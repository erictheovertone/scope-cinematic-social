'use client';

// ── TopUpPendingHost (BAL-1b §4 + BAL-1b.1 §4/5/6/7) — docked wait pill + "B · Slate" landing ──────
// Mounted once at the app root (Providers), so it survives client navigation.
//
// On 'scope:topup-pending' it shows a docked pill ("Adding $25.00 · usually under a minute"). The
// pending record carries the START balance + start time, captured when Continue was pressed, so a
// reload after the money lands still detects the rise (§6).
//
// Every outcome ends (§6):
//   • completed → the Slate lands
//   • rejected / expired → a plain line "That top-up didn't go through." then clear
//   • still pending after 10 min → "Taking longer than usual. Check your balance in a bit." then clear
//
// Detection (§5 — no timer standing in for an event):
//   • LIVE: poll the real on-chain USDC balance; land when it rises above the captured start.
//   • TEST: poll the authed status read (/api/onramp/stripe/session?id=…) and land when Stripe reports
//     fulfillment_complete. No funds move, so the land shows the REAL (unchanged) balance — never faked.
//   Both modes also watch the status for rejected/expired and the 10-minute cap.
//
// The land is "B · Slate" (the approved take), built from the mock as drawn: full-screen, letterbox
// bars slam shut (140ms), the six blades clap, grain flickers, the balance counts up at 56px with a
// running timecode, then the bars snap open on the screen the member was on (~1.3s). Reduced motion:
// the number swaps, no bars. (The collect finish/stamp is BAL-1c, not here.)
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy, useWallets, getAccessToken } from '@privy-io/react-auth';
import { getEmbeddedAddress } from '@/lib/embeddedWallet';
import { getUsdcBalance } from '@/lib/wallet';
import { SLATE_BLADES } from '@/components/economy/slateBlades';

type Mode = 'test' | 'live';
type Pending = { amount: number; mode: Mode; sessionId?: string; startBal: number; startedAt: number };
type Land = { from: number; to: number; mode: Mode };

const DISP: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 700 };
const NUM: React.CSSProperties = { fontFamily: 'var(--font-medium)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' };
const KEY = 'scope:topup-pending';
const usd = (n: number) => `$${n.toFixed(2)}`;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tcOf = (f: number) => `TC 00:00:${String(41 + Math.floor(f / 24)).padStart(2, '0')}:${String(f % 24).padStart(2, '0')}`;

export default function TopUpPendingHost() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const address = getEmbeddedAddress(user, wallets);
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);   // §6 non-landing endings
  const [land, setLand] = useState<Land | null>(null);
  const [closed, setClosed] = useState(false);                  // letterbox bars shut
  const [rolled, setRolled] = useState(0);                      // counting number
  const [tc, setTc] = useState(tcOf(0));                        // running timecode
  const timers = useRef<number[]>([]);

  useEffect(() => { setMounted(true); }, []);
  // restore across a full reload — the captured start travels with it
  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setPending(JSON.parse(s)); } catch { /* */ } }, []);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail as Pending; setNotice(null); setPending(d); try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* */ } };
    window.addEventListener('scope:topup-pending', on);
    return () => window.removeEventListener('scope:topup-pending', on);
  }, []);

  const clearPending = useCallback(() => { try { sessionStorage.removeItem(KEY); } catch { /* */ } setPending(null); }, []);
  const readBal = useCallback(async () => { if (!address) return 0; try { return Number(await getUsdcBalance(address)) || 0; } catch { return 0; } }, [address]);

  // §6 — a non-landing ending: a plain line, briefly, then gone.
  const endWith = useCallback((msg: string) => { clearPending(); setNotice(msg); window.setTimeout(() => setNotice(null), 4200); }, [clearPending]);

  const fireLand = useCallback((from: number, to: number, mode: Mode) => {
    clearPending();
    timers.current.forEach(clearTimeout); timers.current = [];
    if (reduced()) { setLand({ from, to, mode }); setRolled(to); timers.current.push(window.setTimeout(() => setLand(null), 900)); return; }
    setLand({ from, to, mode }); setRolled(from); setClosed(false); setTc(tcOf(0));
    // slam the bars shut on the next frame so the .14s transition plays
    requestAnimationFrame(() => requestAnimationFrame(() => setClosed(true)));
    // running timecode at 24fps
    let f = 0; const tcId = window.setInterval(() => { f++; setTc(tcOf(f)); }, 1000 / 24);
    // the number counts up from 160ms over 900ms (cubic ease-out), as in the mock
    timers.current.push(window.setTimeout(() => {
      const t0 = performance.now(); const dur = 900;
      const step = () => { const p = Math.min(1, (performance.now() - t0) / dur); setRolled(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, 160));
    // bars snap open on the screen they were on at ~1.3s, then the overlay leaves
    timers.current.push(window.setTimeout(() => { clearInterval(tcId); setClosed(false); }, 1300));
    timers.current.push(window.setTimeout(() => setLand(null), 1500));
  }, [clearPending]);

  // detection — one poller owns every ending (§5/§6)
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const from = pending.startBal ?? 0;
    const startedAt = pending.startedAt ?? Date.now();
    const sid = pending.sessionId;
    const everyMs = pending.mode === 'test' ? 3000 : 5000;
    const poll = window.setInterval(async () => {
      if (!alive) { clearInterval(poll); return; }
      // authed status read — terminal states for BOTH modes, test completion
      if (sid) {
        try {
          const token = await getAccessToken();
          const r = await fetch(`/api/onramp/stripe/session?id=${encodeURIComponent(sid)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (r.ok) {
            const j = (await r.json()) as { status?: string };
            const s = j.status;
            if (s === 'rejected' || s === 'expired') { clearInterval(poll); endWith('That top-up didn’t go through.'); return; }
            if (pending.mode === 'test' && s === 'fulfillment_complete') {
              clearInterval(poll); const b = await readBal(); fireLand(from, b, 'test'); return; // real + unchanged
            }
          }
        } catch { /* keep polling */ }
      }
      // LIVE lands on the real on-chain rise
      if (pending.mode === 'live') {
        const b = await readBal();
        if (b > from) { clearInterval(poll); fireLand(from, b, 'live'); return; }
      }
      if (Date.now() - startedAt > 10 * 60_000) { clearInterval(poll); endWith('Taking longer than usual. Check your balance in a bit.'); }
    }, everyMs);
    return () => { alive = false; clearInterval(poll); };
  }, [pending, readBal, fireLand, endWith]);

  // Inert unless ?debug=topup — lets the gated /debug/topup harness play the Slate for review shots
  // (same "inert until flagged" pattern as the other debug overlays). Never fires in product use.
  useEffect(() => {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('debug') !== 'topup') return;
    const on = (e: Event) => { const d = (e as CustomEvent).detail as Land; fireLand(d.from, d.to, d.mode); };
    window.addEventListener('scope:topup-demo-land', on);
    return () => window.removeEventListener('scope:topup-demo-land', on);
  }, [fireLand]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  if (!mounted || (!pending && !land && !notice)) return null;

  const bar: React.CSSProperties = { position: 'absolute', left: 0, right: 0, height: '50.6%', background: '#000' /* theme-ok: letterbox bar */, transition: 'transform 140ms cubic-bezier(.4,0,1,1)' };

  return createPortal(
    <>
      {/* ── docked wait pill + §6 endings ── */}
      {(pending || notice) && !land && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--safe-bottom, 0px) + 78px)', zIndex: 690, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          {notice ? (
            <div style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', maxWidth: 'calc(100vw - 32px)', background: 'var(--surface-08)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgb(var(--ink-rgb) / 0.14)', borderRadius: 999, padding: '9px 16px', fontSize: 12, color: 'var(--ink-100)', boxShadow: '0 6px 24px rgb(var(--canvas-rgb) / 0.4)' }}>
              {notice}
            </div>
          ) : pending && (
            // Compact docked pill, sentence case, one line — as the mock draws it (lab 10px / mono 11px).
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 32px)', background: 'var(--surface-08)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgb(var(--ink-rgb) / 0.14)', borderRadius: 999, padding: '8px 14px', color: 'var(--ink-100)', boxShadow: '0 6px 24px rgb(var(--canvas-rgb) / 0.4)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: 'var(--brass)', animation: 'topupPulse 1.4s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, letterSpacing: '0.12em', color: 'rgb(var(--ink-rgb) / 0.75)' }}>Adding</span>
              <span style={{ ...NUM, fontSize: 11 }}>{usd(pending.amount)}</span>
              <span style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 10, letterSpacing: '0.12em', color: 'rgb(var(--ink-rgb) / 0.45)' }}>· usually under a minute</span>
              {pending.mode === 'test' && <span style={{ fontFamily: 'var(--font-medium)', fontSize: 8, flexShrink: 0, color: 'var(--brass)', border: '1px solid var(--brass)', padding: '1px 4px', borderRadius: 3 }}>TEST</span>}
            </div>
          )}
        </div>
      )}

      {/* ── B · Slate — full-screen landing over the screen they were on ── */}
      {land && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 760, pointerEvents: 'none', overflow: 'hidden' }}>
          {!reduced() && (
            <>
              <div style={{ ...bar, top: 0, transform: closed ? 'translateY(0)' : 'translateY(-101%)' }} />
              <div style={{ ...bar, top: '50%', transform: closed ? 'translateY(0)' : 'translateY(101%)' }} />
              <div style={{ position: 'absolute', inset: 0, opacity: closed ? 0.5 : 0, mixBlendMode: 'screen', backgroundImage: 'radial-gradient(rgb(255 255 255 / .18) .5px, transparent .6px)', backgroundSize: '3px 3px', animation: closed ? 'topupGrain .08s steps(2) infinite' : 'none' }} />
              <svg viewBox="-333 -204 666 408" style={{ position: 'absolute', left: '50%', top: '50%', width: 220, height: 134, margin: '-67px 0 0 -110px', fill: '#E5E1DB' /* theme-ok: slate blades over black letterbox */, animation: 'topupClap .5s steps(1,end) both' }}>
                {SLATE_BLADES.map((b, i) => (
                  <path key={i} d={b.d} style={{ transformBox: 'view-box', transformOrigin: '50% 50%', transform: closed ? 'none' : `translateX(${b.spread}px)`, transition: 'transform 140ms cubic-bezier(.4,0,1,1)' }} />
                ))}
              </svg>
            </>
          )}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', display: 'grid', justifyItems: 'center', gap: 12, color: '#E5E1DB' /* theme-ok: slate face over black letterbox */, opacity: reduced() || closed ? 1 : 0, transition: 'opacity 100ms ease 120ms' }}>
            <span style={{ ...DISP, fontWeight: 500, fontFamily: 'var(--font-medium)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgb(229 225 219 / .55)' }}>Balance{land.mode === 'test' ? ' · test' : ''}</span>
            <b style={{ ...NUM, fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em' }}>{usd(rolled)}</b>
            {!reduced() && <span style={{ ...NUM, fontSize: 11, color: 'rgb(229 225 219 / .55)', letterSpacing: '0.06em' }}>{tc}</span>}
          </div>
        </div>
      )}
      <style>{`@keyframes topupPulse{0%,100%{opacity:1}50%{opacity:.3}}@keyframes topupClap{0%{opacity:1}55%{opacity:1}56%{opacity:0}100%{opacity:0}}@keyframes topupGrain{0%{transform:translate(0,0)}50%{transform:translate(1px,-1px)}100%{transform:translate(-1px,1px)}}`}</style>
    </>,
    document.body,
  );
}
