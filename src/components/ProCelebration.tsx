"use client";

/**
 * ProCelebration — the "WELCOME TO SCOPE PRO" moment, extracted from the
 * /membership/success route so it can render as an IN-APP OVERLAY (no navigation)
 * after an in-suite purchase, AND be reused by the success route for redirect
 * returns. `onDone` fires when the sequence finishes (caller dismisses).
 */

import { useEffect, useState } from "react";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function ProCelebration({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "reveal" | "done">("loading");
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("reveal"), 600);
    const t2 = setTimeout(() => setPhase("done"), 2800);
    const t2b = setTimeout(() => setExiting(true), 6500);
    const t3 = setTimeout(onDone, 7200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t2b); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: exiting ? 0 : 1, transition: exiting ? "opacity 0.8s ease" : "none" }}>
      {phase === "reveal" && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: "#FF0000", animation: "scanDown 1.2s ease-in-out forwards" }} />
      )}
      {phase !== "loading" && (
        <>
          <div style={{ position: "absolute", top: 24, left: 24, width: 40, height: 40, borderTop: "2px solid #FF0000", borderLeft: "2px solid #FF0000", animation: "cornerReveal 0.6s ease forwards", opacity: 0 }} />
          <div style={{ position: "absolute", top: 24, right: 24, width: 40, height: 40, borderTop: "2px solid #FF0000", borderRight: "2px solid #FF0000", animation: "cornerReveal 0.6s ease 0.1s forwards", opacity: 0 }} />
          <div style={{ position: "absolute", bottom: 24, left: 24, width: 40, height: 40, borderBottom: "2px solid #FF0000", borderLeft: "2px solid #FF0000", animation: "cornerReveal 0.6s ease 0.2s forwards", opacity: 0 }} />
          <div style={{ position: "absolute", bottom: 24, right: 24, width: 40, height: 40, borderBottom: "2px solid #FF0000", borderRight: "2px solid #FF0000", animation: "cornerReveal 0.6s ease 0.3s forwards", opacity: 0 }} />
        </>
      )}
      <div style={{ perspective: 500, width: 80, height: 80, marginBottom: 32, position: "relative", opacity: phase === "loading" ? 0 : 1, transform: phase === "loading" ? "scale(0.7)" : "scale(1)", transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ position: "absolute", inset: -20, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,0,0,0.4) 0%, transparent 70%)", animation: "glowPulse 2s ease-in-out infinite" }} />
        <div style={{ width: 80, height: 80, transformStyle: "preserve-3d", animation: "coinFlip 5s ease-in-out infinite", position: "relative" }}>
          <img src="/badges/scope-pro-badge-min-design-01.png" style={{ width: 80, height: 80, position: "absolute", backfaceVisibility: "hidden", filter: "drop-shadow(0 0 16px rgba(255,0,0,0.9))", borderRadius: "50%" }} />
          <img src="/badges/scope-pro-badge-min-design-01.png" style={{ width: 80, height: 80, position: "absolute", backfaceVisibility: "hidden", transform: "rotateY(180deg)", filter: "drop-shadow(0 0 16px rgba(255,0,0,0.9))", borderRadius: "50%" }} />
        </div>
      </div>
      {phase !== "loading" && (
        <>
          <p style={{ ...BOLD, fontSize: 'var(--fs-24)', color: "white", textTransform: "uppercase", letterSpacing: "-0.02em", margin: "0 0 12px", animation: "fadeUp 0.8s ease forwards" }}>WELCOME TO SCOPE</p>
          <p style={{ ...REG, fontSize: 'var(--fs-13)', color: "rgba(255,255,255,0.5)", margin: "0 0 8px", animation: "fadeUp 0.8s ease 0.2s forwards", opacity: 0 }}>You are now a Scope Pro member.</p>
          <p style={{ ...REG, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.3)", animation: "fadeUp 0.8s ease 0.4s forwards", opacity: 0 }}>Your badge is live on your profile.</p>
        </>
      )}
      {phase === "reveal" && (
        <>
          <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", border: "1px solid rgba(255,0,0,0.3)", animation: "pulseRing 2s ease-out infinite" }} />
          <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", border: "1px solid rgba(255,0,0,0.15)", animation: "pulseRing 2s ease-out 0.6s infinite" }} />
        </>
      )}
      <style>{`
        @keyframes scanDown { 0% { top: 0; opacity: 1; } 100% { top: 100%; opacity: 0; } }
        @keyframes coinFlip { 0% { transform: rotateY(0deg); } 40% { transform: rotateY(160deg); } 50% { transform: rotateY(180deg); } 90% { transform: rotateY(340deg); } 100% { transform: rotateY(360deg); } }
        @keyframes glowPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes pulseRing { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cornerReveal { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
