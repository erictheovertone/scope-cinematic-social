import ScopeLoader from "@/components/ScopeLoader";

// Instant nav shell (App Router Suspense fallback) — renders the moment a tap
// commits, before the page's JS/data resolve, so navigation is never a dead gap.
// Brief L1c §2 — house ScopeLoader pulse on the canvas (was a static dim logomark),
// so every full-screen loading beat reads the same. The footer pill (in the layout)
// stays put, so the whole frame reads as already-there.
export default function Loading() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
      <ScopeLoader size="lg" label="Loading" />
    </div>
  );
}
