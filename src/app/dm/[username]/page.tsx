'use client';

// ── /dm/[username] — DM THREAD (Stage 2) ──────────────────────────────────────
//
// Keyed by the OTHER party's @handle (unifies inbox rows, profile MESSAGE, and
// notification taps — all natively carry the handle). The conversationId is
// resolved lazily (via the inbox) so a fresh thread from profile MESSAGE has no
// row until the first send (the send route creates it — no empty-conversation
// rows). Optimistic send, ~4.5s poll, mark-read on open + on new arrivals. The
// footer pill HIDES here (takeover discipline — the composer owns the bottom).

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import {
  getThread, getInbox, sendMessage, markRead, dmTimeAgo, THREAD_POLL_MS, type DMMessage,
} from '@/lib/dm';
import { getUserByPrivyId, getProfileByUsername } from '@/lib/userService';
import { feedImage } from '@/lib/mediaUrl';
import { useIsDesktop } from '@/lib/useIsDesktop';
import DesktopDM from '@/components/desktop/DesktopDM';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

type Other = { userId: string; handle: string; avatar: string | null };
type Pending = { tempId: string; body: string; ts: number; status: 'sending' | 'failed' };
// One render item — a real server message OR an optimistic pending one.
type Item = { key: string; body: string; mine: boolean; iso: string; status?: 'sending' | 'failed'; tempId?: string };

const TIME_BREAK_MS = 10 * 60 * 1000; // group timestamps: a break only after a 10-min gap

// Thin gate: desktop → two-pane surface with this user's thread active; mobile →
// the full-screen thread. Only useIsDesktop + useParams run here (stable hook count),
// so the mobile thread's takeover effect never runs on desktop (the rail stays).
export default function DMThreadPage() {
  const isDesktop = useIsDesktop();
  const params = useParams();
  const username = decodeURIComponent(String(params?.username ?? ''));
  if (isDesktop) return <DesktopDM initialUsername={username} />;
  return <MobileDMThread username={username} />;
}

function MobileDMThread({ username }: { username: string }) {
  const { user } = usePrivy();
  const router = useRouter();

  const [viewerUuid, setViewerUuid] = useState<string | null>(null);
  const [other, setOther] = useState<Other | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const convIdRef = useRef<string | null>(null);
  const viewerRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);

  // Hide the footer pill for the thread's whole session (composer owns the bottom).
  useEffect(() => {
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    return () => {
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, []);

  // Init: resolve viewer uuid + the other party + any existing conversation.
  useEffect(() => {
    if (!user?.id || !username) return;
    let cancelled = false;
    (async () => {
      const [vu, prof] = await Promise.all([getUserByPrivyId(user.id), getProfileByUsername(username)]);
      if (cancelled) return;
      viewerRef.current = vu?.id ?? null;
      setViewerUuid(vu?.id ?? null);
      const p = prof as unknown as { user_id?: string; username?: string; profile_image_url?: string | null } | null;
      if (!p?.user_id) { setNotFound(true); setLoading(false); return; }
      setOther({ userId: p.user_id, handle: p.username ?? username, avatar: p.profile_image_url ?? null });

      const inbox = await getInbox(user.id).catch(() => []);
      if (cancelled) return;
      const conv = inbox.find((c) => c.otherUserId === p.user_id);
      if (conv) {
        convIdRef.current = conv.conversationId;
        const page = await getThread(user.id, conv.conversationId).catch(() => null);
        if (page && !cancelled) {
          setMessages(page.messages);
          setHasMore(page.hasMore);
          setCursor(page.nextCursor);
          if (page.messages.some((m) => m.sender_id !== vu?.id && m.read_at === null)) {
            markRead(user.id, conv.conversationId).catch(() => {});
          }
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, username]);

  // Poll while open — refresh the thread, mark newly-arrived incoming read.
  useEffect(() => {
    if (!user?.id) return;
    const iv = window.setInterval(async () => {
      const cid = convIdRef.current;
      if (!cid || document.visibilityState === 'hidden') return;
      const page = await getThread(user.id, cid).catch(() => null);
      if (!page) return;
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
      if (page.messages.some((m) => m.sender_id !== viewerRef.current && m.read_at === null)) {
        markRead(user.id, cid).catch(() => {});
      }
    }, THREAD_POLL_MS);
    return () => window.clearInterval(iv);
  }, [user?.id]);

  const doSend = useCallback(async (text: string, tempId: string) => {
    if (!user?.id || !other) return;
    setPending((p) => p.map((x) => x.tempId === tempId ? { ...x, status: 'sending' } : x));
    try {
      const { conversationId: cid, message } = await sendMessage(user.id, other.userId, text);
      convIdRef.current = cid;
      setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]));
      setPending((p) => p.filter((x) => x.tempId !== tempId));
    } catch {
      setPending((p) => p.map((x) => x.tempId === tempId ? { ...x, status: 'failed' } : x));
    }
  }, [user?.id, other]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const tempId = `tmp-${Date.now()}-${Math.floor(performance.now())}`;
    setPending((p) => [...p, { tempId, body: text, ts: Date.now(), status: 'sending' }]);
    setDraft('');
    doSend(text, tempId);
  };

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !cursor || !convIdRef.current || !user?.id) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevH = el?.scrollHeight ?? 0;
    const page = await getThread(user.id, convIdRef.current, cursor).catch(() => null);
    if (page) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...page.messages.filter((m) => !seen.has(m.id)), ...prev];
      });
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
      // keep the viewport anchored where the user was after older messages prepend
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
    }
    setLoadingOlder(false);
  }, [loadingOlder, hasMore, cursor, user?.id]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop < 40) loadOlder();
  };

  // Build the render list (real + optimistic) and auto-scroll to bottom on growth.
  const items: Item[] = [
    ...messages.map((m) => ({ key: m.id, body: m.body, mine: m.sender_id === viewerUuid, iso: m.created_at })),
    ...pending.map((p) => ({ key: p.tempId, body: p.body, mine: true, iso: new Date(p.ts).toISOString(), status: p.status, tempId: p.tempId })),
  ];

  useEffect(() => {
    if (loading) return;
    const behavior: ScrollBehavior = didInitialScroll.current ? 'smooth' : 'auto';
    bottomRef.current?.scrollIntoView({ behavior });
    didInitialScroll.current = true;
  }, [items.length, loading]);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#000' }}>
      {/* HEADER — back, avatar + @handle (tap → profile). */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(12px + env(safe-area-inset-top, 0px)) 14px 10px', borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
        <button onClick={() => router.back()} aria-label="Back" className="tappable" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0, flexShrink: 0 }}>
          <svg width="16.5" height="16.5" viewBox="0 0 24 24" fill="none" stroke="#E5E1DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button
          onClick={() => other?.handle && router.push(`/profile/${encodeURIComponent(other.handle)}`)}
          className="tappable"
          style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}
        >
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#222', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {other?.avatar
              ? <img src={feedImage(other.avatar, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB' }}>{other?.handle?.[0]?.toUpperCase() ?? '?'}</span>}
          </div>
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{other?.handle ?? username}</span>
        </button>
      </div>

      {/* MESSAGES */}
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ margin: 'auto' }}><span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LOADING…</span></div>
        ) : notFound ? (
          <div style={{ margin: 'auto', textAlign: 'center' }}><span style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>User not found</span></div>
        ) : items.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', padding: '0 30px' }}>
            <span style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.6 }}>
              No messages yet — say hello.
            </span>
          </div>
        ) : (
          items.map((it, i) => {
            const prev = items[i - 1];
            const showTime = !prev || (new Date(it.iso).getTime() - new Date(prev.iso).getTime() > TIME_BREAK_MS);
            return (
              <div key={it.key}>
                {showTime && (
                  <div style={{ textAlign: 'center', margin: '10px 0 8px' }}>
                    <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: 'rgba(229,225,219,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{dmTimeAgo(it.iso)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: it.mine ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                  <div
                    onClick={it.status === 'failed' && it.tempId ? () => doSend(it.body, it.tempId!) : undefined}
                    style={{
                      maxWidth: '76%', padding: '8px 11px', borderRadius: 2,
                      background: it.mine ? '#242424' : '#0e0e0e',
                      border: it.status === 'failed' ? '1px solid #E5E1DB' : '1px solid rgba(229,225,219,0.06)',
                      cursor: it.status === 'failed' ? 'pointer' : 'default',
                      opacity: it.status === 'sending' ? 0.55 : 1,
                    }}
                  >
                    <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: '#E5E1DB', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'block' }}>{it.body}</span>
                    {it.status === 'failed' && (
                      <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginTop: 3 }}>Failed — tap to retry</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* COMPOSER — owns the bottom (pill hidden). ≥16px font = the iOS zoom floor. */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid rgba(229,225,219,0.08)', background: '#000' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message"
          rows={1}
          maxLength={2000}
          disabled={notFound}
          style={{
            flex: 1, resize: 'none', maxHeight: 120, ...SKR, fontSize: 16, color: '#E5E1DB',
            background: '#111', border: '1px solid rgba(229,225,219,0.14)', borderRadius: 2,
            outline: 'none', padding: '9px 11px', lineHeight: 1.35,
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim() || notFound}
          className="tappable"
          style={{
            ...SKB, fontSize: 'var(--fs-9)', color: draft.trim() ? '#E5E1DB' : 'rgba(229,225,219,0.3)',
            background: 'transparent', border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
            textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 6px', flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
