-- ════════════════════════════════════════════════════════════════════════════
-- SEC-0 — CONTAINMENT (P0)   ·   docs/infra/scope-security-audit.md §4.0
-- Project: brevfwazpoibobuqglxk (SCOPE)   ·   written by CC, RUN BY ERIC
-- Rules of engagement (§4): zero visible/functional change for legitimate users;
-- the ONLY behaviour that may change is that FORGED requests are denied.
--
-- ── RE-VERIFIED 2026-10-29 against the current schema (QUEUE-4 §8) ───────────
--   • New columns since this was written — media_has_renditions (posts),
--     signup_ref / signup_profile (users) — require NO change here:
--       - media_has_renditions is a POSTS column; SEC-0 never touches posts grants
--         (content vandalism is the stated SEC-1 residual).
--       - signup_ref / signup_profile are attribution, not identity/money; the 2a
--         trigger guards only privy_id + wallet_address (SEC-0's identity scope).
--   • 2b re-grant verified: profiles has 41 columns = 28 re-granted (below) + the
--     13 sensitive withheld (is_paid_member, is_top_collector, paid_member_until,
--     payment_method, stripe_customer_id, is_in_house_creator, is_founding_member,
--     founding_member_number, portfolio_mc, is_screening_room_holder,
--     stripe_subscription_id, membership_cancels_at, srh_count). No legit-writable
--     column is accidentally revoked; every granted column exists.
--   • anon-smoke BEFORE baseline (prod, 2026-10-29): all 5 forged writes ALLOWED
--     (exit 1) — uncontained, as expected. Eric's identity row restored intact.
--
-- ⚠️  RUN ORDER — READ BEFORE RUNNING ANYTHING  ⚠️
--   STEP 0  Code is ALREADY LIVE: /api/post-media/delete and /api/coin-metadata
--           are on main (production) as of this commit → Vercel READY. (They must
--           stay live; until they were, STEP 2c would break poster-replace + mint.)
--   STEP 1  Rehearse THIS WHOLE FILE on a Supabase PREVIEW BRANCH with seeded
--           data (gate 4). Confirm onboarding / profile-edit / poster-replace /
--           mint all still pass there.
--   STEP 2  Run on production (2a, 2b, 2c below), in a quiet window.
--   STEP 3  Run the negative smoke test (test/sec/anon-smoke.mjs) + the
--           regression list + the visual diff (gates 3/2/1) — AFTER the SQL.
--
-- Each block has its ROLLBACK inlined directly beneath it.
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 2a · users — privy_id immutable; wallet_address write-once (service_role exempt)
--      Closes payout-address takeover + account-takeover (SEC-F1, identity cols).
--      NULL→value stays allowed (onboarding); same→same stays allowed (idempotent
--      login sync via syncUserWithSupabase upsert); value→different is DENIED.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.guard_user_identity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  is_service boolean;
begin
  is_service := coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role',
    false
  );
  if is_service then
    return new;  -- server jobs (service role) are exempt
  end if;

  if new.privy_id is distinct from old.privy_id then
    raise exception 'privy_id is immutable (SEC-0)';
  end if;

  if old.wallet_address is not null
     and new.wallet_address is distinct from old.wallet_address then
    raise exception 'wallet_address cannot be changed once set (SEC-0)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_user_identity on public.users;
create trigger trg_guard_user_identity
  before update on public.users
  for each row execute function public.guard_user_identity();

-- ROLLBACK 2a:
--   drop trigger if exists trg_guard_user_identity on public.users;
--   drop function if exists public.guard_user_identity();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2b · profiles — strip anon/authenticated write access to the entitlement &
--      billing columns, KEEP every legitimate profile-edit column.
--      TRACE RESULT: all 13 sensitive columns are written ONLY by server routes
--      (Stripe webhook/confirm/confirm-stripe/cancel, cron/collector,
--      economy/screeningRoom via cron+refresh) — ALL service-role. The browser
--      never writes them, so this is invisible to legitimate users.
--
--      NOTE ON MECHANICS: profiles has a *table-level* UPDATE (and INSERT) grant
--      to anon/authenticated, so a column-level REVOKE alone is a no-op. We revoke
--      the table-level grant and re-grant the 28 non-sensitive columns.
--      (INSERT is included: a row INSERT with paid_member_until=future is an
--      equivalent self-grant path — beyond the literal §2b, same spirit. Omit the
--      two INSERT lines if you want to defer that to SEC-1.)
-- ─────────────────────────────────────────────────────────────────────────────

-- UPDATE
revoke update on public.profiles from anon, authenticated;
grant update (
  id, user_id, display_name, username, bio, profile_image_url, grid_layout,
  created_at, updated_at, website_url, kit_camera, kit_lens, kit_favorite_tool,
  contact_email, contact_email_public, divider_line, holo_banner, last_seen_at,
  show_recap, location, short_bio, desktop_layout, desktop_onboarded, more_from,
  aspect_ratio, mobile_count, desktop_count, decks_count
) on public.profiles to anon, authenticated;

-- INSERT (self-grant-via-insert; see note above)
revoke insert on public.profiles from anon, authenticated;
grant insert (
  id, user_id, display_name, username, bio, profile_image_url, grid_layout,
  created_at, updated_at, website_url, kit_camera, kit_lens, kit_favorite_tool,
  contact_email, contact_email_public, divider_line, holo_banner, last_seen_at,
  show_recap, location, short_bio, desktop_layout, desktop_onboarded, more_from,
  aspect_ratio, mobile_count, desktop_count, decks_count
) on public.profiles to anon, authenticated;

-- ROLLBACK 2b (restores table-level grants, which cover all columns again):
--   grant update on public.profiles to anon, authenticated;
--   grant insert on public.profiles to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2c · storage — drop the destructive / defacement anon policies.
--      REQUIRES the STEP 0 code deploy to be LIVE first:
--        · post-media delete → now /api/post-media/delete (ownership-checked)
--        · coin-metadata write → now /api/coin-metadata (ownership-checked)
--      profile-images delete has NO browser caller (trace) → clean drop.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "anon delete post-media"     on storage.objects;
drop policy if exists "anon delete profile-images" on storage.objects;
drop policy if exists "coin metadata update"       on storage.objects;
drop policy if exists "coin metadata insert"       on storage.objects;

-- ROLLBACK 2c (recreate exactly as they were on 2026-10-24):
--   create policy "anon delete post-media" on storage.objects
--     for delete to public using (bucket_id = 'post-media');
--   create policy "anon delete profile-images" on storage.objects
--     for delete to public using (bucket_id = 'profile-images');
--   create policy "coin metadata update" on storage.objects
--     for update to public using (bucket_id = 'coin-metadata') with check (bucket_id = 'coin-metadata');
--   create policy "coin metadata insert" on storage.objects
--     for insert to public with check (bucket_id = 'coin-metadata');

-- ════════════════════════════════════════════════════════════════════════════
-- RESIDUAL after SEC-0 (by design; closed in SEC-1 §4.1): anonymous callers can
-- still vandalise CONTENT (edit/delete posts, comments, decks, links, spoof
-- notifications) and INSERT new arbitrary objects into post-media/profile-images.
-- SEC-0's job is money + identity + media-wipe + coin defacement — all contained.
-- ════════════════════════════════════════════════════════════════════════════
