// ── swipeNav — contextual adjacency map + slide-direction handoff ─────────────
//
// Horizontal swipe = a gesture that COMMITS to a navigation, then the destination
// slides in (SLIDE-ON-COMMIT — we never mount adjacent surfaces together). Each
// top-level surface declares its own footer-ordered sequence + the index of the
// CURRENT surface within it (anchor). Swipe LEFT → order[anchor+1] (next rightward);
// swipe RIGHT → order[anchor-1] (previous). Ends return null → rubber-band, no wrap.

export type SlotId = 'HOME' | 'CREATE' | 'PROFILE' | 'NOTIFICATIONS' | 'MENU' | 'WALLET';

export type Slot =
  // route slot → navigate to `to` and slide the destination in.
  | { id: SlotId; type: 'route'; to: string }
  // action slot → open an overlay on commit (no route-slide). CREATE = the post-
  // creation modal (mounted at /create); we just open it, never "slide into" it.
  | { id: SlotId; type: 'action'; to: string };

const HOME: Slot = { id: 'HOME', type: 'route', to: '/' };
const CREATE: Slot = { id: 'CREATE', type: 'action', to: '/create' };
const PROFILE: Slot = { id: 'PROFILE', type: 'route', to: '/profile' };
const NOTIFICATIONS: Slot = { id: 'NOTIFICATIONS', type: 'route', to: '/profile/notifications' };
// MENU resolved (diagnosis) to a ROUTE — profile's hamburger does router.push('/profile/preferences'),
// not an in-page drawer — so it's a route slot, not an action.
const MENU: Slot = { id: 'MENU', type: 'route', to: '/profile/preferences' };
const WALLET: Slot = { id: 'WALLET', type: 'route', to: '/wallet' };

// Per-surface footer order + anchor (where the current surface sits in its own footer).
//   HOME    footer: HOME · CREATE · PROFILE · NOTIFICATIONS   (home is index 0)
//   PROFILE footer: HOME · CREATE · MENU    · WALLET          (profile's self-slot = the
//                   hamburger position, index 2)
// Extend with other surfaces' real footers as they're confirmed.
export const SURFACES: Record<string, { order: Slot[]; anchor: number }> = {
  '/':        { order: [HOME, CREATE, PROFILE, NOTIFICATIONS], anchor: 0 },
  '/profile': { order: [HOME, CREATE, MENU, WALLET],           anchor: 2 },
};

/** Resolve the neighbor slot for a swipe direction, or null at a rubber-band end. */
export function neighbor(pathname: string, dir: 'left' | 'right'): Slot | null {
  const s = SURFACES[pathname];
  if (!s) return null;
  const i = s.anchor + (dir === 'left' ? 1 : -1);
  return i >= 0 && i < s.order.length ? s.order[i] : null;
}

// ── Slide-direction handoff: the gesture handler stamps the direction the
// destination should enter from; SlideShell consumes it on the next route render. ──
export type SlideDir = 'from-right' | 'from-left';
let pendingSlide: SlideDir | null = null;

/** swipe LEFT → destination enters from the right; swipe RIGHT → from the left. */
export function setPendingSlide(dir: 'left' | 'right'): void {
  pendingSlide = dir === 'left' ? 'from-right' : 'from-left';
}
export function consumePendingSlide(): SlideDir | null {
  const d = pendingSlide;
  pendingSlide = null;
  return d;
}
