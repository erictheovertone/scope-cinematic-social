# SCOPE — SECURITY AUDIT: FINDINGS & PROGRAM
_v1 · 2026-10-24 · Prepared for Eric Brown / Muon Productions, LLC · Live system: scopeapp.world (Vercel), Supabase `brevfwazpoibobuqglxk`, Privy, Zora on Base, Stripe (live), Cloudflare Stream_

---

## 0. Executive summary

A direct inspection of the production database today (read-only queries against the live Supabase project) found that **authorization is effectively absent at the data layer**. Row Level Security is switched on for every table, but the policies on almost every table are `USING (true) WITH CHECK (true)` for the `public` role. Because Scope authenticates with Privy rather than Supabase Auth, every request from the browser reaches Postgres as the anonymous role carrying the public anon key — and the policies let that role update and delete any row.

Concretely, anyone on the internet with the anon key (which ships in the client bundle by design) can today:

- change any user's **payout wallet address** (`users.wallet_address`) and **Privy identity** (`users.privy_id`) — payout theft and account takeover;
- grant themselves **Pro membership, founding-member, top-collector, in-house-creator and screening-room status** (`profiles.*`);
- **edit or delete every post, comment, deck, profile and profile link** on the platform;
- **insert fake notifications** to any user with any sender name, avatar and message (in-app phishing);
- **delete every uploaded image and video** in storage, and **rewrite the on-chain coin metadata JSON** for any coin (name, image, description as shown in wallets and on Zora);
- read every user's **contact email (even when marked private), Stripe customer and subscription IDs, and Privy DID**.

Nothing indicates this has been exploited; the user base is small and the anon key has not been publicised beyond the app. But real money moves through these tables, and the exposure is total. **This is a P0 and it comes before every other item in the roadmap, including native.**

The root cause is architectural, so the fix has two speeds:

1. **Containment (today):** protect the identity and money columns and the storage buckets with database-side guards that do not depend on who the caller is, without breaking the app.
2. **Structural fix (this week):** give every request a verified identity — a Supabase session minted from the verified Privy token — then rewrite every policy to owner scope and move private columns out of public reach.

Everything else in this document (API routes, client, media, money paths, abuse and safety, infrastructure, process) is the full audit program that follows once the data layer is sound.

---

## 1. Threat model

**Assets, in order of blast radius**

1. Payout destinations and identity mappings (`users.wallet_address`, `users.privy_id`, `fc_rewards.holder_wallet`).
2. Membership entitlements and billing linkage (`profiles.is_paid_member`, `paid_member_until`, `stripe_*`, founding/top-collector/in-house/screening-room flags).
3. Published work and its on-chain metadata (`posts`, `coin-metadata` bucket, `post-media` bucket, `decks`).
4. Private communications (`messages`, `conversations`) and private profile fields.
5. Platform integrity (feed, notifications, follows, likes, comments) and the trust of the people testing with real money.
6. Secrets: Supabase service role, Zora API key, Stripe live keys and webhook secret, Cloudflare Stream secrets, cron/admin tokens, Privy app secret.

**Adversaries**

- Anonymous internet with the public anon key (the current gap).
- A logged-in user acting against another user (IDOR, spoofing).
- A compromised dependency or leaked secret (supply chain, git history, pasted terminals).
- Operator error (a bad migration, a policy left open, a stale bundle).

---

## 2. Findings register (verified 2026-10-24)

Severity: **P0** exploitable now for money/identity · **P1** exploitable now for data integrity or privacy · **P2** hardening with a plausible path · **P3** hygiene.

| ID | Sev | Finding | Evidence | Impact | Fix (summary) |
|---|---|---|---|---|---|
| SEC-F1 | **P0** | Write policies are `true` for `public` on: `users` (UPDATE, INSERT), `profiles` (UPDATE, INSERT), `profile_links`, `posts`, `comments`, `comment_likes`, `likes`, `follows`, `decks`, `deck_items`, `looks`, `bookmarks` (ALL), `collected_stacks` (ALL), `collected_stack_items` (ALL), `user_assets`, `notifications` (INSERT, UPDATE). Several tables carry duplicate policies (two INSERT, two UPDATE). | `pg_policies` dump, 2026-10-24 | Any caller can set any user's `wallet_address`/`privy_id`, grant themselves Pro, edit/delete all content, spoof notifications. | Containment today (§4.0); identity bridge + owner-scoped policies this week (§4.1). |
| SEC-F2 | **P0** | Storage: `anon delete post-media`, `anon delete profile-images` with `USING (bucket_id = …)` only; `coin metadata update` open to all; `anon insert post-media` / `profile-images` with no path or owner constraint. | `storage.objects` policies | Wipe all media; rewrite any coin's on-chain metadata JSON (defaces the asset in wallets and on Zora); host arbitrary files under scopeapp.world. | Drop anon DELETE and coin-metadata UPDATE today; owner-prefixed paths after the bridge; coin-metadata writes server-only. |
| SEC-F3 | **P1** | Public SELECT exposes `profiles.contact_email` (ignores `contact_email_public`), `stripe_customer_id`, `stripe_subscription_id`, `payment_method`, `paid_member_until`; `users.privy_id`. | column list + `public read` policies | PII and billing linkage harvestable with one request. | Move private columns to `profile_private` (owner-only RLS); public view exposes only public fields (§4.1). |
| SEC-F4 | **P1** | `messages`/`conversations` deny anon and authenticated — correct — which means DMs are read and written through server routes with the service role. Those routes are now the sole authorization point for private messages and must be audited for IDOR (§4.2). | policies `USING (false)` | If any DM route trusts a client-supplied user id, DMs are readable cross-user. | SEC-2 audit; enforce verified identity in every DM route. |
| SEC-F5 | **P2** | Fail-open limit triggers: `enforce_post_limit` returns `NEW` on any unexpected error; all limit/entitlement checks rely on client-writable columns today. | trigger source (X1) | Limits bypassable; moot until F1 is fixed, then re-verify. | After the bridge, re-test limits with a non-Pro account; make the trigger fail closed on policy errors. |
| SEC-F6 | **P2** | Secrets hygiene: `STREAM_WEBHOOK_SECRET` was pasted into a terminal during V3; `?debug=crop/video/viewport` overlays reachable in production. | project history | Secret may be in shell history/logs; debug overlays leak internals and are a social-engineering aid. | Rotate the Stream webhook secret; gate debug overlays behind a build flag or allowlisted users. |
| SEC-F7 | **P3** | Five functions with mutable `search_path` (`handle_updated_at`, `is_pro_member`, `enforce_*`); `handle_history` and `screening_room_lock` have RLS with no policies (deny-all, acceptable). | Supabase security advisor | Search-path hijack is theoretical here (no SECURITY DEFINER functions). | `ALTER FUNCTION … SET search_path = public, pg_temp` in the same migration as §4.1. |
| SEC-F8 | **P3** | Email: `_dmarc` on muon.film is absent; scopeapp.world unverified. | NameSilo DNS dump | Domain spoofing in phishing against users. | Add DMARC `p=quarantine` with `rua=`, both domains; verify SPF/DKIM on scopeapp.world. |

Unverified today (in the audit program, §4.2–4.7): API routes and webhooks, client XSS/CSP/headers, media pipeline, Stripe/Zora money paths, abuse and safety controls, infrastructure and account security, dependency state.

**Verification note (CC, 2026-10-25, re-ran against live `brevfwazpoibobuqglxk`):** the `pg_policies`, `storage.objects`, and security-advisor dumps match §2 as recorded, with three additions that do not change any severity:
- **`bookmarks`** — the sole policy is named `bookmarks_owner_only` but is `cmd=ALL, USING (true) WITH CHECK (true)` for `public`: fully open despite the name. It is correctly counted under SEC-F1; the name must not be read as "already owner-scoped" during the §4.1 rewrite.
- **`users`** — in addition to the duplicate INSERT/UPDATE noted in SEC-F1, it also carries **duplicate SELECT** policies (`Users are publicly readable` + `public read users`). One more pair to collapse in the §4.1 dedup.
- **`tracks`** — a table not in the register: public SELECT gated `status = 'approved'`, **no** public write policy (no write exposure). Add to the SEC-2 read-surface enumeration; not a SEC-F1 item.

---

## 3. Root cause

Scope uses **Privy** for login and embedded wallets. Supabase's RLS can only enforce per-user rules when the request carries a Supabase-verifiable identity (`auth.uid()`). Browser requests carry only the anon key, so there is no identity to check — and at some point the write policies were opened to `true` so the app would work. Every finding in SEC-F1/F2/F3 descends from that.

The fix is an **identity bridge**: a verified Privy token becomes a Supabase session, so every row can be scoped to its owner.

---

## 4. Remediation plan

### Rules of engagement (binding for every SEC brief)

Every security change leaves the app **pixel-identical and behavior-identical for every legitimate action a user can take today**. The only outcome that may change is that forged requests — operations no real user performs through the interface — are denied. If a fix would require changing what a user sees, taps, or gets, it is not a security fix; it returns to Eric as a product decision first.

The one permitted internal change: a legitimate flow that is *implemented* insecurely (for example, a membership flag written from the browser) is re-plumbed server-side with no visible difference to the user.

Evidence gates required to close any SEC brief:

1. **Visual** — screenshot diff, dark and light, 375 and desktop, every harness surface, before vs after: zero pixel difference.
2. **Behavioral** — the scripted regression list green before and after: post, edit, delete own post, comment, like, follow, edit bio and links, decks, bookmark, look, collect, mint, DM, notifications, membership purchase (both rails), upload, onboarding.
3. **Negative** — anon-key smoke tests proving forged requests are denied; this is the only line permitted to change from "succeeds" to "denied."
4. **Staging** — policy changes rehearsed on a Supabase preview branch with seeded data before production; every policy flip behind a flag with its rollback written beside it.
5. **Data** — migrations additive first (new table, backfill, dual-read), then switched; nothing dropped until the new path is verified.

Every SEC brief opens with: *"Rules of engagement: security-audit.md §4 — zero visible or functional change for legitimate users; evidence gates 1–5 required to close."*


### 4.0 Phase 0 — Containment (today; Eric runs the SQL, CC writes it after a 30-minute trace)

Guards that do not depend on caller identity, so the app keeps working while the bridge is built:

1. **`users`**: a `BEFORE UPDATE` trigger that rejects any change to `privy_id` (always) and any change to `wallet_address` once it is non-null (first set from NULL remains allowed, which is what onboarding does). Service-role sessions (`request.jwt.claims ->> 'role' = 'service_role'`) are exempt so server jobs still work.
2. **`profiles`**: `REVOKE UPDATE (is_paid_member, paid_member_until, payment_method, stripe_customer_id, stripe_subscription_id, membership_cancels_at, is_founding_member, founding_member_number, is_top_collector, is_in_house_creator, is_screening_room_holder, srh_count, portfolio_mc) ON profiles FROM anon, authenticated;` — only after CC confirms the Stripe webhook and the crypto-membership flow write these with the service role. If the crypto membership flow writes `is_paid_member` from the client, that flow is itself exploitable and must move server-side before this revoke; CC decides the order in the trace.
3. **Storage**: `DROP POLICY "anon delete post-media"`, `DROP POLICY "anon delete profile-images"`, `DROP POLICY "coin metadata update"` (and `"coin metadata insert"` if the server writes metadata). Media deletion and metadata writes move to server routes (they likely already are; CC confirms).
4. **Integrity check** (read-only): compare every `users.wallet_address` to the user's Privy embedded-wallet address via the Privy server API; list profiles with any entitlement flag true and compare to Stripe/known state (expected: 1 Pro); list posts/comments/profiles with `updated_at` later than the owner's last session; list storage objects deleted in the last 60 days if logs allow. Report anomalies before anything else.
5. **Rotate** `STREAM_WEBHOOK_SECRET`. Mark every secret in Vercel as Sensitive.

Phase 0 reduces the P0 to "anyone can still vandalise content" — unacceptable, but no longer "anyone can take the money."

### 4.1 Phase 1 — Identity bridge and owner-scoped policies (this week)

**Mechanism (CC verifies the current Supabase docs for the preferred path):**

- Preferred: Supabase **third-party auth** configured to accept Privy's JWTs directly (Privy publishes a JWKS; if Supabase's third-party auth supports a custom issuer/JWKS, no minting is required).
- Otherwise: a Next.js route verifies the Privy access token server-side (`@privy-io/server-auth`) and mints a short-lived Supabase JWT (`sub` = the user's Supabase UUID, `role` = `authenticated`, 15-minute expiry, refreshed silently). The browser's `supabase-js` client is created with that token (`accessToken` option), so `auth.uid()` resolves to the user's UUID in every policy.

**Policies, rewritten table by table — the rule set:**

- Owner-scoped writes everywhere: `WITH CHECK (user_id = auth.uid())` on INSERT, `USING (user_id = auth.uid())` on UPDATE/DELETE; `anon` gets no write anywhere.
- `users`: UPDATE own row only; `privy_id` and `wallet_address` changes remain trigger-guarded (server-only after first set).
- `profiles`: split. Public view/table keeps display fields; `profile_private` (contact_email, stripe_*, payment_method, membership timestamps, entitlement flags) is owner-read, server-write.
- `posts`, `comments`, `decks`, `deck_items`, `profile_links`, `likes`, `follows`, `bookmarks`, `looks`, `collected_stacks(_items)`, `user_assets`: owner-scoped; public read where the product intends it (likes/follows counts can stay readable; bookmarks and looks should be owner-read only).
- `notifications`: INSERT via server or trigger only; recipient-only SELECT/UPDATE; `recipient_id`/`sender_id` become UUIDs with foreign keys (today they are text).
- `coin_market_data`, `fc_rewards`, `fc_payout_runs`, `first_cut_awards`, `top_collectors`, `screening_room`: server-write only; public read where intended; `fc_rewards.holder_wallet` readable only by the holder.
- Storage: object paths are `{bucket}/{user_id}/…`; INSERT/UPDATE/DELETE require `auth.uid()::text = (storage.foldername(name))[1]`; `coin-metadata` is server-write only; public read stays for post-media/profile-images/music.
- Remove duplicate policies; `ALTER FUNCTION … SET search_path`.
- **Regression gate:** a CI test that dumps `pg_policies` and fails the build if any non-SELECT policy has `qual`/`with_check` equal to `true`, or any policy grants writes to `anon`.

**Migration order:** bridge ships behind a flag → client writes verified working with the new session → policies flipped in one migration during a quiet hour → anon-key smoke test proves every write is denied → flag removed.

### 4.2 Phase 2 — Full audit program (the following two weeks; one brief per surface)

**SEC-2 · API routes, webhooks, secrets**
Enumerate every route under `/api`. For each: who may call it (verified Privy identity, cron secret, webhook signature, or public), what it trusts from the request, and what it does with the service role. Specific checks: Stripe webhook signature verification and idempotency (event id store); Cloudflare Stream webhook signature + replay window; cron endpoints reject without `CRON_SECRET`; reconcile/admin endpoints use `RECONCILE_ADMIN_TOKEN`, never the webhook secret; the Zora proxy allows only the paths the app uses and never forwards client-chosen headers; no route accepts a user id from the body where the session already knows it (IDOR); DM routes (SEC-F4) scope every read to a conversation the caller belongs to; rate limits on write routes (Vercel WAF or Upstash); `NEXT_PUBLIC_` inventory — nothing secret; `ZORA_API_KEY` and the service role key confirmed absent from the client bundle (grep the built `.next/static`); git history scan with gitleaks; `.env*` never committed; Vercel env parity.

**SEC-3 · Client: XSS, links, headers**
Every place user text renders (bio, short_bio, captions, comments, DM bodies, usernames, link labels, deck titles, track titles): confirm React escaping, no `dangerouslySetInnerHTML` on user content, markdown (if any) sanitised. Links (`website_url`, `profile_links`, `more_from`): allowlist `https:` only, reject `javascript:`/`data:`, `rel="noopener noreferrer"`, no open redirects through app routes. Security headers on every response: `Content-Security-Policy` (start report-only, then enforce; allow Privy's iframe origin, Supabase, Cloudflare Stream, Zora), `Strict-Transport-Security` with preload, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'` (except where Privy needs otherwise). Debug overlays gated. Clickjacking on the collect/mint sheets specifically.

**SEC-4 · Media pipeline and privacy**
Uploads: server-side type sniffing (not just MIME), size caps enforced server-side, image decode limits (pixel bombs) in sharp, **EXIF stripped on every image — GPS especially** (a creator's home location must never ship in a post), HEIC handling. Cloudflare Stream: who can request a direct-upload URL (verified users, rate-limited); whether playback uses signed URLs or public ids; deleted posts delete their Stream asset and storage objects (required for DMCA takedowns to mean anything); thumbnails/posters purged. Storage public buckets reviewed against the product intent.

**SEC-5 · Money paths**
Membership: state changes only from Stripe webhooks or a server-verified on-chain payment, never from the client; Stripe price ids server-side; subscription cancel/renew paths; the crypto membership flow verifies the USDC transfer on Base (amount, token, recipient = treasury, tx finality) before granting. Zora: coin creation params that the server fixes (platform referral, payout recipient = the creator's verified embedded wallet), slippage/amount handling in collect, error handling that never shows economics it cannot verify (dash rule), `coin_market_data` written only by the server job. First Cut payouts: `fc_rewards.holder_wallet` is bound at accrual to a wallet the server verified; payout job reads from server-trusted data only; dry-run and cap per run; a kill switch. Reconcile and backfill jobs idempotent. Audit log table for every money event (who, what, before/after, tx hash), append-only, owner-read.

**SEC-6 · Abuse, safety, and store compliance**
Rate limits: posts, comments, likes, follows, DMs, uploads, notifications (server-side). **Block and report** users and content — required by App Store Guideline 1.2 for UGC apps and by Play policy; a reports table with a review queue. **CSAM**: Cloudflare's CSAM Scanning Tool on the zone, or a hash-matching service, with a documented escalation path; required before public launch. Spam/bot signup controls at the Privy layer. Account deletion (self-serve, App Store requires it) and data export. Age gate consistent with the 17+ rating. Moderation playbook: takedown, DMCA counter-notice, repeat-infringer tracking (the L2 policy).

**SEC-7 · Infrastructure, accounts, dependencies, backups**
Hardware-key or app 2FA on: Vercel, Supabase, Cloudflare, Stripe, Privy, GitHub, Zoho, NameSilo, Apple, Google Play, Coinbase. NameSilo: registrar lock on both domains, DNSSEC where supported, CAA records. Vercel: deployment protection on previews, preview environments use non-production Supabase keys (or none), Firewall/WAF rules and bot protection on, Attack Challenge Mode available. Supabase: PITR enabled on Pro, a restore drill done once, SSL enforced, network restrictions if the DB is ever exposed, API keys rotated to the new publishable/secret format, read-only role for health reports. Dependencies: `npm audit` high/critical blocking in CI, Dependabot or Renovate, Next.js at a version past the 2025 middleware authorization bypass (CVE-2025-29927) and current patch, `hls.js`/`sharp`/`viem` current. Logging: an error beacon (the largest observability gap), alerts on webhook failures, mint failures, mass deletes, payout anomalies; Supabase log retention.

---

## 5. Maintenance program (ongoing)

| Cadence | Action | Owner |
|---|---|---|
| Every deploy (CI) | RLS policy snapshot test (no `true` write policies, no anon writes) · secret scan · `npm audit` high/critical · canvas `var()` lint · build stamp | CC / CI |
| Weekly | Supabase security + performance advisors; Vercel runtime errors review; webhook failure count | Eric (5 min) via the daily health brief |
| Monthly | Dependency updates merged; review new API routes against SEC-2 rules; review `pg_policies` diff | CC brief |
| Quarterly | Rotate: Stripe webhook secret, Stream secrets, cron/admin tokens, Zora key, Supabase service key (re-deploy); review 2FA and access on all accounts; restore drill | Eric + CC |
| Before App Store submission | External penetration test or a second independent audit pass; CSAM scanning live; block/report live; account deletion live | Eric |
| On any incident | Runbook: revoke/rotate affected keys → disable affected routes (flag) → assess blast radius from logs/audit table → notify affected users within 72h → post-mortem to this document | Eric |

**Severity SLAs:** P0 contained within 24h and fixed within 7 days · P1 within 14 days · P2 within 30 days · P3 next maintenance window.

---

## 6. Order of operations

1. **SEC-0** (today): trace client writes → containment SQL → integrity check → rotate Stream secret.
2. **SEC-1** (this week): identity bridge → owner-scoped policies → policy regression gate → anon smoke test.
3. **SEC-2 → SEC-7** (two weeks, one brief each), findings appended to §2 of this document with status.
4. Resume the product roadmap (M21 launch screen, P4b paint-before-auth, native N1) once SEC-1 is verified. P4b in particular depends on SEC-1: the public feed read is safe only once the write side is closed.

_This document is the register. Every finding gets a status line (Open · Contained · Fixed · Verified) and the commit that closed it._
