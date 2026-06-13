-- ─────────────────────────────────────────────────────────────────────────────
-- UPPERCASE IDENTITY — handles + display names are ALWAYS all caps (2026-06-13)
--
-- RUN MANUALLY in the Supabase SQL editor. Do NOT auto-run. Idempotent.
--
-- The app enforces uppercase at INPUT (setup + account onChange) and at STORE
-- (saveProfile, updateProfileFields). This trigger makes the invariant
-- structural: no write path — script, console, or future API — can land a
-- lowercase handle or display name. Then a one-time pass normalizes existing
-- rows. Lookups (getProfileByUsername / resolveProfileByUsername) already match
-- any case, so URLs minted before this migration keep resolving.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) WRITE-TIME GUARD ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_uppercase_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username := upper(NEW.username);
  END IF;
  IF NEW.display_name IS NOT NULL THEN
    NEW.display_name := upper(NEW.display_name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS uppercase_identity_guard ON profiles;
CREATE TRIGGER uppercase_identity_guard
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_uppercase_identity();

-- 2) PRE-FLIGHT — run this FIRST and eyeball the result ───────────────────────
-- Two handles that differ only by case (e.g. "eric" and "ERIC") would collide
-- on the username unique index when both upper() to the same value. This should
-- return ZERO rows. If it returns any, resolve those handles by hand before the
-- normalization UPDATE below (rename one, or merge), then re-run.
--
--   SELECT upper(username) AS u, count(*), array_agg(username) AS variants
--   FROM profiles
--   GROUP BY upper(username)
--   HAVING count(*) > 1;

-- 3) ONE-TIME NORMALIZATION — uppercase every existing row ────────────────────
-- Only touches rows that aren't already uppercase (keeps it a no-op on re-run).
UPDATE profiles
SET username     = upper(username),
    display_name = upper(display_name)
WHERE username IS DISTINCT FROM upper(username)
   OR display_name IS DISTINCT FROM upper(display_name);

-- Note: handle_history.old_username is intentionally left as-stored — the
-- resolver matches it case-insensitively, so legacy lowercase redirect entries
-- keep working without risking a collision on its unique index.
