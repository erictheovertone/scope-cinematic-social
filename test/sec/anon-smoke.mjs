// SEC-0 · Gate 3 — anon-key negative smoke test.
//
// Proves that, AFTER the containment SQL, the public anon key can no longer:
//   1. change a user's wallet_address   (trigger)
//   2. change a user's privy_id          (trigger)
//   3. grant Pro via profiles.is_paid_member (column REVOKE)
//   4. delete a post-media object        (policy dropped)
//   5. write a coin-metadata object      (policy dropped)
//
// NON-DESTRUCTIVE: 1–3 self-heal (restore the original value and FAIL loudly) if
// a write unexpectedly SUCCEEDS; 4–5 target a throwaway `__sec0_probe__` path.
// Run against the preview branch first, then production.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node test/sec/anon-smoke.mjs
//
// Exit 0 = all five DENIED (contained). Exit 1 = at least one forged write got through.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !ANON) { console.error('set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'); process.exit(2); }

const sb = createClient(URL, ANON);
const results = [];
const rec = (name, denied, detail) => { results.push({ name, denied, detail }); console.log(`${denied ? 'PASS (denied)' : 'FAIL (ALLOWED!)'} — ${name}${detail ? ` · ${detail}` : ''}`); };

// discover targets via public SELECT (anon can read)
const { data: user } = await sb.from('users').select('id, privy_id, wallet_address').limit(1).maybeSingle();
const { data: profile } = await sb.from('profiles').select('user_id, is_paid_member').limit(1).maybeSingle();
if (!user || !profile) { console.error('no rows to target (seed the branch)'); process.exit(2); }

// 1 — wallet_address
{
  const junk = '0x000000000000000000000000000000000000dEaD';
  const { error } = await sb.from('users').update({ wallet_address: junk }).eq('id', user.id);
  if (error) rec('users.wallet_address UPDATE', true, error.code || error.message);
  else { await sb.from('users').update({ wallet_address: user.wallet_address }).eq('id', user.id); rec('users.wallet_address UPDATE', false, 'wrote junk — RESTORED'); }
}
// 2 — privy_id
{
  const { error } = await sb.from('users').update({ privy_id: `did:privy:__sec0_probe__` }).eq('id', user.id);
  if (error) rec('users.privy_id UPDATE', true, error.code || error.message);
  else { await sb.from('users').update({ privy_id: user.privy_id }).eq('id', user.id); rec('users.privy_id UPDATE', false, 'wrote probe — RESTORED'); }
}
// 3 — is_paid_member
{
  const { error } = await sb.from('profiles').update({ is_paid_member: true }).eq('user_id', profile.user_id);
  if (error) rec('profiles.is_paid_member UPDATE', true, error.code || error.message);
  else { await sb.from('profiles').update({ is_paid_member: profile.is_paid_member }).eq('user_id', profile.user_id); rec('profiles.is_paid_member UPDATE', false, 'granted Pro — RESTORED'); }
}
// 4 — post-media delete (dummy path)
{
  const { error } = await sb.storage.from('post-media').remove(['__sec0_probe__/nope.jpg']);
  rec('post-media DELETE', !!error, error ? (error.message) : 'remove() accepted');
}
// 5 — coin-metadata write (dummy path)
{
  const body = new Blob([JSON.stringify({ probe: true })], { type: 'application/json' });
  const { error } = await sb.storage.from('coin-metadata').upload('__sec0_probe__.json', body, { upsert: true, contentType: 'application/json' });
  if (error) rec('coin-metadata WRITE', true, error.message);
  else { await sb.storage.from('coin-metadata').remove(['__sec0_probe__.json']); rec('coin-metadata WRITE', false, 'wrote probe — CLEANED'); }
}

const failed = results.filter((r) => !r.denied);
console.log(`\n${failed.length === 0 ? '✓ CONTAINED — all 5 forged writes denied' : `✗ ${failed.length} forged write(s) STILL ALLOWED`}`);
process.exit(failed.length === 0 ? 0 : 1);
