'use client';

// ── TopUpSheet (BAL-1b) — "Add to your balance" ──────────────────────────────────────────────────
// The real top-up sheet on the live app. Portaled to document.body. Amounts $10/$25/$50 ($25 default,
// or the smallest covering a collect shortfall). Continue creates a server-decided session (test vs
// live — §3) and mounts Stripe's EMBEDDED onramp widget INSIDE the sheet (reusing /debug/topup's
// wiring), theme-matched. The body is an OWN fixed-inset scroller so every Stripe button is reachable
// at 375x667 (the thing that broke /debug/topup). No wallet/crypto words — it is a balance in dollars.
// On payment submitted the sheet closes and hands off to the docked pill (TopUpPendingHost).
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePrivy, useWallets, getAccessToken } from '@privy-io/react-auth';
import { loadStripeOnramp } from '@stripe/crypto';
import { getEmbeddedAddress } from '@/lib/embeddedWallet';
import { getUsdcBalance } from '@/lib/wallet';
import { track } from '@/lib/funnel';
import { TOPUP_AMOUNTS as AMOUNTS, collectsFor, preselectAmount } from '@/lib/onramp/topupMath';
// BAL-1b.1 §7 — the wallet's type tokens, not 'SK-Modernist'. Dollar FIGURES get tabular ("mono")
// numerals, matching the wallet balance readout (--font-medium + tabular-nums).
const SKB: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: 'var(--font-medium)', fontWeight: 500 };
const NUM: React.CSSProperties = { fontFamily: 'var(--font-medium)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' };

type OnrampEvt = { payload: { session: { status: string } } };
type OnrampSession = { mount: (el: HTMLElement | string) => void; addEventListener: (t: string, cb: (e: OnrampEvt) => void) => OnrampSession };

function appTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export interface TopUpSheetProps {
  open: boolean;
  onClose: () => void;
  source: 'wallet' | 'collect';
  /** collect-only: the dollars still needed, and the post's live $-per-collect (for the "N collects" labels). */
  shortfallUsd?: number | null;
  pricePerCollect?: number | null;
  /** quiet "Other ways to add" (Coinbase) — same handler as before. */
  onOtherWays?: () => void;
}

export default function TopUpSheet({ open, onClose, source, shortfallUsd, pricePerCollect, onOtherWays }: TopUpSheetProps) {
  const { user, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const address = getEmbeddedAddress(user, wallets);
  const email = user?.email?.address ?? (user as { google?: { email?: string } } | null)?.google?.email ?? null;

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState(25);
  const [working, setWorking] = useState(false);
  const [widgetUp, setWidgetUp] = useState(false);
  const [mode, setMode] = useState<'test' | 'live' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  // BAL-1b.1 §6 — start balance + time, captured when Continue is pressed, travel WITH the pending
  // record so a reload after the money lands still detects the rise. sessionId drives the §5 status read.
  const startRef = useRef<{ startBal: number; startedAt: number; sessionId?: string }>({ startBal: 0, startedAt: 0 });

  useEffect(() => { setMounted(true); }, []);
  // Preselect the smallest amount that covers the REAL shortfall (collect), else $25; over $50 → $50.
  useEffect(() => {
    if (!open) return;
    setAmount(source === 'collect' ? preselectAmount(shortfallUsd) : 25);
    setErr(null); setWidgetUp(false); setMode(null);
  }, [open, source, shortfallUsd]);
  // slide in/out
  useEffect(() => {
    if (open) { const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true))); return () => cancelAnimationFrame(id); }
    setVisible(false);
  }, [open]);
  useEffect(() => { if (open) void track('topup_opened', { source }); }, [open, source]);

  const start = useCallback(async () => {
    if (!authenticated) { login(); return; }
    if (!address) { setErr('One moment — your balance isn’t ready yet.'); return; }
    setWorking(true); setErr(null);
    // Capture the start the moment Continue is pressed (§6): time now, and the real balance before any
    // funds land, so the landing's count-up and the reload-survival both read from a true baseline.
    startRef.current = { startBal: 0, startedAt: Date.now() };
    void getUsdcBalance(address).then((b) => { startRef.current.startBal = Number(b) || 0; }).catch(() => {});
    try {
      const token = await getAccessToken();
      await track('topup_started', { amount, source });
      const res = await fetch('/api/onramp/stripe/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount, walletAddress: address, email }),
      });
      const j = (await res.json()) as { clientSecret?: string; mode?: 'test' | 'live'; id?: string; error?: string };
      if (!res.ok || !j.clientSecret) { setErr(j.error ?? 'Could not start — try again.'); setWorking(false); return; }
      const m = j.mode ?? 'live'; setMode(m); startRef.current.sessionId = j.id;
      const pubKey = m === 'test' ? process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!pubKey) { setErr(m === 'test' ? 'Sandbox isn’t fully configured. No charge was attempted.' : 'Payments aren’t configured.'); setWorking(false); return; }
      const onramp = await loadStripeOnramp(pubKey);
      if (!onramp || !widgetRef.current) { setErr('Payment couldn’t load — try again.'); setWorking(false); return; }
      widgetRef.current.innerHTML = '';
      const session = (onramp as unknown as { createSession: (o: unknown) => OnrampSession }).createSession({ clientSecret: j.clientSecret, appearance: { theme: appTheme() } });
      session.addEventListener('onramp_session_updated', (e: OnrampEvt) => {
        const st = e.payload.session.status;
        // Payment submitted → hand off to the docked pill and close. fulfillment_processing = paid &
        // delivering (LIVE); fulfillment_complete also covers the TEST path (no on-chain move). The pill
        // then owns every ending (land / didn't go through / taking longer) — §5/§6.
        if (st === 'fulfillment_processing' || st === 'fulfillment_complete') {
          const { startBal, startedAt, sessionId } = startRef.current;
          window.dispatchEvent(new CustomEvent('scope:topup-pending', { detail: { amount, mode: m, sessionId, startBal, startedAt } }));
          onClose();
        } else if (st === 'rejected') {
          // §6 — Stripe rejected the payment: a plain message, in the sheet, no wallet/crypto words.
          setErr('That top-up didn’t go through.'); setWorking(false);
        }
      });
      session.mount(widgetRef.current);
      setWidgetUp(true); setWorking(false);
    } catch (e) { setErr((e as Error).message || 'Something went wrong — try again.'); setWorking(false); }
  }, [authenticated, login, address, amount, email, source, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgb(var(--canvas-rgb) / 0.72)', opacity: visible ? 1 : 0, transition: 'opacity 160ms ease' }} />
      <div role="dialog" aria-label="Add to your balance"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 701, maxWidth: '30rem', margin: '0 auto', maxHeight: '92dvh',
          background: 'var(--surface-1)', borderTop: '1px solid rgb(var(--ink-rgb) / 0.08)', borderRadius: '18px 18px 0 0',
          transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 260ms cubic-bezier(0.22,1,0.36,1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '16px 20px 10px' }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: 'rgb(var(--ink-rgb) / 0.2)', margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-18)', color: 'var(--ink-100)' }}>Add to your balance</span>
            {mode === 'test' && <span style={{ ...SKB, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brass)', border: '1px solid var(--brass)', padding: '2px 6px' }}>TEST MODE · no money moves</span>}
          </div>
        </div>

        {/* OWN scroller — every Stripe button must be reachable at 375x667. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 20px calc(28px + var(--safe-bottom))' }}>
          {!widgetUp && (
            <>
              <div role="radiogroup" aria-label="Amount" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '6px 0 14px' }}>
                {AMOUNTS.map((a) => {
                  const on = amount === a; const n = source === 'collect' ? collectsFor(a, pricePerCollect) : null;
                  return (
                    <button key={a} role="radio" aria-checked={on} onClick={() => setAmount(a)}
                      style={{ background: 'transparent', cursor: 'pointer', border: `1px solid ${on ? 'var(--ink-100)' : 'rgb(var(--ink-rgb) / 0.16)'}`, padding: '14px 8px', display: 'grid', gap: 3, justifyItems: 'center', color: 'var(--ink-100)' }}>
                      <b style={{ ...NUM, fontSize: 20 }}>${a}</b>
                      {n != null && <span style={{ ...SKR, fontSize: 10, color: 'rgb(var(--ink-rgb) / 0.5)' }}>{n} collect{n === 1 ? '' : 's'}</span>}
                    </button>
                  );
                })}
              </div>
              <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgb(var(--ink-rgb) / 0.5)', lineHeight: 1.6, margin: '0 0 16px' }}>
                The total, including the card fee, is shown before you pay. Your balance is yours and never expires.
              </p>
              <button onClick={start} disabled={working} style={{ ...SKB, width: '100%', padding: '14px 0', background: 'var(--ink-100)', color: 'var(--on-ink)', border: 'none', cursor: working ? 'default' : 'pointer', fontSize: 'var(--fs-12)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: working ? 0.6 : 1 }}>
                {working ? 'Opening…' : 'Continue'}
              </button>
              {err && <p role="alert" style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'var(--danger)', margin: '10px 0 0' }}>{err}</p>}
              {onOtherWays && <button onClick={onOtherWays} style={{ ...SKR, display: 'block', margin: '14px auto 0', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 'var(--fs-11)', color: 'rgb(var(--ink-rgb) / 0.5)', textDecoration: 'underline' }}>Other ways to add</button>}
            </>
          )}
          {/* Stripe mounts here — tall so its own buttons have room; the scroller reaches them. */}
          <div ref={widgetRef} style={{ minHeight: widgetUp ? 620 : 0, width: '100%', overflow: 'visible', marginTop: widgetUp ? 4 : 0 }} />
          {widgetUp && <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgb(var(--ink-rgb) / 0.4)', margin: '10px 0 0' }}>Stripe’s sheet runs here — identity on first use, one tap after.</p>}
        </div>
      </div>
    </>,
    document.body,
  );
}
