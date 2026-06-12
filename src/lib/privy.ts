// Privy App ID
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmfggbvdy013fl50ba827mw47';

export const privyConfig = {
  // Configure login methods
  loginMethods: ['email', 'google', 'farcaster', 'twitter'] as ('email' | 'google' | 'farcaster' | 'twitter')[],
  
  // Appearance configuration to match Scope branding
  appearance: {
    theme: 'dark' as const,
    accentColor: '#ff0000' as `#${string}`,
    showWalletLoginFirst: false,
  },
  
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
    termsAndConditionsUrl: 'https://scope.app/terms',
    privacyPolicyUrl: 'https://scope.app/privacy',
  },
};
