// ── feedCache invalidation signal (Brief V1e §6) ──────────────────────────────
// The Home (Discover) feed keeps a 5-min in-memory cache (src/app/page.tsx) so a tab
// round-trip comes back instantly. But publishing a post didn't touch that cache, so a
// return to Home within the TTL showed the stale feed WITHOUT the new post. This is a
// module-level latch that survives Home being unmounted (the user is on /create when
// they publish): publish sets it, and the next Home mount consumes it and refetches.

let dirty = false;

/** Mark the feed stale (call on publish). The next Home visit will refetch. */
export function markFeedDirty(): void { dirty = true; }

/** Consume the stale flag — true exactly once per publish, on the next read. */
export function takeFeedDirty(): boolean { const d = dirty; dirty = false; return d; }

/** The event a publish dispatches so an already-mounted Home can prepend live. */
export const POST_PUBLISHED_EVT = 'scope:post-published';
