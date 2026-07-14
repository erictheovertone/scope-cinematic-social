-- ─────────────────────────────────────────────────────────────────────────────
-- SCOPE ORIGINAL MUSIC LIBRARY — STAGE M1 schema
-- Run once in the Supabase SQL editor. Idempotent (safe to re-run).
--
-- WHAT THIS DOES
--   1. `tracks` — the library. A composer contributes a track; it lands 'pending';
--      an admin approves/rejects. Only 'approved' rows are public.
--   2. `posts.music_track_id` + `posts.music_mode` — playback-layer flags ONLY. The
--      post's own media/audio is NEVER baked or stripped; music plays in PARALLEL.
--   3. The `music` storage bucket (public) — audio lives here, uploaded via the
--      service-role route (src/app/api/music/upload), NOT the anon client.
--
-- IDENTITY: `composer_user_id` is a Supabase `users.id` UUID (the UUID discipline —
-- same as posts.user_id). It is NOT a Privy DID. Notifications elsewhere key by DID,
-- so the approval route translates users.id → users.privy_id before notifying.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. tracks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  composer_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keywords          text[] NOT NULL DEFAULT '{}',
  duration_seconds  int,
  file_url          text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now(),
  approved_at       timestamptz,
  CONSTRAINT tracks_title_len   CHECK (char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT tracks_status_enum CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Approval-queue scan + the public library filter both read status.
CREATE INDEX IF NOT EXISTS tracks_status_idx ON tracks (status);
-- Keyword search (M2 uses the taxonomy for discovery) — GIN over the array.
CREATE INDEX IF NOT EXISTS tracks_keywords_idx ON tracks USING GIN (keywords);
-- Composer → their tracks (the badge count query + "my contributions").
CREATE INDEX IF NOT EXISTS tracks_composer_idx ON tracks (composer_user_id);

-- ── 2. posts additions — PLAYBACK FLAGS ONLY ─────────────────────────────────
-- A post may feature ONE library track played in parallel with its own audio.
-- 'bed' = music under the post's original audio; 'music_only' = music is the audio
-- bed for a silent/photo post. Original post audio is never stripped either way.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS music_track_id uuid REFERENCES tracks(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS music_mode text;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_music_mode_enum;
ALTER TABLE posts ADD CONSTRAINT posts_music_mode_enum
  CHECK (music_mode IS NULL OR music_mode IN ('bed', 'music_only'));

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- The library is PUBLICLY readable, but ONLY approved rows. Pending/rejected rows
-- are invisible to the anon client — the approval queue reads them through the
-- service-role admin route (which bypasses RLS).
--
-- NOTE — no "composer-can-read-own-pending" policy: this app authenticates with
-- Privy, NOT Supabase Auth, so `auth.uid()` is always null and RLS cannot identify
-- the composer. A composer's view of their own pending tracks (M2/M3) must go
-- through a service-role route, same as the admin queue. Reported, not a gap.
--
-- All WRITES (insert on contribute, update on approve/reject) go through the
-- service-role routes, which bypass RLS. With RLS enabled and only a SELECT policy
-- present, anon/authenticated INSERT/UPDATE/DELETE are denied by default.
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracks approved are public" ON tracks;
CREATE POLICY "tracks approved are public" ON tracks
  FOR SELECT USING (status = 'approved');

-- ── 4. storage bucket ────────────────────────────────────────────────────────
-- Public bucket for audio. Objects are immutable-cacheable (trackId-based names).
-- Uploads happen through the service-role route; public buckets are readable by all.
INSERT INTO storage.buckets (id, name, public)
VALUES ('music', 'music', true)
ON CONFLICT (id) DO NOTHING;

-- POLICIES AS WRITTEN (report):
--   tracks: RLS enabled; SELECT allowed WHERE status='approved'; no client
--           INSERT/UPDATE/DELETE policy → those are denied for anon/authenticated
--           (service-role routes bypass RLS). No composer-read-own (no auth.uid).
--   posts:  unchanged RLS; two nullable columns added, music_mode CHECK-constrained.
--   music bucket: public read; writes via service role only.
