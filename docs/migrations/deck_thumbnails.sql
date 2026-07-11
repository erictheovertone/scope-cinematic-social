-- Desktop decks pass: baked collage covers + per-user decks grid count.
-- Run once in the Supabase SQL editor.

-- Baked collage cover for a deck (one small WebP composited from its posts).
-- NULL = needs (re)baking; the add/remove paths clear it, the desktop decks
-- tab bakes it lazily on display. Falls back to cover_image_url / first post.
ALTER TABLE decks ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Per-user DESKTOP decks grid column count (3|4|5). Standalone on profiles (its
-- own surface, distinct from the post-grid layout model's desktop_count).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS decks_count int NOT NULL DEFAULT 4;

-- Until run: the thumbnail clears/reads no-op gracefully (covers use the
-- first-post fallback) and decks_count reads default to 4 in the UI.
