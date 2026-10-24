// ── BuildStamp — the deploy this device is running (Brief P4 §1g) ─────────────
// Commit short-hash + build time, baked at build (next.config env). Shown at the foot of
// Settings so a stale PWA bundle is visible at a glance instead of guessed at.
const SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
const BUILT = process.env.NEXT_PUBLIC_BUILD_TIME;

export default function BuildStamp({ style }: { style?: React.CSSProperties }) {
  const when = BUILT ? new Date(BUILT).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <p style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, letterSpacing: "0.08em", color: "rgb(var(--ink-rgb) / 0.35)", padding: "0 20px calc(28px + var(--safe-bottom))", margin: 0, ...style }}>
      BUILD {SHA}{when ? ` · ${when}` : ""}
    </p>
  );
}
