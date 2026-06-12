# Phase 1 Migration Proposal — 1155 → Zora `createCoin`

**Status:** PROPOSAL for Eric's review. No mint-flow code changes are included or implied by this document.
**Conforms to:** Scope_Economy.docx §9 (ratified rails path) + §5 (token mechanics).
**Date:** 2026-06-11 · **Network:** Base mainnet (8453), production.

---

## 0. Summary & what this changes

Today every post mints a **Zora 1155 collectible** (`createCreatorClient.create1155`, `src/lib/zora.ts:91`, invoked from `CreatePostFlow.tsx:785`). 1155s have no market, no MC, no %-volume fee — nothing for the economy to attach to.

Phase 1 switches **new** posts to a **Zora Coin** (`createCoin`), with **Scope set as `platformReferrer`**. This is config on Zora's *audited* contracts — **no custom contract, zero novel contract risk** (§9). It turns on, natively and immediately: Scope's 0.2% referral revenue, the creator's native 0.5% + 1% allocation, tickers, AMM liquidity, MC, and $-priced reads. The 4%/five-way split and the extra creator/pool streams remain **Phase 1.5** (thin router + MerkleDistributor) and are **out of scope here**.

### Decisions required from Eric before implementation (blocking)
1. **`platformReferrer` address** — PERMANENT per coin, immutable for the coin's life. Candidate: the existing Scope treasury `0xEEb05D9aa4B73af461E820CCC6BA5d97c64cC1c5` (used today for Pro payments, `MembershipSheet.tsx:11`). **Confirm this is the intended forever-recipient, or supply a dedicated referrer wallet.** Recommend storing in env, not hardcoded.
2. **New dependency** — `@zoralabs/coins-sdk` must be added (we ship `@zoralabs/protocol-sdk@^0.13.21` only). CLAUDE.md forbids new deps without approval. **Approve the add.**
3. **Pool/base currency** — `createCoin` requires `currency` (see §1). Choice affects liquidity pairing and routing. Recommendation + open question in §1.4.

---

## 1. The exact `createCoin` call (line by line)

New module `src/lib/zoraCoins.ts`, function `createScopeCoin()`, replacing `mintNewPost()` for new posts. Signature shapes below are pinned to the **current** `@zoralabs/coins-sdk`; exact field names (`payoutRecipientOverride` vs `payoutRecipient`, `metadata` object vs `uri`, `initialPurchaseWei`) **must be re-confirmed against the installed package version at implementation** — the SDK has renamed these across versions (`initialPurchase`→`initialPurchaseWei`, `DeployCurrency` removed).

```ts
import { createCoin, DeployCurrency } from "@zoralabs/coins-sdk";
import { base } from "viem/chains";

// PERMANENT, immutable per coin — env, never inline. Decision (0.1).
const SCOPE_PLATFORM_REFERRER =
  process.env.NEXT_PUBLIC_SCOPE_PLATFORM_REFERRER as `0x${string}`;

export async function createScopeCoin({
  walletClient, publicClient,
  creatorAddress,            // Privy embedded wallet (CreatePostFlow.tsx:787)
  name,                      // post title / caption-derived
  symbol,                    // TICKER — creator-assigned, §4 below
  metadataUri,              // https URI to coin metadata JSON (§1.3)
  initialPurchaseWei = 0n,   // optional creator self-buy (§2)
}: { /* …types… */ }) {
  const args = {
    creator:           creatorAddress,                 // required — owner/creator
    name,                                              // required — coin name
    symbol,                                            // required — TICKER (verified settable)
    metadata:          { type: "RAW_URI", uri: metadataUri }, // required
    currency:          DeployCurrency.ETH,             // required — pool base (§1.4)
    chainId:           base.id,                        // 8453 (default, set explicitly)
    platformReferrer:  SCOPE_PLATFORM_REFERRER,        // ← Scope's permanent 0.2%
    payoutRecipientOverride: creatorAddress,           // creator receives native 0.5% + allocation
    // initialPurchaseWei,                             // self-buy, only if > 0 (§2)
    // startingMarketCap: "LOW",                       // default LOW; ratify if HIGH wanted
  } as const;

  const result = await createCoin({ call: args, walletClient, publicClient });
  // result → { hash, address (coin address), deployment }
  return { coinAddress: result.address, hash: result.hash };
}
```

**Field-by-field, mapped to today's flow:**
- `creator` / `payoutRecipientOverride` → `embeddedWallet.address` (the Privy creator wallet already used at `CreatePostFlow.tsx:787`). Payout = creator so the native creator share + 1% allocation land on the creator (§2).
- `name` → post title (today `pendingMintData.postCaption || 'Scope Post'`, `CreatePostFlow.tsx:789`).
- `symbol` → **new** ticker input (§4). Verified: `symbol` is a required, creator-controllable param (Phase 0 finding, confirmed in SDK signature).
- `metadata.uri` → §1.3.
- `currency` → §1.4 (ratify).
- `platformReferrer` → §0.1 (ratify); **this is the whole point — it is how Scope earns 0.2% natively, forever, per coin.**

### 1.3 Metadata / URI
Today `mintNewPost` builds a `data:application/json;base64,…` URI (`zora.ts:88-89`). Zora coin metadata validation may reject data URIs. **Proposal:** build a coin-metadata JSON (`{ name, description, image, content, properties }`) and upload it to the existing `post-media` Supabase bucket; pass its **public https URL** as `metadataUri`. Fallback: `skipMetadataValidation: true` if validation blocks a valid-but-unrecognized URI. `image`/`content` reference the post's already-uploaded media URL — no new storage path.

### 1.4 Currency (OPEN — ratify)
SDK `currency` options: `"ETH" | "ZORA" | "CREATOR_COIN" | "CREATOR_COIN_OR_ZORA"`. This sets the coin's **pool pairing**, not the trade-time payment asset (USDC/ETH selection is handled by `tradeCoin` routing — verified in the CollectSheet work). **Recommendation:** `ETH` — simplest pairing, broad onramp compatibility, clean $-display via an ETH/USD oracle, and "tradable from the first dollar" (§5) holds. **Caveat to verify at build:** current Zora *content coins* may require pairing against a Creator Coin or ZORA; if `ETH` isn't valid for content coins, fall back to `ZORA`. **Eric ratifies once we confirm which the live factory accepts for our coin type.**

---

## 2. Creator allocation (native 1%) + self-buy

- **Native allocation:** Zora mints the creator **10,000,000 base tokens = 1% of the fixed 1B supply = 100 "pieces"** at creation, to the `creator`/payout address. This **matches the design exactly** (§5: "Creator allocation — 1% of supply (100 tokens)… matches Zora's own 1% convention"). No extra param — it is protocol behavior. We **verify on-chain** post-deploy (balance of creator == 10M base) in the rollout test (§7).
- **Self-buy (optional, at creation):** supported via `initialPurchaseWei` — currency (per §1.4) in wei the creator spends to buy *more* of their own coin at the curve price at t0, paying like anyone (§5: "no free mega-allocations"). 
  - **Post-flow exposure:** add an optional, default-off control on the mint step — "Back your post" with a $ amount (dollar-led, consistent with the economy). If > 0, convert $→wei (same oracle as display) and pass as `initialPurchaseWei`; the creator's wallet must hold the funds (reuse the existing balance check + FUND WALLET path from `MintPromptSheet.tsx:26-53`). If 0/omitted, behaves exactly as a normal create.
  - Creator holdings (allocation + self-buy) are public on the post per the legibility law (§5) — surfaced later via the existing market read path, no new work here.
- **FIRST CUT exclusion:** the creator is excluded from FIRST CUT on their own post (§4/§5). This is **off-chain indexer policy** (the indexer ignores the creator address when assigning the first-10 external slots) — not a `createCoin` param, noted here only so the allocation/self-buy don't get mistaken for a founding slot.

---

## 3. Schema (idempotent SQL — for review, NOT auto-run)

Additive only; legacy rows untouched. `contract_address`/`token_id`/`tx_hash`/`is_minted` stay (they describe legacy 1155s and remain valid for detection, §6).

```sql
-- Phase 1: coin columns on posts. Idempotent; safe to re-run.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_address   text;     -- ERC-20 coin contract (null = not a coin)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ticker         text;     -- creator-assigned symbol (3–6 chars)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_tx_hash   text;     -- createCoin tx
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_currency  text;     -- pool base currency used (audit)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS coin_created_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS token_standard text NOT NULL DEFAULT 'erc1155';
  -- 'erc1155' (legacy) | 'coin'. New coin posts set 'coin'. Existing rows default to legacy.

-- Fast lookup of coin posts (market surfaces) and idempotent retry by address.
CREATE INDEX IF NOT EXISTS idx_posts_coin_address ON posts(coin_address) WHERE coin_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_posts_coin_address ON posts(coin_address) WHERE coin_address IS NOT NULL;
```

`postsService.updatePostMintData` gets a sibling `updatePostCoinData(postId, { coin_address, ticker, coin_tx_hash, coin_currency, token_standard:'coin', coin_created_at })`. No write path is changed in this document — this is the proposed shape.

---

## 4. Ticker UX (post flow)

- **Where:** a new field on the mint step of `CreatePostFlow` (the step that currently shows the post title), shown alongside the existing caption.
- **Auto-suggestion:** derive from the caption — uppercase, strip non-alphanumerics, take a 3–6 char slug (e.g. caption "Night Shift" → `NIGHT` or `NGHT`). Pure client function; no network.
- **Editable:** prefilled, fully overwritable by the creator (§5: "creator-assigned… auto-suggestion they can overwrite"). Another moment of authorship.
- **Validation:** 3–6 chars, `[A-Z0-9]`, uppercased on input; inline error (never `alert()`), consistent with house rules. Uniqueness is **not** enforced on-chain (Zora allows duplicate symbols); we do not block on collision.
- **Stored:** `posts.ticker`; passed as `symbol` to `createScopeCoin`.

---

## 5. Failure handling (must not strand or lose the post)

**Mirror today's resilience exactly.** Current order (`CreatePostFlow.tsx`): the post row is **created and persisted first** (`handlePost`), the chain step runs **after** (`handleDoMint`, line 768), and on failure it sets `mintStatus='mint-failed'` then still `completeFlow()` (line 802-806) — the post survives with `is_minted=false`. We keep this contract:

1. **Post persists first.** `createPost` is unchanged and runs before any coin call. A `createCoin` failure can **never** lose the post.
2. **Coin step is post-hoc and isolated.** On `createCoin` throw → set a `coin-failed` status (analogous to `mint-failed`), surface an inline, loud error (GATE-B style, `CreatePostFlow.tsx:744`), and still complete the flow. The post is live; `coin_address` stays null; `token_standard` stays `'erc1155'`/unset until success.
3. **Idempotent retry from profile.** The post is in a "coin pending" state (no `coin_address`). Provide a **"Create coin" retry action** on the author's own unminted post (the existing copy already promises this — `MintPromptSheet.tsx:191` "YOU CAN ALWAYS MINT LATER FROM YOUR PROFILE"; today that retry isn't fully wired — Phase 1 wires it for coins). Retry re-runs `createScopeCoin`; the unique index on `coin_address` (§3) prevents a double-write if a prior tx actually landed.
4. **Confirm-before-write safety.** Reuse the pre-flight balance check (`MintPromptSheet.tsx:36-46`) so a creator without gas/funds is routed to FUND WALLET instead of a failed tx.
5. **Partial-success guard.** If `createCoin` mines but the DB write fails, the coin exists on-chain but the row lacks `coin_address`. Recovery: retry detects the on-chain coin via the deterministic deploy/tx and back-fills (or the creator re-runs; unique index blocks duplicates). Specify a reconciliation read in the retry path.

---

## 6. The old 1155 path + legacy posts

- **Recommendation: make the 1155 path DORMANT, not deleted.** Keep `mintNewPost`/`collectPost` in `zora.ts` intact but **unreferenced** by the new-post flow (new posts call `createScopeCoin`). Rationale: (a) zero risk to the working code while the coin flow proves out on mainnet; (b) instant rollback (flip the flow back) if anything regresses; (c) legacy 1155 posts still read through the existing functions. Delete only after the coin flow is verified stable in production. (Mainnet = production; we don't burn the lifeboat on day one.)
- **Legacy detection (no market surfaces for 1155s):** a post is a **coin** iff `token_standard='coin'` AND `coin_address IS NOT NULL`. All market surfaces (CollectSheetV2, MC/price reads, First Cut, the boundary's `getPostMarket`) gate on **`coin_address` presence**, not the old `is_minted`. Legacy 1155 posts (`is_minted=true`, `contract_address` set, `coin_address` null) therefore show **no** market UI — exactly as required (§9: "legacy 1155 posts remain collectibles without markets"). The economy `EconomyProvider` boundary is the single place this gate lives; legacy posts simply never get a market read.
- **Graph was empty at cutover** (§9) — so no legacy coin markets are lost; the cost is zero.

---

## 7. Rollout / test sequence (on-chain verification before "done")

Staged, on mainnet, smallest blast radius first:

1. **Config gate.** Add `@zoralabs/coins-sdk` (approved, §0.2); set `NEXT_PUBLIC_SCOPE_PLATFORM_REFERRER` (ratified address, §0.1); confirm `currency` choice (§1.4) against the live factory with a single throwaway create on a burner.
2. **First mint (Eric's wallet).** Create ONE coin via the new flow with a tiny/zero self-buy. Capture `coin_address` + tx.
3. **On-chain verification checklist (before calling it done):**
   - **platformReferrer** — read the coin/market config and confirm the referrer == the Scope address, and that it is immutable (re-read; attempt nothing that could change it).
   - **Creator allocation** — `balanceOf(creator)` == 10,000,000 base tokens (100 pieces / 1%).
   - **Pool / liquidity** — the Uniswap-V4 pool exists and the coin is **tradable from the first dollar** (do a minimal buy from a *second* wallet; confirm price moves up the curve).
   - **Ticker** — on-chain `symbol()` == the creator-entered ticker.
   - **Referral accrual** — execute one buy + one sell from external wallets; confirm Scope's 0.2% referral and the creator's 0.5% accrue/claimable (per the verified rewards split).
   - **$ read path** — confirm price/MC/holders render in dollars via the boundary swap (the UI skeleton already expects exactly these reads).
4. **Failure drill.** Force a `createCoin` revert (e.g., bad params on a burner) and confirm: post persists, inline error shows, retry from profile succeeds, unique index blocks a double-create.
5. **Legacy check.** Confirm an existing 1155 post shows **no** market surfaces under the new gate.
6. **Limited rollout.** Enable the coin flow for a small allowlist (closed beta, §2 "filmmakers collecting each other"), watch referral/creator accrual for a few days, then open up.
7. **Decommission lifeboat.** Only after stable production use, remove the dormant 1155 path (§6).

---

## 8. Out of scope (explicitly NOT Phase 1)
- The 4% fee and five-way split, creator top-up to 1.5%, FIRST CUT 0.5%, Top 1k 1.0%, Augmented 0.5%, Scope 0.5% → **Phase 1.5** thin router + MerkleDistributor.
- On-chain hold-all enforcement, literal 10k supply → Phase 2 only if triggered (§9).
- The trade indexer (FIRST CUT provenance) is a Phase 1 sibling workstream but not part of this mint-flow proposal.

## 9. Ratification checklist for Eric
- [ ] `platformReferrer` address (permanent) — treasury `0xEEb0…C1c5` or dedicated wallet?
- [ ] Approve adding `@zoralabs/coins-sdk`.
- [ ] Pool `currency` (ETH recommended; ZORA fallback) — ratify after live-factory check.
- [ ] `startingMarketCap` LOW (default) vs HIGH.
- [ ] Self-buy control copy/placement ("Back your post") — ship in Phase 1 or defer?
- [ ] Confirm `posts` schema additions (§3) before I prepare the migration.
