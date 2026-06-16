-- Badge redesign · Piece 3 — holographic banner (Augmented only).
-- Boolean toggle: when true (and the user is Augmented), the badge backdrop
-- renders the animated iridescent fill instead of the standard art.
-- Run manually in the Supabase SQL editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS holo_banner BOOLEAN NOT NULL DEFAULT false;

-- Gating is enforced in the app (the toggle only shows for Augmented members,
-- and the render also checks is_founding_member). This column is presentational
-- and publicly readable (RLS unchanged — profiles world-readable, owner-writable).
