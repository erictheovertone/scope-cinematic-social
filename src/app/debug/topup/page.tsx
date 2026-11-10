"use client";

// ── /debug/topup — Stripe hosted onramp plumbing test (BAL-1h #3) ─────────────────────────────────
// Debug-gated (?debug=topup). Three amounts → POST /api/onramp/stripe/session → redirect to Stripe's
// hosted page. On return, poll the embedded wallet's USDC balance via the Alchemy Base RPC every 5s,
// stop when it increases (deposit landed) or after 10 min. Funnel: topup_opened on mount, topup_started
// before redirect; topup_completed/failed arrive via the webhook. No product UI.
import { useEffect, useRef, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getEmbeddedAddress } from "@/lib/embeddedWallet";
import { getUsdcBalance } from "@/lib/wallet";
import { track } from "@/lib/funnel";

const PENDING_KEY = "scope:topup-pending";
const AMOUNTS = [10, 25, 50] as const;
const POLL_MS = 5000;
const MAX_MS = 10 * 60 * 1000;

type Pending = { amount: number; startBalance: string; startAt: number };

export default function TopupDebug() {
  const { user, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const address = getEmbeddedAddress(user, wallets);
  const email = user?.email?.address ?? (user as { google?: { email?: string } } | null)?.google?.email ?? null;

  const [mounted, setMounted] = useState(false);
  const [gated, setGated] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const pollRef = useRef<number | undefined>(undefined);
  const say = useCallback((m: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 40)), []);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const on = new URLSearchParams(window.location.search).get("debug") === "topup";
    setGated(on);
  }, [mounted]);

  // Balance read + poll-on-return.
  const readBalance = useCallback(async (addr: string) => {
    try { const b = await getUsdcBalance(addr); setBalance(b); return b; } catch (e) { say(`balance read error: ${(e as Error).message}`); return null; }
  }, [say]);

  useEffect(() => {
    if (!gated || !address) return;
    void readBalance(address);
    track("topup_opened", { address });
    say(`topup_opened · wallet ${address.slice(0, 10)}… · email ${email ?? "(none)"}`);

    // Returning from Stripe with a pending top-up → poll until the balance rises or 10 min.
    let pending: Pending | null = null;
    try { const raw = sessionStorage.getItem(PENDING_KEY); if (raw) pending = JSON.parse(raw); } catch { /* */ }
    if (pending) {
      say(`returned from Stripe — polling USDC every 5s (expect +${pending.amount}); start ${pending.startBalance}`);
      const start = Number(pending.startBalance);
      pollRef.current = window.setInterval(async () => {
        const b = await readBalance(address);
        const now = Date.now();
        if (b != null && Number(b) > start) {
          const delta = (Number(b) - start).toFixed(2);
          say(`✓ USDC arrived: +${delta} (balance ${b}) after ${Math.round((now - (pending as Pending).startAt) / 1000)}s`);
          try { sessionStorage.removeItem(PENDING_KEY); } catch { /* */ }
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (now - (pending as Pending).startAt > MAX_MS) {
          say(`⏱ stopped polling after 10 min — no increase (balance ${b})`);
          try { sessionStorage.removeItem(PENDING_KEY); } catch { /* */ }
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, POLL_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [gated, address, email, readBalance, say]);

  const start = async (amount: number) => {
    if (!authenticated) { login(); return; }
    if (!address) { say("no embedded wallet address yet"); return; }
    setWorking(true);
    try {
      const startBalance = (await readBalance(address)) ?? "0";
      await track("topup_started", { amount, address });
      say(`topup_started $${amount} → creating session…`);
      const { getAccessToken } = await import("@privy-io/react-auth");
      const token = await getAccessToken();
      const res = await fetch("/api/onramp/stripe/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount, walletAddress: address, email }),
      });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) { say(`session error: ${j.error ?? res.status}`); setWorking(false); return; }
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ amount, startBalance, startAt: Date.now() } satisfies Pending)); } catch { /* */ }
      say(`session created → redirecting to ${j.url.slice(0, 48)}…`);
      window.location.href = j.url; // same-tab redirect to Stripe's hosted page
    } catch (e) {
      say(`error: ${(e as Error).message}`);
      setWorking(false);
    }
  };

  if (!mounted) return <div style={{ minHeight: "100dvh", background: "#000" }} />;
  if (!gated) return <div style={{ minHeight: "100dvh", background: "#000", color: "#fff", fontFamily: "monospace", padding: 24 }}>Append <b>?debug=topup</b> to run /debug/topup.</div>;

  const L: React.CSSProperties = { fontFamily: "monospace", color: "#fff" };
  return (
    <div style={{ minHeight: "100dvh", background: "#000", padding: 16, boxSizing: "border-box", ...L }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>BAL-1h · Stripe onramp — /debug/topup</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, background: "#0a0a0a", border: "1px solid #222", padding: 12, borderRadius: 4, marginBottom: 12 }}>
        <div>authed: <b style={{ color: authenticated ? "#3f8" : "#f55" }}>{String(authenticated)}</b></div>
        <div>embedded wallet: <b style={{ color: "#4af", wordBreak: "break-all" }}>{address ?? "—"}</b></div>
        <div>email: <b>{email ?? "—"}</b></div>
        <div>USDC balance: <b style={{ color: "#3f8" }}>{balance ?? "…"}</b></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {AMOUNTS.map((a) => (
          <button key={a} onClick={() => start(a)} disabled={working || !authenticated}
            style={{ flex: 1, padding: "16px 0", background: working ? "#333" : "#fff", color: working ? "#fff" : "#000", border: "none", borderRadius: 4, fontSize: 18, fontWeight: 700, fontFamily: "monospace", cursor: working ? "default" : "pointer" }}>
            ${a}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>events / log:</div>
      <pre style={{ fontSize: 11, color: "#aaa", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, maxHeight: "40dvh", overflowY: "auto" }}>{log.join("\n")}</pre>
    </div>
  );
}
