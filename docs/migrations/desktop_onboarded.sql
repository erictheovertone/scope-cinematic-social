-- Desktop onboarding seen-once flag (durable, per-user, cross-device).
-- Root cause of "explainer fires every login": this column never existed, so
-- the Supabase write silently no-op'd and only fragile localStorage carried
-- the flag (lost across devices / incognito / Safari private mode).
-- Run once in the Supabase SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS desktop_onboarded boolean NOT NULL DEFAULT false;

-- Optional backfill: if you want existing users who've already been through the
-- desktop experience to NOT see the explainer, flip them now. Otherwise every
-- current user sees it exactly once on their next desktop login (intended).
-- UPDATE profiles SET desktop_onboarded = true WHERE username IS NOT NULL;
