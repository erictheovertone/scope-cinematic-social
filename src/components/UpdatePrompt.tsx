"use client";
// ── UpdatePrompt — "a new build is live, reload" (Brief ARR-8 §6) ─────────────────────────────────
// Scope is a standalone PWA with NO service worker, and warm foreground returns never reload — so a
// member keeps running the client bundle they first loaded for days after a deploy (the stale-shell
// Eric saw). This polls /api/version (the LIVE deployment's SHA, on a path skew protection does not
// pin) and, when it no longer matches the SHA baked into THIS bundle, offers a one-line reload.
//   • checks on visibilitychange→visible and every 15 min;
//   • a reload preserves the current route (location.reload keeps the URL);
//   • NEVER interrupts an open create draft or an in-flight upload — deferred until that closes.
import { useEffect, useRef, useState } from "react";

const LOADED_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
const CHECK_EVERY_MS = 15 * 60 * 1000; // 15 minutes

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };

/** Defer while the create flow / an upload is active: `suiteOpen` marks an open takeover (the create
 *  flow sets it), and `scope:create-live` marks a create session holding media (an in-flight upload). */
function createBusy(): boolean {
  try {
    if (document.documentElement.dataset.suiteOpen) return true;
    if (localStorage.getItem("scope:create-live")) return true;
  } catch { /* storage off */ }
  return false;
}

export default function UpdatePrompt() {
  const [stale, setStale] = useState(false); // the live deployment moved past this bundle
  const [show, setShow] = useState(false);   // stale AND not mid-create
  const inFlight = useRef(false);

  // Expose the bundle's SHA for the harness (public NEXT_PUBLIC value; lets the "matched" test echo
  // the exact loaded SHA, immune to dev-time recompile drift).
  useEffect(() => { try { (window as unknown as { __scopeBuildSha?: string }).__scopeBuildSha = LOADED_SHA; } catch { /* noop */ } }, []);

  // Poll the live SHA. A manual no-store fetch (no ?dpl) is not skew-pinned → it reaches the current
  // deployment, so the SHA moves on deploy. Once stale, stop polling (the answer won't change back).
  useEffect(() => {
    if (LOADED_SHA === "dev" || stale) return;
    let dead = false;
    const check = async () => {
      if (inFlight.current || dead) return;
      inFlight.current = true;
      try {
        const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        if (r.ok) {
          const { sha } = (await r.json()) as { sha?: string };
          if (sha && sha !== "dev" && sha !== LOADED_SHA && !dead) setStale(true);
        }
      } catch { /* offline / transient — the next tick retries */ }
      finally { inFlight.current = false; }
    };
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => void check(), CHECK_EVERY_MS);
    void check(); // once on mount
    return () => { dead = true; document.removeEventListener("visibilitychange", onVis); window.clearInterval(id); };
  }, [stale]);

  // Surface the pill only when the build is stale AND no create/upload is in flight; re-evaluate the
  // busy gate on a short interval so the pill appears the moment the flow closes.
  useEffect(() => {
    if (!stale) { setShow(false); return; }
    const sync = () => setShow(!createBusy());
    sync();
    const id = window.setInterval(sync, 1500);
    return () => window.clearInterval(id);
  }, [stale]);

  if (!show) return null;
  return (
    <button
      type="button"
      data-testid="update-pill"
      onClick={() => { try { location.reload(); } catch { /* noop */ } }}
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        // Above the bottom tab bar + the home indicator.
        bottom: "calc(var(--safe-bottom, 0px) + 72px)",
        zIndex: 480,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 16px",
        background: "var(--ink-100)",
        color: "var(--on-ink)",
        border: "none",
        borderRadius: 999,
        cursor: "pointer",
        boxShadow: "0 6px 20px rgb(var(--black-rgb) / 0.35)",
        animation: "updatePillIn 280ms cubic-bezier(0.16,0.84,0.3,1) both",
      }}
    >
      <span style={{ ...BOLD, fontSize: 11, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Update available</span>
      <span aria-hidden style={{ opacity: 0.5 }}>·</span>
      <span style={{ ...BOLD, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>Reload</span>
      <style>{`@keyframes updatePillIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
    </button>
  );
}
