// VID-2c §5(a) — allowlist parser unit test. Pure, no browser/auth. Run: npx tsx test/vid2c-allowlist.unit.ts
import { gradedAllowlistAllows } from '../src/lib/gradedPlayback';

type Case = [desc: string, username: string | null | undefined, list: string | undefined, expect: boolean];
const cases: Case[] = [
  ['unset → off',                               'overtone', undefined,           false],
  ['empty "" → off',                            'overtone', '',                  false],
  ['"*" → everyone (even signed-out/null)',     null,       '*',                 true],
  ['" * " trims → everyone',                    'anyone',   ' * ',               true],
  ['"overtone" + viewer overtone → on',         'overtone', 'overtone',          true],
  ['" Overtone , ebert " + overtone → on (ws+case)', 'overtone', ' Overtone , ebert ', true],
  ['" Overtone , ebert " + EBERT → on (case)',  'EBERT',    ' Overtone , ebert ', true],
  ['"ebert" + viewer OVERTONE → off',           'OVERTONE', 'ebert',             false],
  ['named list, no username → off',             null,       'overtone',          false],
  ['named list, empty username → off',          '',         'overtone',          false],
];

let fail = 0;
for (const [desc, u, list, exp] of cases) {
  const got = gradedAllowlistAllows(u, list);
  const ok = got === exp;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${desc}  → ${got} (expect ${exp})`);
}
console.log(fail ? `\n${fail}/${cases.length} FAILED` : `\nall ${cases.length} passed`);
process.exit(fail ? 1 : 0);
