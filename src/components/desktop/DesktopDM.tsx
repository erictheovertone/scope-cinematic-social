'use client';

// ── DesktopDM — the two-pane DM surface (Stage 3) ─────────────────────────────
//
// Master-detail (the settings language): LEFT = inbox list (~340px, hairline-
// separated rows, active = red left-bar), RIGHT = the active thread, SWAPPED IN
// PLACE (no navigation — selecting a row sets local state). Sits beside the 71px
// rail (left: 71); the rail stays visible (no takeover). Same services/behaviors
// as mobile: optimistic send, ~4.5s poll, mark-read on open, scroll-up paging.
// Reading a thread fires 'scope:dm-updated' → the rail badge clears.

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import {
  getInbox, getThread, sendMessage, markRead, dmTimeAgo, THREAD_POLL_MS,
  type InboxConversation, type DMMessage,
} from '@/lib/dm';
import { getUserByPrivyId, getProfileByUsername } from '@/lib/userService';
import { feedImage } from '@/lib/mediaUrl';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.12)';
const TIME_BREAK_MS = 10 * 60 * 1000;

type Active = { userId: string; handle: string; avatar: string | null };
type Pending = { tempId: string; body: string; ts: number; status: 'sending' | 'failed' };
type Item = { key: string; body: string; mine: boolean; iso: string; status?: 'sending' | 'failed'; tempId?: string };

export default function DesktopDM({ initialUsername }: { initialUsername?: string }) {
  const { user } = usePrivy();
  const router = useRouter();
  const [viewerUuid, setViewerUuid] = useState<string | null>(null);
  const [convs, setConvs] = useState<InboxConversation[]>([]);
  const [active, setActive] = useState<Active | null>(null);

  const refreshInbox = useCallback(() => {
    if (!user?.id) return;
    getInbox(user.id).then(setConvs).catch(() => {});
    window.dispatchEvent(new CustomEvent('scope:dm-updated')); // clear the rail badge
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [vu, inbox] = await Promise.all([getUserByPrivyId(user.id), getInbox(user.id).catch(() => [])]);
      if (cancelled) return;
      setViewerUuid(vu?.id ?? null);
      setConvs(inbox);
      if (initialUsername) {
        const prof = await getProfileByUsername(initialUsername);
        const p = prof as unknown as { user_id?: string; username?: string; profile_image_url?: string | null } | null;
        if (p?.user_id && !cancelled) setActive({ userId: p.user_id, handle: p.username ?? initialUsername, avatar: p.profile_image_url ?? null });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, initialUsername]);

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') refreshInbox(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshInbox]);

  const activeConvId = active ? (convs.find((c) => c.otherUserId === active.userId)?.conversationId ?? null) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, left: 71, background: '#000', display: 'flex' }}>
      {/* LEFT — inbox list */}
      <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${HAIR}`, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '22px 20px 14px' }}>
          <h1 style={{ ...SKB, fontSize: 15, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.16em', margin: 0 }}>Messages</h1>
        </div>
        {convs.length === 0 ? (
          <div style={{ padding: '26px 20px' }}>
            <span style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.6 }}>
              No messages yet — open a profile and tap MESSAGE.
            </span>
          </div>
        ) : convs.map((c) => {
          const sel = active?.userId === c.otherUserId;
          const unread = c.unreadCount > 0;
          return (
            <button
              key={c.conversationId}
              onClick={() => c.otherHandle && setActive({ userId: c.otherUserId, handle: c.otherHandle, avatar: c.otherAvatar })}
              disabled={!c.otherHandle}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                cursor: c.otherHandle ? 'pointer' : 'default',
                background: sel ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: 'none', borderBottom: `1px solid ${HAIR}`,
                borderLeft: sel ? '2px solid #f20d0d' : '2px solid transparent',
                padding: '13px 18px', transition: 'background 120ms ease',
              }}
            >
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#222', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.otherAvatar
                  ? <img src={feedImage(c.otherAvatar, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ ...SKB, fontSize: 14, color: '#FFF' }}>{c.otherHandle?.[0]?.toUpperCase() ?? '?'}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...SKB, fontSize: 12, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>@{c.otherHandle ?? 'unknown'}</span>
                <span style={{ ...(unread ? SKB : SKR), fontSize: 11, color: unread ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 3 }}>{c.lastMessagePreview ?? ''}</span>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>{dmTimeAgo(c.lastMessageAt)}</span>
                {unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF0000', display: 'block' }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* RIGHT — active thread (swapped in place) */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {active && viewerUuid && user?.id ? (
          <DesktopThreadPane
            key={active.userId}
            viewerDid={user.id}
            viewerUuid={viewerUuid}
            other={active}
            conversationId={activeConvId}
            onActivity={refreshInbox}
            onOpenProfile={() => router.push(`/profile/${encodeURIComponent(active.handle)}`)}
          />
        ) : (
          <div style={{ margin: 'auto' }}>
            <span style={{ ...SKR, fontSize: 13, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Select a conversation</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── The right-pane thread — remounts per conversation (keyed by userId) ────────
function DesktopThreadPane({
  viewerDid, viewerUuid, other, conversationId, onActivity, onOpenProfile,
}: {
  viewerDid: string;
  viewerUuid: string;
  other: Active;
  conversationId: string | null;
  onActivity: () => void;
  onOpenProfile: () => void;
}) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const convRef = useRef<string | null>(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);

  // Initial load (mount-only — the parent remounts this via key on conversation change).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cid = convRef.current;
      if (cid) {
        const page = await getThread(viewerDid, cid).catch(() => null);
        if (page && !cancelled) {
          setMessages(page.messages); setHasMore(page.hasMore); setCursor(page.nextCursor);
          if (page.messages.some((m) => m.sender_id !== viewerUuid && m.read_at === null)) {
            await markRead(viewerDid, cid).catch(() => {});
            onActivity();
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while open.
  useEffect(() => {
    const iv = window.setInterval(async () => {
      const cid = convRef.current;
      if (!cid || document.visibilityState === 'hidden') return;
      const page = await getThread(viewerDid, cid).catch(() => null);
      if (!page) return;
      setMessages(page.messages); setHasMore(page.hasMore); setCursor(page.nextCursor);
      if (page.messages.some((m) => m.sender_id !== viewerUuid && m.read_at === null)) {
        markRead(viewerDid, cid).then(onActivity).catch(() => {});
      }
    }, THREAD_POLL_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSend = useCallback(async (text: string, tempId: string) => {
    setPending((p) => p.map((x) => x.tempId === tempId ? { ...x, status: 'sending' } : x));
    try {
      const { conversationId: cid, message } = await sendMessage(viewerDid, other.userId, text);
      convRef.current = cid;
      setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]));
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      onActivity(); // inbox preview + ordering update
    } catch {
      setPending((p) => p.map((x) => x.tempId === tempId ? { ...x, status: 'failed' } : x));
    }
  }, [viewerDid, other.userId, onActivity]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const tempId = `tmp-${Date.now()}-${Math.floor(performance.now())}`;
    setPending((p) => [...p, { tempId, body: text, ts: Date.now(), status: 'sending' }]);
    setDraft('');
    doSend(text, tempId);
  };

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !cursor || !convRef.current) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevH = el?.scrollHeight ?? 0;
    const page = await getThread(viewerDid, convRef.current, cursor).catch(() => null);
    if (page) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...page.messages.filter((m) => !seen.has(m.id)), ...prev];
      });
      setHasMore(page.hasMore); setCursor(page.nextCursor);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
    }
    setLoadingOlder(false);
  }, [loadingOlder, hasMore, cursor, viewerDid]);

  const onScroll = () => { const el = scrollRef.current; if (el && el.scrollTop < 40) loadOlder(); };

  const items: Item[] = [
    ...messages.map((m) => ({ key: m.id, body: m.body, mine: m.sender_id === viewerUuid, iso: m.created_at })),
    ...pending.map((p) => ({ key: p.tempId, body: p.body, mine: true, iso: new Date(p.ts).toISOString(), status: p.status, tempId: p.tempId })),
  ];

  useEffect(() => {
    if (loading) return;
    bottomRef.current?.scrollIntoView({ behavior: didInitialScroll.current ? 'smooth' : 'auto' });
    didInitialScroll.current = true;
  }, [items.length, loading]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 11, padding: '16px 22px', borderBottom: `1px solid ${HAIR}` }}>
        <button onClick={onOpenProfile} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#222', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {other.avatar
              ? <img src={feedImage(other.avatar, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ ...SKB, fontSize: 13, color: '#FFF' }}>{other.handle?.[0]?.toUpperCase() ?? '?'}</span>}
          </div>
          <span style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>@{other.handle}</span>
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 10px', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ margin: 'auto' }}><span style={{ ...SKB, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LOADING…</span></div>
        ) : items.length === 0 ? (
          <div style={{ margin: 'auto' }}><span style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>No messages yet — say hello.</span></div>
        ) : items.map((it, i) => {
          const prev = items[i - 1];
          const showTime = !prev || (new Date(it.iso).getTime() - new Date(prev.iso).getTime() > TIME_BREAK_MS);
          return (
            <div key={it.key}>
              {showTime && (
                <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                  <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{dmTimeAgo(it.iso)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: it.mine ? 'flex-end' : 'flex-start', marginBottom: 5 }}>
                <div
                  onClick={it.status === 'failed' && it.tempId ? () => doSend(it.body, it.tempId!) : undefined}
                  style={{
                    maxWidth: '68%', padding: '9px 13px', borderRadius: 2,
                    background: it.mine ? '#242424' : '#0e0e0e',
                    border: it.status === 'failed' ? '1px solid #FF0000' : `1px solid rgba(255,255,255,0.06)`,
                    cursor: it.status === 'failed' ? 'pointer' : 'default',
                    opacity: it.status === 'sending' ? 0.55 : 1,
                  }}
                >
                  <span style={{ ...SKR, fontSize: 13, color: '#FFF', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'block' }}>{it.body}</span>
                  {it.status === 'failed' && (
                    <span style={{ ...SKB, fontSize: 9, color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginTop: 4 }}>Failed — click to retry</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* composer — Enter sends, Shift+Enter newlines */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${HAIR}` }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message"
          rows={1}
          maxLength={2000}
          autoFocus
          style={{ flex: 1, resize: 'none', maxHeight: 140, ...SKR, fontSize: 14, color: '#FFF', background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIR}`, borderRadius: 2, outline: 'none', padding: '10px 12px', lineHeight: 1.4 }}
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          style={{ ...SKB, fontSize: 12, color: draft.trim() ? '#FF0000' : 'rgba(255,255,255,0.3)', background: 'transparent', border: 'none', cursor: draft.trim() ? 'pointer' : 'default', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 6px', flexShrink: 0 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
