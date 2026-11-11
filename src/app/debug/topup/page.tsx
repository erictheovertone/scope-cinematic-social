"use client";

// ── /debug/topup — Stripe EMBEDDED Crypto Onramp (BAL-1e) ─────────────────────────────────────────
// Everything happens on scopeapp.world — NO redirect to crypto.link.com. One mounted widget
// (@stripe/crypto → createSession(clientSecret).mount()) handles OTP → KYC → payment → delivery inside
// a Stripe iframe; we only create the locked session (amount/email/wallet prefilled) and read its
// status events. The "server sequence" (Link auth / OAuth / wallet registration / payment token) in the
// brief is NOT a real Stripe API — the widget does all of it internally. Appearance supports only
// { theme } — brand colour/logo/font are Stripe Dashboard branding settings (see the report).
// Debug-gated (?debug=topup). No product UI.
import { useEffect, useRef, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { loadStripeOnramp } from "@stripe/crypto";
import { getEmbeddedAddress } from "@/lib/embeddedWallet";
import { getUsdcBalance } from "@/lib/wallet";
import { track } from "@/lib/funnel";
import TopUpSheet from "@/components/economy/TopUpSheet";

// Load once outside render (per Stripe's guidance) — the script comes from Stripe's own domains.
const onrampPromise = loadStripeOnramp(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
const AMOUNTS = [10, 25, 50] as const;

// @stripe/crypto's session is loosely typed across versions — the minimal surface we use.
type OnrampEvt = { payload: { session: { status: string } } };
type OnrampSession = {
  mount: (el: HTMLElement | string) => void;
  addEventListener: (type: string, cb: (e: OnrampEvt) => void) => OnrampSession;
};

export default function TopupDebug() {
  const { user, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const address = getEmbeddedAddress(user, wallets);
  const email = user?.email?.address ?? (user as { google?: { email?: string } } | null)?.google?.email ?? null;

  const [mounted, setMounted] = useState(false);
  const [gated, setGated] = useState(false);
  const [shots, setShots] = useState(false);                 // BAL-1b.1 — ?debug=topup&shots=1: render the real components for review shots
  const [sheet, setSheet] = useState<null | "wallet" | "collect">(null);
  const [status, setStatus] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(false); // collapsed by default so it never competes for height
  const mountRef = useRef<HTMLDivElement>(null);
  const startBalRef = useRef<number>(0);
  const say = useCallback((m: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 50)), []);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted) { const q = new URLSearchParams(window.location.search); setGated(q.get("debug") === "topup"); setShots(q.get("shots") === "1"); } }, [mounted]);

  const readBalance = useCallback(async (addr: string) => {
    try { const b = await getUsdcBalance(addr); setBalance(b); return Number(b); } catch (e) { say(`balance error: ${(e as Error).message}`); return null; }
  }, [say]);

  useEffect(() => {
    if (!gated || !address) return;
    void readBalance(address);
    track("topup_opened", { address });
    say(`topup_opened · wallet ${address.slice(0, 10)}… · email ${email ?? "(none)"}`);
  }, [gated, address, email, readBalance, say]);

  const start = async (amount: number) => {
    if (!authenticated) { login(); return; }
    if (!address) { say("no embedded wallet address yet"); return; }
    setWorking(true); setStatus(null);
    try {
      startBalRef.current = (await readBalance(address)) ?? 0;
      await track("topup_started", { amount, address });
      say(`topup_started $${amount} → creating session…`);
      const { getAccessToken } = await import("@privy-io/react-auth");
      const token = await getAccessToken();
      const res = await fetch("/api/onramp/stripe/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount, walletAddress: address, email }),
      });
      const j = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !j.clientSecret) { say(`session error: ${j.error ?? res.status}`); setWorking(false); return; }

      const onramp = await onrampPromise;
      if (!onramp || !mountRef.current) { say("stripe onramp failed to load"); setWorking(false); return; }
      mountRef.current.innerHTML = ""; // clear any prior mount
      say("session created → mounting embedded onramp (theme: dark)…");
      const session = (onramp as unknown as { createSession: (o: unknown) => OnrampSession })
        .createSession({ clientSecret: j.clientSecret, appearance: { theme: "dark" } });
      session.addEventListener("onramp_ui_loaded", () => say("onramp_ui_loaded — Stripe widget rendered"));
      session.addEventListener("onramp_session_updated", (e: OnrampEvt) => {
        const st = e.payload.session.status;
        setStatus(st);
        say(`onramp_session_updated: ${st}`);
        if (st === "fulfillment_complete") {
          // the webhook fires topup_completed; here we confirm USDC landed on-chain + time it.
          const started = Date.now();
          const poll = window.setInterval(async () => {
            const b = await readBalance(address);
            if (b != null && b > startBalRef.current) {
              say(`✓ USDC landed: +${(b - startBalRef.current).toFixed(2)} after ${Math.round((Date.now() - started) / 1000)}s from fulfillment`);
              clearInterval(poll);
            } else if (Date.now() - started > 10 * 60 * 1000) { say("⏱ 10 min, no on-chain increase"); clearInterval(poll); }
          }, 5000);
        }
      });
      session.mount(mountRef.current);
      setWorking(false);
    } catch (e) {
      say(`error: ${(e as Error).message}`);
      setWorking(false);
    }
  };

  // Reset — unmount the Stripe widget (removes the iframe) so a fresh amount can remount it.
  const reset = () => { if (mountRef.current) mountRef.current.innerHTML = ""; setStatus(null); setWorking(false); say("reset — widget unmounted"); };

  if (!mounted) return <div style={{ minHeight: "100dvh", background: "#050505" }} />;
  if (!gated) return <div style={{ minHeight: "100dvh", background: "#050505", color: "#E5E1DB", fontFamily: "monospace", padding: 24 }}>Append <b>?debug=topup</b> to run /debug/topup.</div>;

  // ── BAL-1b.1 shots harness (?debug=topup&shots=1) — renders the REAL TopUpSheet + drives the pill /
  // Slate (TopUpPendingHost, mounted at app root) via the gated demo events. The page ground is a
  // theme token so light/dark both read right; no auth needed for the layout. ──────────────────────
  if (shots) {
    const demoPill = () => window.dispatchEvent(new CustomEvent("scope:topup-pending", { detail: { amount: 25, mode: "test", startBal: 128.4, startedAt: Date.now() } }));
    const demoLand = () => window.dispatchEvent(new CustomEvent("scope:topup-demo-land", { detail: { from: 128.4, to: 153.4, mode: "live" } }));
    const bbtn: React.CSSProperties = { padding: "10px 14px", background: "transparent", color: "var(--ink-100)", border: "1px solid rgb(var(--ink-rgb) / 0.3)", borderRadius: 4, fontFamily: "var(--font-medium)", fontSize: 12, cursor: "pointer" };
    return (
      <div style={{ position: "fixed", inset: 0, overflowY: "auto", background: "var(--canvas)", boxSizing: "border-box", padding: "16px 16px calc(120px + var(--safe-bottom, 0px))" }} data-topup-shots>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button data-shot="open-wallet" onClick={() => setSheet("wallet")} style={bbtn}>sheet · wallet</button>
          <button data-shot="open-collect" onClick={() => setSheet("collect")} style={bbtn}>sheet · collect</button>
          <button data-shot="pill" onClick={demoPill} style={bbtn}>pill</button>
          <button data-shot="slate" onClick={demoLand} style={bbtn}>Slate</button>
        </div>
        {/* wallet: dollars only, no counts. collect: counts at $3/collect, $4 shortfall → preselect $10, 3/8/16. */}
        <TopUpSheet open={sheet === "wallet"} onClose={() => setSheet(null)} source="wallet" onOtherWays={() => {}} />
        <TopUpSheet open={sheet === "collect"} onClose={() => setSheet(null)} source="collect" shortfallUsd={4} pricePerCollect={3} onOtherWays={() => {}} />
      </div>
    );
  }

  const L: React.CSSProperties = { fontFamily: "monospace", color: "#E5E1DB" };
  const mountedWidget = status != null;
  return (
    // BAL-1e.1 — OWN fixed-inset scroller: html/body are locked (scroll-trap rule), so a plain block
    // never scrolls and the tall Stripe iframe's accept/continue button sits below the fold. This
    // height-bounded scroller scrolls on phone + desktop; generous safe-area bottom padding lets the
    // widget's last button rise above the nav/pill.
    <div style={{ position: "fixed", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#050505", boxSizing: "border-box", padding: "16px 16px calc(140px + env(safe-area-inset-bottom, 0px))", ...L }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>BAL-1e · Stripe EMBEDDED onramp — /debug/topup</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, background: "#0d0d0d", border: "1px solid #222", padding: 12, borderRadius: 4, marginBottom: 12 }}>
        <div>authed: <b style={{ color: authenticated ? "#3f8" : "#f55" }}>{String(authenticated)}</b></div>
        <div>embedded wallet: <b style={{ color: "#4af", wordBreak: "break-all" }}>{address ?? "—"}</b></div>
        <div>email: <b>{email ?? "—"}</b></div>
        <div>USDC balance: <b style={{ color: "#3f8" }}>{balance ?? "…"}</b> · status: <b style={{ color: "#4af" }}>{status ?? "—"}</b></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {AMOUNTS.map((a) => (
          <button key={a} onClick={() => start(a)} disabled={working || !authenticated}
            style={{ flex: 1, padding: "16px 0", background: working ? "#333" : "#E5E1DB", color: working ? "#fff" : "#050505", border: "none", borderRadius: 4, fontSize: 18, fontWeight: 700, fontFamily: "monospace", cursor: working ? "default" : "pointer" }}>
            ${a}
          </button>
        ))}
        <button onClick={reset} disabled={!mountedWidget}
          style={{ padding: "16px 14px", background: "transparent", color: mountedWidget ? "#E5E1DB" : "#555", border: "1px solid #444", borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: "monospace", cursor: mountedWidget ? "pointer" : "default" }}>
          RESET
        </button>
      </div>
      {/* Stripe injects the onramp iframe here — the whole flow renders inside our page. Tall min-height
          so its own accept/continue buttons have room; no overflow clipping; the page scrolls past it. */}
      <div ref={mountRef} id="onramp-element" style={{ minHeight: mountedWidget ? 720 : 0, width: "100%", overflow: "visible", marginBottom: 16 }} />
      {/* Log BELOW the widget + collapsed by default so it never competes for the widget's height. */}
      <button onClick={() => setLogOpen((v) => !v)} style={{ background: "transparent", border: "none", color: "#888", fontFamily: "monospace", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 4 }}>
        {logOpen ? "▾" : "▸"} events / log ({log.length})
      </button>
      {logOpen && <pre style={{ fontSize: 11, color: "#aaa", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, maxHeight: "40dvh", overflowY: "auto" }}>{log.join("\n")}</pre>}
    </div>
  );
}
