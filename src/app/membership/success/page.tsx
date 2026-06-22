"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProCelebration from "@/components/ProCelebration";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

type Tier = "pro" | "creator" | "top1k" | "founding";


// ── CREATOR ANIMATION ─────────────────────────────────────────────────────────
function CreatorCelebration({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "reveal" | "text" | "done">("loading");
  const [typed, setTyped] = useState("");
  const [exiting, setExiting] = useState(false);
  const fullText = "FILMMAKER VERIFIED";

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("reveal"), 600);
    const t2 = setTimeout(() => setPhase("text"), 1800);
    const t3 = setTimeout(() => setPhase("done"), 3200);
    const t3b = setTimeout(() => setExiting(true), 7500);
    const t4 = setTimeout(onDone, 8200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t3b); clearTimeout(t4); };
  }, []);

  useEffect(() => {
    if (phase !== "text") return;
    let i = 0;
    const interval = setInterval(() => {
      setTyped(fullText.slice(0, i + 1));
      i++;
      if (i >= fullText.length) clearInterval(interval);
    }, 80);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: exiting ? 0 : 1, transition: exiting ? "opacity 0.8s ease" : "none" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E\")", opacity: phase === "loading" ? 0 : 0.4, transition: "opacity 1s ease", pointerEvents: "none" }} />
      {phase !== "loading" && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 48, background: "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, transparent 100%)", animation: "fadeIn 0.8s ease forwards" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 100%)", animation: "fadeIn 0.8s ease forwards" }} />
          <div style={{ position: "absolute", top: 16, left: 16, right: 16, height: 2, backgroundColor: "rgba(255,255,255,0.15)", animation: "expandWidth 0.8s ease forwards" }} />
          <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, height: 2, backgroundColor: "rgba(255,255,255,0.15)", animation: "expandWidth 0.8s ease forwards" }} />
          <div style={{ position: "absolute", top: 24, left: 24, width: 40, height: 40, borderTop: "2px solid #FF0000", borderLeft: "2px solid #FF0000", animation: "cornerReveal 0.4s ease forwards, flicker 4s ease 1s infinite", opacity: 0 }} />
          <div style={{ position: "absolute", top: 24, right: 24, width: 40, height: 40, borderTop: "2px solid #FF0000", borderRight: "2px solid #FF0000", animation: "cornerReveal 0.4s ease 0.1s forwards, flicker 4s ease 1.2s infinite", opacity: 0 }} />
          <div style={{ position: "absolute", bottom: 24, left: 24, width: 40, height: 40, borderBottom: "2px solid #FF0000", borderLeft: "2px solid #FF0000", animation: "cornerReveal 0.4s ease 0.2s forwards, flicker 4s ease 1.4s infinite", opacity: 0 }} />
          <div style={{ position: "absolute", bottom: 24, right: 24, width: 40, height: 40, borderBottom: "2px solid #FF0000", borderRight: "2px solid #FF0000", animation: "cornerReveal 0.4s ease 0.3s forwards, flicker 4s ease 1.6s infinite", opacity: 0 }} />
        </>
      )}
      <div style={{ perspective: 500, width: 80, height: 80, marginBottom: 32, position: "relative", opacity: phase === "loading" ? 0 : 1, transform: phase === "loading" ? "translateY(20px)" : "translateY(0)", transition: "all 1s cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ position: "absolute", inset: -20, borderRadius: "50%", background: "radial-gradient(circle, rgba(180,180,180,0.3) 0%, transparent 70%)", animation: "glowPulse 2.5s ease-in-out infinite" }} />
        <div style={{ width: 80, height: 80, transformStyle: "preserve-3d", animation: "coinFlip 6s ease-in-out infinite", position: "relative" }}>
          <img src="/in-house-creator-logo-grey.png" style={{ width: 80, height: 80, position: "absolute", backfaceVisibility: "hidden", filter: "drop-shadow(0 0 12px rgba(200,200,200,0.7))", borderRadius: "50%" }} />
          <img src="/in-house-creator-logo-grey.png" style={{ width: 80, height: 80, position: "absolute", backfaceVisibility: "hidden", transform: "rotateY(180deg)", filter: "drop-shadow(0 0 12px rgba(200,200,200,0.7))", borderRadius: "50%" }} />
        </div>
      </div>
      {phase !== "loading" && (
        <p style={{ ...BOLD, fontSize: 'var(--fs-24)', color: "white", textTransform: "uppercase", letterSpacing: "-0.02em", margin: "0 0 16px", animation: "fadeUp 0.8s ease forwards" }}>IN-HOUSE CREATOR</p>
      )}
      {(phase === "text" || phase === "done") && (
        <p style={{ fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-13)', color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em" }}>
          {typed}<span style={{ animation: "blink 1s step-end infinite" }}>_</span>
        </p>
      )}
      {phase === "done" && (
        <p style={{ ...REG, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.3)", marginTop: 12, animation: "fadeUp 0.8s ease forwards" }}>Post 10+ times monthly to keep your badge.</p>
      )}
      <Styles />
    </div>
  );
}

// ── TOP 1K ANIMATION ──────────────────────────────────────────────────────────
function Top1kCelebration({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "reveal" | "counter" | "done">("loading");
  const [count, setCount] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [particles, setParticles] = useState<{ x: number; delay: number; size: number }[]>([]);

  useEffect(() => {
    setParticles(Array.from({ length: 40 }, () => ({ x: Math.random() * 100, delay: Math.random() * 3, size: Math.random() * 3 + 1 })));
    const t1 = setTimeout(() => setPhase("reveal"), 600);
    const t2 = setTimeout(() => setPhase("counter"), 1800);
    const t3 = setTimeout(() => setPhase("done"), 3500);
    const t3b = setTimeout(() => setExiting(true), 8000);
    const t4 = setTimeout(onDone, 8800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t3b); clearTimeout(t4); };
  }, []);

  useEffect(() => {
    if (phase !== "counter") return;
    let current = 0;
    const target = 847;
    const duration = 1500;
    const increment = target / (duration / 16);
    const interval = setInterval(() => {
      current = Math.min(current + increment, target);
      setCount(Math.floor(current));
      if (current >= target) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", opacity: exiting ? 0 : 1, transition: exiting ? "opacity 0.8s ease" : "none" }}>
      {particles.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: `${p.x}%`, top: "-10px", width: p.size, height: p.size * 3, backgroundColor: `rgba(201,168,76,${0.4 + Math.random() * 0.6})`, borderRadius: 1, animation: `particleFall ${3 + p.delay}s linear ${p.delay}s infinite`, opacity: phase === "loading" ? 0 : 1, transition: "opacity 0.5s ease" }} />
      ))}
      {phase === "reveal" && (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg, transparent 40%, rgba(201,168,76,0.08) 50%, transparent 60%)", animation: "shimmerSweep 1.5s ease forwards" }} />
      )}
      <div style={{ perspective: 500, width: 88, height: 88, marginBottom: 24, position: "relative", opacity: phase === "loading" ? 0 : 1, transform: phase === "loading" ? "translateY(40px)" : "translateY(0)", transition: "all 1s cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ position: "absolute", inset: -24, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,168,76,0.5) 0%, transparent 70%)", animation: "glowPulse 2s ease-in-out infinite" }} />
        <div style={{ width: 88, height: 88, transformStyle: "preserve-3d", animation: "coinFlip 5s ease-in-out infinite", position: "relative" }}>
          <img src="/top-1k-collector-aperture-gold.png" style={{ width: 88, height: 88, position: "absolute", backfaceVisibility: "hidden", filter: "drop-shadow(0 0 20px rgba(201,168,76,1))", borderRadius: "50%" }} />
          <img src="/top-1k-collector-aperture-gold.png" style={{ width: 88, height: 88, position: "absolute", backfaceVisibility: "hidden", transform: "rotateY(180deg)", filter: "drop-shadow(0 0 20px rgba(201,168,76,1))", borderRadius: "50%" }} />
        </div>
      </div>
      {phase !== "loading" && (
        <p style={{ ...BOLD, fontSize: 'var(--fs-22)', color: "#C9A84C", textTransform: "uppercase", letterSpacing: "-0.02em", margin: "0 0 8px", animation: "fadeUp 0.8s ease forwards" }}>TOP 1000 COLLECTOR</p>
      )}
      {(phase === "counter" || phase === "done") && (
        <p style={{ ...BOLD, fontSize: 48, color: "white", margin: "0 0 4px", animation: "fadeUp 0.5s ease forwards", lineHeight: 1 }}>#{count}</p>
      )}
      {phase === "done" && (
        <>
          <p style={{ ...REG, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.4)", margin: "4px 0 0", animation: "fadeUp 0.8s ease forwards" }}>Your collector rank on Scope</p>
          <p style={{ ...REG, fontSize: 'var(--fs-11)', color: "rgba(201,168,76,0.6)", marginTop: 16, animation: "fadeUp 0.8s ease 0.2s forwards", opacity: 0 }}>Daily distributions begin tomorrow.</p>
        </>
      )}
      <Styles />
    </div>
  );
}

// ── FOUNDING 500 ANIMATION ────────────────────────────────────────────────────
function FoundingCelebration({ foundingNumber, onDone }: { foundingNumber?: number; onDone: () => void }) {
  const [phase, setPhase] = useState<"void" | "vortex" | "burst" | "badge" | "reveal" | "done">("void");
  const [exiting, setExiting] = useState(false);
  const [stars] = useState(() => Array.from({ length: 150 }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2.5 + 0.3,
    delay: Math.random() * 5,
    brightness: Math.random(),
    speed: Math.random() * 3 + 2,
  })));

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("vortex"), 300);
    const t2 = setTimeout(() => setPhase("burst"), 1200);
    const t3 = setTimeout(() => setPhase("badge"), 2000);
    const t4 = setTimeout(() => setPhase("reveal"), 3200);
    const t5 = setTimeout(() => setPhase("done"), 4600);
    const t6 = setTimeout(() => setExiting(true), 10500);
    const t7 = setTimeout(onDone, 11200);
    return () => { [t1,t2,t3,t4,t5,t6,t7].forEach(clearTimeout); };
  }, []);

  const isActive = phase !== "void";

  return (
    <div style={{
      position: "fixed", inset: 0,
      backgroundColor: "#000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      opacity: exiting ? 0 : 1,
      transition: exiting ? "opacity 0.8s ease" : "none",
    }}>

      {/* Deep space bg */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, #080018 0%, #020008 40%, #000 100%)",
        opacity: isActive ? 1 : 0,
        transition: "opacity 1.5s ease",
      }} />

      {/* Stars — drift toward center during vortex */}
      {stars.map((star, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: star.size,
          height: star.size,
          borderRadius: "50%",
          backgroundColor: "white",
          opacity: isActive ? star.brightness * 0.9 : 0,
          transition: `opacity ${star.speed * 0.3}s ease ${star.delay * 0.05}s`,
          animation: phase === "vortex" || phase === "burst"
            ? `starPull ${star.speed}s ease-in ${star.delay * 0.1}s forwards`
            : isActive ? `starTwinkle ${2 + star.delay * 0.5}s ease-in-out ${star.delay * 0.2}s infinite` : "none",
        }} />
      ))}

      {/* Vortex ring — cosmic portal opening */}
      {(phase === "vortex" || phase === "burst") && (
        <div style={{
          position: "absolute",
          width: 300, height: 300,
          borderRadius: "50%",
          border: "1px solid rgba(255,0,128,0.6)",
          animation: "vortexOpen 0.9s ease-out forwards",
          boxShadow: "0 0 40px rgba(255,0,128,0.4), inset 0 0 40px rgba(204,0,255,0.3)",
        }} />
      )}
      {(phase === "vortex" || phase === "burst") && (
        <div style={{
          position: "absolute",
          width: 200, height: 200,
          borderRadius: "50%",
          border: "1px solid rgba(0,207,255,0.5)",
          animation: "vortexOpen 0.9s ease-out 0.1s forwards",
          boxShadow: "0 0 30px rgba(0,207,255,0.4)",
        }} />
      )}
      {(phase === "vortex" || phase === "burst") && (
        <div style={{
          position: "absolute",
          width: 100, height: 100,
          borderRadius: "50%",
          border: "1px solid rgba(255,225,0,0.6)",
          animation: "vortexOpen 0.9s ease-out 0.2s forwards",
          boxShadow: "0 0 20px rgba(255,225,0,0.5)",
        }} />
      )}

      {/* Burst — light rays shoot outward */}
      {(phase === "burst" || phase === "badge") && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
            <div key={i} style={{
              position: "absolute",
              top: "50%", left: "50%",
              width: 1,
              height: "60vh",
              transformOrigin: "0 0",
              transform: `rotate(${angle}deg)`,
              background: `linear-gradient(to bottom, ${i % 3 === 0 ? "rgba(255,0,128,0.9)" : i % 3 === 1 ? "rgba(0,207,255,0.9)" : "rgba(255,225,0,0.9)"} 0%, transparent 80%)`,
              animation: `rayBurst 1.2s ease-out ${i * 0.02}s forwards`,
              opacity: 0,
            }} />
          ))}
        </div>
      )}

      {/* Aurora overlay */}
      {(phase === "reveal" || phase === "done") && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(255,0,128,0.05) 0%, rgba(0,207,255,0.05) 25%, rgba(204,0,255,0.05) 50%, rgba(255,225,0,0.05) 75%, rgba(255,0,128,0.05) 100%)",
          backgroundSize: "400% 400%",
          animation: "auroraShift 5s ease infinite",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }} />
      )}

      {/* Holographic flowing overlay */}
      {(phase === "reveal" || phase === "done") && (
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(255,0,128,0.04) 0%, rgba(0,207,255,0.04) 20%, rgba(204,0,255,0.04) 40%, rgba(255,225,0,0.04) 60%, rgba(0,255,128,0.04) 80%, rgba(255,0,128,0.04) 100%)",
          backgroundSize: "300% 300%",
          animation: "auroraShift 4s ease-in-out infinite reverse",
          pointerEvents: "none",
          zIndex: 3,
        }} />
      )}

      {/* Badge */}
      <div style={{
        perspective: 600,
        perspectiveOrigin: "center center",
        width: 96, height: 96,
        marginBottom: 28,
        position: "relative", zIndex: 4,
        opacity: phase === "void" || phase === "vortex" ? 0 : 1,
        transform: phase === "void" || phase === "vortex" ? "scale(0) rotate(180deg)" : "scale(1) rotate(0deg)",
        transition: phase === "burst" ? "all 0.6s cubic-bezier(0.16,1,0.3,1)" : "none",
      }}>
        <div style={{
          position: "absolute", inset: -32, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,0,128,0.6) 0%, rgba(204,0,255,0.3) 40%, transparent 70%)",
          animation: "glowPulse 2s ease-in-out infinite",
        }} />
        <div style={{
          width: 96, height: 96,
          position: "relative",
          transformStyle: "preserve-3d",
          animation: "coinFlip 6s ease-in-out infinite",
        }}>
          <img src="/augmented-member-founding-500-aperture.png" style={{ width: 96, height: 96, position: "absolute", backfaceVisibility: "hidden", filter: "drop-shadow(0 0 24px rgba(255,0,128,1)) drop-shadow(0 0 48px rgba(204,0,255,0.5))", borderRadius: "50%" }} />
          <img src="/augmented-member-founding-500-aperture.png" style={{ width: 96, height: 96, position: "absolute", backfaceVisibility: "hidden", transform: "rotateY(180deg)", filter: "drop-shadow(0 0 24px rgba(0,207,255,1)) drop-shadow(0 0 48px rgba(255,225,0,0.5))", borderRadius: "50%" }} />
        </div>
      </div>

      {/* Text */}
      <div style={{ position: "relative", zIndex: 4, textAlign: "center", padding: "0 32px" }}>
        {(phase === "reveal" || phase === "done") && (
          <>
            <p style={{ ...BOLD, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.3em", margin: "0 0 8px", animation: "fadeUp 0.8s ease forwards" }}>
              FOUNDING MEMBER
            </p>
            <p style={{
              ...BOLD, fontSize: 52, margin: "0 0 4px", lineHeight: 1,
              animation: "fadeUp 0.6s ease 0.1s forwards",
              background: "linear-gradient(135deg, #ff0080, #ffe100, #00cfff, #cc00ff)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              #{foundingNumber || 1}
            </p>
            <p style={{ ...BOLD, fontSize: 'var(--fs-10)', color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.2em", margin: "0 0 20px", animation: "fadeUp 0.8s ease 0.2s forwards", opacity: 0 }}>
              OF 500
            </p>
          </>
        )}
        {phase === "done" && (
          <>
            <p style={{ ...REG, fontSize: 'var(--fs-13)', color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: "0 0 8px", animation: "fadeUp 0.8s ease forwards" }}>
              You are one of the first 500 members of Scope.
            </p>
            <p style={{ ...REG, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.3)", animation: "fadeUp 0.8s ease 0.2s forwards", opacity: 0 }}>
              Your founding spot is yours as long as you stay.
            </p>
          </>
        )}
      </div>

      <Styles />
    </div>
  );
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
function Styles() {
  return (
    <style>{`
      @keyframes scanDown { 0% { top: 0; opacity: 1; } 100% { top: 100%; opacity: 0; } }
      @keyframes coinFlip { 0% { transform: rotateY(0deg); } 40% { transform: rotateY(160deg); } 50% { transform: rotateY(180deg); } 90% { transform: rotateY(340deg); } 100% { transform: rotateY(360deg); } }
      @keyframes glowPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
      @keyframes pulseRing { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes expandWidth { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      @keyframes particleFall { 0% { transform: translateY(-10px); opacity: 1; } 100% { transform: translateY(110vh); opacity: 0; } }
      @keyframes shimmerSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
      @keyframes starTwinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.9; } }
      @keyframes auroraShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      @keyframes rayPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.8; } }
      @keyframes cornerReveal { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
      @keyframes flicker { 0%, 96%, 100% { opacity: 1; } 97% { opacity: 0.3; } 98% { opacity: 1; } 99% { opacity: 0.1; } }
      @keyframes vortexOpen { 0% { transform: scale(0); opacity: 1; } 60% { transform: scale(1.2); opacity: 0.8; } 100% { transform: scale(2.5); opacity: 0; } }
      @keyframes starPull { 0% { transform: translate(0, 0) scale(1); opacity: 0.8; } 100% { transform: translate(calc(50vw - var(--x, 50%) * 1vw), calc(50vh - var(--y, 50%) * 1vh)) scale(0); opacity: 0; } }
      @keyframes rayBurst { 0% { opacity: 0; height: 0; } 30% { opacity: 1; } 100% { opacity: 0; height: 60vh; } }
    `}</style>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function MembershipSuccess() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tier, setTier] = useState<Tier>("pro");
  const [foundingNumber, setFoundingNumber] = useState<number>(1);

  useEffect(() => {
    const plan = searchParams?.get("plan") || "pro";
    const founding = searchParams?.get("founding") === "true";
    const fNumber = parseInt(searchParams?.get("founding_number") || "1");
    setFoundingNumber(fNumber);

    if (founding) setTier("founding");
    else if (plan === "creator") setTier("creator");
    else if (plan === "top1k") setTier("top1k");
    else setTier("pro");

    const activate = async () => {
      const sessionId = searchParams?.get("session_id");
      if (!sessionId) return;
      try {
        await fetch("/api/membership/confirm-stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
      } catch (e) {
        console.error("[success] confirm failed:", e);
      }
    };
    activate();
  }, [searchParams]);

  const handleDone = () => router.push("/profile?upgraded=true");

  return (
    <>
      {tier === "founding" && <FoundingCelebration foundingNumber={foundingNumber} onDone={handleDone} />}
      {tier === "top1k" && <Top1kCelebration onDone={handleDone} />}
      {tier === "creator" && <CreatorCelebration onDone={handleDone} />}
      {tier === "pro" && <ProCelebration onDone={handleDone} />}
    </>
  );
}
