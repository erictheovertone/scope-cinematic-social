"use client";

// ── AugmentedSheet — the Augmented Pro upsell + checkout (Brief AUG-1 §2) ────────────────────────
// Per docs/design/scope-augmented-mock.html: brass mark hero, "Augmented" in brass, the two plans
// (annual PRE-SELECTED, "2 months free"), five benefits, Join, fine print. Bottom sheet on mobile,
// centred panel on desktop. Card only — Stripe Embedded Checkout (no navigation, so a Download
// tap that raised it resumes in place). Opened through useUpsell().showAugmented() from:
// Settings → Membership, any Download tap by a non-member, and the Augmented badge tap.
//
// Completion mirrors MembershipSheet's embedded path: onComplete → confirm-stripe (server writes
// tier + period) → invalidateMembership → 'scope:pro-activated' (+ 'scope:tier-changed').

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { invalidateMembership } from "@/lib/userService";
import { forgetTier } from "@/lib/tier";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { AugmentedMark } from "@/components/brand/AugmentedMark";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = "rgb(var(--ink-rgb) / 0.16)";
const MUTE = "rgb(var(--ink-rgb) / 0.5)";

type Plan = "augmented_monthly" | "augmented_annual";
const PLANS: { id: Plan; label: string; price: string; unit: string; note?: string }[] = [
  { id: "augmented_monthly", label: "Monthly", price: "$29.99", unit: "/mo" },
  { id: "augmented_annual", label: "Annual", price: "$299", unit: "/yr", note: "2 months free" },
];
const BENEFITS = [
  "Everything in Pro",
  "Unlimited full-resolution downloads",
  "Music downloads",
  "Basic usage & sync rights · social and YouTube",
  "The Augmented badge on your profile and posts",
];

interface EmbeddedCheckoutHandle { mount: (el: string | HTMLElement) => void; destroy: () => void }

export default function AugmentedSheet({ visible, onClose, onJoined }: { visible: boolean; onClose: () => void; onJoined: () => void }) {
  const { user, login } = usePrivy();
  const isDesktop = useIsDesktop();
  const [plan, setPlan] = useState<Plan>("augmented_annual");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embeddedOpen, setEmbeddedOpen] = useState(false);
  const embeddedRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<EmbeddedCheckoutHandle | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => { if (visible) { setPlan("augmented_annual"); setError(null); } }, [visible]);
  useEffect(() => {
    if (embeddedOpen && checkoutRef.current && embeddedRef.current) checkoutRef.current.mount(embeddedRef.current);
  }, [embeddedOpen]);

  const closeEmbedded = () => {
    try { checkoutRef.current?.destroy(); } catch { /* noop */ }
    checkoutRef.current = null;
    setEmbeddedOpen(false);
    setWorking(false);
  };

  const join = async () => {
    if (!user) { login(); return; }
    setWorking(true); setError(null);
    try {
      const res = await fetch("/api/stripe/create-embedded-checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, privyUserId: user.id }),
      });
      const { clientSecret, sessionId, error: err } = await res.json();
      if (err || !clientSecret) throw new Error(err || "Checkout unavailable");
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
      if (!stripe) throw new Error("Stripe failed to load");
      const checkout = await stripe.createEmbeddedCheckoutPage({
        clientSecret,
        onComplete: () => {
          try { checkout.destroy(); } catch { /* noop */ }
          checkoutRef.current = null;
          setEmbeddedOpen(false);
          (async () => {
            try {
              const r = await fetch("/api/membership/confirm-stripe", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }),
              });
              if (!r.ok) throw new Error(`confirm-stripe ${r.status}`);
              await invalidateMembership(user.id);
              window.dispatchEvent(new CustomEvent("scope:pro-activated"));
              window.dispatchEvent(new CustomEvent("scope:tier-changed"));
              setWorking(false);
              onJoined();
            } catch (e) {
              console.error("[augmented] confirm failed:", e);
              setWorking(false);
              setError("Payment went through but activation is still pending — refresh in a moment; you won't be charged twice.");
            }
          })();
        },
      });
      checkoutRef.current = checkout as unknown as EmbeddedCheckoutHandle;
      setEmbeddedOpen(true);
    } catch (e) {
      setWorking(false);
      setError((e as Error).message || "Checkout failed");
    }
  };
  // Keep forgetTier referenced for the viewer's own row (the batched cache) after joining.
  useEffect(() => {
    const h = () => { if (user?.id) forgetTier(user.id); };
    window.addEventListener("scope:tier-changed", h);
    return () => window.removeEventListener("scope:tier-changed", h);
  }, [user?.id]);

  // Portal only after mount: the server renders nothing, so the client's first render must too
  // (a `typeof document` check here mismatched hydration app-wide — React #418 — and the
  // client re-render dropped <html data-theme>, flipping light-theme users back to dark).
  if (!mounted) return null;

  const body = (
    <div data-testid="augmented-sheet">
      {!isDesktop && <div style={{ width: 36, height: 3, borderRadius: 2, background: "rgb(var(--ink-rgb) / 0.32)", margin: "0 auto 20px" }} />}
      <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "6px 0 20px", borderBottom: `1px solid ${HAIR}`, marginBottom: 16 }}>
        <AugmentedMark width={88} />
        <div style={{ ...BOLD, fontSize: 30, letterSpacing: "0.1em", textTransform: "uppercase", lineHeight: 1, background: "var(--brass-grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Augmented</div>
        <div style={{ ...REG, color: MUTE, fontSize: 13 }}>The mark you carry on Scope</div>
      </div>

      <div role="radiogroup" aria-label="Plan" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {PLANS.map((p) => {
          const on = plan === p.id;
          return (
            <button key={p.id} role="radio" aria-checked={on} data-testid={`plan-${p.id}`} onClick={() => setPlan(p.id)}
              style={{ textAlign: "left", background: "transparent", cursor: "pointer", border: `1px solid ${on ? "var(--brass)" : HAIR}`, padding: "10px 12px", display: "grid", gap: 4, color: "var(--ink-100)" }}>
              <span style={{ ...BOLD, color: MUTE, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                {p.label}
                {p.note && <em style={{ fontStyle: "normal", color: "var(--brass)", fontSize: 8, border: "1px solid var(--brass)", padding: "1px 4px" }}>{p.note}</em>}
              </span>
              <b style={{ ...REG, fontWeight: 500, fontSize: 22, letterSpacing: "-0.01em" }}>{p.price}<small style={{ fontSize: 11, color: MUTE }}>{p.unit}</small></b>
            </button>
          );
        })}
      </div>

      <div>
        {BENEFITS.map((b, i) => (
          <div key={b} style={{ ...REG, display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${HAIR}`, borderBottom: i === BENEFITS.length - 1 ? `1px solid ${HAIR}` : undefined, fontSize: 13 }}>
            <i style={{ width: 14, height: 14, border: "1px solid var(--ink-100)", display: "inline-grid", placeItems: "center", flex: "none" }}>
              <span style={{ width: 7, height: 7, background: "var(--ink-100)" }} />
            </i>{b}
          </div>
        ))}
      </div>

      <button data-testid="augmented-join" onClick={join} disabled={working}
        style={{ ...BOLD, width: "100%", marginTop: 16, padding: "13px 16px", background: "var(--ink-100)", color: "var(--surface-1)", border: "1px solid var(--ink-100)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", cursor: working ? "default" : "pointer", opacity: working ? 0.6 : 1 }}>
        {working ? "Opening checkout…" : "Join Augmented Pro"}
      </button>
      {error && <p role="alert" style={{ ...REG, color: "var(--danger)", fontSize: 12, margin: "10px 0 0" }}>{error}</p>}
      <p style={{ ...REG, color: MUTE, fontSize: 11, lineHeight: 1.5, margin: "12px 0 0" }}>
        Billed through Stripe. Cancel anytime. Sync rights cover your own social and YouTube channels; broadcast, film and advertising need a separate license.{" "}
        <Link href="/legal/sync-license" onClick={onClose} style={{ color: "var(--ink-100)", textDecoration: "none", borderBottom: "1px solid rgb(var(--ink-rgb) / 0.32)" }}>Read the license</Link>
      </p>
    </div>
  );

  return createPortal(
    <>
      {embeddedOpen && (
        <div data-swipe-exclude style={{ position: "fixed", inset: 0, zIndex: 620, backgroundColor: "var(--surface-1)", display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgb(var(--ink-rgb) / 0.08)" }}>
            <span style={{ ...BOLD, fontSize: "var(--fs-12)", color: "var(--brass)", textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", gap: 8, alignItems: "center" }}><AugmentedMark width={20} />Augmented Pro</span>
            <button onClick={closeEmbedded} aria-label="Cancel" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, lineHeight: 0 }}>
              <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="var(--ink-100)" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
          {/* The fixed outer never scrolls (WebKit iframe hit-target rule) — this child does. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <div ref={embeddedRef} style={{ width: "100%", minHeight: "75dvh" }} />
          </div>
        </div>
      )}
      <div data-swipe-exclude onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "rgb(var(--black-rgb) / 0.85)", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none", transition: "opacity 0.3s ease" }} />
      {isDesktop ? (
        <div data-swipe-exclude role="dialog" aria-modal="true" aria-label="Augmented Pro" aria-hidden={!visible} {...(visible ? {} : { inert: true })} style={{ position: "fixed", left: "50%", top: "50%", zIndex: 601, width: 420, maxHeight: "90vh", overflowY: "auto", background: "var(--surface-1)", border: `1px solid ${HAIR}`, padding: "28px 24px", color: "var(--ink-100)", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none", transform: `translate(-50%, ${visible ? "-50%" : "-46%"})`, transition: "opacity 0.25s ease, transform 0.25s ease" }}>{body}</div>
      ) : (
        <div data-swipe-exclude role="dialog" aria-modal="true" aria-label="Augmented Pro" aria-hidden={!visible} {...(visible ? {} : { inert: true })} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 601, maxHeight: "92dvh", overflowY: "auto", background: "var(--surface-1)", borderTop: `1px solid ${HAIR}`, borderRadius: "22px 22px 0 0", padding: "14px 20px calc(32px + var(--safe-bottom))", color: "var(--ink-100)", transform: visible ? "translateY(0)" : "translateY(100%)", transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)" }}>{body}</div>
      )}
    </>,
    document.body,
  );
}
