import ScopeLoader from "@/components/ScopeLoader";

// Instant nav shell (App Router Suspense fallback). Brief L1c §2 — house ScopeLoader
// pulse on the canvas (was a static dim logomark), consistent full-screen loading beat.
export default function Loading() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
      <ScopeLoader size="lg" label="Loading" />
    </div>
  );
}
