-- ── First Cut lifecycle — slot expiry ────────────────────────────────────────
-- First Cut is now a HOLDING-GATED benefit, not a permanent mint. The award row
-- persists as the permanent record of WHO held slot N (so the slot never reopens
-- to a new buyer), and `expired_at` marks it dead when the holder SELLS the coin
-- down below the $4.50 keep-floor. NULL = active; set = expired (permanent).
--
-- Existing rows default to NULL (active) — correct, no backfill needed. The
-- existing UNIQUE (user_id, coin_address) + ON CONFLICT DO NOTHING already makes
-- expiry permanent: a re-award attempt on an expired row does nothing (never
-- clears expired_at).
--
-- Run manually in the Supabase SQL editor.

ALTER TABLE first_cut_awards ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ NULL;

-- Last-seen on-chain token balance for the out-of-app expiry cron. The cron
-- compares run-to-run to detect a token-balance DECREASE (a sell) — so a pure
-- price drop (balance unchanged) NEVER expires a slot. NULL = not yet sampled.
ALTER TABLE first_cut_awards ADD COLUMN IF NOT EXISTS last_balance_tokens NUMERIC NULL;

-- Fast "active slots for a user" lookup (the badge resolution).
CREATE INDEX IF NOT EXISTS first_cut_awards_active_idx
  ON first_cut_awards (user_id) WHERE expired_at IS NULL;
