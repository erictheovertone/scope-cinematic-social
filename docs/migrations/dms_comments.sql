-- ─────────────────────────────────────────────────────────────────────────────
-- DMs + COMMENT INTERACTIONS · Stage 1 foundation schema
-- Run once in the Supabase SQL editor.
--
-- TWO PRIVACY POSTURES IN ONE FILE — read the RLS notes:
--   • conversations + messages  → PRIVATE. RLS enabled, NO permissive policy →
--     default-deny for the anon/authenticated API keys. The ONLY read/write path
--     is the server routes under /api/dm/*, which use the service-role key (it
--     bypasses RLS by design). The anon key literally cannot SELECT a message.
--   • comment_likes + comments.parent_comment_id → PUBLIC, mirrors the existing
--     permissive posture of `comments`/`likes` (client writes via the anon key).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. conversations ─────────────────────────────────────────────────────────
-- Strict 1:1. The pair is NORMALIZED (user_a < user_b) so a conversation is
-- unique regardless of who opened it — the server always sorts the two uuids
-- before upserting. last_message_* are DENORMALIZED for a cheap inbox list
-- (no per-row subquery to render the newest-first conversations).
CREATE TABLE IF NOT EXISTS conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_message_at      timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  CONSTRAINT conversations_pair_ordered CHECK (user_a < user_b),
  CONSTRAINT conversations_pair_unique  UNIQUE (user_a, user_b)
);

-- Inbox query for a participant: "conversations where I am user_a OR user_b",
-- newest-first. Index both sides so either lookup hits an index.
CREATE INDEX IF NOT EXISTS conversations_user_a_idx ON conversations (user_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_b_idx ON conversations (user_b, last_message_at DESC);


-- ── 2. messages ──────────────────────────────────────────────────────────────
-- body capped at 2000 chars (and non-empty). read_at NULL = unread; set by the
-- recipient calling /api/dm/read.
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz,
  CONSTRAINT messages_body_len CHECK (char_length(body) BETWEEN 1 AND 2000)
);

-- Thread paging: messages of a conversation in time order (the (conv, created_at)
-- composite serves both the newest-50 fetch and the `before` cursor scan).
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at DESC);


-- ── 3. comments: one-level replies ───────────────────────────────────────────
-- parent_comment_id NULL = a top-level comment. A reply points at its parent.
-- ONE LEVEL ONLY: a reply's parent must itself have parent_comment_id IS NULL —
-- enforced in the service layer (commentInteractions.replyToComment), not by a
-- DB trigger, to keep this migration a pure additive column.
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_comment_id);


-- ── 4. comment_likes ─────────────────────────────────────────────────────────
-- A user likes a comment at most once → composite PK (comment_id, user_id).
-- user_id here follows the SAME convention as comments.user_id / likes.user_id:
-- it stores the actor's Privy DID (text), NOT a users.id uuid. (This is the
-- app's live convention — see postsService.likePost/addComment.)
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS comment_likes_comment_idx ON comment_likes (comment_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── PRIVATE: conversations + messages — DEFAULT-DENY ─────────────────────────
-- Enable RLS and add NO permissive policy. With RLS on and zero policies, every
-- row is denied to the anon AND authenticated API keys — SELECT/INSERT/UPDATE/
-- DELETE all return nothing / fail. The service-role key (server routes only)
-- bypasses RLS entirely, so /api/dm/* is the single access path. This is the
-- privacy boundary: a leaked anon key cannot read one message.
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;

-- Belt-and-braces: an explicit deny makes the intent unmistakable in the policy
-- list (and survives someone later toggling "force RLS"). USING (false) never
-- matches a row for the anon/authenticated roles.
DROP POLICY IF EXISTS "conversations deny anon"  ON conversations;
CREATE POLICY "conversations deny anon" ON conversations
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "messages deny anon" ON messages;
CREATE POLICY "messages deny anon" ON messages
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);


-- ── PUBLIC: comment_likes — permissive, mirrors comments/likes ───────────────
-- Public read; client writes via the anon key (identity is enforced in the
-- service layer, exactly as likes/comments do today). No private data here —
-- a comment like is as public as the comment.
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes readable by all" ON comment_likes;
CREATE POLICY "comment_likes readable by all" ON comment_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "comment_likes insertable by all" ON comment_likes;
CREATE POLICY "comment_likes insertable by all" ON comment_likes
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "comment_likes deletable by all" ON comment_likes;
CREATE POLICY "comment_likes deletable by all" ON comment_likes
  FOR DELETE USING (true);

-- comments.parent_comment_id needs no policy change: replies are inserted through
-- the same permissive path as top-level comments.
