"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HiddenPosts() {
  const router = useRouter();
  const [hiddenPosts] = useState([
    {
      id: 1,
      caption: 'Behind the scenes from yesterday\'s shoot',
      mediaUrl: '/api/placeholder/300/200',
      hiddenDate: '2 days ago',
      reason: 'Hidden by you'
    },
    {
      id: 2,
      caption: 'Work in progress - not ready to share yet',
      mediaUrl: '/api/placeholder/300/300',
      hiddenDate: '1 week ago',
      reason: 'Hidden by you'
    }
  ]);

  const unhidePost = (postId: number) => {
    // Implementation would update post visibility
    console.log('Unhiding post:', postId);
  };

  const deletePost = (postId: number) => {
    // Implementation would permanently delete post
    console.log('Deleting post:', postId);
  };

  return (
    <div className="bg-black relative w-[375px] h-[812px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-[#333333]">
        <button 
          onClick={() => router.back()} 
          className="text-white text-lg"
        >
          ←
        </button>
        <h1 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-18)]">
          Hidden Posts
        </h1>
        <div className="w-6" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {hiddenPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <svg width="67.5" height="67.5" viewBox="0 0 24 24" fill="none" stroke="#333333" strokeWidth="1">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
              <path d="M3 3l18 18"/>
            </svg>
            <p className="font-['IBM_Plex_Mono'] font-medium text-[#666666] text-[var(--fs-16)] mt-4 text-center">
              No hidden posts
            </p>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#666666] text-[var(--fs-12)] mt-2 text-center">
              Posts you hide from your profile will appear here
            </p>
          </div>
        ) : (
          <div className="px-4 py-4">
            {hiddenPosts.map((post) => (
              <div
                key={post.id}
                className="bg-[#1A1A1A] border border-[#333333] rounded-lg p-4 mb-4"
              >
                <div className="flex items-start space-x-4">
                  <div className="w-16 h-16 bg-[#333333] rounded-lg flex-shrink-0 flex items-center justify-center">
                    <svg width="27.5" height="27.5" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="9" cy="9" r="2"/>
                      <path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                  </div>
                  
                  <div className="flex-1">
                    <p className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-14)] mb-2">
                      {post.caption}
                    </p>
                    
                    <div className="flex items-center space-x-4 mb-3">
                      <p className="font-['IBM_Plex_Mono'] font-normal text-[#666666] text-[var(--fs-11)]">
                        Hidden {post.hiddenDate}
                      </p>
                      <p className="font-['IBM_Plex_Mono'] font-normal text-[#666666] text-[var(--fs-11)]">
                        {post.reason}
                      </p>
                    </div>
                    
                    <div className="flex space-x-3">
                      <button
                        onClick={() => unhidePost(post.id)}
                        className="bg-[#333333] text-white px-4 py-2 rounded-lg font-['IBM_Plex_Mono'] text-[var(--fs-12)] hover:bg-[#444444] transition-colors"
                      >
                        Unhide
                      </button>
                      <button
                        onClick={() => deletePost(post.id)}
                        className="bg-transparent border border-[#FF0000] text-[#FF0000] px-4 py-2 rounded-lg font-['IBM_Plex_Mono'] text-[var(--fs-12)] hover:bg-[#FF0000] hover:bg-opacity-10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="border-t border-[#333333] p-6">
        <div className="bg-[#1A1A1A] border border-[#333333] rounded-lg p-4">
          <p className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-12)] mb-2">
            About Hidden Posts:
          </p>
          <ul className="space-y-1">
            <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] flex items-start">
              <span className="text-[#FF0000] mr-2">•</span>
              Hidden posts don't appear on your profile
            </li>
            <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] flex items-start">
              <span className="text-[#FF0000] mr-2">•</span>
              You can unhide them anytime
            </li>
            <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] flex items-start">
              <span className="text-[#FF0000] mr-2">•</span>
              Deleting removes them permanently
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
