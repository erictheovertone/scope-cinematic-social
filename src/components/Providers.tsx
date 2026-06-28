'use client';

import { Suspense } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { privyConfig, PRIVY_APP_ID } from '@/lib/privy';
import AppShell from '@/components/AppShell';
import { UpsellProvider } from '@/components/UpsellProvider';
import { EconomyProvider } from '@/components/EconomyProvider';
import { TxNarratorProvider } from '@/components/TxNarrator';
import PostLightboxHost from '@/components/PostLightboxHost';
import BodyHeightLog from '@/components/BodyHeightLog'; // TEMP DEBUG

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <EconomyProvider>
        <TxNarratorProvider>
          <UpsellProvider>
            <Suspense fallback={<div style={{backgroundColor:'#000',minHeight:'100dvh'}}/>}>
              {children}
            </Suspense>
            <AppShell />
            <PostLightboxHost />
            <BodyHeightLog /> {/* TEMP DEBUG — strip after confirming body=844 */}
          </UpsellProvider>
        </TxNarratorProvider>
      </EconomyProvider>
    </PrivyProvider>
  );
}
