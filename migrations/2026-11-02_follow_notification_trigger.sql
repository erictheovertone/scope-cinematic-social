-- ── ARR-8 §3 — follower notifications via a DB trigger on follows INSERT ─────────────────────────
-- When A follows B, B should get an in-app "X started following you" notification that opens X's
-- profile. The app's followUser() created this notification, but the Arrival sign-up follow
-- (/api/arrival/follow) inserts into `follows` DIRECTLY and never notified. Moving it to a trigger
-- makes it fire for EITHER path — app or Arrival — and becomes the single source (the app-side
-- insert is removed in the same change, so there is exactly one notification).
--
-- IDs: follows.follower_id / following_id and notifications.sender_id / recipient_id are all Privy
-- DIDs (text). The follower's username/avatar come from users (privy_id = DID) → profiles (user_id =
-- users.id). SECURITY DEFINER so the insert runs regardless of the follower's RLS (the app insert is
-- done by the user's own role; the trigger owner inserts the recipient's notification).
--
-- NOT RUN automatically — apply this with the deploy that removes the app-side follow notification
-- (src/lib/userService.ts followUser). Run in the Supabase SQL editor.

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_username text;
  s_avatar   text;
begin
  -- Never notify a self-follow.
  if new.follower_id = new.following_id then
    return new;
  end if;

  -- The follower's display identity, if we have a profile for them (NULLs are fine — the UI falls
  -- back to "someone", exactly as the old app-side insert did).
  select p.username, p.profile_image_url
    into s_username, s_avatar
  from public.users u
  join public.profiles p on p.user_id = u.id
  where u.privy_id = new.follower_id
  limit 1;

  insert into public.notifications
    (recipient_id, sender_id, sender_username, sender_avatar, type, post_id, post_image_url, message, is_read)
  values
    (new.following_id, new.follower_id, s_username, s_avatar, 'follow', null, null,
     '@' || coalesce(s_username, 'someone') || ' started following you', false);

  return new;
end;
$$;

drop trigger if exists trg_notify_on_follow on public.follows;
create trigger trg_notify_on_follow
  after insert on public.follows
  for each row
  execute function public.notify_on_follow();
