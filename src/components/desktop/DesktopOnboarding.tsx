'use client';
// ── DESKTOP ONBOARDING — the continuous flow orchestrator ────────────────────
// explainer → (setup IF new) → grid picker → profile. Resolves the user's
// state on mount and runs only the needed steps.
//
// ENTRY LOGIC:
//  · New desktop user (no username): explainer → setup → grid picker → /profile.
//  · Mobile-onboarded user on desktop (has username, unseen explainer): explainer
//    ONLY → /. desktop_layout stays NULL and DERIVES SILENTLY (the reported
//    lean — no forced grid step; the picker stays available in settings).
//  · Returning desktop user (explainer seen): straight to /.
// SKIP or completion both set the seen-flag.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { getUserByPrivyId, getProfile } from '@/lib/userService';
import { hasSeenDesktopExplainer, markDesktopExplainerSeen } from '@/lib/desktopOnboarding';
import { deriveDesktopLayout, type DesktopLayout } from '@/lib/desktopLayout';
import FrameLoader from '@/components/FrameLoader';
import WelcomeExplainer from '@/components/desktop/WelcomeExplainer';
import DesktopProfileSetup from '@/components/desktop/DesktopProfileSetup';
import DesktopGridPicker from '@/components/desktop/DesktopGridPicker';

type Phase = 'resolving' | 'explainer' | 'setup' | 'picker' | 'done';

export default function DesktopOnboarding() {
  const router = useRouter();
  const { user, ready, authenticated } = usePrivy();
  const [phase, setPhase] = useState<Phase>('resolving');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [gridInitial, setGridInitial] = useState<DesktopLayout>({ aspect: 'scope', count: 4 });

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !user) { router.replace('/welcome'); return; }
    (async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        const profile = sbUser ? await getProfile(sbUser.id) : null;
        const hasUsername = !!profile?.username;
        const seen = sbUser ? await hasSeenDesktopExplainer(sbUser.id) : false;
        if (sbUser) setUserId(sbUser.id);
        setNeedsSetup(!hasUsername);
        if (profile) setGridInitial(deriveDesktopLayout((profile as { desktop_layout?: unknown }).desktop_layout, profile.grid_layout));
        // Returning desktop user (seen the explainer, profile complete) → app.
        if (seen && hasUsername) { router.replace('/'); return; }
        setPhase('explainer');
      } catch (e) {
        console.error('[desktop-onboarding] resolve error:', e);
        router.replace('/');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, user?.id]);

  // The explainer has been SEEN the moment it's dismissed — persist immediately
  // on BOTH completion and skip, for EVERY downstream path. (Previously a new
  // user's flag was deferred to the grid picker's CONFIRM, so Esc-ing the picker
  // left it unwritten → the explainer re-fired next login.)
  const markSeen = async () => { if (userId) await markDesktopExplainerSeen(userId); };

  // After the explainer: new users → setup; existing → app. Seen-flag set first.
  const afterExplainer = async () => {
    await markSeen();
    if (needsSetup) { setPhase('setup'); return; }
    router.replace('/'); // mobile-onboarded path lands here; new-user path lands via the picker's own push('/profile')
  };
  const skip = async () => { await markSeen(); router.replace('/'); };

  if (phase === 'resolving') {
    return <div className="bg-black" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FrameLoader variant="page" /></div>;
  }
  if (phase === 'explainer') return <WelcomeExplainer onDone={afterExplainer} onSkip={skip} />;
  if (phase === 'setup') {
    return <DesktopProfileSetup onComplete={(uid) => { setUserId(uid); setPhase('picker'); }} />;
  }
  if (phase === 'picker' && userId) {
    return (
      <DesktopGridPicker
        initial={gridInitial}
        userId={userId}
        onApplied={async () => { await markDesktopExplainerSeen(userId); }}
        onClose={() => { /* the picker's CONFIRM auto-pushes to /profile; a bare close (Esc) still lands the app */ router.replace('/profile'); }}
      />
    );
  }
  return null;
}
