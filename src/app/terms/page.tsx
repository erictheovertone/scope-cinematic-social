// ── /terms — canonical public Terms of Service (no auth, logged-out reachable) ─
// The Privy login modal links here (scopeapp.world/terms). DRAFT copy — swap
// strings when Eric's final .md lands. DMCA lives here as the #dmca section
// (one page beats a third route for a contact block). /legal/terms and
// /profile/terms redirect here (next.config).

import Link from "next/link";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export const metadata = { title: "Terms of Service · Scope" };

const SECTIONS: { title: string; body: string }[] = [
  { title: "1. THE SERVICE", body: "Scope is a cinematic social platform for visual creators. Posts can be minted as tokens on the Base network; collecting and trading them involves real digital assets and real risk. By using Scope you accept these terms." },
  { title: "2. YOUR CONTENT", body: "You own what you post. By posting you grant Scope a non-exclusive license to display, distribute, and render your content within the platform. Don't post what you don't have the rights to." },
  { title: "3. TOKENS & TRADING", body: "Minted posts are ERC-20/1155 tokens on public infrastructure. Prices move; value can go to zero. Scope charges platform fees on trades as disclosed in-app. Nothing on Scope is investment advice." },
  { title: "4. CONDUCT", body: "No harassment, impersonation, spam, or illegal content. We can remove content and suspend accounts that break these rules." },
  { title: "5. TERMINATION", body: "You can delete your account at any time from Settings. On-chain records are permanent by nature and survive account deletion." },
  { title: "6. CHANGES", body: "We may update these terms; material changes will be announced in-app. Continued use is acceptance." },
];

export default function TermsPage() {
  return (
    // The app shell fixes the body (PWA rubber-band suppression) — natural
    // document scroll never happens, so long pages need their own scroller:
    // the same fixed/inset-0/overflow-y-auto pattern Settings uses. bg-black
    // class required (the globals rule hides fixed divs without it).
    <div className="bg-black" style={{ position: "fixed", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ background: "#000", minHeight: "100%", padding: "calc(20px + env(safe-area-inset-top, 0px)) 20px calc(60px + env(safe-area-inset-bottom, 0px))", maxWidth: 640, margin: "0 auto" }}>
      <Link href="/" style={{ ...SKR, fontSize: 12, color: "rgba(229,225,219,0.5)", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.08em" }}>← SCOPE</Link>
      <h1 style={{ ...SKB, fontSize: 22, color: "#E5E1DB", textTransform: "uppercase", letterSpacing: "0.06em", margin: "22px 0 4px" }}>Terms of Service</h1>
      <p style={{ ...SKR, fontSize: 11, color: "rgba(229,225,219,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 28px" }}>DRAFT · LAST UPDATED JULY 2026</p>
      {SECTIONS.map((s) => (
        <section key={s.title} style={{ margin: "0 0 24px" }}>
          <h2 style={{ ...SKB, fontSize: 12, color: "rgba(229,225,219,0.85)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 8px" }}>{s.title}</h2>
          <p style={{ ...SKR, fontSize: 13, color: "rgba(229,225,219,0.7)", lineHeight: 1.6, margin: 0 }}>{s.body}</p>
        </section>
      ))}
      <section id="dmca" style={{ margin: "36px 0 0", borderTop: "1px solid rgba(229,225,219,0.12)", paddingTop: 24 }}>
        <h2 style={{ ...SKB, fontSize: 12, color: "rgba(229,225,219,0.85)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 8px" }}>COPYRIGHT / DMCA</h2>
        <p style={{ ...SKR, fontSize: 13, color: "rgba(229,225,219,0.7)", lineHeight: 1.6, margin: 0 }}>
          To report content that infringes your copyright, send a takedown notice identifying the work, the infringing URL, and your contact details to{" "}
          <a href="mailto:dmca@scopeapp.world" style={{ color: "#E5E1DB" }}>dmca@scopeapp.world</a>. We remove infringing content and terminate repeat infringers.
        </p>
      </section>
      </div>
    </div>
  );
}
