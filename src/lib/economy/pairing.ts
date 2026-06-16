// ── Coin tradeability, by PAIRING ─────────────────────────────────────────────
//
// ETH-paired content coins are unroutable on Zora's router — every BUY / SELL /
// backing returns "Failed to create route", and the pairing is immutable, so the
// coin is permanently non-tradeable (proven 2026-06-12, re-proven live 2026-06-16:
// 6/6 ETH-paired coins fail all legs; every ZORA-paired coin routes). New coins
// are hard-guarded to mint ZORA-only (see createScopeCoin); these are the legacy
// stragglers.
//
// Detection is by the STORED pairing, never by catching a trade error. It is
// deliberately CONSERVATIVE — flags ONLY an explicit ETH currency, so a coin with
// a null/ZORA currency is never hidden (no false-negatives on good coins). Extend
// the rule only if a non-ETH pairing is later proven unroutable.

export function isUntradeableCoin(p: {
  coin_address?: string | null;
  coin_currency?: string | null;
}): boolean {
  return !!p.coin_address && (p.coin_currency ?? "").toUpperCase() === "ETH";
}
