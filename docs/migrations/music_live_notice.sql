-- Brief MUS-3 §4 — the one-time "your music is live" composer notice.
-- A TIMESTAMP, not a boolean: the notice fires whenever the composer has an approved track whose
-- approval time is NEWER than this stamp, so a composer who ships a second album later is notified
-- again (MusicLiveNoticeHost / shouldShow). Dismissing the notice stamps now(). Null = never notified
-- (so the first approved track fires it). Until this is run, the host reads an error and never shows.
alter table profiles
  add column if not exists music_live_notified_at timestamptz;

comment on column profiles.music_live_notified_at is
  'MUS-3 §4 — last time the "your music is live" notice was shown to this composer; the notice re-fires when an approved track''s approved_at is newer than this.';
