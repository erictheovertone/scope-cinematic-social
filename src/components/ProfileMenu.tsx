"use client";

import { useState } from 'react';
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileMenu({ isOpen, onClose }: ProfileMenuProps) {
  const { logout } = usePrivy();
  const router = useRouter();
  const [showInviteLink, setShowInviteLink] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/welcome');
  };

  const handleInvite = () => {
    setShowInviteLink(true);
    const inviteLink = `${window.location.origin}/welcome?invite=${Math.random().toString(36).substring(7)}`;
    navigator.clipboard.writeText(inviteLink);
  };

  const menuItems = [
    {
      label: '+Invite',
      onClick: handleInvite,
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      )
    },
    {
      label: 'Notifications',
      href: '/profile/notifications',
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      )
    },
    {
      label: 'Hidden Posts',
      href: '/profile/hidden',
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
          <path d="M3 3l18 18"/>
        </svg>
      )
    },
    {
      label: 'Preferences',
      href: '/profile/preferences',
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6m5.66-13.66l-4.24 4.24m0 8.48l4.24 4.24M23 12h-6m-6 0H1m18.36-5.64l-4.24 4.24m0 8.48l4.24 4.24"/>
        </svg>
      )
    },
    {
      label: 'Contact Us',
      href: '/profile/contact',
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      )
    },
    {
      label: 'Terms of Service',
      href: '/terms',
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    },
    {
      label: 'Delete Account',
      href: '/profile/delete-account',
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="#FF0000" strokeWidth="1.5">
          <polyline points="3,6 5,6 21,6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      ),
      danger: true
    },
    {
      label: 'Log Out',
      onClick: handleLogout,
      icon: (
        <svg width="19.5" height="19.5" viewBox="0 0 24 24" fill="none" stroke="#FF0000" strokeWidth="1.5">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16,17 21,12 16,7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      ),
      danger: true
    }
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-[100]"
        onClick={onClose}
      />
      
      {/* Menu */}
      <div className="fixed top-[160px] right-[15px] bg-[#1A1A1A] border border-[#333333] rounded-lg shadow-lg z-[101] w-[200px]">
        {/* Invite Link Popup */}
        {showInviteLink && (
          <div className="absolute -top-[60px] left-0 right-0 bg-[#FF0000] text-white p-2 rounded-lg text-center">
            <p className="font-['IBM_Plex_Mono'] text-[var(--fs-10)]">
              Invite link copied!
            </p>
            <button 
              onClick={() => setShowInviteLink(false)}
              className="absolute top-1 right-2 text-white text-xs"
            >
              ×
            </button>
          </div>
        )}

        <div className="py-2">
          {menuItems.map((item, index) => (
            <div key={item.label}>
              {item.href ? (
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center px-4 py-3 hover:bg-[#333333] transition-colors ${
                    item.danger ? 'text-[#FF0000]' : 'text-white'
                  }`}
                >
                  <span className="mr-3">{item.icon}</span>
                  <span className="font-['IBM_Plex_Mono'] text-[var(--fs-12)]">
                    {item.label}
                  </span>
                </Link>
              ) : (
                <button
                  onClick={() => {
                    item.onClick?.();
                    if (item.label !== '+Invite') onClose();
                  }}
                  className={`w-full flex items-center px-4 py-3 hover:bg-[#333333] transition-colors text-left ${
                    item.danger ? 'text-[#FF0000]' : 'text-white'
                  }`}
                >
                  <span className="mr-3">{item.icon}</span>
                  <span className="font-['IBM_Plex_Mono'] text-[var(--fs-12)]">
                    {item.label}
                  </span>
                </button>
              )}
              
              {/* Separator line (except for last item) */}
              {index < menuItems.length - 1 && (
                <div className="border-b border-[#333333] mx-2" />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
