"use client";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

export default function FramesProUpsellSheet({ isOpen, onClose, onUpgrade }: Props) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.6)" }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 91,
          maxWidth: '30rem', margin: "0 auto",
          background: "#080808",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          padding: "0 20px 28px",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 20, marginBottom: 4 }}>
          <div style={{ width: 36, height: 3, background: "rgba(255,255,255,0.2)" }} />
        </div>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingTop: 16 }}>
          <div>
            <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 4px" }}>
              FRAMES
            </p>
            <p style={{ ...SKR, fontSize: 'var(--fs-13)', lineHeight: 1.5, color: "rgba(255,255,255,0.85)", margin: 0, maxWidth: 260 }}>
              Export your decks as cinematic frame stacks. Curate up to 6 images into a single 9:16 image ready to share. SCOPE Pro feature.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, width: 18, height: 18, flexShrink: 0, marginLeft: 8 }}
          >
            <svg width="19.5" height="19.5" viewBox="0 0 18 18" fill="none">
              <path d="M3 3L15 15M15 3L3 15" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Visual reference placeholder */}
        <div style={{ display: "flex", justifyContent: "center", margin: "24px 0" }}>
          <div
            style={{
              width: 90, height: 160,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
              padding: "0 0 10px",
            }}
          >
            {/* Stacked frame suggestion lines */}
            <div style={{ position: "absolute", width: 70 }}>
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  style={{
                    height: 28,
                    background: `rgba(255,255,255,${0.04 + i * 0.03})`,
                    marginBottom: 2,
                  }}
                />
              ))}
            </div>
            <img
              src="/scope-logo-new-no-black.png"
              alt="SCOPE"
              style={{ width: 40, height: "auto", display: "block", opacity: 0.5, position: "relative", zIndex: 1 }}
            />
          </div>
        </div>

        {/* What you get */}
        <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 12px" }}>
          WHAT YOU GET
        </p>
        <div style={{ marginBottom: 20 }}>
          {[
            "Multiple aspect-ratio layouts auto-matched to your deck",
            "Cinematic credits including camera, lens, and curator credit",
            "Share to social, save to camera roll",
          ].map((line, i) => (
            <p
              key={i}
              style={{ ...SKR, fontSize: 'var(--fs-12)', lineHeight: 1.5, color: "rgba(255,255,255,0.7)", margin: i < 2 ? "0 0 12px" : 0 }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onUpgrade}
            style={{ width: "100%", padding: "14px 0", background: "#FF0000", border: "none", cursor: "pointer" }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              UPGRADE TO PRO
            </span>
          </button>
          <button
            onClick={onClose}
            style={{ width: "100%", padding: "14px 0", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              NOT NOW
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
