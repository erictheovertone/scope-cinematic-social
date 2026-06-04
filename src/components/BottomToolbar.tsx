"use client";

import Link from "next/link";

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
};

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? '#FF0000' : 'white';
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 27 27" fill="none">
      <path d="M3.375 10.125L13.5 3.375L23.625 10.125V22.5C23.625 23.0967 23.3879 23.669 22.9597 24.0972C22.5315 24.5254 21.9592 24.7625 21.3625 24.7625H5.6375C5.04076 24.7625 4.46851 24.5254 4.04029 24.0972C3.61207 23.669 3.375 23.0967 3.375 22.5V10.125Z" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.125 24.7625V13.5H16.875V24.7625" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 27 27" fill="none">
      <path d="M13.5 5.0625V21.9375M5.0625 13.5H21.9375" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 27 27" fill="none">
      <path d="M20.25 23.625V21.375C20.25 20.1815 19.7759 19.037 18.9331 18.1942C18.0903 17.3514 16.9458 16.875 15.75 16.875H11.25C10.0542 16.875 8.90973 17.3514 8.06694 18.1942C7.22414 19.037 6.75 20.1815 6.75 21.375V23.625" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.5 12.375C15.9853 12.375 18 10.3603 18 7.875C18 5.38972 15.9853 3.375 13.5 3.375C11.0147 3.375 9 5.38972 9 7.875C9 10.3603 11.0147 12.375 13.5 12.375Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="13" height="13.5" viewBox="0 0 24 25" fill="none">
      <path d="M18 9A6 6 0 0 0 6 9c0 7-3 9-3 9h18s-3-2-3-9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.73 22a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 26 26" fill="none">
      <path d="M22.75 6.5H3.25C2.42157 6.5 1.75 7.17157 1.75 8V20.5C1.75 21.3284 2.42157 22 3.25 22H22.75C23.5784 22 24.25 21.3284 24.25 20.5V8C24.25 7.17157 23.5784 6.5 22.75 6.5Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17.5 4V6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.5 4V6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.75 13H21.25C21.6642 13 22 13.3358 22 13.75V14.75C22 15.1642 21.6642 15.5 21.25 15.5H19.75C19.3358 15.5 19 15.1642 19 14.75V13.75C19 13.3358 19.3358 13 19.75 13Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface Props {
  page: Page;
  unreadCount?: number;
  onNotificationsClick?: () => void;
  onHamburgerPress?: () => void;
}

function HamburgerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
      <rect x="0" y="3" width="18" height="1.5" fill="white"/>
      <rect x="0" y="8.25" width="18" height="1.5" fill="white"/>
      <rect x="0" y="13.5" width="18" height="1.5" fill="white"/>
    </svg>
  );
}

// Pure render component — no hooks, no state, no async.
// All routing logic lives in AppShell; this component only displays.
export default function BottomToolbar({ page, unreadCount = 0, onNotificationsClick, onHamburgerPress }: Props) {
  const isHome = page === 'home';

  return (
    <>
      {/* Gradient fade behind toolbar */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 50,
        background: 'linear-gradient(to top, rgba(0,0,0,0.54) 0%, rgba(0,0,0,0) 100%)',
        zIndex: 49,
        pointerEvents: 'none',
      }} />
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: isHome ? 60 : 'auto',
        zIndex: 50,
        background: isHome ? 'transparent' : 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.18) 60%, transparent 100%)',
      }}
    >
      <div
        style={isHome ? {
          maxWidth: 375,
          width: '100%',
          height: '100%',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingLeft: 8,
          paddingRight: 8,
          paddingBottom: 2,
        } : {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingLeft: 2,
          paddingRight: 2,
          paddingBottom: 2,
          paddingTop: 8,
          width: '100%',
          boxSizing: 'border-box' as const,
        }}
      >
        {/* 1 — Home */}
        <Link href="/" style={{ ...BTN, opacity: page === 'home' ? 1 : 0.7 }} aria-label="Home">
          <HomeIcon active={page === 'home'} />
        </Link>

        {/* 2 — Create */}
        <Link href="/create" style={{ ...BTN, opacity: 0.7 }} aria-label="Create post">
          <CreateIcon />
        </Link>

        {/* 3 — Profile (home/wallet) | Hamburger (profile / public-profile) */}
        {isHome || page === 'wallet' || page === 'public-profile' ? (
          <Link href="/profile" style={{ ...BTN, opacity: 0.7 }} aria-label="Profile">
            <ProfileIcon />
          </Link>
        ) : (
          <button
            onClick={onHamburgerPress}
            style={{ ...BTN, opacity: 0.7 }}
            aria-label="Menu"
          >
            <HamburgerIcon />
          </button>
        )}

        {/* 4 — Bell (home) | Wallet (profile / public-profile) */}
        {!isHome && (
          <Link href="/wallet" style={{ ...BTN, opacity: 0.7 }} aria-label="Wallet">
            <WalletIcon />
          </Link>
        )}

        {isHome && (
          <Link
            href="/profile/notifications"
            onClick={onNotificationsClick}
            className="relative"
            style={{ ...BTN, opacity: 0.7 }}
            aria-label="Notifications"
          >
            <BellIcon />
            {unreadCount > 0 && (
              <div
                className="absolute"
                style={{
                  top: 2, right: 1,
                  background: '#FF0000',
                  color: 'white',
                  fontFamily: "'SK-Modernist', sans-serif",
                  fontWeight: 700,
                  fontSize: 8,
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
        )}
      </div>
    </div>
    </>
  );
}
