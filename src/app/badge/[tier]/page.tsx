"use client";

import { useParams, useRouter } from "next/navigation";

const BOLD: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const REG: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const TIER_DETAILS: Record<string, {
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
    img: '/in-house-creator-logo-grey.png',
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
    img: '/scope-pro-icon-aperture.png',
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
    img: '/top-1k-collector-aperture-gold.png',
    size: 64,
    label: 'TOP 1000 COLLECTOR',
    color: '#C9A84C',
    tagline: 'The more you collect, the more you earn. Every single day.',
    sections: [
      {
        title: 'HOW IT WORKS',
        body: "1% of all Scope platform fees are distributed daily across the top 1000 collectors. Your share is weighted — the top collector earns significantly more than the 1000th. Rankings are based on current holdings, trading volume, number of unique creators supported, and how long you've held your tokens.",
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
    img: '/augmented-member-founding-500-aperture.png',
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
        body: "Founding members earn 0.5% of all Scope platform fees — every day, forever, as long as your subscription stays open. If you're also a Top 1k Collector, both shares stack. You earn from two pools simultaneously.",
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
        <img src={detail.img} alt={detail.label} style={{ width: detail.size, height: detail.size, display: 'block', marginBottom: 20 }} />
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
          <p style={{ ...REG, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: 0 }}>
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
            onClick={() => router.back()}
            style={{ width: '100%', background: '#FF0000', border: 'none', cursor: 'pointer', padding: '14px 0' }}
          >
            <span style={{ ...BOLD, fontSize: 12, color: 'white', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              BECOME A SCOPE MEMBER
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
