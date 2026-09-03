-- ── Brief X1 — FALSE POST-LIMIT PAYWALL (critical path) ──────────────────────
-- Eric hit "25 free posts reached" at ~14 real posts. ROOT CAUSE: the post-limit
-- trigger's COUNT(*) counts ALL of a user's post rows, but deletes are SOFT
-- (is_deleted = true; hard-delete is forbidden — see postsService.ts:668). So
-- soft-deleted posts inflate the count: ~14 kept + ~11 deleted = 25 → false block.
--
-- The trigger that raises SCOPE_LIMIT_POSTS lives ONLY in the live DB (it was never
-- committed to the repo). This migration REPLACES it with a corrected version:
--   • counts KEPT posts only (is_deleted = false) — the real "published and still has"
--   • keyed on user_id (uuid) — the shape createPost inserts (already correct)
--   • Pro members exempt (paid_member_until in the future OR is_paid_member) — never gated
--   • FAILS OPEN: any error reading the count/membership → publish proceeds (a missed
--     upsell costs nothing; a false block costs a creator's post)
-- Publish/mint logic is untouched — this only corrects the gate's count + condition.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0 (confirm the cause) — Eric's counts by category. Replace <ERIC_DID>:
--
--   SELECT
--     count(*)                                      AS total_rows,
--     count(*) FILTER (WHERE is_deleted = false)    AS kept,          -- the real total
--     count(*) FILTER (WHERE is_deleted IS TRUE)    AS soft_deleted   -- the inflation
--   FROM posts
--   WHERE user_id = (SELECT id FROM users WHERE privy_id = '<ERIC_DID>');
--
-- Expected: kept ≈ 14, soft_deleted ≈ 11, total ≈ 25. `kept` is the corrected count.
--
-- STEP 1 (find the current trigger + function so the DROP below targets the right names):
--
--   SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'posts'::regclass AND NOT tgisinternal;
--   SELECT proname FROM pg_proc WHERE prosrc LIKE '%SCOPE_LIMIT_POSTS%';
--
-- If the live function/trigger names differ from the ones below, either rename here to
-- match, or DROP the old ones by their real names before creating these — otherwise the
-- OLD (inflating) trigger keeps firing alongside the new one.
-- ─────────────────────────────────────────────────────────────────────────────

-- STEP 2 — the corrected enforcement.
CREATE OR REPLACE FUNCTION enforce_post_limit()
RETURNS TRIGGER AS $$
DECLARE
  kept_count int;
  is_pro     boolean := false;
BEGIN
  -- Reads wrapped so ANY error here FAILS OPEN (publish proceeds on ambiguity).
  BEGIN
    SELECT (
      (paid_member_until IS NOT NULL AND paid_member_until > now())
      OR is_paid_member IS TRUE
    )
      INTO is_pro
      FROM profiles
      WHERE user_id = NEW.user_id;

    IF is_pro THEN
      RETURN NEW;                       -- Pro: no limit
    END IF;

    SELECT count(*)
      INTO kept_count
      FROM posts
      WHERE user_id = NEW.user_id
        AND is_deleted = false;         -- ← THE FIX: exclude soft-deleted rows
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;                         -- count/membership unreadable → allow (fail open)
  END;

  IF kept_count >= 25 THEN
    RAISE EXCEPTION 'SCOPE_LIMIT_POSTS';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-point the trigger (drop the old name too if STEP 1 showed a different one).
DROP TRIGGER IF EXISTS enforce_post_limit_trigger ON posts;
CREATE TRIGGER enforce_post_limit_trigger
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION enforce_post_limit();
