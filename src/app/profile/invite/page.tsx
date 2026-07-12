"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Invite() {
  const router = useRouter();
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const generateInviteLink = () => {
    const link = `${window.location.origin}/welcome?invite=${Math.random().toString(36).substring(7)}`;
    setInviteLink(link);
  };

  const copyToClipboard = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
          Invite Friends
        </h1>
        <div className="w-6" />
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-[#FF0000] rounded-full mx-auto mb-6 flex items-center justify-center">
            <svg width="35.5" height="35.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          
          <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-20)] mb-4">
            Share Scope
          </h2>
          
          <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-14)] leading-relaxed mb-8">
            Invite your friends to join Scope and discover amazing visual content together. Share your unique invite link below.
          </p>
        </div>

        {/* Generate Link Button */}
        {!inviteLink ? (
          <button
            onClick={generateInviteLink}
            className="w-full bg-[#FF0000] text-white py-4 rounded-lg font-['IBM_Plex_Mono'] font-medium text-[var(--fs-16)] hover:bg-[#CC0000] transition-colors mb-6"
          >
            Generate Invite Link
          </button>
        ) : (
          <div className="space-y-4">
            {/* Invite Link Display */}
            <div className="bg-[#1A1A1A] border border-[#333333] rounded-lg p-4">
              <p className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-12)] mb-2">
                Your Invite Link:
              </p>
              <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] break-all">
                {inviteLink}
              </p>
            </div>

            {/* Copy Button */}
            <button
              onClick={copyToClipboard}
              className={`w-full py-4 rounded-lg font-['IBM_Plex_Mono'] font-medium text-[var(--fs-16)] transition-colors ${
                copied 
                  ? 'bg-green-600 text-white' 
                  : 'bg-[#333333] text-white hover:bg-[#444444]'
              }`}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>

            {/* Generate New Link */}
            <button
              onClick={generateInviteLink}
              className="w-full bg-transparent border border-[#333333] text-[#888888] py-3 rounded-lg font-['IBM_Plex_Mono'] font-medium text-[var(--fs-14)] hover:border-[#555555] transition-colors"
            >
              Generate New Link
            </button>
          </div>
        )}

        {/* Info */}
        <div className="mt-12 p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
          <p className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-12)] mb-2">
            How it works:
          </p>
          <ul className="space-y-2">
            <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] flex items-start">
              <span className="text-[#FF0000] mr-2">•</span>
              Share your unique invite link with friends
            </li>
            <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] flex items-start">
              <span className="text-[#FF0000] mr-2">•</span>
              They'll be directed to sign up for Scope
            </li>
            <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] flex items-start">
              <span className="text-[#FF0000] mr-2">•</span>
              You'll both get connected automatically
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
