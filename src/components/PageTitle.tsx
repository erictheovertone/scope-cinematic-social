'use client';

import Link from 'next/link';
import { useState } from 'react';

// PageTitle — the established mobile page-title chrome, extracted at instance 3 (Brief M3;
// W9 had deferred the extraction). 75 Bold 32px sentence-case title top-left (~10px inset,
// --safe-top padded) + return-home logomark top-right with a press-pop. Consumed
// byte-identically by Wallet, Messages, and Screening Room — change the treatment HERE, not
// per-page. Optional `children` render directly under the title (Wallet's copy-address line,
// Screening Room's descriptor). `onTitleTap` carries the shared 5-tap viewport-debug toggle.
//
// NOTE: home's "Discover" is deliberately NOT a consumer — it's a distinct 36px, flex-row,
// viewing-modes-trigger treatment (node 37:65), not this return-home page-title pattern.
export default function PageTitle({
  title,
  onTitleTap,
  paddingBottom = 24,
  children,
}: {
  title: string;
  onTitleTap?: () => void;
  paddingBottom?: number;
  children?: React.ReactNode;
}) {
  const [logoPressed, setLogoPressed] = useState(false);
  return (
    <div style={{ position: 'relative', padding: `calc(10px + var(--safe-top)) 10px ${paddingBottom}px` }}>
      <h1 onClick={onTitleTap} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, lineHeight: 1, letterSpacing: 'var(--track-display)', color: 'var(--ink-100)', margin: 0 }}>
        {title}
      </h1>
      {children}
      <div style={{ position: 'absolute', top: 'calc(4px + var(--safe-top))', right: 6, display: 'flex', alignItems: 'center' }}>
        <Link
          href="/"
          aria-label="Home"
          onPointerDown={() => setLogoPressed(true)}
          onPointerUp={() => setLogoPressed(false)}
          onPointerLeave={() => setLogoPressed(false)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 6px', textDecoration: 'none', outline: 'none', transform: logoPressed ? 'scale(0.92)' : 'scale(1)', opacity: logoPressed ? 0.75 : 1, transition: 'transform 120ms ease, opacity 120ms ease' }}
        >
          <img src="/design-updates-071526/scope-logomark-offwhite.png" alt="Scope" style={{ width: 39, height: 'auto', objectFit: 'contain', display: 'block' }} />
        </Link>
      </div>
    </div>
  );
}
