// Brief C2 §B — BUILD GUARD against the canvas/image-gen var() landmine.
// A 2D canvas, an OffscreenCanvas, sharp, satori/OG, and an SVG-rasterized-to-image CANNOT resolve
// CSS custom properties — `fillStyle = 'var(--black)'` silently falls back (usually to black), so a
// token sweep that touches these sinks bakes the WRONG colour into stored images with no error.
// These sinks must use LITERAL colours (they're baked / theme-invariant). This fails the build if
// a CSS var() reaches any of them. DOM SVG (<svg fill="var(--…)">) is fine and NOT matched.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const SINKS = [
  // canvas colour setters + gradient stops
  /(fillStyle|strokeStyle|shadowColor)\s*=\s*['"`][^'"`]*var\(--/,
  /addColorStop\s*\([^)]*var\(--/,
  // sharp pixel-colour options (flatten/tint/background) carrying a var()
  /\.(flatten|tint)\s*\(\s*\{[^}]*var\(--/,
];
// Scope: TS/TSX under src, plus any OG/satori/sharp image route.
const files = execSync(`git ls-files 'src/**/*.ts' 'src/**/*.tsx'`).toString().split('\n').filter(Boolean);
const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => { if (SINKS.some((re) => re.test(ln))) hits.push(`${f}:${i + 1}  ${ln.trim().slice(0, 100)}`); });
}
if (hits.length) {
  console.error('\n✗ CANVAS var() LANDMINE — a CSS var() reached a canvas/image sink (it will bake wrong):');
  hits.forEach((h) => console.error('  ' + h));
  console.error('\nUse a LITERAL colour at these sinks (baked output is theme-invariant). See CLAUDE.md.\n');
  process.exit(1);
}
console.log('✓ canvas/image sinks are var()-free');
