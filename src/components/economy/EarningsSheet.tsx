'use client';

// ── SCOPE EARNINGS — the wallet header stat's tap-through detail sheet ────────
//
// Portaled bottom sheet (the WhileYouWereAway pattern) consuming the session-
// cached /api/earnings dataset — range chips re-slice the SAME data, never a
// refetch. Entry: framer-motion slide-up with a quick spring settle; numbers
// count up (the established ~700ms easeOutExpo); the chart line DRAWS ITSELF
// left→right (dashoffset), the fill fades in behind it, the end-dot pops last.
// prefers-reduced-motion: everything lands at final state instantly.
// Brand: black, money-green #4ade80, SK-Modernist, sharp corners; the chart
// card's dark gradient is the established scoped exception.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { sumAll, sumSince, cumulativeSeries, type EarningsData } from '@/lib/economy/earnings';
import EarningsExplainerSheet from '@/components/economy/EarningsExplainerSheet';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const GREEN = '#4ade80';
const DAY_MS = 86_400_000;

const RANGES = [
  { key: 'ALL', days: null as number | null },
  { key: '90D', days: 90 },
  { key: '30D', days: 30 },
  { key: '7D', days: 7 },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// The established synchronized count-up (the WhileYouWereAway primitive):
// ~150ms after open, 700ms easeOutExpo progress 0→1; reduced-motion → 1.
function useCountProgress(reduced: boolean): number {
  const [e, setE] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { setE(1); return; }
    const DUR = 700, DELAY = 150;
    const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0 - DELAY) / DUR));
      setE(ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return e;
}

// ── The chart: plain SVG polyline + area fill — no chart lib ─────────────────
function EarningsChart({ series, drawMs, reduced }: {
  series: { t: number; cum: number }[];
  drawMs: number;
  reduced: boolean;
}) {
  const W = 320, H = 132, PAD_X = 8, PAD_TOP = 12, PAD_BOT = 8;
  const pathRef = useRef<SVGPathElement>(null);
  const [drawn, setDrawn] = useState(reduced);

  const { linePath, areaPath, endX, endY } = useMemo(() => {
    const n = series.length;
    const maxCum = Math.max(series[n - 1]?.cum ?? 0, 1e-9);
    const x = (i: number) => PAD_X + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD_X));
    const y = (c: number) => PAD_TOP + (1 - c / maxCum) * (H - PAD_TOP - PAD_BOT);
    const pts = series.map((p, i) => `${x(i).toFixed(2)},${y(p.cum).toFixed(2)}`);
    const line = `M ${pts.join(' L ')}`;
    const area = `${line} L ${x(n - 1).toFixed(2)},${H - PAD_BOT} L ${x(0).toFixed(2)},${H - PAD_BOT} Z`;
    return { linePath: line, areaPath: area, endX: x(n - 1), endY: y(series[n - 1]?.cum ?? 0) };
  }, [series]);

  // Self-draw: measure the real path length, run dashoffset L→0. Re-runs per
  // series change (chip switch remounts via key, so this is per-mount).
  useEffect(() => {
    if (reduced) { setDrawn(true); return; }
    const el = pathRef.current;
    if (!el) return;
    const L = el.getTotalLength();
    el.style.strokeDasharray = `${L}`;
    el.style.strokeDashoffset = `${L}`;
    // Force the start state into layout before transitioning to 0.
    el.getBoundingClientRect();
    el.style.transition = `stroke-dashoffset ${drawMs}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    el.style.strokeDashoffset = '0';
    const id = window.setTimeout(() => setDrawn(true), drawMs * 0.82); // dot pops as the line lands
    return () => window.clearTimeout(id);
  }, [linePath, drawMs, reduced]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity="0.18" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        fill="url(#earnFill)"
        style={reduced ? undefined : { opacity: drawn ? 1 : 0, transition: `opacity ${Math.round(drawMs * 0.6)}ms ease ${Math.round(drawMs * 0.35)}ms` }}
      />
      <path ref={pathRef} d={linePath} fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={endX} cy={endY} r={3.5} fill={GREEN}
        style={reduced ? undefined : { transform: drawn ? 'scale(1)' : 'scale(0)', transformOrigin: `${endX}px ${endY}px`, transition: 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
    </svg>
  );
}

interface Props {
  data: EarningsData;
  onClose: () => void;
}

export default function EarningsSheet({ data, onClose }: Props) {
  const reduced = !!useReducedMotion();
  const e = useCountProgress(reduced);
  const [range, setRange] = useState<string>('ALL');
  const [showHow, setShowHow] = useState(false);   // HOW EARNINGS WORK pull-up (stacks above)
  const [howPressed, setHowPressed] = useState(false);
  const [entered, setEntered] = useState(false); // first draw = full 750ms; chip redraws = 250ms
  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), 900);
    return () => window.clearTimeout(id);
  }, []);

  const allTime = useMemo(() => sumAll(data.events), [data]);
  const last7 = useMemo(() => sumSince(data.events, Date.now() - 7 * DAY_MS), [data]);
  const empty = data.events.length === 0 || allTime <= 0;

  const activeDays = RANGES.find((r) => r.key === range)?.days ?? null;
  const series = useMemo(() => cumulativeSeries(data, activeDays), [data, activeDays]);

  const created = new Date(data.accountCreatedAt);
  const leftLabel = activeDays == null
    ? `${MONTHS[created.getUTCMonth()] ?? ''} · ACCOUNT CREATED`
    : `${activeDays} DAYS AGO`;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div data-swipe-exclude style={{ position: 'fixed', inset: 0, zIndex: 1100 }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.25 }}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)' }}
      />
      {/* Sheet — slide-up, quick spring settle; drag down to dismiss. */}
      <motion.div
        initial={reduced ? { y: 0 } : { y: '100%' }}
        animate={{ y: 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', duration: 0.34, bounce: 0.16 }}
        drag={reduced ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); }}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: '#080808', borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '20px 20px calc(28px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ width: 36, height: 2, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>
            SCOPE EARNINGS
          </p>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, margin: -6 }}>
            <span style={{ ...SKR, fontSize: 'var(--fs-16)', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>×</span>
          </button>
        </div>

        {/* Numbers first in the stagger */}
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.28, delay: reduced ? 0 : 0.08 }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <p style={{ ...SKB, fontSize: 40, color: GREEN, margin: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              ${(allTime * e).toFixed(2)}
            </p>
            <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>ALL TIME</span>
          </div>
          {!empty && (
            <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: GREEN, margin: '8px 0 0', opacity: 0.85 }}>
              +${(last7 * e).toFixed(2)} LAST 7 DAYS{' '}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-1px' }}>
                <path d="M3 17l6 -6l4 4l8 -8" /><path d="M14 7l7 0l0 7" />
              </svg>
            </p>
          )}
        </motion.div>

        {/* Chart card next in the stagger */}
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.3, delay: reduced ? 0 : 0.18 }}
          style={{
            marginTop: 22,
            background: 'linear-gradient(180deg, #101010 0%, #0a0a0a 100%)',
            border: '0.5px solid #1f1f1f', borderRadius: 2,
            padding: '16px 12px 10px',
          }}
        >
          {empty ? (
            <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: '26px 8px' }}>
              Your creator earnings will build here with every collect.
            </p>
          ) : (
            <>
              {/* key remounts the chart per range → each slice draws itself */}
              <EarningsChart key={range} series={series} drawMs={entered ? 250 : 750} reduced={reduced} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 2px' }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{leftLabel}</span>
                <span style={{ ...SKB, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>TODAY</span>
              </div>
            </>
          )}
        </motion.div>

        {/* Range chips — re-slice the cached dataset, never a refetch. */}
        {!empty && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                style={{
                  ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.1em',
                  padding: '7px 14px', cursor: 'pointer', background: 'transparent',
                  border: `1px solid ${range === r.key ? '#2a2a2a' : 'rgba(255,255,255,0.07)'}`,
                  color: range === r.key ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                }}
              >
                {r.key}
              </button>
            ))}
          </div>
        )}

        {/* Footnote */}
        <p style={{ ...SKR, fontSize: 'var(--fs-8)', color: 'rgba(255,255,255,0.28)', lineHeight: 1.6, margin: '16px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          creator fees from every collect &amp; trade of your work · not included in total balance
        </p>

        {/* HOW IT WORKS ? — second-level pull-up trigger */}
        <button
          onClick={() => setShowHow(true)}
          onPointerDown={() => setHowPressed(true)}
          onPointerUp={() => setHowPressed(false)}
          onPointerLeave={() => setHowPressed(false)}
          style={{
            ...SKB, display: 'block', background: 'transparent', border: 'none', padding: '10px 0 0', cursor: 'pointer',
            fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.16em',
            opacity: howPressed ? 0.7 : 1, transform: howPressed ? 'scale(0.96)' : 'scale(1)',
            transition: 'transform 120ms ease, opacity 120ms ease',
          }}
        >
          HOW IT WORKS <span style={{ letterSpacing: 0 }}>?</span>
        </button>

        {/* Stacks ABOVE this sheet; closing returns here, not the wallet. */}
        {showHow && <EarningsExplainerSheet onClose={() => setShowHow(false)} />}
      </motion.div>
    </div>,
    document.body,
  );
}
