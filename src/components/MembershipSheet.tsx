"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, http, parseUnits } from "viem";
import { base } from "viem/chains";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const TREASURY = "0xEEb05D9aa4B73af461E820CCC6BA5d97c64cC1c5";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const USDC_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type Plan = "monthly_crypto" | "annual_crypto" | "monthly_stripe" | "annual_stripe";
type TxStatus = "idle" | "confirming" | "success" | "error";

interface MembershipSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (plan: Plan, txHash?: string) => void;
  isPaidMember?: boolean;
  paidMemberUntil?: Date | null;
  /** In-suite purchase (raised from FINISHING) → resolve IN-APP, never navigate. */
  fromFinishing?: boolean;
}

interface EmbeddedCheckoutHandle { mount: (el: string | HTMLElement) => void; destroy: () => void }

export default function MembershipSheet({ visible, onClose, onSuccess, isPaidMember, paidMemberUntil, fromFinishing }: MembershipSheetProps) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [selectedPlan, setSelectedPlan] = useState<Plan>("monthly_crypto");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  // Stripe Embedded Checkout (in-suite card path) — mounted in an overlay.
  const [embeddedOpen, setEmbeddedOpen] = useState(false);
  const embeddedRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<EmbeddedCheckoutHandle | null>(null);

  // Mount the embedded checkout once its container is in the DOM.
  useEffect(() => {
    if (embeddedOpen && checkoutRef.current && embeddedRef.current) {
      checkoutRef.current.mount(embeddedRef.current);
    }
  }, [embeddedOpen]);

  const closeEmbedded = () => {
    try { checkoutRef.current?.destroy(); } catch { /* noop */ }
    checkoutRef.current = null;
    setEmbeddedOpen(false);
    setWorking(false);
    setTxStatus("idle");
  };

  const plans = [
    {
      id: "monthly_crypto" as Plan,
      label: "MONTHLY",
      price: "$5 USDC",
      sub: "RENEWS MANUALLY · CRYPTO",
      amount: "5",
    },
    {
      id: "annual_crypto" as Plan,
      label: "ANNUAL",
      price: "$50 USDC",
      sub: "BEST VALUE · CRYPTO",
      amount: "50",
    },
    {
      id: "monthly_stripe" as Plan,
      label: "MONTHLY",
      price: "$5 / MO",
      sub: "AUTO-RENEWS · CARD",
      amount: "5",
    },
    {
      id: "annual_stripe" as Plan,
      label: "ANNUAL",
      price: "$50 / YR",
      sub: "BEST VALUE · CARD",
      amount: "50",
    },
  ];

  const handleCryptoPayment = async (amount: string) => {
    const embeddedWallet = wallets.find(w => w.walletClientType === "privy");
    if (!embeddedWallet) throw new Error("No wallet found");

    await embeddedWallet.switchChain(base.id);
    const provider = await embeddedWallet.getEthereumProvider();

    const { createWalletClient, custom } = await import("viem");
    const walletClient = createWalletClient({
      account: embeddedWallet.address as `0x${string}`,
      chain: base,
      transport: custom(provider),
    });

    const amountInUnits = parseUnits(amount, 6); // USDC has 6 decimals

    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [TREASURY as `0x${string}`, amountInUnits],
      chain: base,
      account: embeddedWallet.address as `0x${string}`,
    });

    // Wait for confirmation
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://mainnet.base.org"),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return hash;
  };

  // Non-suite card path — hosted checkout (full nav → success route → profile glow).
  // privyUserId travels in Stripe metadata (no localStorage needed).
  const handleStripePayment = async () => {
    if (!user) return;
    const res = await fetch("/api/stripe/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: selectedPlan, privyUserId: user.id }),
    });
    const { url, error } = await res.json();
    if (error) throw new Error(error);
    if (url) window.location.href = url;
  };

  // In-suite card path — Stripe Embedded Checkout (no navigation; editor stays mounted).
  const handleStripeEmbedded = async () => {
    if (!user) return;
    const res = await fetch("/api/stripe/create-embedded-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: selectedPlan, privyUserId: user.id }),
    });
    const { clientSecret, sessionId, error } = await res.json();
    if (error) throw new Error(error);
    const { loadStripe } = await import("@stripe/stripe-js");
    const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
    if (!stripe) throw new Error("Stripe failed to load");
    const checkout = await stripe.createEmbeddedCheckoutPage({
      clientSecret,
      onComplete: () => {
        // Skip Stripe's own confirmation screen: tear the embedded component down
        // IMMEDIATELY and jump straight to the Scope Pro celebration (one
        // confirmation moment, no back-to-back stutter).
        try { checkout.destroy(); } catch { /* noop */ }
        checkoutRef.current = null;
        setEmbeddedOpen(false);
        setWorking(false);
        onSuccess(selectedPlan); // provider → celebration (runs ~7s) + an early isPro refresh

        // Verify SERVER-SIDE in parallel (onComplete is client-side only). The
        // celebration covers this latency; on success re-fire the refresh so
        // locks lift. On failure, leave Pro OFF (locks stay locked — never a
        // silent unlock) and surface the error.
        (async () => {
          try {
            const r = await fetch("/api/membership/confirm-stripe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
            if (!r.ok) throw new Error(`confirm-stripe ${r.status}`);
            if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("scope:pro-activated"));
          } catch (e) {
            console.error("[membership] embedded server confirm failed:", e);
            setTxError("Payment went through but activation failed — please refresh; you won't be charged twice.");
          }
        })();
      },
    });
    checkoutRef.current = checkout as unknown as EmbeddedCheckoutHandle;
    setWorking(false);
    setEmbeddedOpen(true); // effect mounts it once the container renders
  };

  const handleSubscribe = async () => {
    setWorking(true);
    setTxStatus("confirming");
    setTxError(null);

    try {
      if (selectedPlan === "monthly_stripe" || selectedPlan === "annual_stripe") {
        // In-suite → embedded (stays mounted); elsewhere → hosted (existing nav).
        if (fromFinishing) { await handleStripeEmbedded(); return; }
        await handleStripePayment();
        return;
      }

      const plan = plans.find(p => p.id === selectedPlan)!;
      const hash = await handleCryptoPayment(plan.amount);

      await fetch("/api/membership/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, txHash: hash, privyUserId: user?.id }),
      });

      // Crypto already resolves in-app — NO redirect. The provider decides:
      // in-suite → in-app celebration + isPro refresh (editor mounted);
      // elsewhere → it routes to the success/profile glow.
      setTxStatus("success");
      onSuccess(selectedPlan, hash as string);
    } catch (e: any) {
      console.error("[membership] payment failed:", e);
      setTxStatus("error");
      setTxError(e?.shortMessage || e?.message || "Payment failed");
    } finally {
      setWorking(false);
    }
  };

  const resetAndClose = () => {
    setTxStatus("idle");
    setTxError(null);
    setSelectedPlan("monthly_crypto");
    onClose();
  };

  return (
    <>
      {/* Stripe Embedded Checkout overlay (in-suite card path) — no navigation.
          Full-screen black sheet. CRITICAL: the Stripe iframe must NOT be a
          descendant of a position:fixed element that is also the scroll
          container — on mobile WebKit that desyncs the iframe's painted
          position from its touch hit-target (a tap near the top registers
          lower down) and forces an awkward inner scroll. So the fixed outer
          does NOT scroll (overflow:hidden) and the header is a normal flex
          child; a dedicated NON-fixed flex child does the scrolling. The
          iframe auto-sizes to content and fills the centred column cleanly. */}
      {embeddedOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "#000", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#000" }}>
            <span style={{ ...BOLD, fontSize: 'var(--fs-12)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>SCOPE PRO</span>
            <button onClick={closeEmbedded} aria-label="Cancel" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, lineHeight: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "16px 16px 32px" }}>
              <div ref={embeddedRef} style={{ width: "100%" }} />
            </div>
          </div>
        </div>
      )}

      {/* Overlay */}
      <div
        onClick={resetAndClose}
        style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(0,0,0,0.9)",
          zIndex: 500,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 0.35s ease",
        }}
      />

      {/* Floating badge above sheet */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(90vh - 48px)',
        left: '50%',
        transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100px)',
        transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.35s ease',
        zIndex: 502,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}>
        <div style={{
          perspective: 400,
          perspectiveOrigin: "center center",
          width: 80,
          height: 80,
          position: "relative",
        }}>
          <div style={{
            position: "absolute",
            inset: -12,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,0,0,0.35) 0%, transparent 70%)",
            animation: "glowPulse 2.5s ease-in-out infinite",
            pointerEvents: "none",
          }} />
          <div style={{
            width: "100%",
            height: "100%",
            position: "relative",
            transformStyle: "preserve-3d",
            animation: "coinFlip 5s ease-in-out infinite",
          }}>
            <img
              src="/scope-pro-icon-aperture.png"
              alt="Scope Pro"
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                position: "absolute",
                backfaceVisibility: "hidden",
                filter: "drop-shadow(0 0 12px rgba(255,0,0,0.8))",
                borderRadius: "50%",
              }}
            />
            <img
              src="/scope-pro-icon-aperture.png"
              alt=""
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                position: "absolute",
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                filter: "drop-shadow(0 0 12px rgba(255,0,0,0.8))",
                borderRadius: "50%",
              }}
            />
          </div>
        </div>
      </div>

      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        backgroundColor: "#080808",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        zIndex: 501,
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
        padding: "32px 24px 48px",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <div style={{ width: 36, height: 2, backgroundColor: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Active member guard */}
        {isPaidMember && paidMemberUntil && (
          <div style={{ padding: '20px 0', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 20 }} />
            <p style={{ ...BOLD, fontSize: 'var(--fs-10)', color: '#FF0000', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
              ACTIVE MEMBER
            </p>
            <p style={{ ...REG, fontSize: 'var(--fs-11)', color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>
              Your membership is active until
            </p>
            <p style={{ ...BOLD, fontSize: 'var(--fs-13)', color: 'white', margin: '0 0 16px' }}>
              {paidMemberUntil.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: '10px 32px' }}
            >
              <span style={{ ...BOLD, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CLOSE</span>
            </button>
            <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 20 }} />
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ ...BOLD, fontSize: 'var(--fs-18)', color: "white", textTransform: "uppercase", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            BECOME A SCOPE MEMBER
          </p>
          <p style={{ ...REG, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>
            Unlock unlimited posts, unlimited decks, more links, and the full cinematic editing suite. Membership is debited directly from your wallet.
          </p>
        </div>

        {/* What you get */}
        <div style={{ marginBottom: 28, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
          {[
            "UNLIMITED POSTS",
            "UNLIMITED DECKS",
            "UP TO 5 LINKS",
            "FULL EDITING SUITE",
          ].map(benefit => (
            <div key={benefit} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#FF0000", flexShrink: 0 }} />
              <p style={{ ...BOLD, fontSize: 'var(--fs-9)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{benefit}</p>
            </div>
          ))}
        </div>

        {/* Plan selector — 2x2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {plans.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              style={{
                background: 'transparent',
                border: `1px solid ${selectedPlan === plan.id ? 'white' : 'rgba(255,255,255,0.15)'}`,
                padding: '10px 8px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <p style={{ ...BOLD, fontSize: 'var(--fs-8)', color: selectedPlan === plan.id ? 'white' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                {plan.label}
              </p>
              <p style={{ ...BOLD, fontSize: 'var(--fs-13)', color: selectedPlan === plan.id ? 'white' : 'rgba(255,255,255,0.4)', margin: '0 0 4px' }}>
                {plan.price}
              </p>
              <p style={{ ...REG, fontSize: 'var(--fs-7)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                {plan.sub}
              </p>
            </button>
          ))}
        </div>

        {/* Error */}
        {txStatus === "error" && txError && (
          <p style={{ ...REG, fontSize: 'var(--fs-9)', color: "#FF0000", textAlign: "center", margin: "0 0 12px", lineHeight: 1.4 }}>
            {txError.slice(0, 80)}
          </p>
        )}

        {/* CTA */}
        <button
          onClick={handleSubscribe}
          disabled={working || txStatus === "success" || isPaidMember}
          style={{
            width: "100%",
            background: working ? "rgba(255,0,0,0.4)" : "#FF0000",
            border: "none",
            padding: "16px 0",
            cursor: working ? "default" : "pointer",
          }}
        >
          <span style={{ ...BOLD, fontSize: 'var(--fs-12)', color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {working ? "PROCESSING..." : txStatus === "confirming" ? "CONFIRMING..." : "JOIN SCOPE · " + plans.find(p => p.id === selectedPlan)?.price}
          </span>
        </button>

        <p style={{ ...REG, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.25)", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>
          CRYPTO PAYMENTS SENT TO SCOPE TREASURY ON BASE. CARD PAYMENTS PROCESSED BY STRIPE.
        </p>
      </div>

      <style>{`
        @keyframes coinFlip {
          0% { transform: rotateY(0deg); }
          40% { transform: rotateY(160deg); }
          50% { transform: rotateY(180deg); }
          90% { transform: rotateY(340deg); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </>
  );
}
