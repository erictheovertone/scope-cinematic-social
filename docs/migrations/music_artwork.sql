-- ─────────────────────────────────────────────────────────────────────────────
-- MUSIC — track artwork (optional cover per track). Run once; idempotent.
-- Stored in the existing public `music` bucket as <userId>/<trackId>.art.webp
-- (same folder as the audio, so the abandon-cleanup guard covers it). Baked to a
-- square 600×600 WebP by the service-role route (/api/music/artwork). Tracks
-- without a cover render the deterministic generated default (TrackArt) — no
-- storage row needed, so the library reads uniform whether uploaded or generated.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artwork_url text;
