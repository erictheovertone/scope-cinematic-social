"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

export default function DeleteAccount() {
  const router = useRouter();
  const { logout } = usePrivy();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    
    setIsDeleting(true);
    
    // Simulate account deletion process
    setTimeout(async () => {
      await logout();
      router.push('/welcome');
    }, 2000);
  };

  const isConfirmValid = confirmText === "DELETE";

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
          Delete Account
        </h1>
        <div className="w-6" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isDeleting ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 border-4 border-[#FF0000] border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-18)] mb-4 text-center">
              Deleting Account...
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-14)] text-center">
              This may take a few moments.
            </p>
          </div>
        ) : (
          <>
            {/* Warning Icon */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-[#FF0000] bg-opacity-20 border-2 border-[#FF0000] rounded-full mx-auto mb-6 flex items-center justify-center">
                <svg width="35.5" height="35.5" viewBox="0 0 24 24" fill="none" stroke="#FF0000" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              
              <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-20)] mb-4">
                Delete Your Account
              </h2>
              
              <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-14)] leading-relaxed">
                This action cannot be undone. All your data will be permanently deleted.
              </p>
            </div>

            {/* What will be deleted */}
            <div className="bg-[#1A1A1A] border border-[#FF0000] border-opacity-30 rounded-lg p-6 mb-8">
              <h3 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
                What will be deleted:
              </h3>
              <ul className="space-y-3">
                <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] flex items-start">
                  <span className="text-[#FF0000] mr-3">•</span>
                  All your posts and media content
                </li>
                <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] flex items-start">
                  <span className="text-[#FF0000] mr-3">•</span>
                  Your profile information and settings
                </li>
                <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] flex items-start">
                  <span className="text-[#FF0000] mr-3">•</span>
                  All trading history and transactions
                </li>
                <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] flex items-start">
                  <span className="text-[#FF0000] mr-3">•</span>
                  Connections with other users
                </li>
                <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] flex items-start">
                  <span className="text-[#FF0000] mr-3">•</span>
                  All notifications and messages
                </li>
              </ul>
            </div>

            {/* Confirmation */}
            <div className="space-y-6">
              <div>
                <label className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-14)] block mb-3">
                  Type "DELETE" to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#333333] rounded-lg px-4 py-3 font-['IBM_Plex_Mono'] text-white text-[var(--fs-14)] focus:border-[#FF0000] focus:outline-none"
                  placeholder="Type DELETE here"
                />
              </div>

              <button
                onClick={handleDelete}
                disabled={!isConfirmValid}
                className={`w-full py-4 rounded-lg font-['IBM_Plex_Mono'] font-medium text-[var(--fs-16)] transition-colors ${
                  isConfirmValid
                    ? 'bg-[#FF0000] text-white hover:bg-[#CC0000]'
                    : 'bg-[#333333] text-[#666666] cursor-not-allowed'
                }`}
              >
                Delete My Account Permanently
              </button>

              <button
                onClick={() => router.back()}
                className="w-full bg-transparent border border-[#333333] text-white py-3 rounded-lg font-['IBM_Plex_Mono'] font-medium text-[var(--fs-14)] hover:border-[#555555] transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Final warning */}
            <div className="mt-8 p-4 bg-[#1A1A1A] border border-[#333333] rounded-lg">
              <p className="font-['IBM_Plex_Mono'] font-medium text-[#FF0000] text-[var(--fs-12)] mb-2">
                ⚠️ Final Warning
              </p>
              <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-11)] leading-relaxed">
                Account deletion is immediate and irreversible. We cannot recover your data once deleted. Consider downloading your content first if you want to keep it.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
