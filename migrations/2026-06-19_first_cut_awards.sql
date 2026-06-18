-- ── Awarding layer · Step 3 — First Cut (write-once, immutable) ───────────────
-- Plan: docs/economy/Indexer_Decisions.md §First Cut. Unlike SRH/Collector (which
-- are recomputed every cron run), First Cut is PERMANENT: once a wallet is one of
-- the first 10 external collectors of a coin, that row is written ONCE and never
-- updated, cleared, or recomputed. The First Cut badge reads from this table
-- (count of rows for a user > 0 → badge earned).
--
-- Run manually in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS first_cut_awards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,                         -- users.id (= profiles.user_id)
  coin_address TEXT NOT NULL,                         -- the post's coin
  rank         INT  NOT NULL CHECK (rank BETWEEN 1 AND 10), -- founding slot 1..10
  awarded_at   TIMESTAMPTZ DEFAULT now(),
  -- Write-once per (user, coin): the in-flow check upserts ON CONFLICT DO NOTHING,
  -- so a re-buy or a re-run never issues a second slot or overwrites the first.
  UNIQUE (user_id, coin_address)
);

CREATE INDEX IF NOT EXISTS first_cut_awards_user_idx ON first_cut_awards (user_id);
CREATE INDEX IF NOT EXISTS first_cut_awards_coin_idx ON first_cut_awards (coin_address);

-- Provenance is public (it's on-chain truth); writes are service-role only
-- (the /api/first-cut/check route), which bypasses RLS.
ALTER TABLE first_cut_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "first_cut_awards public read" ON first_cut_awards;
CREATE POLICY "first_cut_awards public read" ON first_cut_awards
  FOR SELECT USING (true);
