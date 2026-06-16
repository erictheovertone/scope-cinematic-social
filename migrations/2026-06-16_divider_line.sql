-- Badge redesign · Piece 2 — dividing-line customization.
-- Stores the user's chosen banner divider line (NULL = default black/invisible).
-- Run manually in the Supabase SQL editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS divider_line TEXT;

-- Values: 'slate' | 'splice' | 'drip' | 'golden' | 'sunset' | 'burn'
-- NULL or 'default' = the default solid-black line (no visible divider).
-- Gating is enforced in the app (Edit Profile only offers lines the user's
-- tier unlocks); this column is presentational and publicly readable (RLS:
-- profiles are world-readable, owner-writable — unchanged).
