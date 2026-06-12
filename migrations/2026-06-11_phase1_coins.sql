-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Coin migration (1155 → Zora createCoin)
-- Scope_Economy.docx §9 · proposal docs/economy/Phase1_Coin_Migration_Proposal.md §3
--
-- RUN MANUALLY in the Supabase SQL editor. Do NOT auto-run.
-- Additive + idempotent: safe to re-run; legacy rows are untouched.
-- The legacy 1155 columns (contract_address / token_id / tx_hash / is_minted)
-- are kept — they describe legacy collectibles and drive legacy detection.
-- ─────────────────────────────────────────────────────────────────────────────

-- Coin identity / market columns.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_address    text;        -- ERC-20 coin contract (NULL = not a coin / not yet created)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ticker          text;        -- creator-assigned symbol (3–6 chars, [A-Z0-9])
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_tx_hash    text;        -- createCoin tx (persisted optimistically for reconciliation)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_currency   text;        -- pool base currency actually used (ETH | ZORA | …) — audit
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_created_at timestamptz; -- when the coin confirmed

-- Token standard: 'erc1155' (legacy) | 'coin' (Phase 1+). Existing rows default
-- to legacy; new coin posts set 'coin' once the coin confirms.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS token_standard  text NOT NULL DEFAULT 'erc1155';

-- Fast lookup of coin posts for market surfaces (the legacy gate keys on this).
CREATE INDEX IF NOT EXISTS idx_posts_coin_address
  ON posts(coin_address) WHERE coin_address IS NOT NULL;

-- One coin per address — the backstop against a double-create on retry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_posts_coin_address
  ON posts(coin_address) WHERE coin_address IS NOT NULL;
