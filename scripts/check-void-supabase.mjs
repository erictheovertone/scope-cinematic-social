// ── check-void-supabase — build guard against fire-and-forget postgrest builders (MUS-3b) ─────────
// A supabase/postgrest builder is a LAZY thenable: it only sends its HTTP request when awaited /
// .then() / .catch()'d. `void supabase.from('x').update(...)` (MUS-3a) therefore NEVER fires — the
// write silently no-ops. This guard fails the build on that class so it can't come back:
//   1. `void <client>.…`                    — explicitly discarded builder (the MUS-3a bug).
//   2. a statement-dropped mutation chain    — insert/update/upsert/delete/rpc whose statement has no
//      (not a Promise.all element)             await / return / assignment / .then / .catch.
// Reads only git-tracked source; strips comments + strings so matches inside them don't count.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const CLIENT = '(?:supabase|sb|db|client|admin|service|sbAdmin|sbService|serviceClient\\(\\)|serverSupabase|supa)';
const CLIENT_RE = new RegExp(`\\b${CLIENT}\\b`);
const VOID_RE = new RegExp(`\\bvoid\\s+${CLIENT}\\s*\\.`);
const MUT = /\.(?:insert|update|upsert|delete|rpc)\s*\(/;

// Replace // and /* */ comments and string/template literals with spaces (keep newlines + length).
function strip(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } }
    else if (c === '/' && d === '*') { out += '  '; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; }
    else if (c === '"' || c === "'" || c === '`') { const q = c; out += ' '; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') { out += '  '; i += 2; continue; } out += src[i] === '\n' ? '\n' : ' '; i++; } out += ' '; i++; }
    else { out += c; i++; }
  }
  return out;
}

const offenders = [];
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const code = strip(raw);
  const lines = code.split('\n');
  const rawLines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (VOID_RE.test(lines[i])) offenders.push({ loc: `${file}:${i + 1}`, why: 'void of a supabase builder (never fires)', snip: rawLines[i].trim().slice(0, 100) });
    if (!MUT.test(lines[i])) continue;
    // Walk back to the statement start to judge aliveness.
    let start = i;
    while (start > 0) {
      const prev = lines[start - 1].trimEnd(), cur = lines[start].trimStart();
      if (cur.startsWith('.') || prev.endsWith('.') || prev.endsWith('(') || prev.endsWith(',') || /(?:await|return|=|\?|\()\s*$/.test(prev)) { start--; continue; }
      break;
    }
    const head = lines.slice(start, i + 1).join('\n');
    if (!CLIENT_RE.test(head)) continue; // not a supabase chain (Map/Set/searchParams .delete, etc.)
    const win = lines.slice(Math.max(0, start - 1), Math.min(lines.length, i + 3)).join('\n');
    const alive = /\bawait\b/.test(win) || /\breturn\b/.test(win) || /\.then\s*\(/.test(win) || /\.catch\s*\(/.test(win) || new RegExp(`=\\s*(?:await\\s+)?${CLIENT}`).test(win) || /Promise\.(?:all|allSettled|race)/.test(win);
    if (!alive) offenders.push({ loc: `${file}:${i + 1}`, why: 'statement-dropped mutation builder (no await/return/then/catch → never fires)', snip: rawLines[i].trim().slice(0, 100) });
  }
}

if (offenders.length) {
  console.error(`\n✗ fire-and-forget supabase builder(s) — these never send their request:\n`);
  for (const o of offenders) console.error(`  ${o.loc}\n     ${o.snip}\n     → ${o.why}. Add \`await\` (and handle the error).`);
  console.error(`\n${offenders.length} offender(s). A postgrest builder only runs when awaited/.then()'d.\n`);
  process.exit(1);
}
console.log('✓ no fire-and-forget supabase builders (every mutation is awaited)');
