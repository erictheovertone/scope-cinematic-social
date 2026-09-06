-- Brief M10 — Mirage snippet window persistence.
-- postsService.createPost writes snippet_start / snippet_length to `posts` as plain
-- metadata (seconds; NO baked clip). These columns were never added, so the write
-- fails with PGRST204 ("Could not find the 'snippet_length' column of 'posts'").
-- Additive, nullable, no constraints: null/absent = Mirage plays from 0 for the
-- default window length. DOUBLE PRECISION so a fractional second (scrub position)
-- is preserved; NULL is the "no saved window" sentinel the app reads.
-- Run manually in the Supabase SQL editor.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS snippet_start  DOUBLE PRECISION;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS snippet_length DOUBLE PRECISION;

-- RLS unchanged (posts are world-readable, owner-writable). These are presentational
-- playback metadata — no policy, index, default, or check constraint needed.
