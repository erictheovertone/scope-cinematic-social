-- ─────────────────────────────────────────────────────────────────────────────
-- MUSIC — waveforms + clip selection. Run once; idempotent.
--   tracks.waveform_peaks — ~300 normalized peaks (0–1 floats), generated in the
--     composer's browser at contribution (Web Audio decodeAudioData). Legacy tracks
--     self-heal: the first render of a peakless track decodes + POSTs the peaks back
--     (/api/music/waveform) — the seeded library fills in on first view.
--   posts.music_start_seconds — where the featured clip starts in the track. Window
--     WIDTH is implied by the post type (image = 20s loop; video = the video's
--     length), so only the offset is stored. M3's playback engine reads it.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS waveform_peaks jsonb;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS music_start_seconds real;
