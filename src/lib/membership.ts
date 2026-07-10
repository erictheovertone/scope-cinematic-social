// ── MEMBERSHIP STATE — the ONE read + label logic, shared by both platforms ───
// The mobile bar (BadgeExplainerSheet) and the desktop settings MEMBERSHIP panel
// both derive status through here, so RENEWS/CANCELS never diverges. Source of
// truth is the DB: paid_member_until (active window) + membership_cancels_at
// (a scheduled cancel_at_period_end — set by /api/stripe/cancel-subscription).
import { isProMember } from '@/lib/userService';

export type MembershipState = {
  isPaid: boolean;
  paidUntil: Date | null;
  cancelsAt: Date | null; // set → membership ends at period-end, no renewal
};

type ProfileRow = {
  paid_member_until?: string | null;
  is_paid_member?: boolean;
  membership_cancels_at?: string | null;
} | null | undefined;

// Resolve a raw profile row into membership status. A cancelled-but-still-active
// member is STILL isPaid (Pro until the period ends) — cancelsAt just flips the
// bar from RENEWS to CANCELS.
export function resolveMembership(p: ProfileRow): MembershipState {
  return {
    isPaid: isProMember(p ?? undefined),
    paidUntil: p?.paid_member_until ? new Date(p.paid_member_until) : null,
    cancelsAt: p?.membership_cancels_at ? new Date(p.membership_cancels_at) : null,
  };
}

const fmt = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

// The single source of the membership BAR label — rendered identically on mobile
// and desktop. Non-members get 'FREE' (callers show a GET PRO affordance).
export function membershipBarLabel(s: MembershipState): string {
  if (!s.isPaid) return 'FREE';
  if (s.cancelsAt) return `SCOPE PRO · CANCELS ${fmt(s.cancelsAt)}`;
  return s.paidUntil ? `SCOPE PRO · RENEWS ${fmt(s.paidUntil)}` : 'SCOPE PRO';
}
