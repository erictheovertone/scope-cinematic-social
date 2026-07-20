"use client";
import { useEffect, useState } from "react";

interface WelcomeTransitionProps {
  onComplete: () => void;
}

export default function WelcomeTransition({ onComplete }: WelcomeTransitionProps) {
  const [phase, setPhase] = useState<"fade" | "corners" | "logo" | "pulse" | "done">("fade");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("corners"), 400);
    const t2 = setTimeout(() => setPhase("logo"), 1000);
    const t3 = setTimeout(() => setPhase("pulse"), 1800);
    const t4 = setTimeout(() => setPhase("done"), 2400);
    const t5 = setTimeout(onComplete, 2600);
    return () => { [t1,t2,t3,t4,t5].forEach(clearTimeout); };
  }, []);

  const cornerSize = 28;
  const strokeWidth = 1.5;
  const strokeColor = "#E5E1DB";
  const offset = phase === "fade" ? 40 : 0;
  const cornerOpacity = phase === "fade" ? 0 : 1;
  const logoOpacity = phase === "logo" || phase === "pulse" || phase === "done" ? 1 : 0;
  const pulseScale = phase === "pulse" ? 1.08 : 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: phase === "done" ? 0 : 1,
      transition: phase === "done" ? 'opacity 0.3s ease' : 'none',
    }}>
      {/* Top-left corner */}
      <div style={{
        position: 'absolute',
        top: 24 - offset,
        left: 24 - offset,
        opacity: cornerOpacity,
        transition: 'top 0.5s cubic-bezier(0.16,1,0.3,1), left 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease',
      }}>
        <svg width={cornerSize} height={cornerSize} viewBox={`0 0 ${cornerSize} ${cornerSize}`} fill="none">
          <line x1="1" y1="1" x2="1" y2={cornerSize} stroke={strokeColor} strokeWidth={strokeWidth}/>
          <line x1="1" y1="1" x2={cornerSize} y2="1" stroke={strokeColor} strokeWidth={strokeWidth}/>
        </svg>
      </div>

      {/* Top-right corner */}
      <div style={{
        position: 'absolute',
        top: 24 - offset,
        right: 24 - offset,
        opacity: cornerOpacity,
        transition: 'top 0.5s cubic-bezier(0.16,1,0.3,1), right 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease',
      }}>
        <svg width={cornerSize} height={cornerSize} viewBox={`0 0 ${cornerSize} ${cornerSize}`} fill="none">
          <line x1={cornerSize - 1} y1="1" x2={cornerSize - 1} y2={cornerSize} stroke={strokeColor} strokeWidth={strokeWidth}/>
          <line x1="1" y1="1" x2={cornerSize - 1} y2="1" stroke={strokeColor} strokeWidth={strokeWidth}/>
        </svg>
      </div>

      {/* Bottom-left corner */}
      <div style={{
        position: 'absolute',
        bottom: 24 - offset,
        left: 24 - offset,
        opacity: cornerOpacity,
        transition: 'bottom 0.5s cubic-bezier(0.16,1,0.3,1), left 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease',
      }}>
        <svg width={cornerSize} height={cornerSize} viewBox={`0 0 ${cornerSize} ${cornerSize}`} fill="none">
          <line x1="1" y1={cornerSize - 1} x2="1" y2="1" stroke={strokeColor} strokeWidth={strokeWidth}/>
          <line x1="1" y1={cornerSize - 1} x2={cornerSize} y2={cornerSize - 1} stroke={strokeColor} strokeWidth={strokeWidth}/>
        </svg>
      </div>

      {/* Bottom-right corner */}
      <div style={{
        position: 'absolute',
        bottom: 24 - offset,
        right: 24 - offset,
        opacity: cornerOpacity,
        transition: 'bottom 0.5s cubic-bezier(0.16,1,0.3,1), right 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease',
      }}>
        <svg width={cornerSize} height={cornerSize} viewBox={`0 0 ${cornerSize} ${cornerSize}`} fill="none">
          <line x1={cornerSize - 1} y1={cornerSize - 1} x2={cornerSize - 1} y2="1" stroke={strokeColor} strokeWidth={strokeWidth}/>
          <line x1="1" y1={cornerSize - 1} x2={cornerSize - 1} y2={cornerSize - 1} stroke={strokeColor} strokeWidth={strokeWidth}/>
        </svg>
      </div>

      {/* Scope logo — fades in center */}
      <img
        src="/scope-logo-new.png"
        alt="Scope"
        style={{
          height: 48,
          width: 'auto',
          opacity: logoOpacity,
          transform: `scale(${pulseScale})`,
          transition: 'opacity 0.5s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}
      />
    </div>
  );
}
