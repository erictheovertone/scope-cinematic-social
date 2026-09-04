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
import DesktopLanding from "@/components/desktop/DesktopLanding";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useFontReady } from "@/lib/useFontReady";

// NOTE: the 0.4px wordmark blur is now DESKTOP-ONLY (Eric — it read too heavy on a 3× iPhone,
// the exact reason the app-wide soften system was retired in W5). Mobile renders crisp; the
// blur constant lives in DesktopLanding, which still applies it there.

export default function Welcome() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  // Brief S2d — gate the script wordmark until its face is loaded, so no fallback
  // (Times) frame ever paints; then fade in. Login/Sign Up (Haas) render immediately.
  const wordmarkReady = useFontReady('400 100px "Birds of Paradise"');

  const { login } = useLogin({
    onComplete: () => router.push("/auth/callback"),
    onError: (error) => { console.log("Authentication error:", error); },
  });

  // DESKTOP SEAM: the logged-out desktop landing renders the SAME composition, scaled.
  if (isDesktop) return <DesktopLanding />;

  // Login / Sign Up — Haas 75 Bold 16px, --track-display, --ink-100, ~31px apart.
  // Aligned to the OUTER left edge of the "s" swash (Eric): 0 left padding + a small
  // negative margin pulls the text left of the wordmark's text box, matching the "s"
  // glyph's leftmost point (frame: buttons x108 vs wordmark box x113).
  const action: React.CSSProperties = {
    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
    letterSpacing: "var(--track-display)", color: "var(--ink-100)",
    background: "transparent", border: "none", cursor: "pointer",
    padding: "3px 4px 3px 0", marginLeft: -5, lineHeight: 1.25, textAlign: "left",
    whiteSpace: "nowrap", display: "block",
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
      {/* The lockup — wordmark + the two actions, left-aligned. Mobile renders CRISP (no
          blur — Eric; the 0.4px exception is desktop-only now). */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        {/* "scope" — script face, ~100px @390 ref, --ink, ~1px tracking (frame 179×81).
            Brief S2c — the face has ONLY a 400 cut; body sets font-weight:700, so without an
            explicit weight the browser SYNTHESIZED bold (the thickening). Pin weight 400 +
            style normal + font-synthesis:none so the loaded Regular renders with no faking. */}
        <span style={{ fontFamily: "var(--font-script)", fontWeight: 400, fontStyle: "normal", fontSynthesis: "none", fontSize: 100, lineHeight: 0.85, letterSpacing: "1px", color: "var(--ink-100)", display: "block", opacity: wordmarkReady ? 1 : 0, transition: "opacity 120ms ease" }}>
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
    </div>
  );
}
