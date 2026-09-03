"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { supabase } from "@/lib/supabase/client";
import { invalidateMembership } from "@/lib/userService";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function ManageMembershipPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // CANCELLATION TRUTH — the persisted scheduled-cancel date (survives leaving
  // the page): active-but-cancelled renders "cancels <date>" + a RESUME control.
  const [cancelsAt, setCancelsAt] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const { data: u } = await supabase.from('users').select('id').eq('privy_id', user.id).maybeSingle();
      if (!alive || !u?.id) return;
      const { data: p } = await supabase.from('profiles').select('membership_cancels_at').eq('user_id', u.id).maybeSingle();
      if (alive) setCancelsAt((p as { membership_cancels_at?: string | null } | null)?.membership_cancels_at ?? null);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const handleResume = async () => {
    setResuming(true);
    setCancelError(null);
    try {
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, action: 'resume' }),
      });
      if (res.ok) {
        setCancelsAt(null); setCancelled(false);
        // Invalidate the shared profile cache so the membership BAR (badges
        // sheet / desktop panel) re-reads fresh state instead of stale RENEWS.
        if (user?.id) await invalidateMembership(user.id);
        window.dispatchEvent(new CustomEvent('scope:membership-changed'));
        return;
      }
      setCancelError("Couldn't resume right now — please try again.");
    } catch {
      setCancelError("Couldn't resume right now — please try again.");
    } finally {
      setResuming(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      });
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j?.cancelsAt) setCancelsAt(j.cancelsAt);
        setCancelled(true);
        // Invalidate the shared profile cache so the membership BAR (badges
        // sheet / desktop panel) reflects CANCELS immediately, not stale RENEWS.
        if (user?.id) await invalidateMembership(user.id);
        window.dispatchEvent(new CustomEvent('scope:membership-changed'));
        return;
      }
      // Don't fail silently — surface it so "Cancel anytime" is honest.
      const j = await res.json().catch(() => ({}));
      setCancelError(j?.error === 'No subscription found' || j?.error === 'No active subscription'
        ? "We couldn't find an active subscription to cancel."
        : "Couldn't cancel right now — please try again.");
    } catch (e) {
      console.error('Cancel failed:', e);
      setCancelError("Couldn't cancel right now — please try again.");
    } finally {
      setCancelling(false);
    }
  };

  if (cancelled) {
    return (
      <div style={{ backgroundColor: '#000', minHeight: '100dvh', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-18)', color: '#E5E1DB', textTransform: 'uppercase', textAlign: 'center', margin: '0 0 12px' }}>MEMBERSHIP CANCELLED</p>
        <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.5)', textAlign: 'center', margin: '0 0 32px', lineHeight: 1.6 }}>
          Your Pro access continues until the end of your billing period.
        </p>
        <button onClick={() => router.push('/profile')} style={{ background: '#E5E1DB', border: 'none', cursor: 'pointer', padding: '12px 32px' }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: 'var(--on-ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>BACK TO PROFILE</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100dvh', padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
        <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginRight: 12, padding: 4 }}>
          <svg width="23.5" height="23.5" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="#E5E1DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MANAGE MEMBERSHIP</span>
      </div>

      {/* Current plan */}
      <div style={{ padding: '24px 16px', borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <img src="/design-updates-071526/new-badges/scope-pro.png" alt="Scope Pro" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <div>
            <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>CURRENT PLAN</p>
            <p style={{ ...SKB, fontSize: 'var(--fs-18)', color: '#E5E1DB', textTransform: 'uppercase', margin: 0 }}>SCOPE PRO</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { label: 'STATUS', value: cancelsAt ? `PRO · CANCELS ${fmtDate(cancelsAt).toUpperCase()}` : 'ACTIVE' },
            { label: 'BILLING', value: cancelsAt ? 'ENDS — NO RENEWAL' : '$5 / MONTH' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ ...SKB, fontSize: 'var(--fs-8)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>{label}</p>
              <p style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#E5E1DB', margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What you get */}
      <div style={{ padding: '24px 16px', borderBottom: '1px solid rgba(229,225,219,0.08)' }}>
        <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px' }}>INCLUDED WITH PRO</p>
        {[
          'Unlimited posts',
          'Full analytics dashboard',
          'Priority minting',
          'Red aperture badge on your profile',
          'Decks — curated collections',
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#E5E1DB', flexShrink: 0 }} />
            <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.7)', margin: 0 }}>{item}</p>
          </div>
        ))}
      </div>

      {/* Cancel section — reflects the persisted state: scheduled cancel →
          RESUME (Stripe supports un-scheduling any time before the period ends). */}
      <div style={{ padding: '24px 16px' }}>
        {cancelsAt ? (
          <div>
            <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.5)', lineHeight: 1.6, margin: '0 0 14px' }}>
              Your membership is set to cancel on {fmtDate(cancelsAt)}. Pro stays active until then.
            </p>
            <button
              onClick={handleResume}
              disabled={resuming}
              style={{ background: '#E5E1DB', border: 'none', cursor: resuming ? 'default' : 'pointer', padding: '12px 24px', width: '100%' }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'var(--on-ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {resuming ? 'RESUMING…' : 'RESUME MEMBERSHIP'}
              </span>
            </button>
            {cancelError && (
              <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'var(--danger)', lineHeight: 1.5, margin: '14px 0 0' }}>{cancelError}</p>
            )}
          </div>
        ) : !showCancelConfirm ? (
          <button
            onClick={() => setShowCancelConfirm(true)}
            style={{ background: 'transparent', border: '1px solid rgba(229,225,219,0.15)', cursor: 'pointer', padding: '12px 24px', width: '100%' }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CANCEL MEMBERSHIP</span>
          </button>
        ) : (
          <div style={{ border: '1px solid rgba(229,225,219,0.3)', padding: 20 }}>
            <p style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#E5E1DB', textTransform: 'uppercase', margin: '0 0 8px' }}>ARE YOU SURE?</p>
            <p style={{ ...SKR, fontSize: 'var(--fs-12)', color: 'rgba(229,225,219,0.5)', lineHeight: 1.6, margin: '0 0 20px' }}>
              You'll keep Pro access until the end of your billing period. After that you'll revert to the free tier.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{ flex: 1, background: 'transparent', border: '1px solid rgba(229,225,219,0.2)', cursor: 'pointer', padding: '10px 0' }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.6)', textTransform: 'uppercase' }}>KEEP PRO</span>
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ flex: 1, background: 'rgba(229,225,219,0.15)', border: '1px solid rgba(229,225,219,0.4)', cursor: cancelling ? 'default' : 'pointer', padding: '10px 0' }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', textTransform: 'uppercase' }}>
                  {cancelling ? 'CANCELLING...' : 'YES, CANCEL'}
                </span>
              </button>
            </div>
            {cancelError && (
              <p style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'var(--danger)', lineHeight: 1.5, margin: '14px 0 0' }}>{cancelError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
