'use client';

// ── /dm — Direct Messages ─────────────────────────────────────────────────────
//
// STAGE 1 PLACEHOLDER. The DM foundation (schema + /api/dm/* routes + src/lib/dm.ts)
// is shipped, but the inbox/thread UI is Stage 2. Until it lands, the pill's DM
// icon is a first-class citizen that routes here to a quiet COMING SOON state —
// never a dead tap, never a half-built shell. Swap this whole file for the inbox
// when Stage 2 arrives; the route + pill wiring stay.

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export default function DMPage() {
  return (
    <main
      style={{
        minHeight: '100dvh', background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: '0 40px 96px', textAlign: 'center',
      }}
    >
      {/* the red dot — the Scope mark, quiet at rest */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF0000', marginBottom: 8 }} />
      <h1 style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.14em', margin: 0 }}>
        Direct Messages
      </h1>
      <p style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
        Coming soon
      </p>
    </main>
  );
}
