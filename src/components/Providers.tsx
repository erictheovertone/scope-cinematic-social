'use client';

import { Suspense } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { privyConfig, PRIVY_APP_ID } from '@/lib/privy';
import AppShell from '@/components/AppShell';

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
    </div>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <div style={{ paddingBottom: 80 }}>
        <Suspense fallback={<LoadingSpinner />}>
          {children}
        </Suspense>
      </div>
      <AppShell />
    </PrivyProvider>
  );
}
