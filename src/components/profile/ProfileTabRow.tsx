"use client";

// ── ProfileTabRow — the SHARED mobile profile tab-row INNER content ──────────
//
// Brief F6a: extracted from own-profile so the public profile stops forking the
// tab row (twin drift). Three text tabs MAIN · COLLECTED · DECKS (75 Bold 10.5px,
// --track-display; active = ink-100, inactive ~57%, opacity only). The first slot
// becomes the logomark (dismiss) while snapped. THEATRE is deliberately NOT a tab
// on either page — it's entered by rotation in ProfilePostViewer (and, on own, the
// lightbox path). Each page keeps its OWN outer wrapper (snap position + chrome
// lift), which diverges; only this inner content is shared.

export default function ProfileTabRow({
  activeTab,
  headerSnapped,
  headerUnsnapping,
  snapAnimKey,
  onDismissSnap,
  onMain,
  onCollected,
  onDecks,
}: {
  activeTab: string;
  headerSnapped: boolean;
  headerUnsnapping: boolean;
  snapAnimKey: number;
  onDismissSnap: () => void;
  onMain: () => void;
  onCollected: () => void;
  onDecks: () => void;
}) {
  return (
    <div key={snapAnimKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", height: 20 }}>
      {/* First slot: logomark (dismiss) when snapped, MAIN text when at top */}
      {(headerSnapped || headerUnsnapping) ? (
        <button
          onClick={onDismissSnap}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", animation: headerUnsnapping ? "snapOutLeft 0.28s cubic-bezier(0.16,1,0.3,1) 165ms both" : "snapInLeft 0.32s cubic-bezier(0.16,1,0.3,1) 0ms both" }}
        >
          <img src="/logomark-plain-white.png" alt="" style={{ width: 32, height: 20, objectFit: "contain", display: "block" }} />
        </button>
      ) : (
        <button
          onClick={onMain}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13.5, letterSpacing: "var(--track-display)", color: activeTab === "main" ? "var(--ink-100)" : "rgba(229,225,219,0.57)", textTransform: "uppercase" }}>MAIN</span>
        </button>
      )}

      <button
        onClick={onCollected}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", animation: headerUnsnapping ? "snapOutUp 0.28s cubic-bezier(0.16,1,0.3,1) 55ms both" : headerSnapped ? "snapInUp 0.32s cubic-bezier(0.16,1,0.3,1) 55ms both" : "none" }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13.5, letterSpacing: "var(--track-display)", color: activeTab === "collected" ? "var(--ink-100)" : "rgba(229,225,219,0.57)", textTransform: "uppercase" }}>COLLECTED</span>
      </button>

      <button
        onClick={onDecks}
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", animation: headerUnsnapping ? "snapOutRight 0.28s cubic-bezier(0.16,1,0.3,1) 0ms both" : headerSnapped ? "snapInRight 0.32s cubic-bezier(0.16,1,0.3,1) 110ms both" : "none" }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13.5, letterSpacing: "var(--track-display)", color: activeTab === "decks" ? "var(--ink-100)" : "rgba(229,225,219,0.57)", textTransform: "uppercase" }}>DECKS</span>
      </button>
    </div>
  );
}
