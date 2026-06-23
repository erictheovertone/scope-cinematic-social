"use client";
import { useState, useEffect, useRef } from "react";
import { detectPlatform, shouldShowA2HS, setInstalled, setSnoozed, type Platform } from "@/lib/pwaUtils";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  privyId: string;
  forceShow?: boolean; // bypasses shouldShowA2HS check — use when opened from settings
}

export default function AddToHomeScreenSheet({ isOpen, onClose, privyId, forceShow }: Props) {
  const [canShow, setCanShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const platform = useRef<Platform>(detectPlatform());

  useEffect(() => {
    if (isOpen && privyId) {
      if (forceShow || shouldShowA2HS(privyId)) {
        setCanShow(true);
      } else {
        onClose();
      }
    } else {
      setCanShow(false);
    }
  }, [isOpen, privyId, forceShow]);

  // Listen for the custom event dispatched by the global appinstalled handler
  useEffect(() => {
    const handler = () => {
      setInstalled(privyId);
      onClose();
    };
    window.addEventListener('scope:app-installed', handler);
    return () => window.removeEventListener('scope:app-installed', handler);
  }, [privyId, onClose]);

  const handleInstallAndroid = async () => {
    const prompt = (window as any).__deferredA2HSPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(privyId);
      onClose();
    }
  };

  const handleIOSAdded = () => {
    setInstalled(privyId);
    onClose();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleSnooze = () => {
    setSnoozed(privyId);
    onClose();
  };

  const plt = platform.current;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleSnooze}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          zIndex: 800,
          opacity: canShow ? 1 : 0,
          pointerEvents: canShow ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#080808',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        zIndex: 801,
        transform: canShow ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        padding: '20px 20px 28px',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 36, height: 3, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <img
            src="/scope-square-thumbnail-logo.png"
            alt="Scope"
            style={{
              width: 56, height: 56,
              objectFit: 'cover',
              border: '1px solid rgba(255,255,255,0.15)',
              flexShrink: 0,
            }}
          />
          <div>
            <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 4px' }}>
              INSTALL
            </p>
            <p style={{ ...SKB, fontSize: 'var(--fs-16)', color: '#FFFFFF', letterSpacing: '0.02em', textTransform: 'uppercase', margin: 0 }}>
              SCOPE
            </p>
          </div>
        </div>

        {/* Description */}
        <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: '0 0 28px' }}>
          {plt === 'android-chrome'
            ? 'Add Scope to your home screen and launch full-screen with no browser bar.'
            : 'Watch Scope in full frame. No browser, no chrome — just the work.'}
        </p>

        {/* iOS Safari — numbered step rows (display only) */}
        {plt === 'ios-safari' && (
          <div>
            {[
              {
                num: '01',
                label: 'TAP THE SHARE ICON',
                subtitle: 'Bottom of your Safari window',
                icon: (
                  <svg width="21.5" height="27.5" viewBox="0 0 16 20" fill="none">
                    <path d="M8 1 L8 13" stroke="#FFFFFF" strokeWidth="1.5"/>
                    <path d="M4 5 L8 1 L12 5" stroke="#FFFFFF" strokeWidth="1.5" fill="none"/>
                    <path d="M2 8 L2 18 L14 18 L14 8" stroke="#FFFFFF" strokeWidth="1.5" fill="none"/>
                  </svg>
                ),
              },
              {
                num: '02',
                label: 'ADD TO HOME SCREEN',
                subtitle: 'Scroll down in the share menu',
                icon: (
                  <svg width="21.5" height="21.5" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="1" width="14" height="14" stroke="#FFFFFF" strokeWidth="1.5" fill="none"/>
                    <path d="M8 4 L8 12 M4 8 L12 8" stroke="#FFFFFF" strokeWidth="1.5"/>
                  </svg>
                ),
              },
            ].map((row, i) => (
              <div
                key={row.num}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  marginBottom: i === 0 ? 22 : 28,
                }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-28)', color: '#FF0000', letterSpacing: '0.02em', lineHeight: 1, minWidth: 36 }}>
                  {row.num}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#FFFFFF', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.4, margin: '0 0 4px' }}>
                    {row.label}
                  </p>
                  <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4, margin: 0 }}>
                    {row.subtitle}
                  </p>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {row.icon}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* iOS Chrome — redirect to Safari instructional block */}
        {plt === 'ios-chrome' && (
          <div style={{ marginBottom: 28 }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#FFFFFF', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.4, margin: '0 0 8px' }}>
              OPEN IN SAFARI TO INSTALL
            </p>
            <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0 }}>
              Chrome on iPhone can't install apps the same way. For the full experience, copy this link and open it in Safari.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plt === 'ios-safari' && (
            <button
              onClick={handleIOSAdded}
              style={{ width: '100%', padding: '14px 0', background: '#FF0000', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                GOT IT
              </span>
            </button>
          )}
          {plt === 'android-chrome' && (
            <button
              onClick={handleInstallAndroid}
              style={{ width: '100%', padding: '14px 0', background: '#FF0000', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                INSTALL SCOPE
              </span>
            </button>
          )}
          {plt === 'ios-chrome' && (
            <button
              onClick={handleCopyLink}
              style={{ width: '100%', padding: '14px 0', background: '#FF0000', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {copied ? 'COPIED ✓' : 'COPY LINK'}
              </span>
            </button>
          )}
          <button
            onClick={handleSnooze}
            style={{ width: '100%', padding: '14px 0', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              REMIND ME LATER
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
