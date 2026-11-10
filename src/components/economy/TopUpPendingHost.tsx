'use client';

// ── TopUpPendingHost (BAL-1b §4) — docked wait pill + "Slate" landing (B) ─────────────────────────
// Mounted once at the app root (Providers), so it survives client navigation. On 'scope:topup-pending'
// it shows a docked pill ("ADDING $25.00 · USUALLY UNDER A MINUTE"). LIVE: it fires the land only when
// the real on-chain USDC balance goes up (same detection as the wallet page). TEST: no funds move, so
// it lands shortly after (the test session reaches fulfillment_complete), tagged TEST, and shows the
// REAL (unchanged) balance — never a fabricated number. The land is the "Slate": the balance readout
// grows, a hairline sweeps, the number odometer-rolls old→new, then it snaps away (~1.3s), leaving the
// member exactly where they were. Reduced motion: the number swaps, no bars. (The collect stamp is BAL-1c.)
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { getEmbeddedAddress } from '@/lib/embeddedWallet';
import { getUsdcBalance } from '@/lib/wallet';

type Pending = { amount: number; mode: 'test' | 'live' };
const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const KEY = 'scope:topup-pending';
const usd = (n: number) => `$${n.toFixed(2)}`;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function TopUpPendingHost() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const address = getEmbeddedAddress(user, wallets);
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [land, setLand] = useState<{ from: number; to: number; mode: 'test' | 'live' } | null>(null);
  const [rolled, setRolled] = useState(0);        // odometer display value
  const [grown, setGrown] = useState(false);      // 1.45x grow toggle

  useEffect(() => { setMounted(true); }, []);
  // restore across a full reload
  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setPending(JSON.parse(s)); } catch { /* */ } }, []);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail as Pending; setPending(d); try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* */ } };
    window.addEventListener('scope:topup-pending', on);
    return () => window.removeEventListener('scope:topup-pending', on);
  }, []);

  const readBal = useCallback(async () => { if (!address) return 0; try { return Number(await getUsdcBalance(address)); } catch { return 0; } }, [address]);

  const fireLand = useCallback((from: number, to: number, mode: 'test' | 'live') => {
    try { sessionStorage.removeItem(KEY); } catch { /* */ }
    setPending(null);
    setLand({ from, to, mode });
    if (reduced()) { setRolled(to); setGrown(false); setTimeout(() => setLand(null), 900); return; }
    setGrown(true); setRolled(from);
    const t0 = performance.now();
    const dur = 900; // odometer roll
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      setRolled(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => setGrown(false), 1000);     // settle back
    setTimeout(() => setLand(null), 1600);        // 160ms snap-out after ~1.4s
  }, []);

  // detection
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    (async () => {
      const from = await readBal();
      if (pending.mode === 'test') {
        await new Promise((r) => setTimeout(r, 2600)); // no funds move; ~ when the test session completes
        if (alive) fireLand(from, from, 'test');        // balance is REAL + unchanged
      } else {
        const t0 = Date.now();
        const poll = window.setInterval(async () => {
          if (!alive) { clearInterval(poll); return; }
          const b = await readBal();
          if (b > from) { clearInterval(poll); fireLand(from, b, 'live'); }
          else if (Date.now() - t0 > 10 * 60_000) clearInterval(poll); // 10 min: stop polling, keep the pill
        }, 5000);
      }
    })();
    return () => { alive = false; };
  }, [pending, readBal, fireLand]);

  if (!mounted || (!pending && !land)) return null;

  return createPortal(
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--safe-bottom, 0px) + 78px)', zIndex: 690, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      {pending && !land && (
        <div style={{ ...SKB, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface-08)', border: '1px solid rgb(var(--ink-rgb) / 0.12)', borderRadius: 999, padding: '9px 16px', fontSize: 'var(--fs-11)', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-100)', boxShadow: '0 6px 24px rgb(var(--canvas-rgb) / 0.4)' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--brass)', animation: 'topupPulse 1.4s ease-in-out infinite' }} />
          Adding {usd(pending.amount)} · usually under a minute
          {pending.mode === 'test' && <span style={{ fontSize: 8, color: 'var(--brass)', border: '1px solid var(--brass)', padding: '1px 4px', borderRadius: 3 }}>TEST</span>}
        </div>
      )}
      {land && (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, transformOrigin: 'right center', transform: grown ? 'scale(1.45)' : 'scale(1)', transition: 'transform 1s cubic-bezier(0.22,1,0.36,1)' }}>
          <span style={{ ...SKB, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--ink-rgb) / 0.5)' }}>Balance{land.mode === 'test' ? ' · test' : ''}</span>
          <span style={{ ...SKB, fontSize: 'var(--fs-24)', color: 'var(--ink-100)', fontVariantNumeric: 'tabular-nums' }}>{usd(rolled)}</span>
          <span style={{ display: 'block', height: 1, width: 48, background: 'var(--brass)', opacity: grown ? 1 : 0, transition: 'opacity 0.3s ease' }} />
        </div>
      )}
      <style>{`@keyframes topupPulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
    </div>,
    document.body,
  );
}
