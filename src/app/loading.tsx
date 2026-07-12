// Instant nav shell (App Router Suspense fallback) — renders the moment a tap
// commits, before the page's JS/data resolve, so navigation is never a dead gap.
// Black canvas + dim logomark; the real content streams in over it. The footer
// pill (in the layout) stays put, so the whole frame reads as already-there.
export default function Loading() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
      <img src="/logomark-plain-white.png" alt="" style={{ width: 41, height: 26, objectFit: 'contain', opacity: 0.3 }} />
    </div>
  );
}
