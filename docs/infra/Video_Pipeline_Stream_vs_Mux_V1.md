# Video Pipeline Scoping — Cloudflare Stream vs Mux (Brief V1)

**Status:** RESEARCH + PROPOSAL for Eric's sign-off. **No integration code** exists or is implied by this document. Eric signs off before any V2 work begins.
**Date:** 2026-07-22 · **Author:** CC (Opus 4.8)
**Prerequisite gap:** **M4's evidence table (real file sizes / codecs / volume) has NOT shipped.** Every cost figure below is built on *explicit, labelled assumptions* and a parameterised formula — drop M4's real numbers into §1.4 and the recommendation re-computes. The qualitative comparison (§1.1–1.3, 1.5) does not depend on M4.

---

## 0. Recommendation

**Adopt Cloudflare Stream.** It is the better fit for Scope's *specific* requirements — and the deciding factor is the one requirement that most distinguishes Scope: the **cinematic, high-bitrate bias**.

Why, in one paragraph: Stream bills a **flat, resolution-agnostic** rate ($5 / 1,000 min stored, $1 / 1,000 min delivered) with **free encoding and bundled egress**. Mux is cheaper *per unit at 720p/1080p* and has a generous free delivery tier, but it applies **resolution multipliers of 1.25× (1080p) → 2× (2K) → 4× (4K)** to both storage and delivery, and it **charges for encoding**. Scope's content is exactly what those multipliers punish. Stream also fully satisfies every functional requirement (tus direct-to-vendor uploads, MOV ingest, encode-complete webhooks, signed URLs, auto-thumbnails, asset DELETE) and its **two-line pricing is trivial to forecast** — which matters for a pre-revenue product.

**Mux would win only if** (a) content stays predominantly ≤1080p *and* (b) monthly delivered minutes stay under Mux's 100k free tier — i.e. permanently small. Scope's trajectory and positioning contradict both. Mux's advanced surface (Mux Data analytics, per-title encoding, mature live) is real but is **not on Scope's current need list**.

**Confidence:** medium-high on the qualitative fit; **the cost crossover is assumption-driven and must be confirmed against M4** before final sign-off. See §1.4 and the open items in §4.

### Decisions required from Eric (blocking V2)
1. **Approve the vendor** (recommend Cloudflare Stream) and the **new account + new dependency** (`tus-js-client` on the browser side; Stream needs no server SDK — it's plain REST). New deps require approval per CLAUDE.md.
2. **Confirm the DNS/CDN question** in §1.5 — is Scope's domain already on Cloudflare? If yes, Stream gains same-vendor adjacency; if no, both vendors are equally "new."
3. **Ship M4** (or approve proceeding on the assumptions in §1.4) so the cost table is real before money is committed.
4. **The `processing`-state design call** (§2.2) — a tiny Eric design decision (poster-or-placeholder + PROCESSING label).

---

## STAGE 1 — The comparison

### 1.1 Ingest

| | **Cloudflare Stream** | **Mux** |
|---|---|---|
| Direct-to-vendor upload (bypass our API) | ✅ **tus** resumable + basic direct-creator uploads; short-lived one-time upload URL minted server-side with **no bytes through our function** | ✅ **Direct Uploads** — resumable URL, client uploads straight to Mux, "no intermediary steps" |
| 4.5 MB Vercel body cap | **Non-issue** — bytes never touch our serverless function (same architecture we already use for Supabase Storage + `/api/music/sign`) | **Non-issue** — same pattern |
| iPhone **MOV** acceptance | ✅ MOV listed as a supported input | ✅ broad ingest (transcodes on the way in) |
| iPhone **HEVC / H.265** | ⚠️ **Verify.** MOV confirmed; HEVC is explicitly documented only for *live* inputs (H.264-only there). On-demand HEVC ingest is very likely (Stream transcodes arbitrary sources) but **must be confirmed with a real iPhone clip in V2's spike.** | ✅ documented broad codec support incl. HEVC |
| Resumability | ✅ tus (required >200 MB, recommended on flaky connections) | ✅ resumable/chunked |
| Max file size | **200 MB via basic** upload; **tus for larger** (so cinematic 60 s high-bitrate clips that exceed 200 MB *require the tus path* — plan for it, don't use basic) | No documented hard cap (resumable) |

**This directly fixes a live pain point.** Today Scope **rejects .mov/HEVC at upload** (`src/lib/storage.ts:74` — "not web-playable"), forcing users to pre-convert. Both vendors accept the iPhone's native format and transcode it. This is arguably the strongest *product* reason to adopt a pipeline at all, independent of cost.

### 1.2 Processing

| | **Cloudflare Stream** | **Mux** |
|---|---|---|
| Encoding cost | **Free** | **Paid** — Plus from $0.025/min (720p base), Premium from $0.0384/min; resolution raises it |
| Transcode latency (30 s–3 min clips) | Typically well under real-time for short clips; not SLA'd on the pricing page | Similar; Mux publishes "instant" perceptual start via its own ladder |
| Webhook on "ready" | ✅ webhook subscriptions "notified when a video is ready" — drives our post-state swap | ✅ `video.asset.ready` webhook, **payload carries `playback_id`** — clean for our swap |
| Poster / thumbnail | ✅ auto-generated; `thumbnailTimestampPct` to pick the frame; animated preview available | ✅ on-demand thumbnails from the asset |
| **Frees client-side frame grabs** | ✅ — retires our current client poster capture **and** the baked `autoplay_clip_url` step in `CreatePostFlow` | ✅ same |

Both **eliminate Scope's client-side poster/clip generation** — a real simplification of `CreatePostFlow` and a reliability win (no canvas/frame-grab flakiness on Safari).

### 1.3 Playback

| | **Cloudflare Stream** | **Mux** |
|---|---|---|
| Output | HLS + DASH, adaptive bitrate ladder | HLS (`.m3u8`) default, adaptive bitrate |
| **Native iOS Safari `<video>`** (no JS player) | ✅ works — HLS plays natively in the iOS `<video>` element. **This is an iOS capability, true for both.** | ✅ same |
| Non-Safari (Android Chrome, desktop) | ⚠️ **needs `hls.js`** — native HLS is Safari-only. Applies to *both* vendors. | ⚠️ same |
| Autoplay-muted / loop | ✅ standard `<video muted playsinline loop autoplay>` — our **existing W3/M4 `GradedVideo` discipline maps directly onto an HLS source** | ✅ same |
| Time-to-first-frame | Bundled CDN, segment-based; good for short clips | Mux markets low TTFF; comparable in practice |
| Signed / private URLs | ✅ `requireSignedURLs` | ✅ signed playback IDs (asset can carry both a public and a signed ID) |

**Player-library note (matters for Scope):** posts render today in a bare `<video>`. On **iOS Safari (Scope's primary PWA target) native HLS works with zero player library.** For Android/desktop parity we will need **`hls.js`** (mount it only when `!video.canPlayType('application/vnd.apple.mpegurl')`). This is a shared cost of *any* HLS pipeline, not a differentiator — but it is new client weight to budget in **V3**.

### 1.4 Cost — rate card + three volumes

**Verified rate cards (fetched 2026-07-22; see Sources):**

| | **Cloudflare Stream** | **Mux (720p base → multipliers)** |
|---|---|---|
| Encoding | **free** | Plus $0.025/min · Premium $0.0384/min (free tier available) |
| Storage / min / month | **$0.005 (flat)** | $0.0024 → ×1.25 (1080p) ×2 (2K) ×4 (4K); cold −60% |
| Delivery / min | **$0.001 (flat)** | **free ≤100k min/mo**, then $0.0008 → same resolution multipliers |
| Egress / bandwidth | **included** | included in delivery price |
| Pricing shape | 2 lines, prepaid storage in $5 blocks | multi-tier, resolution-scaled |

**Assumptions (ILLUSTRATIVE — replace with M4 + view analytics):** avg clip **0.5 min** (30 s; cap is 60 s), output treated as **1080p-class** for the Mux multiplier (×1.25). *If M4 shows 2K/4K sources, multiply every Mux storage+delivery figure by 2–4×; Stream is unchanged.*

| Scenario | Assumed library / new-per-mo / delivered-min-per-mo | **Stream / mo** | **Mux / mo (1080p)** | **Mux / mo (if 4K)** |
|---|---|---|---|---|
| **Today (~1 user)** | 50 vids · 20 new · 2,000 del-min | ~$2–7¹ | **<$0.50** (free delivery) | <$1 |
| **100 creators** | 10k vids (5k min) · 1k new · 300k del-min | ~$325 | ~$230 | ~$500–800 |
| **1,000 creators** | 100k vids (50k min) · 10k new · 5M del-min | ~$5,250 | ~$5,205 | ~$9,800–19,600 |

¹ Stream storage is prepaid in $5 blocks, so a near-empty library still floors around $5.

**Read of the table:**
- **At toy volume, Mux is cheaper** (free delivery tier + trivial storage). Not decision-relevant — both are rounding error.
- **At 1080p, the two are ~identical at scale** (delivery dominates and lands at ~$0.001/min for both).
- **At Scope's actual bias (2K/4K, high-bitrate), Mux is 2–4× Stream** on the line item that dominates the bill (delivery). **This is the whole ballgame.** Stream's flat rate is a structural hedge against exactly Scope's content.

**Formula for M4 to finalise:** `monthly = encode(new_min × enc_rate) + storage(lib_min × stor_rate) + delivery(max(0, del_min − free) × del_rate)`, with Mux's rates × resolution multiplier. Stream: `enc_rate=0`, multiplier=1, `free=0`.

### 1.5 Platform fit

| | **Cloudflare Stream** | **Mux** |
|---|---|---|
| Incumbency | New vendor to the stack (Vercel · Supabase · Privy · Base · Zora · Alchemy). **Open Q:** is our **domain/DNS already on Cloudflare?** If so, Stream is same-account-adjacent. | New vendor; video specialist |
| Webhook auth | Signed webhooks; verify signature in a service-role route (our house RLS-bypass pattern, cf. `/api/music/sign`) | Signed webhooks (`Mux-Signature` HMAC) — mature, well-documented |
| Deletion API (user deletes post → asset cleanup) | REST `DELETE` on the video resource (standard; **confirm endpoint in V2 spike** — not surfaced in the page I read) | ✅ documented `DELETE /video/v1/assets/{id}` |
| UGC terms | Standard CF terms; fine for public UGC | Explicit **"Basic" tier positioned for social/UGC**; UGC-friendly |
| DX / SDKs | Plain REST + tus; thin | Richer SDKs, Mux Data analytics, static MP4 renditions, AI captions |

**Net:** Mux is the more *featureful* video platform and has the smoother DX. Stream is the better *cost-and-simplicity* fit for a cinematic, cost-sensitive, pre-revenue product. Given Scope's requirements as written, **cost structure + format acceptance + pricing simplicity outweigh Mux's advanced features Scope isn't using.**

---

## STAGE 2 — Integration plan (paper only; for the recommended pick, Cloudflare Stream)

### 2.1 Publish flow (fire-and-forget — publish/mint NEVER blocks on processing)
1. **Client** requests a one-time **tus upload URL** from a new server route `POST /api/video/sign` (service role, **no bytes**; mirrors `/api/music/sign`). Route sets `maxDurationSeconds` + `requireSignedURLs=false` (public today).
2. **Client** uploads the raw MOV/MP4 **straight to Cloudflare** via `tus-js-client` (resumable; survives the 200 MB basic cap).
3. On upload accepted, Cloudflare returns an **asset UID**. Client creates the **post row immediately** with `video_status='processing'`, `video_asset_id=<uid>`, `media_type='video'`. **Mint/publish proceeds now** — it does not await encoding.
4. **Cloudflare webhook → `POST /api/video/webhook`** (service-role route; verify signature; RLS-bypass to write). On "ready": set `video_status='ready'`, `playback_url=<hls manifest>`, and backfill `poster_url`/`thumbnail_url` from the auto-generated thumbnail. On "error": `video_status='failed'`.

### 2.2 Feed / theatre / SR render
- `video_status='processing'` → **poster-or-placeholder + a quiet `PROCESSING` label.** *(Small Eric design call: exact placeholder + label treatment — flagged.)* The post is already live and mint-complete; only its media is pending.
- `video_status='ready'` → HLS playback via the **existing `GradedVideo` discipline** (W3/M4 rules: muted, `playsinline`, loop, in-view IntersectionObserver, iOS decode-retry) pointed at `playback_url`. Add `hls.js` only where native HLS is unsupported (§1.3).
- `video_status='failed'` → surface a re-upload affordance (§2.4).

### 2.3 Migration (backfill of existing stored videos)
- **Path:** enumerate existing `posts` where `media_type='video'` → push each stored Supabase file through **Stream's "copy from URL"** ingest (server-side, no client) → on webhook-ready, write `video_asset_id`/`playback_url`/`video_status='ready'` → *later* (rollout step 3) drop the raw file.
- **Count / GB / one-time cost: UNKNOWN — blocked on M4.** Encoding is free on Stream, so backfill cost ≈ **only the first month's storage** of the migrated minutes ($0.005/min/mo) — trivially cheap; the real cost is engineering time + a careful cutover, not vendor fees.

### 2.4 Failure modes
- **Webhook missed:** a **reconciliation cron** (we already run crons, e.g. the SR refresh) polls Stream for any post stuck `processing` > N minutes and reconciles status/URL. Idempotent.
- **Processing failed:** `video_status='failed'` → inline re-upload path; never a dead post (the row + mint already succeeded).
- **Asset deleted upstream / orphaned:** post-delete calls Stream `DELETE`; a periodic sweep reconciles posts whose asset 404s (mark `failed`, offer re-upload). Deleting a post cleans its asset.

### 2.5 Schema deltas — **SQL for Eric to run** (standing two-step inspection discipline)

**Step 1 — inspect first (run and read before altering):**
```sql
-- What video-related columns exist today?
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_name = 'posts'
  and column_name in ('video_status','video_asset_id','playback_url','poster_url','thumbnail_url','media_type')
order by column_name;
-- How many rows would a default touch?
select media_type, count(*) from posts group by media_type;
```

**Step 2 — apply (idempotent; only adds columns — nothing dropped):**
```sql
alter table posts add column if not exists video_status text not null default 'ready';
alter table posts add column if not exists video_asset_id text;
alter table posts add column if not exists playback_url  text;
-- poster_url / thumbnail_url already exist → REUSED for the Stream-generated thumbnail; no new column.

-- Existing rows are correct as 'ready' (already-playable files). New VIDEO posts are
-- written 'processing' by the client and flipped by the webhook. Images stay 'ready'.
comment on column posts.video_status is 'processing | ready | failed — video pipeline (Brief V1). Non-video + legacy rows = ready.';
```
**RLS:** the webhook writes with the **service role** (bypasses RLS) — same pattern as our other server-role routes. No new public write policy. Column adds don't change existing RLS.

### 2.6 Rollout order
1. **New uploads first** (V2 + V3): pipeline live for *new* video posts behind a flag; old posts keep the raw-file path. Validate on real iPhone clips.
2. **Backfill second** (V4): migrate existing videos; both paths coexist (render reads `playback_url` if present, else the legacy `media_urls[0]`).
3. **Old-path removal last:** once backfill is 100% and stable, retire the raw-video branch + drop the source files.

---

## 3. Risks
- **Cost model is assumption-driven** → **blocked on M4.** If M4 reveals ≤1080p content + low view volume, Mux is competitive and the recommendation should be re-litigated. *(Highest-priority open item.)*
- **HEVC-on-demand ingest on Stream unconfirmed** (§1.1) — a real iPhone clip must be run through in the V2 spike before commitment.
- **200 MB basic cap** → must use the **tus** path for large cinematic clips; do not ship the basic uploader.
- **`hls.js` for non-Safari** → new client weight + a code path in `GradedVideo` (V3).
- **Vendor lock-in / new account** → mitigated by fire-and-forget design (raw source retained until backfill step 3; reversible).
- **Webhook reliability** → mitigated by the reconciliation cron (§2.4).

## 4. Open items for Eric (before/at sign-off)
1. Approve vendor (**Stream**) + new account + `tus-js-client` dep.
2. Domain-on-Cloudflare? (§1.5)
3. Ship M4 or approve proceeding on §1.4 assumptions.
4. Confirm public-only playback for now (signed URLs deferred — both vendors support it when needed).
5. `processing`-state placeholder design call (§2.2).

## 5. Proposed brief sequence (implementation, post-sign-off)
- **V2 — Ingest + webhook:** `/api/video/sign` (tus), client resumable upload, `processing` row creation, `/api/video/webhook` → `ready`/`failed`, schema migration (§2.5), reconciliation cron. **Includes the HEVC/200 MB spike on a real device.**
- **V3 — Playback swap:** `GradedVideo` reads `playback_url`, HLS + `hls.js` fallback, `processing`/`failed` render states, retire client poster/clip generation.
- **V4 — Backfill + old-path removal:** migrate existing videos, verify, drop raw files + legacy branch.

*(CC is open to a different split — e.g. folding the `processing` render state into V2 so V3 is purely the HLS swap — Eric's call.)*

---

## Sources (fetched 2026-07-22)
- Cloudflare Stream pricing — https://developers.cloudflare.com/stream/pricing/
- Cloudflare Stream uploads (tus / direct creator / 200 MB) — https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/ · https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- Cloudflare Stream capabilities (formats, webhooks, signed URLs, thumbnails) — https://developers.cloudflare.com/stream/llms-full.txt
- Mux pricing — https://www.mux.com/pricing
- Mux direct uploads (resumable) — https://www.mux.com/docs/guides/upload-files-directly
- Mux webhooks / assets / delete — https://www.mux.com/docs/webhook-reference · https://www.mux.com/docs/api-reference/video/assets/delete-asset
