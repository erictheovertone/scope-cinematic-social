-- MORE FROM shelf — the creator's settings-selected posts featured in their
-- desktop home-feed lightbox (Figma 775:4, Shelf 1). Ordered array of post_ids
-- (the pick order = the shelf order); cap of 6 is enforced in the UI.
-- Run once in the Supabase SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS more_from jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Until this runs, the settings picker's save no-ops gracefully (caught) and the
-- MORE FROM shelf simply stays hidden (empty selection) — no errors, no crash.
