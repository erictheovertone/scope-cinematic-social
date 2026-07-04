'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import UpsellSheet, { UpsellLimit } from '@/components/UpsellSheet';
import MembershipSheet from '@/components/MembershipSheet';
import ProCelebration from '@/components/ProCelebration';
import VideoCelebration from '@/components/VideoCelebration';

const Ctx = createContext<{ showUpsell: (l: UpsellLimit) => void }>({ showUpsell: () => {} });
export const useUpsell = () => useContext(Ctx);

export function UpsellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [limit, setLimit] = useState<UpsellLimit | null>(null);
  const [showMembership, setShowMembership] = useState(false);
  // Origin-aware: an upsell raised from the editing suite uses limit 'edit'. That
  // purchase must resolve IN-APP (editor stays mounted) with an overlay
  // celebration; any other origin keeps the existing profile badge/glow-in flow.
  const [fromFinishing, setFromFinishing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const showUpsell = useCallback((l: UpsellLimit) => setLimit(l), []);
  const goPro = useCallback(() => {
    setFromFinishing(limit === 'edit');
    setLimit(null);
    setShowMembership(true);
  }, [limit]);

  // Called by MembershipSheet ONLY when the purchase resolves in-app (crypto, or
  // Stripe embedded). Refreshes Pro everywhere, then branches by origin.
  const handleMembershipSuccess = useCallback(() => {
    setShowMembership(false);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('scope:pro-activated'));
    if (fromFinishing) {
      setCelebrate(true); // in-app overlay — editor stays mounted, no navigation
    } else {
      router.push('/membership/success?plan=pro'); // existing celebration → profile glow
    }
  }, [fromFinishing, router]);

  return (
    <Ctx.Provider value={{ showUpsell }}>
      {children}
      <UpsellSheet limit={limit} onClose={() => setLimit(null)} onGoPro={goPro} />
      <MembershipSheet
        visible={showMembership}
        onClose={() => setShowMembership(false)}
        onSuccess={handleMembershipSuccess}
        fromFinishing={fromFinishing}
      />
      {celebrate && (
        <VideoCelebration
          videoSrc="/badges/welcome-scope-pro-animation.mp4"
          badgeSrc="/badges/scope-pro-badge-min-design-01.png"
          onDone={() => {
            setCelebrate(false);
            // The dust-lift cue: the suite behind is already unlocked (state
            // refreshed during the celebration) — now it plays the reveal.
            window.dispatchEvent(new CustomEvent('scope:pro-celebration-done'));
          }}
          renderFallback={(d) => <ProCelebration onDone={d} />}
        />
      )}
    </Ctx.Provider>
  );
}
