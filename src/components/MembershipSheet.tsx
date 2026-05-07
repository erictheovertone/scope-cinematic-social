"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, http, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const TREASURY = "0xEEb05D9aa4B73af461E820CCC6BA5d97c64cC1c5";
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

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

type Plan = "monthly_crypto" | "annual_crypto" | "monthly_stripe";
type TxStatus = "idle" | "confirming" | "success" | "error";

interface MembershipSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (plan: Plan, txHash?: string) => void;
}

export default function MembershipSheet({ visible, onClose, onSuccess }: MembershipSheetProps) {
  const { wallets } = useWallets();
  const [selectedPlan, setSelectedPlan] = useState<Plan>("monthly_crypto");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

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
      sub: "BEST VALUE · ONE PAYMENT · CRYPTO",
      amount: "50",
    },
    {
      id: "monthly_stripe" as Plan,
      label: "MONTHLY",
      price: "$5 / MO",
      sub: "AUTO-RENEWS · CARD",
      amount: "5",
    },
  ];

  const handleCryptoPayment = async (amount: string) => {
    const embeddedWallet = wallets.find(w => w.walletClientType === "privy");
    if (!embeddedWallet) throw new Error("No wallet found");

    await embeddedWallet.switchChain(baseSepolia.id);
    const provider = await embeddedWallet.getEthereumProvider();

    const { createWalletClient, custom } = await import("viem");
    const walletClient = createWalletClient({
      account: embeddedWallet.address as `0x${string}`,
      chain: baseSepolia,
      transport: custom(provider),
    });

    const amountInUnits = parseUnits(amount, 6); // USDC has 6 decimals

    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [TREASURY as `0x${string}`, amountInUnits],
      chain: baseSepolia,
      account: embeddedWallet.address as `0x${string}`,
    });

    // Wait for confirmation
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_ALCHEMY_BASE_URL || "https://sepolia.base.org"),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return hash;
  };

  const handleStripePayment = async () => {
    // Stripe flow — redirect to Stripe checkout
    // Will be wired up once Stripe keys are configured
    const res = await fetch("/api/stripe/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "monthly_stripe" }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  const handleSubscribe = async () => {
    setWorking(true);
    setTxStatus("confirming");
    setTxError(null);

    try {
      if (selectedPlan === "monthly_stripe") {
        await handleStripePayment();
        return;
      }

      const plan = plans.find(p => p.id === selectedPlan)!;
      const hash = await handleCryptoPayment(plan.amount);
      console.log("[membership] payment confirmed, hash:", hash);

      // Notify server to update paid_member_until
      await fetch("/api/membership/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, txHash: hash }),
      });

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

      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        backgroundColor: "#080808",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        zIndex: 501,
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
        padding: "28px 24px 48px",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <div style={{ width: 36, height: 2, backgroundColor: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ ...BOLD, fontSize: 18, color: "white", textTransform: "uppercase", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            BECOME A SCOPE MEMBER
          </p>
          <p style={{ ...REG, fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: 0 }}>
            Unlock unlimited posts, decks, analytics, and your place in the Scope ecosystem. Membership is debited directly from your wallet.
          </p>
        </div>

        {/* What you get */}
        <div style={{ marginBottom: 28, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
          {[
            "UNLIMITED POSTS",
            "DECKS & COLLECTIONS",
            "FULL ANALYTICS PER POST",
            "SCOPE MEMBER BADGE",
            "EARLY ACCESS TO NEW FEATURES",
            "PRIORITY SUPPORT",
          ].map(benefit => (
            <div key={benefit} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#FF0000", flexShrink: 0 }} />
              <p style={{ ...BOLD, fontSize: 9, color: "white", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{benefit}</p>
            </div>
          ))}
        </div>

        {/* Plan selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {plans.map(plan => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              style={{
                flex: 1,
                background: "transparent",
                border: `1px solid ${selectedPlan === plan.id ? "white" : "rgba(255,255,255,0.15)"}`,
                padding: "10px 4px",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <p style={{ ...BOLD, fontSize: 8, color: selectedPlan === plan.id ? "white" : "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
                {plan.label}
              </p>
              <p style={{ ...BOLD, fontSize: 13, color: selectedPlan === plan.id ? "white" : "rgba(255,255,255,0.4)", margin: "0 0 4px" }}>
                {plan.price}
              </p>
              <p style={{ ...REG, fontSize: 7, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>
                {plan.sub}
              </p>
            </button>
          ))}
        </div>

        {/* Error */}
        {txStatus === "error" && txError && (
          <p style={{ ...REG, fontSize: 9, color: "#FF0000", textAlign: "center", margin: "0 0 12px", lineHeight: 1.4 }}>
            {txError.slice(0, 80)}
          </p>
        )}

        {/* CTA */}
        <button
          onClick={handleSubscribe}
          disabled={working || txStatus === "success"}
          style={{
            width: "100%",
            background: working ? "rgba(255,0,0,0.4)" : "#FF0000",
            border: "none",
            padding: "16px 0",
            cursor: working ? "default" : "pointer",
          }}
        >
          <span style={{ ...BOLD, fontSize: 12, color: "white", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {working ? "PROCESSING..." : txStatus === "confirming" ? "CONFIRMING..." : "JOIN SCOPE · " + plans.find(p => p.id === selectedPlan)?.price}
          </span>
        </button>

        <p style={{ ...REG, fontSize: 8, color: "rgba(255,255,255,0.25)", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>
          CRYPTO PAYMENTS SENT TO SCOPE TREASURY ON BASE. CARD PAYMENTS PROCESSED BY STRIPE.
        </p>
      </div>
    </>
  );
}
