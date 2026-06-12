'use client';

import { Suspense } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { privyConfig, PRIVY_APP_ID } from '@/lib/privy';
import AppShell from '@/components/AppShell';
import { UpsellProvider } from '@/components/UpsellProvider';
import { EconomyProvider } from '@/components/EconomyProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <EconomyProvider>
        <UpsellProvider>
          <Suspense fallback={<div style={{backgroundColor:'#000',minHeight:'100vh'}}/>}>
            {children}
          </Suspense>
          <AppShell />
        </UpsellProvider>
      </EconomyProvider>
    </PrivyProvider>
  );
}
