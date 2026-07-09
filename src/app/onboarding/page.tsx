'use client';
// /onboarding — desktop-only continuous onboarding flow. Mobile onboards via
// /profile/setup (untouched); a mobile viewport here bounces to the app.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsDesktop } from '@/lib/useIsDesktop';
import DesktopOnboarding from '@/components/desktop/DesktopOnboarding';

export default function OnboardingPage() {
  const isDesktop = useIsDesktop();
  const router = useRouter();
  useEffect(() => {
    // SSR-safe: useIsDesktop is false on first paint. Only bounce once we've
    // confirmed a real narrow viewport (matchMedia synced on mount).
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) router.replace('/');
  }, [router]);
  if (!isDesktop) return <div className="bg-black" style={{ position: 'fixed', inset: 0 }} />;
  return <DesktopOnboarding />;
}
