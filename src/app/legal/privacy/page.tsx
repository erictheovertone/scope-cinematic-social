// ── /legal/privacy — public, no auth (linked from Settings → LEGAL) ───────────
// DRAFT copy — swap strings when Eric's final .md lands.

import Link from "next/link";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export const metadata = { title: "Privacy Policy · Scope" };

const SECTIONS: { title: string; body: string }[] = [
  { title: "1. WHAT WE COLLECT", body: "Account data (email or social login via Privy), your profile, your posts, and on-chain wallet addresses created for you. Usage data that keeps the service working." },
  { title: "2. WHAT'S PUBLIC", body: "Profiles, posts, collections, and all on-chain activity (mints, trades, holdings) are public by nature. Wallet addresses and transactions are visible on the Base network regardless of Scope." },
  { title: "3. WHAT WE DON'T DO", body: "We don't sell your personal data. We don't hold custody of your keys — wallets are embedded via Privy under your control." },
  { title: "4. PROCESSORS", body: "We rely on Privy (auth/wallets), Supabase (data), Stripe (card payments), and Vercel (hosting). Each processes data under its own terms." },
  { title: "5. DELETION", body: "Delete your account from Settings; we remove your profile and off-chain data. On-chain records are permanent by nature." },
  { title: "6. CONTACT", body: "Privacy questions: legal@scope.film." },
];

export default function PrivacyPage() {
  return (
    // The app shell fixes the body (PWA rubber-band suppression) — natural
    // document scroll never happens, so long pages need their own scroller:
    // the same fixed/inset-0/overflow-y-auto pattern Settings uses. bg-black
    // class required (the globals rule hides fixed divs without it).
    <div className="bg-black" style={{ position: "fixed", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ background: "#000", minHeight: "100%", padding: "calc(20px + env(safe-area-inset-top, 0px)) 20px calc(60px + env(safe-area-inset-bottom, 0px))", maxWidth: 640, margin: "0 auto" }}>
      <Link href="/" style={{ ...SKR, fontSize: 12, color: "rgba(255,255,255,0.5)", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.08em" }}>← SCOPE</Link>
      <h1 style={{ ...SKB, fontSize: 22, color: "#FFF", textTransform: "uppercase", letterSpacing: "0.06em", margin: "22px 0 4px" }}>Privacy Policy</h1>
      <p style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 28px" }}>DRAFT · LAST UPDATED JULY 2026</p>
      {SECTIONS.map((s) => (
        <section key={s.title} style={{ margin: "0 0 24px" }}>
          <h2 style={{ ...SKB, fontSize: 12, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 8px" }}>{s.title}</h2>
          <p style={{ ...SKR, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0 }}>{s.body}</p>
        </section>
      ))}
      </div>
    </div>
  );
}
