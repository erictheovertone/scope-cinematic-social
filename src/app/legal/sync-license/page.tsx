// ── /legal/sync-license — the BASIC sync license for Augmented Pro members (Brief AUG-1) ─────────
// Linked from the Augmented sheet and from every music download note (DownloadAction). Public,
// no auth. DRAFT copy pending legal review — swap the strings when the reviewed text lands.
// Same structure + typography as /terms and /privacy; scrolls inside PageScroller (the body is
// locked — scroll-trap rule).

import Link from "next/link";
import PageScroller from "@/components/PageScroller";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export const metadata = { title: "Sync License · Scope" };

const H2: React.CSSProperties = { ...SKB, fontSize: 12, color: "rgb(var(--ink-rgb) / 0.85)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 8px" };
const P: React.CSSProperties = { ...SKR, fontSize: 13, color: "rgb(var(--ink-rgb) / 0.7)", lineHeight: 1.6, margin: "0 0 8px" };
const LI: React.CSSProperties = { ...SKR, fontSize: 13, color: "rgb(var(--ink-rgb) / 0.7)", lineHeight: 1.6, margin: "0 0 4px" };

const SECTIONS: { title: string; body?: string[]; list?: string[] }[] = [
  {
    title: "1. WHO THIS IS FOR",
    body: [
      "This license comes with an active Augmented Pro membership.",
      "It covers music from the Scope library and media you download from Scope.",
    ],
  },
  {
    title: "2. WHAT YOU CAN DO",
    list: [
      "Use it in posts on your own social media accounts.",
      "Use it in videos on your own YouTube channel.",
      "That includes monetized videos on your own channel.",
      "Edit, trim and loop it to fit your piece.",
    ],
  },
  {
    title: "3. WHAT IS NOT COVERED",
    list: [
      "Broadcast — TV, radio, or streaming services.",
      "Film, theatrical release, or festival screenings.",
      "Advertising, paid promotion, or brand and sponsored content.",
      "Sharing, reselling, or redistributing the file itself.",
      "Uploading the file to other music or stock libraries.",
      "Registering the music with Content ID or any similar system.",
    ],
  },
  {
    title: "4. HOW LONG IT LASTS",
    body: [
      "The license covers content you publish while you are a member.",
      "Content you published as a member can stay up after your membership ends.",
      "New content published after your membership ends is not covered.",
    ],
  },
  {
    title: "5. CREDIT",
    body: [
      "Credit is not required, but it is appreciated.",
      "A simple line works: “Music: <artist> via Scope”.",
    ],
  },
  {
    title: "6. OWNERSHIP",
    body: [
      "The artists keep all rights to their music. This is a license to use it, not a transfer of ownership.",
      "Scope may end the license for misuse.",
    ],
  },
];

export default function SyncLicensePage() {
  return (
    <PageScroller>
      <div style={{ background: "var(--canvas)", minHeight: "100%", padding: "calc(20px + var(--safe-top, 0px)) 20px 60px", maxWidth: 640, margin: "0 auto" }}>
        <Link href="/" style={{ ...SKR, fontSize: 12, color: "rgb(var(--ink-rgb) / 0.5)", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.08em" }}>← SCOPE</Link>

        {/* DRAFT marker — prominent until the reviewed copy lands. */}
        <div data-testid="sync-license-draft" style={{ margin: "22px 0 0", border: "1px solid rgb(var(--ink-rgb) / 0.5)", padding: "10px 12px" }}>
          <span style={{ ...SKB, fontSize: 12, color: "var(--ink-100)", textTransform: "uppercase", letterSpacing: "0.14em" }}>DRAFT — PENDING REVIEW</span>
          <p style={{ ...SKR, fontSize: 12, color: "rgb(var(--ink-rgb) / 0.6)", lineHeight: 1.5, margin: "4px 0 0" }}>
            This text is a draft and may change before it is final.
          </p>
        </div>

        <h1 style={{ ...SKB, fontSize: 22, color: "var(--ink-100)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "22px 0 4px" }}>Sync License</h1>
        <p style={{ ...SKR, fontSize: 11, color: "rgb(var(--ink-rgb) / 0.4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 28px" }}>BASIC · AUGMENTED PRO · DRAFT</p>

        <p style={{ ...P, margin: "0 0 24px" }}>
          In short: use Scope music and downloads in your own social posts and on your own YouTube channel. Don&apos;t use them for broadcast, film, or ads, and don&apos;t pass the files on.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.title} style={{ margin: "0 0 24px" }}>
            <h2 style={H2}>{s.title}</h2>
            {s.body?.map((b, i) => <p key={i} style={P}>{b}</p>)}
            {s.list && (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {s.list.map((b, i) => <li key={i} style={LI}>{b}</li>)}
              </ul>
            )}
          </section>
        ))}

        <section style={{ margin: "36px 0 0", borderTop: "1px solid rgb(var(--ink-rgb) / 0.12)", paddingTop: 24 }}>
          <h2 style={H2}>NEED A WIDER LICENSE?</h2>
          <p style={P}>
            For broadcast, film, advertising, or anything else not covered here, ask us. Tell us the track, the project, and where it will run.
          </p>
          <p style={P}>
            <Link href="/profile/contact" style={{ color: "var(--ink-100)" }}>Contact Scope</Link>
          </p>
        </section>
      </div>
    </PageScroller>
  );
}
