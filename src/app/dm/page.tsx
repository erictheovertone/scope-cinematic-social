'use client';

// ── /dm — Direct Messages INBOX (Stage 2) ─────────────────────────────────────
//
// The footer DM icon's destination. Conversation list from /api/dm/inbox,
// newest-first. Each row: other participant's avatar + @handle, last-message
// preview (bold when unread), relative time, red unread dot. Row → the thread,
// keyed by the other party's @handle (unifies with profile MESSAGE + notif tap).
// Refresh on focus/visibility (the polling model — inbox is focus-driven, not a
// timer). The footer pill SHOWS here (this is the DM tab, icon active).

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { getInbox, dmTimeAgo, type InboxConversation } from '@/lib/dm';
import { feedImage } from '@/lib/mediaUrl';
import { useIsDesktop } from '@/lib/useIsDesktop';
import DesktopDM from '@/components/desktop/DesktopDM';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

// Thin gate: desktop → two-pane surface; mobile → the inbox page. Only useIsDesktop
// runs here, so switching viewport just mounts/unmounts a child (no hook-order risk).
export default function DMInboxPage() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return <DesktopDM />;
  return <MobileDMInbox />;
}

function MobileDMInbox() {
  const { user } = usePrivy();
  const router = useRouter();
  const [convs, setConvs] = useState<InboxConversation[] | null>(null);
  const [logoPressed, setLogoPressed] = useState(false); // Brief W9 — return-home logomark press-pop (matches Wallet)

  const load = useCallback(() => {
    if (!user?.id) return;
    getInbox(user.id).then(setConvs).catch(() => setConvs([]));
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Refresh on focus / tab-visible (the inbox half of the polling model).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  return (
    <main style={{ minHeight: '100dvh', background: '#000', paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header — Brief W9: page-title treatment matching Wallet (32px / 75 Bold /
          --track-display / --ink-100 / sentence case), ~10px left inset + --safe-top per
          the F1 chrome rule, return-home logomark top-right (the Wallet/Discover house
          pattern; the inbox had nothing top-right before), ~24px to the first row. */}
      <div style={{ position: 'relative', padding: 'calc(10px + var(--safe-top)) 10px 24px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, lineHeight: 1, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', margin: 0 }}>
          Messages
        </h1>
        <div style={{ position: 'absolute', top: 'calc(4px + var(--safe-top))', right: 6, display: 'flex', alignItems: 'center' }}>
          <Link
            href="/"
            aria-label="Home"
            onPointerDown={() => setLogoPressed(true)}
            onPointerUp={() => setLogoPressed(false)}
            onPointerLeave={() => setLogoPressed(false)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 6px', textDecoration: 'none', outline: 'none', transform: logoPressed ? 'scale(0.92)' : 'scale(1)', opacity: logoPressed ? 0.75 : 1, transition: 'transform 120ms ease, opacity 120ms ease' }}
          >
            <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="Scope" style={{ width: 39, height: 'auto', objectFit: 'contain', display: 'block', filter: 'blur(0.35px)' }} />
          </Link>
        </div>
      </div>

      {convs === null ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LOADING…</span>
        </div>
      ) : convs.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12, padding: '0 40px', textAlign: 'center' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>No messages yet</span>
          <span style={{ ...SKR, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.6 }}>
            Start one from any profile — tap MESSAGE.
          </span>
        </div>
      ) : (
        <div>
          {convs.map((c) => {
            const unread = c.unreadCount > 0;
            const handle = c.otherHandle;
            return (
              <button
                key={c.conversationId}
                className="press-row"
                onClick={() => { if (handle) router.push(`/dm/${encodeURIComponent(handle)}`); }}
                disabled={!handle}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  background: 'transparent', border: 'none', borderBottom: '1px solid rgba(229,225,219,0.06)',
                  cursor: handle ? 'pointer' : 'default', padding: '13px 20px', textAlign: 'left',
                }}
              >
                {/* avatar */}
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#222', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {c.otherAvatar
                    ? <img src={feedImage(c.otherAvatar, 96)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#E5E1DB' }}>{handle?.[0]?.toUpperCase() ?? '?'}</span>}
                </div>
                {/* handle + preview */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block' }}>
                    @{handle ?? 'unknown'}
                  </span>
                  <span style={{
                    ...(unread ? SKB : SKR),
                    fontSize: 'var(--fs-9)',
                    color: unread ? 'rgba(229,225,219,0.9)' : 'rgba(229,225,219,0.45)',
                    display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 3,
                  }}>
                    {c.lastMessagePreview ?? ''}
                  </span>
                </div>
                {/* time + unread dot */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ ...SKR, fontSize: 'var(--fs-7)', color: 'rgba(229,225,219,0.4)', fontVariantNumeric: 'tabular-nums' }}>{dmTimeAgo(c.lastMessageAt)}</span>
                  {unread && <span aria-label="unread" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E5E1DB', display: 'block' }} />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
