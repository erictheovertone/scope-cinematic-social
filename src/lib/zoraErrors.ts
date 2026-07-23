// ── Honest classification of Zora failures ───────────────────────────────────
//
// Brief Z2 §3, closing Z1's step 4.
//
// WHAT WAS WRONG. coins-sdk's createCoinCall discards the HTTP response and
// throws one constant string — "Failed to create content calldata" — for every
// possible cause. CreatePostFlow then regex-matched that constant and reported
// "Zora's service is having trouble." So a rate limit, a rejected key, bad
// metadata and a genuine outage all rendered as the same sentence, and that
// sentence was a guess. It cost us an entire investigation (Z1).
//
// WHAT MAKES CLASSIFICATION POSSIBLE NOW. The evidence tap in zoraCoins.ts sits
// BELOW the SDK, at the fetch layer, where the real response still exists. It
// records the status/body/endpoint of any failing Zora call into the slot below.
// Because the tap is scoped around exactly one awaited SDK call, whatever it
// records during that window IS that call's failure.
//
// THE RULE: the outage message is reserved for 5xx and network-class evidence.
// Never a default, never a fallback, never a guess. If we don't know, we say the
// honest thing and show the real message we do have.

/** What actually went wrong, by evidence — not by string-matching. */
export type ZoraFailureKind =
  | "rate-limit"  // 429 — we're being throttled; waiting genuinely helps
  | "auth"        // 401/403 — key rejected/missing; a Scope-side fix, not a retry
  | "outage"      // 5xx or couldn't reach Zora at all — the ONLY honest "outage"
  | "request"     // other 4xx — Zora refused THIS request (bad metadata, etc.)
  | "chain"       // reverted / insufficient funds — on-chain, not Zora's API
  | "unknown";    // no evidence — say so, show the real message

export interface ZoraApiFailure {
  status: number;
  body: string;
  url: string;
  keyed: boolean | "unknown";
  at: number;
}

export interface ZoraClassification {
  kind: ZoraFailureKind;
  /** User-facing sentence. Plain English, no raw technical strings. */
  message: string;
  /** Is retrying the SAME action plausibly useful to the user right now? */
  retryable: boolean;
  /** The evidence this verdict rests on — for logs, not for the user. */
  evidence: string;
}

// ── The observed-failure slot ────────────────────────────────────────────────
//
// Written by the evidence tap, read once by the classifier. Deliberately
// single-slot and short-lived: a stale record must never be attributed to a
// later failure, which would be exactly the mistake this brief is fixing.
const EVIDENCE_TTL_MS = 30_000;
let lastFailure: ZoraApiFailure | null = null;

export function recordZoraApiFailure(f: ZoraApiFailure): void {
  lastFailure = f;
}

/** Consume the recorded failure if it's fresh. Consuming (not just reading)
    prevents one response from explaining two unrelated errors. */
export function takeZoraApiFailure(now = Date.now()): ZoraApiFailure | null {
  const f = lastFailure;
  lastFailure = null;
  if (!f) return null;
  return now - f.at <= EVIDENCE_TTL_MS ? f : null;
}

export function clearZoraApiFailure(): void {
  lastFailure = null;
}

// ── Chain-side errors (not Zora's API at all) ────────────────────────────────
const CHAIN_PATTERNS = /reverted|insufficient funds|insufficient balance|out of gas|nonce too low|user rejected|user denied/i;

/**
 * Classify a thrown Zora failure using the strongest evidence available:
 * the observed HTTP response first, then the SDK's own attached error body,
 * then the message. Returns a verdict that is honest about not knowing.
 *
 * @param err     the thrown error
 * @param opts.action  what the user was doing — shapes the retry guidance
 */
export function classifyZoraFailure(
  err: unknown,
  opts: { action?: "mint" | "trade" } = {},
): ZoraClassification {
  const action = opts.action ?? "mint";
  const raw = String((err as any)?.message ?? "");
  const noun = action === "mint" ? "Minting" : "This trade";

  // 1. On-chain failures are decided by the message — they never reached Zora's
  //    API, so no HTTP evidence exists and none should be invented.
  if (CHAIN_PATTERNS.test(raw)) {
    return {
      kind: "chain",
      message: raw.length > 0 && raw.length < 160 ? raw : `${noun} failed on-chain. Nothing was charged.`,
      retryable: !/user rejected|user denied/i.test(raw),
      evidence: "on-chain error text",
    };
  }

  // 2. The observed HTTP response — the evidence the SDK threw away.
  const obs = takeZoraApiFailure();
  const status = obs?.status ?? statusFromSdkError(err);

  if (status != null) {
    const ev = `HTTP ${status}${obs ? ` from ${obs.url}` : ""}${obs ? ` (api-key: ${obs.keyed === true ? "sent" : obs.keyed === false ? "ABSENT" : "unknown"})` : ""}`;

    if (status === 429) {
      return {
        kind: "rate-limit",
        message: `${noun} is being rate-limited by Zora right now. Your post is safe — wait about a minute and retry.`,
        retryable: true,
        evidence: ev,
      };
    }
    if (status === 401 || status === 403) {
      // Explicitly NOT an outage and NOT user-retryable: retrying an unaccepted
      // key just fails again. Say it's ours to fix.
      return {
        kind: "auth",
        message: `${noun} is blocked — Zora rejected Scope's API credentials. Your post is safe; this one is on us to fix, not something a retry will clear.`,
        retryable: false,
        evidence: ev,
      };
    }
    if (status >= 500) {
      return {
        kind: "outage",
        message: `${noun} is temporarily unavailable — Zora's service is having trouble. Your post is safe; retry in a bit.`,
        retryable: true,
        evidence: ev,
      };
    }
    if (status >= 400) {
      // Zora refused THIS request. The body usually names the reason
      // (bad metadata, unsupported currency) — far more useful than "outage".
      const detail = extractDetail(obs?.body) ?? extractDetail(sdkErrorBody(err));
      return {
        kind: "request",
        message: detail
          ? `${noun} was refused by Zora: ${detail}`
          : `${noun} was refused by Zora (error ${status}). Your post is safe.`,
        retryable: false,
        evidence: ev,
      };
    }
  }

  // 3. Couldn't reach Zora at all — network-class. Genuinely outage-shaped.
  if (/failed to fetch|networkerror|network request failed|econnrefused|enotfound|etimedout|and the network|load failed/i.test(raw)) {
    return {
      kind: "outage",
      message: `${noun} couldn't reach Zora — the connection failed. Your post is safe; check your connection and retry.`,
      retryable: true,
      evidence: "network-class error, no HTTP response",
    };
  }

  // 4. No evidence. Show the real message if it's presentable; otherwise say
  //    plainly that we don't know. NEVER the outage line — that guess is the
  //    bug this brief exists to remove.
  const detail = extractDetail(sdkErrorBody(err));
  if (detail) {
    return { kind: "unknown", message: `${noun} failed: ${detail}`, retryable: true, evidence: "SDK error body, no status" };
  }
  const presentable = raw.length > 0 && raw.length < 160 && !isSdkConstant(raw);
  return {
    kind: "unknown",
    message: presentable ? raw : `Something failed on the way to the chain. Your post is safe.`,
    retryable: true,
    evidence: presentable ? "error message only" : "no usable evidence",
  };
}

/** The SDK's own generic strings carry no information — never show them. */
function isSdkConstant(m: string): boolean {
  return /failed to create content calldata|failed to load create content calldata|quote failed/i.test(m);
}

/** createTradeCall attaches the upstream body; some errors carry a status. */
function sdkErrorBody(err: unknown): unknown {
  return (err as any)?.errorBody ?? null;
}

function statusFromSdkError(err: unknown): number | null {
  const s = (err as any)?.status ?? (err as any)?.response?.status;
  return typeof s === "number" ? s : null;
}

/** Pull a short human reason out of an upstream body (JSON or text). */
function extractDetail(body: unknown): string | null {
  if (!body) return null;
  let obj: any = body;
  if (typeof body === "string") {
    const t = body.trim();
    if (!t) return null;
    try { obj = JSON.parse(t); } catch { return t.length < 160 ? t : null; }
  }
  const msg = obj?.error ?? obj?.message ?? obj?.detail ?? obj?.errorType;
  if (typeof msg === "string" && msg.trim() && msg.length < 160) return msg.trim();
  return null;
}
