"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { supabase } from "@/lib/supabase/client";

interface UserData {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  joinDate: string;
  lastActive: string;
  storageUsed: string;
}

export default function DataPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const [userData, setUserData] = useState<UserData>({
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
    joinDate: "N/A",
    lastActive: "N/A",
    storageUsed: "0 MB"
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;

    try {
      // Get posts count
      const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Get likes count
      const { count: likesCount } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Get comments count
      const { count: commentsCount } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Get user profile for join date
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('privy_id', user.id)
        .single();

      setUserData({
        totalPosts: postsCount || 0,
        totalLikes: likesCount || 0,
        totalComments: commentsCount || 0,
        joinDate: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "N/A",
        lastActive: new Date().toLocaleDateString(),
        storageUsed: `${Math.round((postsCount || 0) * 2.5)} MB`
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-black relative w-[430px] h-[932px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-6 border-b border-[#333333]">
        <button 
          onClick={() => router.back()} 
          className="text-[#E5E1DB] text-lg"
        >
          ←
        </button>
        <h1 className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-18)]">
          Data
        </h1>
        <div className="w-6" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="font-['IBM_Plex_Mono'] text-[#E5E1DB] text-[var(--fs-14)]">Loading...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Account Statistics */}
            <div>
              <h2 className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-16)] mb-4">
                Account Statistics
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
                  <span className="font-['IBM_Plex_Mono'] text-[#E5E1DB] text-[var(--fs-14)]">Total Posts</span>
                  <span className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)]">{userData.totalPosts}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
                  <span className="font-['IBM_Plex_Mono'] text-[#E5E1DB] text-[var(--fs-14)]">Total Likes Given</span>
                  <span className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)]">{userData.totalLikes}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
                  <span className="font-['IBM_Plex_Mono'] text-[#E5E1DB] text-[var(--fs-14)]">Total Comments</span>
                  <span className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)]">{userData.totalComments}</span>
                </div>
              </div>
            </div>

            {/* Account Information */}
            <div>
              <h2 className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-16)] mb-4">
                Account Information
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
                  <span className="font-['IBM_Plex_Mono'] text-[#E5E1DB] text-[var(--fs-14)]">Join Date</span>
                  <span className="font-['IBM_Plex_Mono'] text-[#888888] text-[var(--fs-14)]">{userData.joinDate}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
                  <span className="font-['IBM_Plex_Mono'] text-[#E5E1DB] text-[var(--fs-14)]">Last Active</span>
                  <span className="font-['IBM_Plex_Mono'] text-[#888888] text-[var(--fs-14)]">{userData.lastActive}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
                  <span className="font-['IBM_Plex_Mono'] text-[#E5E1DB] text-[var(--fs-14)]">Storage Used</span>
                  <span className="font-['IBM_Plex_Mono'] text-[#888888] text-[var(--fs-14)]">{userData.storageUsed}</span>
                </div>
              </div>
            </div>

            {/* Data Export */}
            <div>
              <h2 className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-16)] mb-4">
                Data Export
              </h2>
              <div className="space-y-3">
                <button className="w-full text-left p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg hover:bg-[#222222] transition-colors">
                  <p className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)] mb-1">
                    Download My Data
                  </p>
                  <p className="font-['IBM_Plex_Mono'] text-[#666666] text-[var(--fs-12)]">
                    Export all your posts, comments, and account data
                  </p>
                </button>
                <button className="w-full text-left p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg hover:bg-[#222222] transition-colors">
                  <p className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)] mb-1">
                    Request Account Report
                  </p>
                  <p className="font-['IBM_Plex_Mono'] text-[#666666] text-[var(--fs-12)]">
                    Get a detailed report of your account activity
                  </p>
                </button>
              </div>
            </div>

            {/* Privacy Controls */}
            <div>
              <h2 className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-16)] mb-4">
                Privacy Controls
              </h2>
              <div className="space-y-3">
                <button className="w-full text-left p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg hover:bg-[#222222] transition-colors">
                  <p className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)] mb-1">
                    Data Sharing Settings
                  </p>
                  <p className="font-['IBM_Plex_Mono'] text-[#666666] text-[var(--fs-12)]">
                    Control how your data is used and shared
                  </p>
                </button>
                <button className="w-full text-left p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg hover:bg-[#222222] transition-colors">
                  <p className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)] mb-1">
                    Analytics Preferences
                  </p>
                  <p className="font-['IBM_Plex_Mono'] text-[#666666] text-[var(--fs-12)]">
                    Manage data collection for analytics
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
