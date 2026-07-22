"use client";

// ── Welcome / Lander (Brief S2, Figma 93:674) ────────────────────────────────
// The cold-load destination for logged-out users (F5 §3 routes here). Radically
// minimal per the frame: canvas #050505, and ONE centered-upper row —
// "Login" · the blurred logomark (baked-blur art) · "Sign Up" on a single baseline.
// Both actions enter the SAME existing Privy useLogin flow (the current auth setup
// does NOT distinguish login vs signup) → onComplete → /auth/callback. Auth logic
// is untouched — entry points only. The old bordered two-button box + 750ms
// FrameLoader are gone (not in the frame; the welcome now renders directly, no flash).

import { useRouter } from "next/navigation";
import { useLogin } from "@privy-io/react-auth";
import DesktopLanding from "@/components/desktop/DesktopLanding";
import { useIsDesktop } from "@/lib/useIsDesktop";

export default function Welcome() {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const { login } = useLogin({
    onComplete: () => router.push("/auth/callback"),
    onError: (error) => { console.log("Authentication error:", error); },
  });

  // DESKTOP SEAM: the logged-out desktop landing (mobile welcome untouched).
  if (isDesktop) return <DesktopLanding />;

  const action: React.CSSProperties = {
    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24,
    letterSpacing: "var(--track-display)", color: "var(--ink-100)",
    background: "transparent", border: "none", cursor: "pointer",
    padding: "10px 6px", lineHeight: 1, whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "var(--canvas)", boxSizing: "border-box",
        // Centered-upper (frame: logomark top ≈ 33% of 844).
        paddingTop: "calc(33vh + var(--safe-top))",
        paddingLeft: "calc(4px + var(--safe-left))",
        paddingRight: "calc(4px + var(--safe-right))",
      }}
    >
      {/* Login · logomark · Sign Up — single baseline; logomark exactly centred via a
          1fr | auto | 1fr grid (Login left-anchored, Sign Up right-anchored). */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 6, padding: "0 38px" }}>
        <button onClick={login} className="tap-target" aria-label="Log in" style={{ ...action, justifySelf: "start", textAlign: "left" }}>
          Login
        </button>
        <img src="/design-updates-071526/welcome-logomark-blur.png" alt="Scope" style={{ width: 116, height: "auto", objectFit: "contain", display: "block" }} />
        <button onClick={login} className="tap-target" aria-label="Sign up" style={{ ...action, justifySelf: "end", textAlign: "right" }}>
          Sign Up
        </button>
      </div>
    </div>
  );
}
