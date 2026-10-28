'use client';

import { Suspense, useMemo } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { privyConfigFor, PRIVY_APP_ID } from '@/lib/privy';
import { useTheme } from '@/lib/useTheme';
import AppShell from '@/components/AppShell';
import { UpsellProvider } from '@/components/UpsellProvider';
import { EconomyProvider } from '@/components/EconomyProvider';
import { TxNarratorProvider } from '@/components/TxNarrator';
import PostLightboxHost from '@/components/PostLightboxHost';
import SlideShell from '@/components/SlideShell';
import SwipeNav from '@/components/SwipeNav';
import RecapHost from '@/components/RecapHost';
import ImageRenditionFallback from '@/components/ImageRenditionFallback';
import ViewportDebug from '@/components/ViewportDebug';
import CropDebugOverlay from "@/components/CropDebugOverlay";
import VideoDebugOverlay from "@/components/VideoDebugOverlay";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Brief U2b §2 — the Privy modal follows the app theme (ink-on-canvas SUBMIT button,
  // inverted in light). useTheme is reactive, so a runtime toggle re-themes the modal.
  const theme = useTheme();
  const privyConfig = useMemo(() => privyConfigFor(theme), [theme]);
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <EconomyProvider>
        <TxNarratorProvider>
          <UpsellProvider>
            <Suspense fallback={<div style={{backgroundColor:'var(--canvas)',minHeight:'100dvh'}}/>}>
              <SlideShell>{children}</SlideShell>
            </Suspense>
            <AppShell />
            <ImageRenditionFallback />
            <SwipeNav />
            <PostLightboxHost />
            <RecapHost />
            <ViewportDebug />{/* Brief W2-1b — inert unless ?debug=viewport */}
            <CropDebugOverlay />{/* Brief C1a — inert unless ?debug=crop */}
            <VideoDebugOverlay />{/* Brief V1e — inert unless ?debug=video or the 5-tap toggle */}
          </UpsellProvider>
        </TxNarratorProvider>
      </EconomyProvider>
    </PrivyProvider>
  );
}
