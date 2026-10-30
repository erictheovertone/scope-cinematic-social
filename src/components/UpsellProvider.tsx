'use client';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/lib/supabase/client';
import { getUserByPrivyId } from '@/lib/userService';
import { tierOf, type Tier } from '@/lib/tier';
import UpsellSheet, { UpsellLimit } from '@/components/UpsellSheet';
import MembershipSheet from '@/components/MembershipSheet';
import ProCelebration from '@/components/ProCelebration';
import VideoCelebration, { AugmentedWelcomeStill } from '@/components/VideoCelebration';
import AugmentedSheet from '@/components/AugmentedSheet';

// AUG-1 — showAugmented() raises the Augmented Pro sheet (Settings → Membership, a Download tap by
// a non-member, the Augmented badge tap). It resolves in place: no navigation.
const Ctx = createContext<{ showUpsell: (l: UpsellLimit) => void; goPro: () => void; showAugmented: () => void }>({ showUpsell: () => {}, goPro: () => {}, showAugmented: () => {} });
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
  const [showAug, setShowAug] = useState(false);
  const showAugmented = useCallback(() => { setLimit(null); setShowMembership(false); setShowAug(true); }, []);
  // CEL-2 — the Augmented welcome film. Raised by an in-app Augmented checkout (AugmentedSheet
  // onJoined, tier from the completed Price) and by a Pro → Augmented upgrade that landed some
  // other way (portal plan change → webhook): membership_tier flipping pro → augmented.
  const [welcomeAug, setWelcomeAug] = useState(false);
  const { user } = usePrivy();
  const privyId = user?.id ?? null;
  useEffect(() => {
    if (!privyId) return;
    const key = `scope:seen-tier:${privyId}`;
    let alive = true;
    const check = async () => {
      try {
        const u = await getUserByPrivyId(privyId);
        if (!u?.id) return;
        const { data, error } = await supabase.from('profiles').select('membership_tier, paid_member_until').eq('user_id', u.id).maybeSingle();
        if (error || !alive) return;
        const now: Tier = tierOf(data);
        let seen: string | null = null;
        try { seen = localStorage.getItem(key); localStorage.setItem(key, now); } catch { /* storage blocked → no upgrade detection */ }
        if (seen === 'pro' && now === 'augmented') setWelcomeAug(true);
      } catch { /* a failed read just skips this check */ }
    };
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('scope:tier-changed', check);
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.removeEventListener('scope:tier-changed', check); document.removeEventListener('visibilitychange', onVis); };
  }, [privyId]);
  const onAugmentedJoined = useCallback((tier: Tier) => {
    setShowAug(false);
    if (tier !== 'augmented') return;
    // Mark the tier seen FIRST so the watcher above (also woken by 'scope:tier-changed') can't
    // play the film a second time after this one closes.
    try { if (privyId) localStorage.setItem(`scope:seen-tier:${privyId}`, 'augmented'); } catch { /* noop */ }
    setWelcomeAug(true);
  }, [privyId]);

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
    <Ctx.Provider value={{ showUpsell, goPro, showAugmented }}>
      {children}
      <UpsellSheet limit={limit} onClose={() => setLimit(null)} onGoPro={goPro} />
      <MembershipSheet
        visible={showMembership}
        onClose={() => setShowMembership(false)}
        onSuccess={handleMembershipSuccess}
        fromFinishing={fromFinishing}
      />
      <AugmentedSheet visible={showAug} onClose={() => setShowAug(false)} onJoined={onAugmentedJoined} />
      {welcomeAug && (
        <VideoCelebration
          tier="augmented"
          onDone={() => setWelcomeAug(false)}
          renderFallback={(d) => <AugmentedWelcomeStill onDone={d} />}
        />
      )}
      {celebrate && (
        <VideoCelebration
          tier="pro"
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
