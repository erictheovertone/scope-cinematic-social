-- ─────────────────────────────────────────────────────────────────────────────
-- DECKS = OWN WORK ONLY — DB-level guard (ratified 2026-06-13)
--
-- RUN MANUALLY in the Supabase SQL editor. Do NOT auto-run. Idempotent.
--
-- The app layer already refuses (userService.addPostToDeck); this trigger makes
-- it structural: a deck_items row can only reference a post authored by the
-- deck's owner. Decks curate what you MADE; collected-grouping (post-launch)
-- will curate what you OWN.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_deck_own_work()
RETURNS TRIGGER AS $$
BEGIN
  -- post_id may be null for raw-media deck items (owner's own media uploads).
  IF NEW.post_id IS NOT NULL THEN
    IF (SELECT user_id FROM decks WHERE id = NEW.deck_id)
       IS DISTINCT FROM
       (SELECT user_id FROM posts WHERE id = NEW.post_id) THEN
      RAISE EXCEPTION 'Decks hold the owner''s own work only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deck_own_work_guard ON deck_items;
CREATE TRIGGER deck_own_work_guard
  BEFORE INSERT OR UPDATE ON deck_items
  FOR EACH ROW EXECUTE FUNCTION enforce_deck_own_work();
