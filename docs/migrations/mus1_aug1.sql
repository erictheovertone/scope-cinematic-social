-- ── Brief MUS-1 + AUG-1 — albums, composer self-service, Augmented Pro tier, downloads ──────────
-- ⚠ RUN BEFORE TESTING. Supabase SQL editor, two steps (INSPECT, then ALTER). Additive only —
-- nothing dropped, no existing column changes meaning. Safe to re-run (every statement is
-- IF NOT EXISTS / idempotent).
--
-- RLS posture (matches the CURRENT tracks policy, opens nothing wider): tracks has exactly one
-- policy — SELECT where status = 'approved'. Writes never go through the anon client; they go
-- through server routes (service role) that verify the caller's Privy token and check that the
-- caller IS the composer. albums gets the same shape: public SELECT, no client write policy.
-- downloads + track_versions: RLS on, NO policies at all (service role only).

-- ── STEP 1 — INSPECT (read the output, then run Step 2) ──────────────────────────────────────────
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'tracks' order by ordinal_position;
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles'
   and column_name in ('composer_bio','composer_links','membership_tier','augmented_since','stripe_price_id');
select to_regclass('public.albums') as albums, to_regclass('public.downloads') as downloads,
       to_regclass('public.track_versions') as track_versions;
select tablename, policyname, cmd, qual from pg_policies where tablename in ('tracks','albums');
-- How many tracks will the Singles backfill touch, across how many composers?
select count(*) as tracks_without_album, count(distinct composer_user_id) as composers from tracks;

-- ── STEP 2 — ALTER ───────────────────────────────────────────────────────────────────────────────

-- MUS-1 §1 — albums
create table if not exists albums (
  id           uuid primary key default gen_random_uuid(),
  composer_id  uuid not null references users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 80),
  cover_url    text,
  year         int  check (year is null or year between 1900 and 2100),
  position     int  not null default 0,
  is_singles   boolean not null default false,   -- the per-composer "Singles" home (backfill + default)
  created_at   timestamptz not null default now()
);
create index if not exists albums_composer_idx on albums (composer_id, position);
-- One Singles album per composer (the backfill + the submit default both rely on it).
create unique index if not exists albums_one_singles_per_composer on albums (composer_id) where is_singles;
alter table albums enable row level security;
drop policy if exists "albums are public" on albums;
create policy "albums are public" on albums for select using (true);

alter table tracks add column if not exists album_id uuid references albums(id) on delete set null;
alter table tracks add column if not exists position int not null default 0;
create index if not exists tracks_album_idx on tracks (album_id, position);

-- Composer page fields
alter table profiles add column if not exists composer_bio   text check (composer_bio is null or char_length(composer_bio) <= 600);
alter table profiles add column if not exists composer_links jsonb not null default '[]'::jsonb;

-- MUS-1 §4 — audio replacement goes through the EXISTING approval path: a pending version row
-- the admin approves (approve → file_url/duration/peaks swap onto the live track) or rejects.
create table if not exists track_versions (
  id               uuid primary key default gen_random_uuid(),
  track_id         uuid not null references tracks(id) on delete cascade,
  composer_id      uuid not null references users(id) on delete cascade,
  file_url         text not null,
  duration_seconds int,
  waveform_peaks   jsonb,
  status           text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);
create index if not exists track_versions_pending_idx on track_versions (status, created_at);
alter table track_versions enable row level security;   -- no policies: service role only

-- Backfill: every track without an album → its composer's "Singles" album, positioned by age.
insert into albums (composer_id, title, is_singles, position)
select distinct t.composer_user_id, 'Singles', true, 1000
  from tracks t
 where t.album_id is null
   and not exists (select 1 from albums a where a.composer_id = t.composer_user_id and a.is_singles)
on conflict do nothing;

update tracks t
   set album_id = a.id,
       position = s.rn
  from albums a,
       (select id, row_number() over (partition by composer_user_id order by created_at) as rn
          from tracks where album_id is null) s
 where t.id = s.id
   and a.composer_id = t.composer_user_id and a.is_singles
   and t.album_id is null;

-- AUG-1 §1 — the membership tier. 'free' | 'pro' | 'augmented'. Existing paid members are Pro.
alter table profiles add column if not exists membership_tier text not null default 'free'
  check (membership_tier in ('free','pro','augmented'));
alter table profiles add column if not exists augmented_since timestamptz;
update profiles set membership_tier = 'pro'
 where membership_tier = 'free' and paid_member_until is not null and paid_member_until > now();

-- AUG-1 §3 — every download, logged (user, asset, ts). Service role only.
create table if not exists downloads (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  asset_type  text not null check (asset_type in ('post','track')),
  asset_id    uuid not null,
  created_at  timestamptz not null default now()
);
create index if not exists downloads_user_idx  on downloads (user_id, created_at desc);
create index if not exists downloads_asset_idx on downloads (asset_type, asset_id);
alter table downloads enable row level security;   -- no policies: service role only

-- MUS-1 §6 — the AUGMENTED badge is renamed ADOPTER. The badge has no stored key column today
-- (it derives from profiles.is_founding_member); this one line renames any notification rows
-- that carry the old key, and touches 0 rows if none exist.
update notifications set type = 'badge_adopter' where type = 'badge_augmented';

-- ── STEP 3 — VERIFY ──────────────────────────────────────────────────────────────────────────────
select (select count(*) from albums where is_singles) as singles_albums,
       (select count(*) from tracks where album_id is null) as tracks_still_homeless,   -- expect 0
       (select count(*) from profiles where membership_tier = 'pro') as pro_profiles,
       (select count(*) from profiles where membership_tier = 'augmented') as augmented_profiles;
