"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile, invalidateProfileCache } from "@/lib/userService";
import { resolveLayout, legacyLayoutId } from "@/lib/layoutModel";
import CreatePostFlow from "@/components/CreatePostFlow";

export default function CreatePage() {
  const [showCreateFlow, setShowCreateFlow] = useState(true);
  const [userLayoutId, setUserLayoutId] = useState<string>('scope');
  const router = useRouter();
  const { user } = usePrivy();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabaseUser = await getUserByPrivyId(user.id);
      if (!supabaseUser) return;
      // Brief C1b — read the layout FRESH from the ONE canonical source (resolveLayout /
      // aspect_ratio), not the raw grid_layout mirror, so the prop matches the create flow.
      invalidateProfileCache(supabaseUser.id);
      const profile = await getProfile(supabaseUser.id);
      if (profile) {
        const R = resolveLayout(profile as Parameters<typeof resolveLayout>[0]);
        setUserLayoutId(R.aspect === 'collage' ? 'collage' : legacyLayoutId(R.aspect, R.mobileCount));
      }
    })();
  }, [user]);

  const handleClose = () => {
    setShowCreateFlow(false);
    router.push('/');
  };

  return (
    <div className="bg-canvas relative w-[375px] h-[812px] mx-auto">
      <CreatePostFlow
        isOpen={showCreateFlow}
        onClose={handleClose}
        userLayoutId={userLayoutId}
      />
    </div>
  );
}
