import "./globals.css";
import type { Viewport } from "next";
import Providers from '@/components/Providers';
import ThemeSync from '@/components/ThemeSync';

// Brief T1-4a §2 — NO-FOUC pre-paint theme. Runs synchronously in <head> before first paint:
// read localStorage 'scope.theme', resolve 'system', stamp data-theme + color-scheme on <html>
// and set the theme-color meta = the canvas ground (#050505 / #E5E1DB) so any Android/desktop
// chrome — and, where iOS honours it, the status bar — matches the ground with no seam. No
// imports, try/catch, ≤20 lines. Absent key = 'dark' (Scope's default).
const NO_FOUC = `(function(){try{var v=localStorage.getItem('scope.theme'),p=(v==='light'||v==='system'||v==='dark')?v:'dark',a=p==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p,e=document.documentElement;e.setAttribute('data-theme',a);e.style.colorScheme=a;var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',a==='light'?'#E5E1DB':'#050505');}catch(_){}})();`;

// Stage 0.1 — viewport via Next's export (replaces the manual <meta>). viewportFit
// 'cover' is what makes env(safe-area-inset-*) resolve to real notch/home-indicator
// values (otherwise they're 0). User zoom left enabled (accessibility).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* T1-4a §2 — pre-paint theme stamp; FIRST in <head> so data-theme is set before any
            paint (no dark flash on a light-set reload). */}
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC }} />
        <title>Scope - Cinematic Social Platform</title>
        <meta name="description" content="A cinematic social platform where creators post ultra-wide images/videos into customizable grids." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="dns-prefetch" href="https://auth.privy.io" />
        {/* Brief S2d — preload the SCRIPT wordmark face so its fetch starts with the HTML
            (not after CSS parse), shrinking the invisible window on the welcome cold-load —
            the primary logged-out entry. crossOrigin is required or the preload won't match
            the CORS-mode font fetch (browser would ignore it / double-fetch). woff2, 36KB.
            Correctness doesn't hinge on this: font-display:block + the useFontReady gate
            already guarantee no fallback frame; the preload only shrinks the blank window. */}
        <link rel="preload" as="font" type="font/woff2" href="/design-updates-071526/font-files/birds-of-paradise-script.woff2" crossOrigin="anonymous" />
        <link rel="manifest" href="/manifest.json" />
        {/* theme-color is now set dynamically by the pre-paint script above, to the CANVAS
            ground (#050505 / #E5E1DB) — so if iOS 16.4+ standalone paints a status-bar band it
            matches the ground seamlessly (the old worry was a MISMATCHED colour). status-bar-style
            stays black-translucent; on the LIGHT theme its white glyphs read poorly on ivory —
            an iOS status-bar-style limitation (can't vary per theme via meta), flagged for Stage 4b. */}
        <link rel="apple-touch-icon" href="/scope-square-thumbnail-logo-v2.png" />
        {/* Brief W2-1d — modern standalone flag (Chrome/Android + the spec successor to the
            apple-prefixed one, which is kept for iOS back-compat). */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Scope" />
      </head>
      <body className="bg-canvas text-[var(--ink-100)] font-mono antialiased" suppressHydrationWarning>
        <ThemeSync />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
