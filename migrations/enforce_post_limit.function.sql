-- ── enforce_post_limit() — VERSION-CONTROLLED RECORD of the live gate logic ──
-- Record-keeping only. NO behavior change: this is the CURRENT (post-Brief-X1) definition
-- of the free-tier 25-post gate, mirrored here so the live logic is in git. Running it is a
-- no-op re-affirmation (CREATE OR REPLACE with the identical body).
--
-- INVOKED BY: trigger  trg_enforce_post_limit  BEFORE INSERT ON posts  FOR EACH ROW
--             EXECUTE FUNCTION enforce_post_limit();  (the trigger itself is unchanged and
--             NOT recreated here — this file records the FUNCTION only.)
--
-- SOURCE: transcribed from the applied fix migration
--   2026-09-03_post_limit_soft_delete_fix.sql (Brief X1). I do not have live-DB access to
--   run pg_get_functiondef, so this is the authoritative deployed body, not a fresh pg_proc
--   dump. If the live function was hand-edited after X1, re-sync this file from:
--     SELECT pg_get_functiondef('enforce_post_limit'::regproc);
--
-- Behavior (unchanged from X1): count KEPT posts only (is_deleted = false), exempt Pro
-- (paid_member_until in the future OR is_paid_member), and FAIL OPEN — any error reading the
-- count/membership lets the publish proceed. RAISE 'SCOPE_LIMIT_POSTS' at >= 25 kept posts.
--
-- ⚠ TRIGGER-NAME NOTE: the live trigger is trg_enforce_post_limit. The X1 fix migration
--   referenced a DIFFERENT name (enforce_post_limit_trigger) in its DROP/CREATE at the end —
--   so if X1 was run verbatim, a SECOND (redundant) trigger may exist alongside
--   trg_enforce_post_limit. Both call the same function, so behavior is correct but the insert
--   fires the gate twice. Verify with:
--     SELECT tgname FROM pg_trigger WHERE tgrelid='posts'::regclass AND NOT tgisinternal;
--   and DROP any duplicate. (Cleanup is intentionally NOT in this record-only commit.)
-- ─────────────────────────────────────────────────────────────────────────────

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
        AND is_deleted = false;         -- count KEPT posts only (exclude soft-deleted)
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;                         -- count/membership unreadable → allow (fail open)
  END;

  IF kept_count >= 25 THEN
    RAISE EXCEPTION 'SCOPE_LIMIT_POSTS';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
