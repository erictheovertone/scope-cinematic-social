// ── Open the unified post lightbox from anywhere ────────────────────────────
//
// Pure helper (NO component imports → no import cycles). Any surface can open
// the post's full lightbox by id; PostLightboxHost (mounted in the provider
// tree) fetches the row and renders the one PostModal. Used by the collect
// sheet's media tap-through.

export const OPEN_POST_EVENT = 'scope:open-post';

// Brief M3c §3 — optional QUEUE CONTEXT. A surface that opens a post from a known
// ordered set (e.g. the Screening Room lineup) can hand the host that set so a
// rotate-to-theatre from the lightbox swipes the WHOLE queue (not just the one post)
// and, for SR, shows the rank indicator. Read-only; the host never re-fetches it.
export interface PostLightboxContext {
  posts: Record<string, unknown>[];
  ranks?: number[];
  startIndex?: number;
  source?: 'feed' | 'profile' | 'screening';
}

export function openPostLightbox(postId: string, ctx?: PostLightboxContext): void {
  if (typeof window === 'undefined' || !postId) return;
  window.dispatchEvent(new CustomEvent(OPEN_POST_EVENT, { detail: { postId, ctx } }));
}
