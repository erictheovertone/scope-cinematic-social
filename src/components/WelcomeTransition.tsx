"use client";
import { useEffect } from "react";
import ScopeLoader from "@/components/ScopeLoader";

interface WelcomeTransitionProps {
  onComplete: () => void;
}

// Brief L1c — the grid-apply beat. WAS the pre-rebrand loader visual (corner
// brackets + logo fade/pulse on a blind 2.6s timer — the "old loader" Eric flagged).
// Now the house ScopeLoader pulse on the canvas, full-screen shell preserved.
//
// TIMING: the layout writes finish in the caller (handleConfirm) BEFORE this mounts,
// and the profile RELOAD happens on the next route (/profile), not here — this page
// has no profile-ready signal to await. So this is a ~600ms MINIMUM beat (never a
// flash), then onComplete navigates; /profile's route loading.tsx — now also
// ScopeLoader (L1c §2) — carries the pulse seamlessly UNTIL the profile data
// resolves. The "until ready" lives in that route loader; the 600ms floor lives here.
export default function WelcomeTransition({ onComplete }: WelcomeTransitionProps) {
  useEffect(() => {
    const t = setTimeout(onComplete, 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'var(--canvas)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <ScopeLoader size="lg" label="Loading" />
    </div>
  );
}
