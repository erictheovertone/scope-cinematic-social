'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import UpsellSheet, { UpsellLimit } from '@/components/UpsellSheet';
import MembershipSheet from '@/components/MembershipSheet';

const Ctx = createContext<{ showUpsell: (l: UpsellLimit) => void }>({ showUpsell: () => {} });
export const useUpsell = () => useContext(Ctx);

export function UpsellProvider({ children }: { children: ReactNode }) {
  const [limit, setLimit] = useState<UpsellLimit | null>(null);
  const [showMembership, setShowMembership] = useState(false);

  const showUpsell = useCallback((l: UpsellLimit) => setLimit(l), []);
  const goPro = useCallback(() => { setLimit(null); setShowMembership(true); }, []);

  return (
    <Ctx.Provider value={{ showUpsell }}>
      {children}
      <UpsellSheet limit={limit} onClose={() => setLimit(null)} onGoPro={goPro} />
      <MembershipSheet
        visible={showMembership}
        onClose={() => setShowMembership(false)}
        onSuccess={() => setShowMembership(false)}
      />
    </Ctx.Provider>
  );
}
