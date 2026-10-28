// Privy App ID
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmfggbvdy013fl50ba827mw47';

// Brief U2b §2 — Privy's modal renders OUTSIDE the app's styled tree, so `appearance`
// cannot read CSS custom properties: a `var(--…)` silently falls back and the enabled
// SUBMIT button loses its fill (it "goes dark" the moment an email is typed). These MUST
// be literal hex, kept in lockstep with --ink-rgb / --canvas-rgb (src/app/globals.css):
//   dark  → ink #E5E1DB on canvas #050505   (light button on the dark modal)
//   light → ink #050505 on canvas #E5E1DB   (dark button on the ivory modal — inverted)
// accentColor is the primary button's fill; Privy auto-contrasts its label, so ink-as-accent
// reads as "ink on canvas" in either theme.
const INK = { dark: '#E5E1DB', light: '#050505' } as const;

export type PrivyTheme = 'dark' | 'light';

const BASE = {
  // Configure login methods
  loginMethods: ['email', 'google', 'farcaster', 'twitter'] as ('email' | 'google' | 'farcaster' | 'twitter')[],

  // Wallet configuration - auto-create wallets
  embeddedWallets: {
    createOnLogin: 'users-without-wallets' as const,
    requireUserPasswordOnCreate: false,
    // SIGNING CLARITY (consent without fatigue): Privy's generic confirmation
    // sheets are suppressed for embedded-wallet signing. Consent is collected
    // ONCE by the labeled Scope action the user already took ("CREATE COIN ·
    // BACK $1.00", "BUY · $1.00"), with inline narration during multi-signature
    // sequences. No unlabeled money-moving signature is ever fired.
    showWalletUIs: false,
  },

  // Legal configuration
  legal: {
    termsAndConditionsUrl: 'https://scopeapp.world/terms',
    privacyPolicyUrl: 'https://scopeapp.world/privacy',
  },
};

/** The PrivyProvider config for the applied theme — the modal matches the app's
 *  theme and the enabled SUBMIT button is ink on canvas (inverted in light). */
export function privyConfigFor(theme: PrivyTheme) {
  return {
    ...BASE,
    appearance: {
      theme,
      accentColor: INK[theme] as `#${string}`,
      showWalletLoginFirst: false,
    },
  };
}

// Back-compat default (dark) for any caller that isn't theme-aware.
export const privyConfig = privyConfigFor('dark');
