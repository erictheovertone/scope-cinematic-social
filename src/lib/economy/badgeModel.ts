// ── SHARED BADGE MODEL — the ONE source both sheets read ─────────────────────
// Nature (buy / earned / base), state resolution, and earn-path copy for every
// badge. Mobile + desktop badges sheets read THIS so the model can't diverge.
//
// REAL earn conditions (from resolveBadges / the badgeHoldings truth):
//   pro       → isPaidMember (paid_member_until active)      — BUY
//   augmented → isFoundingMember (one of the first 500)      — EARNED (closed)
//   firstCut  → firstCutCount > 0 (first-10 collector, active)— EARNED
//   top1k     → isTopCollector (top-1000 collector)          — EARNED
//   srh       → isScreeningRoomHolder (post in the top-50)   — EARNED
//   inHouse   → isInHouseCreator (regular tool use)          — EARNED
//   free      → always (base membership)                     — BASE

import type { BadgeKey } from '@/lib/economy/badges';

export interface BadgeFlags {
  isPaidMember?: boolean;
  isFoundingMember?: boolean;
  isTopCollector?: boolean;
  isScreeningRoomHolder?: boolean;
  isInHouseCreator?: boolean;
  firstCutCount?: number;
}

export type BadgeNature = 'buy' | 'earned' | 'base';
export type BadgeState = 'held' | 'buyable' | 'locked';

export const BADGE_NATURE: Record<BadgeKey, BadgeNature> = {
  free: 'base', pro: 'buy',
  augmented: 'earned', firstCut: 'earned', top1k: 'earned', srh: 'earned', inHouse: 'earned',
};

export function badgeHeld(key: BadgeKey, f: BadgeFlags): boolean {
  switch (key) {
    case 'free': return true;
    case 'pro': return !!f.isPaidMember;
    case 'augmented': return !!f.isFoundingMember;
    case 'firstCut': return (f.firstCutCount ?? 0) > 0;
    case 'top1k': return !!f.isTopCollector;
    case 'srh': return !!f.isScreeningRoomHolder;
    case 'inHouse': return !!f.isInHouseCreator;
    default: return false;
  }
}

/** held → 'held'; not-held PRO → 'buyable' (the buy CTA); not-held earned → 'locked'. */
export function badgeState(key: BadgeKey, f: BadgeFlags): BadgeState {
  if (badgeHeld(key, f)) return 'held';
  return BADGE_NATURE[key] === 'buy' ? 'buyable' : 'locked';
}

// EARN-PATH copy (DRAFT — Eric approves/edits). Accurate to the code conditions.
export const BADGE_EARN_PATH: Record<BadgeKey, string> = {
  free: 'Every account starts here — nothing to do.',
  pro: 'Unlock the full finishing suite — every look, every tool.',
  firstCut: 'Hold a First Cut position on any post to earn this. Sell it and the slot releases.',
  srh: 'Hold work featured in the Screening Room — Scope’s top-50 most-traded showcase — to earn this.',
  top1k: 'Collect work from other creators to earn this — the top 1,000 collectors hold it.',
  augmented: 'Given to Scope’s first 500 members. This one’s closed — a permanent founding honor.',
  inHouse: 'Earned by creators who regularly use Scope’s built-in tools to make their work. It can’t be bought — only earned.',
};
