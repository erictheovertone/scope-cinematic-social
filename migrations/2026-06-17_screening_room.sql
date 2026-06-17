-- Awarding layer · Step 1 — Screening Room ranking + SRH badge.
-- Run manually in the Supabase SQL editor (in order). Idempotent.

-- ── Step A: registry hardening ───────────────────────────────────────────────
-- Denormalize the creator's wallet onto the post so the ranking job needs no
-- join at read time. New mints write it directly (postsService.updatePostCoinData);
-- this backfills the existing rows from the current creator mapping.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS creator_address TEXT;

UPDATE posts p
SET creator_address = u.wallet_address
FROM users u
WHERE p.user_id = u.id
  AND p.creator_address IS NULL
  AND u.wallet_address IS NOT NULL;

-- ── SRH flag on profiles (consistent with is_founding_member / is_top_collector
--    / is_in_house_creator). Awarded/cleared by the job every refresh. ─────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_screening_room_holder BOOLEAN NOT NULL DEFAULT false;

-- ── Screening Room cache — the ranked top-50 by volume. Overwritten each run
--    (last-write-wins snapshot). Also feeds the future Screening Room UI. ──────
CREATE TABLE IF NOT EXISTS screening_room (
  rank            INT PRIMARY KEY,
  coin_address    TEXT NOT NULL,
  creator_address TEXT,
  user_id         UUID,
  symbol          TEXT,
  volume          NUMERIC,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- World-readable (for the future browsable showcase); writes are service-role
-- only (the cron uses the service key, which bypasses RLS).
ALTER TABLE screening_room ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "screening_room public read" ON screening_room;
CREATE POLICY "screening_room public read" ON screening_room FOR SELECT USING (true);
