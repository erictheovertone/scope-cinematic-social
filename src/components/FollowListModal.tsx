"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFollowers, getFollowing } from "@/lib/userService";
import FrameLoader from "@/components/FrameLoader";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  type: "followers" | "following";
  privyUserId: string;
  onClose: () => void;
}

export default function FollowListModal({ type, privyUserId, onClose }: Props) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = type === "followers"
          ? await getFollowers(privyUserId)
          : await getFollowing(privyUserId);
        setProfiles(data);
      } catch (e) {
        console.error("FollowListModal load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [type, privyUserId]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#000", maxWidth: 375, margin: "0 auto" }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-[4px] pt-[12px] pb-[10px]">
        <button
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer p-0"
        >
          <span style={{ ...SKR, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>
            ← Back
          </span>
        </button>
        <span style={{ ...SKB, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>
          {type === "followers" ? "Followers" : "Following"}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-[4px]">
        {loading ? (
          <div className="flex items-center justify-center mt-8">
            <FrameLoader />
          </div>
        ) : profiles.length === 0 ? (
          <p style={{ ...SKR, fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 24 }}>
            {type === "followers" ? "No followers yet" : "Not following anyone yet"}
          </p>
        ) : (
          profiles.map((p) => (
            <button
              key={p.id}
              className="flex items-center gap-[8px] w-full bg-transparent border-none cursor-pointer p-0 mb-[14px]"
              onClick={() => { router.push(`/profile/${p.username}`); onClose(); }}
            >
              <div
                className="flex-shrink-0 overflow-hidden bg-[#222] flex items-center justify-center"
                style={{ width: 28, height: 28 }}
              >
                {p.profile_image_url ? (
                  <img
                    src={p.profile_image_url}
                    alt={p.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span style={{ ...SKB, fontSize: 10, color: "white" }}>
                    {p.username?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>
              <span style={{ ...SKR, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>
                @{p.username}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
