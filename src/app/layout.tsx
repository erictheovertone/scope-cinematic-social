import "./globals.css";
import type { Viewport } from "next";
import Providers from '@/components/Providers';
import ThemeSync from '@/components/ThemeSync';
import LaunchCue from '@/components/LaunchCue';
import { SPLASH_SCREENS, SPLASH_GROUND } from '@/lib/splash';

// Brief T1-4a §2 — NO-FOUC pre-paint theme. Runs synchronously in <head> before first paint:
// read localStorage 'scope.theme', resolve 'system', stamp data-theme + color-scheme on <html>
// and set the theme-color meta = the canvas ground (#050505 / #E5E1DB) so any Android/desktop
// chrome — and, where iOS honours it, the status bar — matches the ground with no seam. No
// imports, try/catch, ≤20 lines. Absent key = 'dark' (Scope's default).
const NO_FOUC = `(function(){try{var v=localStorage.getItem('scope.theme'),p=(v==='light'||v==='system'||v==='dark')?v:'dark',a=p==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p,e=document.documentElement;e.setAttribute('data-theme',a);e.style.colorScheme=a;var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',a==='light'?'#E5E1DB':'#050505');}catch(_){}})();`;

// Brief M21 — COLD standalone launch flag, pre-paint: the Home Screen app (iOS navigator.standalone
// / display-mode: standalone) opening a fresh page session gets html.launching, which reveals the
// server-rendered LaunchCue on the very first frame (identical to the startup image). Once per
// session (sessionStorage), so reloads/in-app navigations don't replay it; warm foreground returns
// never reload the page at all.
const LAUNCH_FLAG = `(function(){try{var s=window.navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;if(s&&!sessionStorage.getItem('scope.launched')){sessionStorage.setItem('scope.launched','1');document.documentElement.classList.add('launching')}}catch(e){}})()`;

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
        {/* Brief M21 — no white before the stylesheet: the ground is off-black from the first
            byte (the splash's colour). Scoped to not-light so once the T1-4a stamp below picks
            the light theme, the stylesheet's ivory canvas takes over untouched. */}
        <style dangerouslySetInnerHTML={{ __html: `html:not([data-theme="light"]){background:${SPLASH_GROUND}}` }} />
        {/* T1-4a §2 — pre-paint theme stamp; FIRST script in <head> so data-theme is set before
            any paint (no dark flash on a light-set reload). */}
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC }} />
        <script dangerouslySetInnerHTML={{ __html: LAUNCH_FLAG }} />
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
        {/* Brief P4 §1e — the two primary Haas weights (Roman 400 body, Bold 700 titles) start
            with the HTML instead of after CSS parse; the rest stay on demand (swap). */}
        <link rel="preload" as="font" type="font/otf" href="/design-updates-071526/font-files/NeueHaasGrotDisp-55Roman.otf" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/otf" href="/design-updates-071526/font-files/NeueHaasGrotDisp-75Bold.otf" crossOrigin="anonymous" />
        <link rel="manifest" href="/manifest.json" />
        {/* theme-color is now set dynamically by the pre-paint script above, to the CANVAS
            ground (#050505 / #E5E1DB) — so if iOS 16.4+ standalone paints a status-bar band it
            matches the ground seamlessly (the old worry was a MISMATCHED colour). status-bar-style
            stays black-translucent; on the LIGHT theme its white glyphs read poorly on ivory —
            an iOS status-bar-style limitation (can't vary per theme via meta), flagged for Stage 4b. */}
        <link rel="apple-touch-icon" href="/scope-square-thumbnail-logo-v2.png" />
        {/* Brief M21 — iOS launch screens (public/splash, from scripts/gen-splash.mjs): one per
            current iPhone portrait viewport × DPR, so cold launch is off-black + the aperture
            instead of a white page. iOS caches these at install (re-add the PWA to pick up). */}
        {SPLASH_SCREENS.map((s) => (
          <link key={s.file} rel="apple-touch-startup-image" media={s.media} href={`/splash/${s.file}`} />
        ))}
        {/* The LaunchCue's mask — must be in hand for its first frame (6KB). */}
        <link rel="preload" as="image" href="/splash/mark-mask.png" />
        {/* Brief W2-1d — modern standalone flag (Chrome/Android + the spec successor to the
            apple-prefixed one, which is kept for iOS back-compat). */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Scope" />
      </head>
      <body className="bg-canvas text-[var(--ink-100)] font-mono antialiased" suppressHydrationWarning>
        <LaunchCue />
        <ThemeSync />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
