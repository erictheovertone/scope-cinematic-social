// ── Ticker helpers ───────────────────────────────────────────────────────────
//
// The coin ticker (Zora `symbol`) is creator-assigned in the post flow, with a
// caption-derived auto-suggestion they can overwrite (Scope_Economy.docx §5).
// 3–6 chars, [A-Z0-9]. Pure functions — no network.

/** Caption → suggested 3–6 char uppercase ticker (slugified). May be < 3 if the
 *  caption has too few alphanumerics; the field stays editable and validation
 *  enforces the 3-char minimum before a coin can be created. */
export function suggestTicker(caption: string): string {
  const cleaned = (caption || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, 6);
}

/** Normalize raw input to the allowed shape (uppercase, [A-Z0-9], max 6). */
export function normalizeTicker(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** Valid iff 3–6 chars of [A-Z0-9]. */
export function isValidTicker(t: string): boolean {
  return /^[A-Z0-9]{3,6}$/.test(t);
}

/** Inline validation message, or null when valid/empty. */
export function tickerError(t: string): string | null {
  if (!t) return null; // empty handled separately (auto-suggest fills it)
  if (t.length < 3) return 'Ticker needs at least 3 characters.';
  if (!/^[A-Z0-9]+$/.test(t)) return 'Letters and numbers only.';
  return null;
}
