"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { syncUserWithSupabase, getUserByPrivyId, getProfile } from "@/lib/userService";
import FrameLoader from "@/components/FrameLoader";

export default function AuthCallback() {
  const router = useRouter();
  const { user, authenticated, ready } = usePrivy();

  useEffect(() => {
    if (!ready) return;

    if (!authenticated || !user) {
      router.replace("/welcome");
      return;
    }

    const checkProfile = async () => {
      try {
        // Ensure the user row exists in Supabase
        await syncUserWithSupabase(user);

        const supabaseUser = await getUserByPrivyId(user.id);
        if (!supabaseUser) {
          router.replace("/profile/setup");
          return;
        }

        const profile = await getProfile(supabaseUser.id);
        if (profile && profile.username) {
          // Setup complete (has a username) → land on the HOME FEED.
          router.replace("/");
        } else {
          // Fresh signup / setup incomplete → route through onboarding.
          router.replace("/profile/setup");
        }
      } catch (err) {
        console.error("Auth callback error:", err);
        router.replace("/profile/setup");
      }
    };

    checkProfile();
  }, [ready, authenticated, user, router]);

  return (
    <div
      style={{
        backgroundColor: "#000000",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <FrameLoader variant="page" />
    </div>
  );
}
