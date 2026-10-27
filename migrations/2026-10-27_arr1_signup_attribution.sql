-- Brief ARR-1 — Arrival sign-up attribution. Run manually in the Supabase SQL editor.
-- /api/arrival/follow writes these once (first arrival wins); it fails soft until this runs.
alter table public.users add column if not exists signup_ref text;
alter table public.users add column if not exists signup_profile text;
