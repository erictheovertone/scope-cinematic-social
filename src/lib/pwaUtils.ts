export type Platform = 'ios-safari' | 'android-chrome' | 'unsupported';

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unsupported';
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIOS && isSafari) return 'ios-safari';
  const isAndroid = /Android/.test(ua);
  const isChromium = /Chrome|Edg/.test(ua) && !/EdgiOS|CriOS/.test(ua);
  if (isAndroid && isChromium) return 'android-chrome';
  return 'unsupported';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
}

export function shouldShowA2HS(privyId: string): boolean {
  if (isStandalone()) return false;
  if (detectPlatform() === 'unsupported') return false;
  if (localStorage.getItem(`scope_a2hs_installed_${privyId}`) === 'true') return false;
  const snoozedUntil = localStorage.getItem(`scope_a2hs_snoozed_until_${privyId}`);
  if (snoozedUntil && new Date(snoozedUntil) > new Date()) return false;
  return true;
}

export function setInstalled(privyId: string) {
  localStorage.setItem(`scope_a2hs_installed_${privyId}`, 'true');
}

export function setSnoozed(privyId: string) {
  const threeDaysOut = new Date();
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);
  localStorage.setItem(`scope_a2hs_snoozed_until_${privyId}`, threeDaysOut.toISOString());
}
