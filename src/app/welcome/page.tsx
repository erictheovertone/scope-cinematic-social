"use client";

// ── Welcome / Lander (Brief S2b, Figma 93:674) ───────────────────────────────
// The cold-load destination for logged-out users (F5 §3 routes here). Revised frame:
// the SCRIPT wordmark "scope" (Birds of Paradise, --font-script) upper-middle, with
// "Login" then "Sign Up" stacked BELOW it, left-aligned to the wordmark's left edge.
// Canvas #050505, safe-area padded. Both actions enter the SAME existing Privy useLogin
// flow (the current auth setup does NOT distinguish login vs signup) → /auth/callback.
// Auth logic is untouched — entry points only. Renders directly, no chrome flash.

import { useRouter } from "next/navigation";
import { useLogin } from "@privy-io/react-auth";
import DesktopLanding, { WELCOME_BLUR } from "@/components/desktop/DesktopLanding";
import { useIsDesktop } from "@/lib/useIsDesktop";

// Brief S2b §3 — Welcome-only exception per Eric; the app-wide soften system stays retired
// (W5). WELCOME_BLUR is the ONE shared constant (owned by DesktopLanding, imported here) so
// the device nudge is a single number across both surfaces. 0.4px reads far heavier on a 3×
// iPhone than in devtools — that's why the app-wide system was retired.

export default function Welcome() {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const { login } = useLogin({
    onComplete: () => router.push("/auth/callback"),
    onError: (error) => { console.log("Authentication error:", error); },
  });

  // DESKTOP SEAM: the logged-out desktop landing renders the SAME composition, scaled.
  if (isDesktop) return <DesktopLanding />;

  // Login / Sign Up — Haas 75 Bold 16px, --track-display (≈-0.8px @16px), --ink-100,
  // left-aligned to the wordmark's left edge, ~31px apart (frame: y371 → y402).
  const action: React.CSSProperties = {
    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
    letterSpacing: "var(--track-display)", color: "var(--ink-100)",
    background: "transparent", border: "none", cursor: "pointer",
    padding: "3px 4px", lineHeight: 1.25, textAlign: "left", whiteSpace: "nowrap",
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "var(--canvas)", boxSizing: "border-box",
        // Frame 390×844: wordmark left x113 (≈28.9vw), top y268 (≈31.7vh) — upper-middle,
        // off-centre calm (not dead-centred). Safe-area padded.
        paddingTop: "calc(var(--safe-top) + 31.7vh)",
        paddingLeft: "calc(var(--safe-left) + 28.9vw)",
        paddingRight: "calc(var(--safe-right) + 8px)",
      }}
    >
      {/* The lockup — wordmark + the two actions, all left-aligned. The 0.4px blur is on
          THIS group only (welcome-only exception; no app-wide soften — W5 stays retired). */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", filter: `blur(${WELCOME_BLUR})` }}>
        {/* "scope" — script face, ~100px @390 ref, --ink, ~1px tracking (frame 179×81). */}
        <span style={{ fontFamily: "var(--font-script)", fontSize: 100, lineHeight: 0.85, letterSpacing: "1px", color: "var(--ink-100)", display: "block" }}>
          scope
        </span>
        {/* ~22px below the wordmark (frame: 349→371). */}
        <button onClick={login} className="tap-target" aria-label="Log in" style={{ ...action, marginTop: 18 }}>
          Login
        </button>
        {/* 31px top-to-top → ~7px after the Login box. */}
        <button onClick={login} className="tap-target" aria-label="Sign up" style={{ ...action, marginTop: 7 }}>
          Sign Up
        </button>
      </div>

      {/* Brief S2b §4 — the frame OMITS terms/privacy; rather than drop them silently, a
          quiet micro-line at the bottom (the only non-frame element, proposed for Eric). */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(var(--safe-bottom) + 18px)", textAlign: "center" }}>
        <a href="/profile/terms" style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 10, letterSpacing: "var(--track-body)", color: "rgba(229,225,219,0.32)", textDecoration: "none" }}>
          Terms &amp; Privacy
        </a>
      </div>
    </div>
  );
}
