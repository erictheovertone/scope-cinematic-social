// Brief LT-1 — BUILD GUARD against the theme-invariant-black landmine.
//
// globals.css defines --black / --black-rgb as a DELIBERATELY theme-invariant pure black (#000),
// sanctioned ONLY for media letterboxes and full-black scrims. Used instead as a CONTENT or PAGE
// *background*, it never flips: in dark mode #000 ≈ the #050505 canvas so it looks right, but in
// light mode the ink flips to off-black while the background stays black → off-black text on black,
// unreadable. (This is exactly what broke Manage Membership, the bio sheet, and the badge pages.)
//
// This guard fails the build when a (near-)opaque invariant black is used as a background FILL:
//   • background/backgroundColor: 'var(--black)'                  (inline style, the solid-fill form)
//   • a `bg-black` Tailwind class (opaque; `bg-black/50` and `bg-opacity-*` are NOT matched)
//   • background/backgroundColor: 'rgb(var(--black-rgb) / α)' with α >= 0.9 — a BLACK PANEL, not a
//     scrim. This is exactly the ProfileDataSheet bug (0.95); the ternary form
//     `rgb(var(--black-rgb) / ${open ? 0.95 : 0})` is matched too.
// The 0.9 FLOOR is deliberate: real scrims sit at 0.85 and below (CollectSheetV2's canvas-rgb
// pattern), so a 0.9 floor won't catch legitimate ones; anything >= 0.9 that IS genuinely a scrim
// takes a /* theme-ok */ like the letterboxes do. By CONVENTION a scrim dims to the ivory ground with
// `rgb(var(--canvas-rgb) / α)` so it follows the theme. var(--black-rgb) inside a GRADIENT (its value
// crosses a comma), or on `color`/`border`/`fill`/a shadow, is a legitimate use and is NOT matched
// (solid background fills only).
//
// To add an exception you must ARGUE it, one of two ways:
//   1. the file/dir is in ALLOW below (a whole surface that is a DECLARED [data-force-dark] region), or
//   2. the line carries an inline  /* theme-ok: <reason> */  comment (a media letterbox, a crop/
//      reframe stage, a transient full-screen flash). State the reason; the next reviewer reads it.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// ── Named allowlist — each entry is a surface that renders under [data-force-dark] (globals.css
//    :297), so invariant black is correct there under EITHER theme. Keep this tight. ──────────────
const ALLOW = [
  { path: 'src/components/finishing/',                 why: 'finishing suite — the whole tool is [data-force-dark] (media reads against charcoal)' },
  { path: 'src/app/membership/success/page.tsx',       why: 'membership celebrations — roots marked [data-force-dark] (cinematic dark stage)' },
  { path: 'src/components/arrival/Arrival.tsx',         why: 'public Scope profile — [data-force-dark] brand-dark surface' },
];

// The offending background forms. Gradients (value crosses a comma), shadows, color/border/fill, and
// scrims (α < 0.9) are deliberately excluded.
const VARBLACK = /\b(?:background|backgroundColor)\s*[:=]\s*(['"`])\s*var\(--black\)\s*\1/;        // solid var(--black)
const BGBLACK_CLASS = /className\s*=\s*(['"`{])[^'"`]*\bbg-black\b(?!\/)/;                          // opaque Tailwind bg-black
// A background value whose FIRST property-value token is an rgb(var(--black-rgb) / …): [^,}]*? keeps
// us inside the one property (so a later boxShadow / a gradient's internal comma can't match).
const BGBLACK_RGB = /\b(?:background|backgroundColor)\s*[:=]\s*(['"`])?[^,}]*?rgba?\(\s*var\(--black-rgb\)\s*\/([^,}]*)/;
const ALPHA_GE_09 = /(?:\/\s*|\?\s*)(0\.9\d*|1(?:\.0+)?)\b/; // α >= 0.9, static (`/ 0.95`) or ternary (`? 0.95 :`)
const OK = /\/\*\s*theme-ok:/; // inline, argued exception

const offends = (ln) => {
  if (OK.test(ln)) return false;
  if (VARBLACK.test(ln) || BGBLACK_CLASS.test(ln)) return true;
  const m = ln.match(BGBLACK_RGB);         // a black-rgb background; m[2] = the alpha tail of THAT value
  return !!m && ALPHA_GE_09.test('/' + m[2]);
};

const allowed = (f) => ALLOW.find((a) => f.startsWith(a.path));

const files = execSync(`git ls-files 'src/**/*.ts' 'src/**/*.tsx'`).toString().split('\n').filter(Boolean);
const hits = [];
for (const f of files) {
  if (allowed(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => { if (offends(ln)) hits.push(`${f}:${i + 1}  ${ln.trim().slice(0, 110)}`); });
}
if (hits.length) {
  console.error('\n✗ THEME-INVARIANT BLACK — opaque var(--black)/bg-black used as a background fill (stays black in light mode):');
  hits.forEach((h) => console.error('  ' + h));
  console.error('\nFix: a page/content ground → var(--canvas); a raised panel → var(--surface-*); a scrim → rgb(var(--canvas-rgb) / α).');
  console.error('Genuinely invariant (a media letterbox / crop stage / transient flash)? Add  /* theme-ok: <reason> */  on the line.');
  console.error('A whole [data-force-dark] surface? Add it to ALLOW in scripts/check-theme-invariant-black.mjs. See CLAUDE.md.\n');
  process.exit(1);
}
console.log('✓ no theme-invariant black used as a content background');
