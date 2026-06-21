"use client";

import { useParams, useRouter } from "next/navigation";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

export const TIER_DETAILS: Record<string, {
  img: string;
  size: number;
  label: string;
  color: string;
  tagline: string;
  sections: { title: string; body: string }[];
}> = {
  free: {
    img: '/free-tier-aperture-logo-red.png',
    size: 64,
    label: 'FREE TIER',
    color: '#FF0000',
    tagline: 'Your first token. Your first post. Your first piece of the ecosystem.',
    sections: [
      {
        title: 'WHAT YOU GET',
        body: 'Every Scope account starts with 25 free posts. Each post is automatically minted as an ERC-1155 token on Base — meaning from day one, your work is a digital asset. When someone collects your post, you earn ETH directly to your wallet.',
      },
      {
        title: 'HOW YOU EARN',
        body: 'When you create a post, 1 token is minted to your wallet at no cost. Every time a collector buys your token, you receive the creator portion of that transaction — paid in ETH, withdrawable at any time. Your posts are open editions, meaning unlimited collectors can buy in.',
      },
      {
        title: 'YOUR NEXT MOVE',
        body: 'Hit your 25-post limit and want to keep building? Upgrade to Scope Pro for unlimited posts, full analytics, and your red aperture badge — for $3 a month or $30 a year.',
      },
    ],
  },
  creator: {
    img: '/badges/in-house-badge-min-design-01.png',
    size: 64,
    label: 'IN-HOUSE CREATOR',
    color: 'rgba(255,255,255,0.7)',
    tagline: 'Make it here. Show it here. Win here.',
    sections: [
      {
        title: 'HOW TO EARN IT',
        body: "Post a minimum of 10 times per month using Scope's built-in filmmaking tools — LUTs, color grading, cropping, and the linear editor. The badge is awarded automatically when you hit the threshold. It resets monthly. Keep creating, keep the badge.",
      },
      {
        title: 'THE FILM FESTIVAL',
        body: "Every In-House Creator badge holder is automatically entered into Scope's monthly Film Festival. The top 3 badge holders — ranked by post quality, engagement, and collect volume — receive a cash prize. This is the only badge where consistent creation directly competes for real money.",
      },
      {
        title: 'WHY IT MATTERS',
        body: "This badge signals to the community that you're not just posting — you're making. Content created with Scope's tools is native to the platform. It's the difference between a filmmaker and a re-poster.",
      },
    ],
  },
  pro: {
    img: '/badges/scope-pro-badge-min-design-01.png',
    size: 64,
    label: 'SCOPE PRO',
    color: '#FF0000',
    tagline: 'The full toolkit. No limits.',
    sections: [
      {
        title: 'WHAT YOU UNLOCK',
        body: "Unlimited posts. Full deck functionality — organize your work into collections, share them publicly, and let collectors browse your catalog. Post analytics showing views, collect rates, and earnings per post. Priority access to new features before they ship publicly.",
      },
      {
        title: 'YOUR BADGE',
        body: "The red aperture badge on your profile signals to every collector and creator on Scope that you're a serious participant. It shows on your PFP across the feed, in comments, and on every post you make. It's a mark of commitment to the platform.",
      },
      {
        title: 'PRICING',
        body: '$5 per month, or $50 for a full year — saving you $10. Payment is debited directly from your embedded wallet in USDC, or charged to a card via Stripe with auto-renewal. Cancel anytime.',
      },
    ],
  },
  top1k: {
    img: '/badges/collector-badge-min-design-01.png',
    size: 64,
    label: 'TOP 1000 COLLECTOR',
    color: '#C9A84C',
    tagline: 'The more you collect, the more you earn. Every single day.',
    sections: [
      {
        title: 'HOW IT WORKS',
        body: "1% of everything traded on Scope is distributed daily across the top 1000 collectors. Your cut is weighted — the top collector earns significantly more than the 1000th. Rankings are based on current holdings, trading volume, number of unique creators supported, and how long you've held your tokens.",
      },
      {
        title: 'WHAT THAT LOOKS LIKE',
        body: 'If Scope processes $200,000 in transaction volume in a day, $2,000 is distributed across the top 1000 collectors. The top collector might receive $50–$100 on that day alone. The 500th collector might receive $1–$2. Every day. Accumulating in your wallet as withdrawable ETH.',
      },
      {
        title: 'HOW TO CLIMB',
        body: "Collect early from creators before their tokens appreciate. Hold positions — long-term holders are weighted more heavily than flippers. Diversify across many creators. The collectors who win are the ones who treat Scope like a portfolio, not a social feed.",
      },
      {
        title: 'YOUR BADGE',
        body: "The gold aperture badge is visible across the entire platform. It tells creators you're a serious collector — one who has earned their place through action. Creators notice who collects them. This badge opens doors.",
      },
    ],
  },
  founding: {
    img: '/badges/augmented-badge-min-design-01.png',
    size: 64,
    label: 'FOUNDING 500',
    color: '#ff0080',
    tagline: 'The rarest badge on Scope. Earned by being early.',
    sections: [
      {
        title: 'WHAT IT IS',
        body: 'Reserved for the first 500 Scope Pro subscribers. Once all 500 spots are claimed, this badge is permanently closed to new members — unless an existing founding member cancels their subscription. If you cancel, your spot immediately passes to the next person in line.',
      },
      {
        title: 'THE ECONOMIC ADVANTAGE',
        body: "Founding members earn 0.5% of all trading volume on Scope — every day, forever, as long as your subscription stays open. If you're also a Top 1k Collector, both streams stack. You earn from two pools simultaneously.",
      },
      {
        title: 'COMPOUNDING RETURNS',
        body: "At $200k daily platform volume, the founding pool alone pays out $1,000 across 500 members. Add a top collector position and the daily returns compound significantly. The earlier you collect, the deeper both pools grow.",
      },
      {
        title: 'THE BADGE',
        body: "The holographic augmented aperture is the most visually distinct badge on the platform. It marks you as someone who was here before Scope was Scope. That history doesn't disappear — it compounds.",
      },
    ],
  },
  composer: {
    img: '/badges/composer-badge-min-design-01.png',
    size: 64,
    label: 'COMPOSER',
    color: '#7FB2FF',
    tagline: 'Score the platform. Earn forever.',
    sections: [
      {
        title: 'HOW TO EARN IT',
        body: "Contribute original music to the Scope library and keep at least 12 vetted tracks live each quarter. Submissions are reviewed for quality and originality before they go in. Hit the threshold and the badge is yours; keep your catalog live and it stays. This is a working musician's badge — it rewards a body of work, not a single upload.",
      },
      {
        title: 'PERPETUAL ROYALTY',
        body: "Every time a creator scores a post with one of your tracks, you earn a perpetual share of that post's trading activity — automatically, for as long as the post lives on Scope. You don't chase licensing or sign paperwork. Your music works while you sleep. The more your sound spreads across the platform, the more you earn.",
      },
      {
        title: 'WHY IT MATTERS',
        body: "Film is sound as much as image. The Composer badge marks the people scoring Scope — the artists whose work gives everyone else's films a pulse. It signals that your music is native to the platform, trusted by creators, and woven into the work being made here.",
      },
    ],
  },
  firstCut: {
    img: '/badges/first-cut-badge-min-design-01.png',
    size: 64,
    label: 'FIRST CUT',
    color: '#00E08A',
    tagline: 'Be early. Stay first.',
    sections: [
      {
        title: 'HOW TO EARN IT',
        body: "Be one of the first 10 external collectors of any post on Scope. The moment you collect early on a work before the crowd arrives, the First Cut badge is minted to you for that post. It's awarded automatically, on-chain, and it can never be re-issued for that work — the first 10 are the first 10, forever.",
      },
      {
        title: 'A FOUNDING STAKE',
        body: "First Cut isn't just recognition — it's a permanent founding position in a piece of work. You backed a creator before it was obvious. That early conviction is recorded on Base and can't be diluted, bought later, or faked. As the work grows, your place at the front of it stays fixed in its history.",
      },
      {
        title: 'WHY IT MATTERS',
        body: "Every great film had people who saw it first. First Cut marks the collectors with taste and timing — the ones who find the work early and put their conviction behind it. It's the difference between following a trend and starting one.",
      },
    ],
  },
  srh: {
    img: '/badges/srh-badge-min-design-01.png',
    size: 64,
    label: 'SCREENING ROOM HOLDER',
    color: '#C9A84C',
    tagline: 'Hold the room.',
    sections: [
      {
        title: 'HOW TO EARN IT',
        body: "Hold at least one post in the Screening Room — Scope's showcase of the top 50 most-traded works on the platform. When a post you hold sits in the top 50, you carry the SRH badge. It's live and earned in real time: hold your place and keep the badge. If your post is pushed out of the top 50 by another, the badge passes with it. Nothing here is permanent — it's held.",
      },
      {
        title: 'THE TOP 50',
        body: "The Screening Room is the most visible real estate on Scope — the works the whole platform is moving on right now. Holding a spot there puts you among the most active and successful collectors and creators on the app. The room refreshes continuously, so the badge always reflects who's holding the room today, not who held it last month.",
      },
      {
        title: 'WHY IT MATTERS',
        body: "SRH is a living signal of standing. It can't be bought outright or held by resting — it's earned by holding work the platform values and defended against everyone trying to take your place. Wearing it means you're not just on Scope; you're holding the room at the center of it.",
      },
    ],
  },
};

export default function BadgeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tier = params?.tier as string;
  const detail = TIER_DETAILS[tier];

  if (!detail) {
    return (
      <div style={{ backgroundColor: '#000', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ ...BOLD, color: 'white', fontSize: 11 }}>BADGE NOT FOUND</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', padding: '0 0 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 20px 0' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ ...BOLD, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>← BACK</span>
        </button>
      </div>

      {/* Badge hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px 32px' }}>
        <div style={{
          width: detail.size,
          height: detail.size,
          marginBottom: 20,
          position: 'relative',
        }}>
          {/* Glow — blooms in over the focus-pull window (trails slightly so the
              logo arrives first). The glow treatment stays (CHANGE 1). */}
          <div className="badge-hero-glow" style={{
            position: 'absolute',
            inset: -24,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${detail.color}55 0%, transparent 65%)`,
            animation: 'glowIn 2s ease 0.3s both',
            pointerEvents: 'none',
          }} />
          {/* FOCUS PULL — flat min-design logo racks from blurred + enlarged into
              sharp focus at full size. Plays ONCE on open; filter/transform/opacity
              only (GPU). prefers-reduced-motion → simple fade (in <style>). */}
          <img
            className="badge-hero-logo"
            src={detail.img}
            alt={detail.label}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              position: 'relative',
              animation: 'focusPull 2s cubic-bezier(0.16, 0.84, 0.3, 1) both',
            }}
          />
        </div>
        <p style={{ ...BOLD, fontSize: 18, color: detail.color, textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 12px', textAlign: 'center' }}>
          {detail.label}
        </p>
        <p style={{ ...REG, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.6, margin: 0, maxWidth: 280 }}>
          {detail.tagline}
        </p>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '0 20px 32px' }} />

      {/* Sections */}
      {detail.sections.map((section, i) => (
        <div key={i} style={{ padding: '0 20px 32px' }}>
          <p style={{ ...BOLD, fontSize: 9, color: detail.color, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 10px' }}>
            {section.title}
          </p>
          <p style={{ ...REG, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4, margin: 0 }}>
            {section.body}
          </p>
          {i < detail.sections.length - 1 && (
            <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 28 }} />
          )}
        </div>
      ))}

      {/* CTA */}
      {(tier === 'free' || tier === 'pro') && (
        <div style={{ padding: '0 20px' }}>
          <button
            onClick={() => router.push('/profile?showMembership=true')}
            style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '14px 0' }}
          >
            <span style={{ ...BOLD, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              BECOME A SCOPE MEMBER
            </span>
          </button>
        </div>
      )}

      <style>{`
        /* FOCUS PULL — the badge logo's rack-focus reveal on sheet open. */
        @keyframes focusPull {
          0%   { filter: blur(14px); transform: scale(1.25); opacity: 0; }
          100% { filter: blur(0);    transform: scale(1);    opacity: 1; }
        }
        @keyframes glowIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* prefers-reduced-motion → no blur/scale, just a gentle fade. */
        @media (prefers-reduced-motion: reduce) {
          .badge-hero-logo { animation: glowIn 0.6s ease both !important; }
          .badge-hero-glow { animation: glowIn 0.6s ease both !important; }
        }
      `}</style>
    </div>
  );
}
