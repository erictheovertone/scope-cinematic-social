"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function ManageMembershipPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      });
      if (res.ok) setCancelled(true);
    } catch (e) {
      console.error('Cancel failed:', e);
    } finally {
      setCancelling(false);
    }
  };

  if (cancelled) {
    return (
      <div style={{ backgroundColor: '#000', minHeight: '100vh', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ ...SKB, fontSize: 18, color: 'white', textTransform: 'uppercase', textAlign: 'center', margin: '0 0 12px' }}>MEMBERSHIP CANCELLED</p>
        <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '0 0 32px', lineHeight: 1.6 }}>
          Your Pro access continues until the end of your billing period.
        </p>
        <button onClick={() => router.push('/profile')} style={{ background: '#FF0000', border: 'none', cursor: 'pointer', padding: '12px 32px' }}>
          <span style={{ ...SKB, fontSize: 11, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>BACK TO PROFILE</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginRight: 12, padding: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span style={{ ...SKB, fontSize: 11, color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MANAGE MEMBERSHIP</span>
      </div>

      {/* Current plan */}
      <div style={{ padding: '24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <img src="/badges/scope-pro-badge-min-design-01.png" alt="Scope Pro" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <div>
            <p style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>CURRENT PLAN</p>
            <p style={{ ...SKB, fontSize: 18, color: 'white', textTransform: 'uppercase', margin: 0 }}>SCOPE PRO</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { label: 'STATUS', value: 'ACTIVE' },
            { label: 'BILLING', value: '$5 / MONTH' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ ...SKB, fontSize: 8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>{label}</p>
              <p style={{ ...SKB, fontSize: 12, color: 'white', margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What you get */}
      <div style={{ padding: '24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px' }}>INCLUDED WITH PRO</p>
        {[
          'Unlimited posts',
          'Full analytics dashboard',
          'Priority minting',
          'Red aperture badge on your profile',
          'Decks — curated collections',
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#FF0000', flexShrink: 0 }} />
            <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{item}</p>
          </div>
        ))}
      </div>

      {/* Cancel section */}
      <div style={{ padding: '24px 16px' }}>
        {!showCancelConfirm ? (
          <button
            onClick={() => setShowCancelConfirm(true)}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: '12px 24px', width: '100%' }}
          >
            <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CANCEL MEMBERSHIP</span>
          </button>
        ) : (
          <div style={{ border: '1px solid rgba(255,0,0,0.3)', padding: 20 }}>
            <p style={{ ...SKB, fontSize: 13, color: 'white', textTransform: 'uppercase', margin: '0 0 8px' }}>ARE YOU SURE?</p>
            <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 20px' }}>
              You'll keep Pro access until the end of your billing period. After that you'll revert to the free tier.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: '10px 0' }}
              >
                <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>KEEP PRO</span>
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ flex: 1, background: 'rgba(255,0,0,0.15)', border: '1px solid rgba(255,0,0,0.4)', cursor: cancelling ? 'default' : 'pointer', padding: '10px 0' }}
              >
                <span style={{ ...SKB, fontSize: 10, color: '#FF0000', textTransform: 'uppercase' }}>
                  {cancelling ? 'CANCELLING...' : 'YES, CANCEL'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
