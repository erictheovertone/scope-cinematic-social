'use client';

import { Suspense } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { privyConfig, PRIVY_APP_ID } from '@/lib/privy';
import AppShell from '@/components/AppShell';
import { UpsellProvider } from '@/components/UpsellProvider';
import { EconomyProvider } from '@/components/EconomyProvider';
import { TxNarratorProvider } from '@/components/TxNarrator';
import PostLightboxHost from '@/components/PostLightboxHost';
import SlideShell from '@/components/SlideShell';
import SwipeNav from '@/components/SwipeNav';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <EconomyProvider>
        <TxNarratorProvider>
          <UpsellProvider>
            <Suspense fallback={<div style={{backgroundColor:'#000',minHeight:'100dvh'}}/>}>
              <SlideShell>{children}</SlideShell>
            </Suspense>
            <AppShell />
            <SwipeNav />
            <PostLightboxHost />
          </UpsellProvider>
        </TxNarratorProvider>
      </EconomyProvider>
    </PrivyProvider>
  );
}
