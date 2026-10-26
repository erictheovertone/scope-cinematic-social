/**
 * amountInput — shared sanitiser for the decimal money/token amount inputs in the
 * mint / collect / swap sheets (C3-15).
 *
 * Why this exists: those inputs use `type="text" inputMode="decimal"` so iOS Safari
 * shows a DECIMAL pad (a bare type="number"/inputMode="numeric" shows no dot key).
 * But the decimal pad's separator is LOCALE-dependent — on a comma-locale device
 * it emits "," not "." — so a naive `replace(/[^0-9.]/g, '')` silently strips the
 * comma and "0,5" collapses to "05" (→ 5, not 0.5). These helpers accept BOTH
 * separators, normalise to ".", strip everything else, and allow ONE separator max.
 */

/**
 * Clean a raw amount string: comma → dot, strip non-numeric, one dot max.
 * Preserves a trailing "." so mid-typing ("0." on the way to "0.5") isn't eaten.
 * The result is always safe for parseFloat()/Number().
 */
export function sanitizeDecimalInput(raw: string): string {
  let s = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
}

/**
 * sanitizeDecimalInput, then clamp the fractional part to `places` digits
 * (e.g. 2 for USD cents). Keeps the typed integer/separator intact.
 */
export function sanitizeDecimalInputClamped(raw: string, places: number): string {
  const s = sanitizeDecimalInput(raw);
  const i = s.indexOf('.');
  if (i === -1) return s;
  return s.slice(0, i + 1) + s.slice(i + 1, i + 1 + Math.max(0, places));
}
