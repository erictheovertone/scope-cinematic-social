# Composer pool share — BOOKMARK (Brief AUG-1 §6: bookmark, don't build)

**Status:** not built. This note records the idea and the hooks that now exist, so a later brief can scope it.

## The idea
Augmented Pro revenue, part of it, funds a pool shared with the composers whose music members use,
the way the Top 1K and Adopter pools pay collectors. Composers get paid for being used, not only for
being approved.

## What AUG-1 / MUS-1 already gives a future build
- **Usage signal:** `downloads` (user_id, asset_type 'track', asset_id, created_at) logs every music
  download by an Augmented member. `posts.music_track_id` logs every post scored with a track.
- **Who pays in:** `profiles.membership_tier = 'augmented'` + `augmented_since`, and Stripe
  subscriptions on the four `STRIPE_PRICE_*` Prices (invoice.payment_succeeded = money in).
- **Who gets paid:** `tracks.composer_user_id`, grouped by `albums`.

## Open questions (Eric)
1. What share of Augmented revenue goes to the pool, and is it fixed or per-period?
2. What's the weighting: downloads, posts scored, plays, or a mix? Do we cap per member, so one heavy
   downloader can't steer the pool?
3. Payout rail: USDC to the composer's embedded wallet (like FC payouts), or Stripe Connect?
4. What period and minimum payout, and what happens to unclaimed shares?
5. Is it Augmented-only revenue, or Pro too?

Nothing in the codebase reads this note. It isn't a spec.
