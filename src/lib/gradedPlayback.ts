// ── gradedPlayback — the VID-2c allowlist gate (GRADED_PLAYBACK_ALLOWLIST) ───────────────────────
// Graded WebGL playback (Option A) is gated per ACCOUNT on production by a RUNTIME, SERVER-SIDE env
// var — NOT a NEXT_PUBLIC_ build-time flag — so Eric can flip who gets it without a redeploy:
//
//   GRADED_PLAYBACK_ALLOWLIST = "overtone"            → just that user
//   GRADED_PLAYBACK_ALLOWLIST = "overtone,ebert,ava"  → those users
//   GRADED_PLAYBACK_ALLOWLIST = "*"                    → everyone
//   (unset / empty)                                    → off for everyone
//
// The var is read only in /api/graded-playback (server). The route resolves the signed-in user's
// username against it and returns a plain boolean; the client caches that boolean (GradedPlaybackProvider)
// and GradedVideo reads it. Matching is case-insensitive and trims whitespace around each entry.

/** Pure allowlist check — does `list` admit `username`? Used server-side and unit-tested directly. */
export function gradedAllowlistAllows(username: string | null | undefined, list: string | null | undefined): boolean {
  const l = (list ?? "").trim();
  if (!l) return false;          // unset / empty → off
  if (l === "*") return true;    // everyone
  if (!username) return false;   // a named list but no signed-in username → off
  const u = username.trim().toLowerCase();
  if (!u) return false;
  return l.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(u);
}

/** The gate GradedVideo uses: attempt graded when enabled for this user, the source is HLS, and the
 *  post carries a real look. `enabled` is the resolved per-user boolean (allowlist OR a debug force). */
export function shouldAttemptGraded(isHls: boolean, hasLook: boolean, enabled: boolean): boolean {
  return enabled && isHls && hasLook;
}
