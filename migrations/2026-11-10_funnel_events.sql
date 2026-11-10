-- BAL-1h #4 — funnel_events. Keyed by the Supabase users.id UUID (resolved from privy_id), never the DID.
-- Run manually in the Supabase SQL editor (additive; no change to existing tables).
create table if not exists public.funnel_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  event       text not null,            -- topup_opened | topup_started | topup_completed | topup_failed
                                        -- | collect_attempted | collect_blocked_no_balance | collect_completed | mint_blocked_no_balance
  props       jsonb not null default '{}'::jsonb,   -- e.g. { amount: 25, reason: 'rejected', session: 'cos_...' }
  created_at  timestamptz not null default now()
);

create index if not exists funnel_events_user_time  on public.funnel_events (user_id, created_at desc);
create index if not exists funnel_events_event_time on public.funnel_events (event,   created_at desc);

-- Writes go ONLY through the service role (the /api/funnel route + the onramp webhook). No anon policy,
-- so the anon key cannot read or write it. RLS on with no policy = deny-all for anon/authenticated.
alter table public.funnel_events enable row level security;
