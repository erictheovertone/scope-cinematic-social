// ── Open the unified post lightbox from anywhere ────────────────────────────
//
// Pure helper (NO component imports → no import cycles). Any surface can open
// the post's full lightbox by id; PostLightboxHost (mounted in the provider
// tree) fetches the row and renders the one PostModal. Used by the collect
// sheet's media tap-through.

export const OPEN_POST_EVENT = 'scope:open-post';

export function openPostLightbox(postId: string): void {
  if (typeof window === 'undefined' || !postId) return;
  window.dispatchEvent(new CustomEvent(OPEN_POST_EVENT, { detail: { postId } }));
}
