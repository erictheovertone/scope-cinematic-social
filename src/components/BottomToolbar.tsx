"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PressPop from "@/components/PressPop";

type Page = 'home' | 'profile' | 'public-profile' | 'wallet';

const BTN: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  color: 'inherit',
  // Kill the double-tap-zoom recognition delay (root is touch-action:none; these
  // opt back into fast single-tap → click). Every footer tap fires first time.
  touchAction: 'manipulation',
  // White icons need contrast where a bright frame shows through the dark glass → subtle shadow.
  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))',
  // Equal quarter-cells → the red marker maps exactly to each icon's centre; icons sit
  // above the marker (zIndex 0 behind).
  flex: 1,
  position: 'relative',
  zIndex: 1,
};

// Footer pill fill — flip to 'smoke' for the darker-contrast fallback. Eric judges on
// device over real feed content; this one line is the toggle.
const PILL_FILL: 'frost' | 'smoke' = 'frost';

// Inner glyph wrapper: `.pp-inner` is the ONLY thing that scales on press. The press
// LISTENER lives on the host Link/button (each entry is wrapped in <PressPop level="icon">),
// so ANY tap in the 48px target fires the pop — while the host + its .tap-target halo
// never move (the PopIcon rule; also avoids the mid-tap halo-shrink dead-tap bug).
// (Round-2 fix: the listener used to sit on this inner span, so taps on the ~29px halo
// ring around the 19px glyph never popped → the press felt gone.)
function PopInner({ children }: { children: React.ReactNode }) {
  return <span className="pp-inner" style={{ display: 'flex' }}>{children}</span>;
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? '#FF0000' : 'white';
  return (
    <svg width="19" height="19" viewBox="0 0 27 27" fill="none">
      <path d="M3.375 10.125L13.5 3.375L23.625 10.125V22.5C23.625 23.0967 23.3879 23.669 22.9597 24.0972C22.5315 24.5254 21.9592 24.7625 21.3625 24.7625H5.6375C5.04076 24.7625 4.46851 24.5254 4.04029 24.0972C3.61207 23.669 3.375 23.0967 3.375 22.5V10.125Z" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.125 24.7625V13.5H16.875V24.7625" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 27 27" fill="none">
      <path d="M13.5 5.0625V21.9375M5.0625 13.5H21.9375" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 27 27" fill="none">
      <path d="M20.25 23.625V21.375C20.25 20.1815 19.7759 19.037 18.9331 18.1942C18.0903 17.3514 16.9458 16.875 15.75 16.875H11.25C10.0542 16.875 8.90973 17.3514 8.06694 18.1942C7.22414 19.037 6.75 20.1815 6.75 21.375V23.625" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.5 12.375C15.9853 12.375 18 10.3603 18 7.875C18 5.38972 15.9853 3.375 13.5 3.375C11.0147 3.375 9 5.38972 9 7.875C9 10.3603 11.0147 12.375 13.5 12.375Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18.5" height="19" viewBox="0 0 24 25" fill="none">
      <path d="M18 9A6 6 0 0 0 6 9c0 7-3 9-3 9h18s-3-2-3-9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.73 22a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function WalletIcon({ active }: { active?: boolean }) {
  const c = active ? '#FF0000' : 'white';
  return (
    <svg width="18.5" height="18.5" viewBox="0 0 26 26" fill="none">
      <path d="M22.75 6.5H3.25C2.42157 6.5 1.75 7.17157 1.75 8V20.5C1.75 21.3284 2.42157 22 3.25 22H22.75C23.5784 22 24.25 21.3284 24.25 20.5V8C24.25 7.17157 23.5784 6.5 22.75 6.5Z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17.5 4V6.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.5 4V6.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.75 13H21.25C21.6642 13 22 13.3358 22 13.75V14.75C22 15.1642 21.6642 15.5 21.25 15.5H19.75C19.3358 15.5 19 15.1642 19 14.75V13.75C19 13.3358 19.3358 13 19.75 13Z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface Props {
  page: Page;
  unreadCount?: number;
  onNotificationsClick?: () => void;
  onHamburgerPress?: () => void;
}

function HamburgerIcon({ active }: { active?: boolean }) {
  const c = active ? '#FF0000' : 'white';
  return (
    <svg width="19.5" height="19.5" viewBox="0 0 18 18" fill="none">
      <rect x="0" y="3" width="18" height="1.5" fill={c}/>
      <rect x="0" y="8.25" width="18" height="1.5" fill={c}/>
      <rect x="0" y="13.5" width="18" height="1.5" fill={c}/>
    </svg>
  );
}

// Pure render component — no hooks, no state, no async.
// All routing logic lives in AppShell; this component only displays.
export default function BottomToolbar({ page, unreadCount = 0, onNotificationsClick, onHamburgerPress }: Props) {
  // TAKEOVER STANDDOWN (root fix): theatre mode (any entry) sets
  // data-suite-open on <html> and dispatches scope:takeover-change. The check
  // lives HERE — in the footer component itself — because footers mount from
  // multiple scopes (AppShell on most routes, the profile pages render their
  // own instances): every instance reacts, no entry point can escape.
  const [takeover, setTakeover] = useState(false);
  useEffect(() => {
    const sync = () => setTakeover(!!document.documentElement.dataset.suiteOpen);
    sync();
    // REGRESSION FIX: a MutationObserver on the attribute itself — source-
    // agnostic. The event-only sync missed CreatePostFlow (sets/clears the
    // attribute without dispatching): during a create→profile route transition
    // the incoming toolbar mounted while the flow was still up (attr set), the
    // flow then unmounted SILENTLY → the toolbar never re-synced → footer gone
    // on the normal profile view. The observer catches every setter, present
    // and future, no event contract required.
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-suite-open'] });
    window.addEventListener('scope:takeover-change', sync);
    return () => { mo.disconnect(); window.removeEventListener('scope:takeover-change', sync); };
  }, []);
  if (takeover) return null;

  const isHome = page === 'home';
  // The active destination the red marker rests under (always 4 quarter-cells).
  // /profile → hamburger slot (2); public-profile is someone else's page → no marker.
  const activeIndex = page === 'home' ? 0 : page === 'wallet' ? 3 : page === 'profile' ? 2 : -1;

  // PILL POP (round 4C) — a subtle scale flex on any nav tap, timed with the marker
  // slide. Furniture, not a button: it flexes, doesn't jump. Retrigger on rapid taps.
  const pillRef = useRef<HTMLDivElement>(null);
  const popPill = () => {
    const el = pillRef.current;
    if (!el) return;
    el.classList.remove('pill-pop');
    void el.offsetWidth; // reflow so the animation restarts
    el.classList.add('pill-pop');
  };

  return (
    <>
    {/* DARK-GLASS PILL — floats low (15px min from bottom + sides), TIGHT height hugging
        the icons, 0.5px grey hairline + dark frost, no shadow. The feed scrolls VISIBLY
        (blurred) beneath AND beside it. Pops subtly on a nav tap (4C). */}
    <div
      ref={pillRef}
      className={`footer-pill${PILL_FILL === 'smoke' ? ' smoke' : ''}`}
      onPointerDownCapture={popPill}
      onAnimationEnd={(e) => { if (e.animationName === 'pillPop') e.currentTarget.classList.remove('pill-pop'); }}
      style={{
        position: 'fixed',
        left: 15,
        right: 15,
        // Sit LOW: 15px on non-notch; on the home-indicator phones the inset floors it
        // just above the indicator (max, not +).
        bottom: 'max(15px, env(safe-area-inset-bottom, 0px))',
        height: 38,
        borderRadius: 2,
        border: '0.5px solid rgba(255,255,255,0.3)',
        zIndex: 50,
        transformOrigin: 'center',
        boxSizing: 'border-box' as const,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          // Quarter-cells (flex:1) fill the full pill → icons spread evenly across the
          // whole bar; horizontal safe-area only (0 in portrait) so the marker % maps
          // exactly to cell centres.
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box' as const,
        }}
      >
        {/* RED SLIDING MARKER (4B) — a plate-less 18×2 red underline beneath the active
            icon; travels cell→cell with a ~200ms spring as `page` changes (on the
            persistent AppShell footer). The icon still turns red on arrival. */}
        {activeIndex >= 0 && (
          <div aria-hidden style={{
            position: 'absolute', bottom: 3, left: `calc((${activeIndex} + 0.5) * 25%)`,
            transform: 'translateX(-50%)', width: 18, height: 2, borderRadius: 1,
            background: '#FF0000', pointerEvents: 'none', zIndex: 0,
            transition: 'left 200ms cubic-bezier(0.34, 1.5, 0.5, 1)',
          }} />
        )}

        {/* 1 — Home */}
        <PressPop level="icon">
          <Link className="tap-target" href="/" style={{ ...BTN, opacity: page === 'home' ? 1 : 0.7 }} aria-label="Home">
            <PopInner><HomeIcon active={page === 'home'} /></PopInner>
          </Link>
        </PressPop>

        {/* 2 — Create */}
        <PressPop level="icon">
          <Link className="tap-target" href="/create" style={{ ...BTN, opacity: 0.7 }} aria-label="Create post">
            <PopInner><CreateIcon /></PopInner>
          </Link>
        </PressPop>

        {/* 3 — Profile (home/wallet) | Hamburger (profile / public-profile) */}
        {isHome || page === 'wallet' || page === 'public-profile' ? (
          <PressPop level="icon">
            <Link className="tap-target" href="/profile" style={{ ...BTN, opacity: 0.7 }} aria-label="Profile">
              <PopInner><ProfileIcon /></PopInner>
            </Link>
          </PressPop>
        ) : (
          <PressPop level="icon">
            <button
              onClick={onHamburgerPress} className="tap-target"
              style={{ ...BTN, opacity: 1 }}
              aria-label="Menu"
            >
              <PopInner><HamburgerIcon active /></PopInner>
            </button>
          </PressPop>
        )}

        {/* 4 — Bell (home) | Wallet (profile / public-profile) */}
        {!isHome && (
          <PressPop level="icon">
            <Link className="tap-target" href="/wallet" style={{ ...BTN, opacity: page === 'wallet' ? 1 : 0.7 }} aria-label="Wallet">
              <PopInner><WalletIcon active={page === 'wallet'} /></PopInner>
            </Link>
          </PressPop>
        )}

        {isHome && (
          <PressPop level="icon">
          <Link
            href="/profile/notifications"
            onClick={onNotificationsClick}
            className="relative tap-target"
            style={{ ...BTN, opacity: 0.7 }}
            aria-label="Notifications"
          >
            <PopInner><BellIcon /></PopInner>
            {unreadCount > 0 && (
              <div
                className="absolute"
                style={{
                  top: 2, right: 1,
                  background: '#FF0000',
                  color: 'white',
                  fontFamily: "'SK-Modernist', sans-serif",
                  fontWeight: 700,
                  fontSize: 'var(--fs-8)',
                  lineHeight: 1,
                  padding: '1px 3px',
                  minWidth: 14,
                  textAlign: 'center',
                  borderRadius: 0,
                }}
              >
                {unreadCount}
              </div>
            )}
          </Link>
          </PressPop>
        )}
      </div>
    </div>
    </>
  );
}
