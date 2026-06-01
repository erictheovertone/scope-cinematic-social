"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId, getProfile } from "@/lib/userService";
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
      const profile = await getProfile(supabaseUser.id) as any;
      if (profile?.grid_layout) {
        setUserLayoutId(profile.grid_layout);
      }
    })();
  }, [user]);

  const handleClose = () => {
    setShowCreateFlow(false);
    router.push('/');
  };

  return (
    <div className="bg-black relative w-[375px] h-[812px] mx-auto">
      <CreatePostFlow
        isOpen={showCreateFlow}
        onClose={handleClose}
        userLayoutId={userLayoutId}
      />
    </div>
  );
}
