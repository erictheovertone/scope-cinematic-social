// ── MUS-1 + AUG-1 harness — node-side helpers (seed · Stripe test-mode relay · teardown) ──────────
// TEST ACCOUNT ONLY. The identity is the shared AUTH_STATE session, which global-setup has already
// verified is NOT Eric (DID + email preflight). Production and Preview share one database, so every
// row this writes is fixed-id, scoped to the test account (plus one throwaway "other composer"
// for the 403 checks), and removed by teardown(). Seeded tracks are approved only for the run.
//
// Stripe: TEST MODE only (the local key must be sk_test_ — asserted). Webhooks can't reach
// localhost, so relay() pulls the real test-mode events from Stripe's Events API and POSTs them
// to the local /api/stripe/webhook signed with the local STRIPE_WEBHOOK_SECRET — the handler sees
// exactly what Stripe would deliver.
import { readFileSync, existsSync } from 'fs';
import { createHmac, randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const BASE = process.env.BASE_URL || 'http://localhost:3000';
export const STATE = process.env.AUTH_STATE || 'test/.auth/throwaway.json';

// ── env (.env.local) ──
const env: Record<string, string> = {};
for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
export const E = (k: string) => process.env[k] || env[k] || '';

export const db: SupabaseClient = createClient(E('NEXT_PUBLIC_SUPABASE_URL'), E('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// ── the test account ──
export function sessionToken(): string {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const o = s.origins.find((x: { origin: string }) => x.origin === new URL(BASE).origin) ?? s.origins[0];
  return JSON.parse(o.localStorage.find((e: { name: string }) => e.name === 'privy:token').value);
}
export const sessionDid = () => JSON.parse(Buffer.from(sessionToken().split('.')[1], 'base64url').toString()).sub as string;

export async function me(): Promise<{ did: string; userId: string; username: string }> {
  const did = sessionDid();
  const { data: u } = await db.from('users').select('id').eq('privy_id', did).single();
  const { data: p } = await db.from('profiles').select('username').eq('user_id', u!.id).single();
  return { did, userId: u!.id, username: p!.username };
}

// ── fixed seed ids (stable across runs → idempotent upserts) ──
export const IDS = {
  album: '7e57a1b0-0000-4000-8000-000000000001',
  tracks: ['7e57a1b0-0000-4000-8000-0000000000a1', '7e57a1b0-0000-4000-8000-0000000000a2', '7e57a1b0-0000-4000-8000-0000000000a3'],
  otherUser: '7e57a1b0-0000-4000-8000-0000000000f0',
  otherDid: 'did:privy:harness-other-composer',
  otherHandle: 'HARNESSOTHER',
  otherAlbum: '7e57a1b0-0000-4000-8000-0000000000f1',
  otherTrack: '7e57a1b0-0000-4000-8000-0000000000f2',
  post: '7e57a1b0-0000-4000-8000-0000000000c1',
};
export const TITLES = ['Harness Ember', 'Harness Hollow', 'Harness Lantern'];
export const ALBUM_TITLE = 'Harness Auburn';

/** A 2-second sine WAV — the delivered "master" for seeded tracks. */
function wav(freq: number): Buffer {
  const rate = 8000, n = rate * 2, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 9000), 44 + i * 2);
  return buf;
}

async function putAudio(owner: string, id: string, freq: number): Promise<string> {
  const path = `${owner}/harness-${id}.wav`;
  const { error } = await db.storage.from('music').upload(path, wav(freq), { contentType: 'audio/wav', upsert: true });
  if (error) throw new Error(`seed upload: ${error.message}`);
  return db.storage.from('music').getPublicUrl(path).data.publicUrl;
}

const peaks = (k: number) => Array.from({ length: 96 }, (_, i) => Math.round((0.25 + 0.7 * Math.abs(Math.sin(i / (6 + k)))) * 100) / 100);

export async function seed(): Promise<void> {
  const m = await me();
  // the throwaway other composer (users + profiles rows; never logs in)
  await db.from('users').upsert({ id: IDS.otherUser, privy_id: IDS.otherDid }, { onConflict: 'id' });
  await db.from('profiles').upsert({ user_id: IDS.otherUser, username: IDS.otherHandle, display_name: 'Harness Other' }, { onConflict: 'user_id' });

  await db.from('albums').upsert([
    { id: IDS.album, composer_id: m.userId, title: ALBUM_TITLE, year: 2026, position: 0 },
    { id: IDS.otherAlbum, composer_id: IDS.otherUser, title: 'Harness Other Album', year: 2025, position: 0 },
  ], { onConflict: 'id' });

  const rows = await Promise.all(IDS.tracks.map(async (id, i) => ({
    id, composer_user_id: m.userId, title: TITLES[i], keywords: ['cinematic', 'ambient'], duration_seconds: 2,
    file_url: await putAudio(m.userId, id, 220 * (i + 2)), status: 'approved', approved_at: new Date().toISOString(),
    album_id: IDS.album, position: i + 1, waveform_peaks: peaks(i),
  })));
  rows.push({
    id: IDS.otherTrack, composer_user_id: IDS.otherUser, title: 'Harness Not Yours', keywords: ['cinematic', 'ambient'], duration_seconds: 2,
    file_url: await putAudio(IDS.otherUser, IDS.otherTrack, 330), status: 'approved', approved_at: new Date().toISOString(),
    album_id: IDS.otherAlbum, position: 1, waveform_peaks: peaks(4),
  });
  const { error } = await db.from('tracks').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`seed tracks: ${error.message}`);
}

/** Reset the test account's membership to free (never touches any other account). */
export async function resetMembership(): Promise<void> {
  const m = await me();
  await db.from('profiles').update({
    is_paid_member: false, paid_member_until: null, membership_tier: 'free', augmented_since: null,
    membership_cancels_at: null, stripe_customer_id: null, stripe_subscription_id: null,
  }).eq('user_id', m.userId);
}

export async function profileRow() {
  const m = await me();
  const { data } = await db.from('profiles')
    .select('membership_tier, augmented_since, paid_member_until, membership_cancels_at, stripe_customer_id, stripe_subscription_id')
    .eq('user_id', m.userId).single();
  return data!;
}

export async function teardown(): Promise<void> {
  const m = await me();
  const subs = await cancelAllTestSubs().catch(() => 0);
  await db.from('downloads').delete().eq('user_id', m.userId);
  await db.from('track_versions').delete().in('track_id', [...IDS.tracks, IDS.otherTrack]);
  await db.from('tracks').delete().in('id', [...IDS.tracks, IDS.otherTrack]);
  await db.from('tracks').delete().eq('composer_user_id', m.userId).like('title', 'Harness%');
  await db.from('albums').delete().in('id', [IDS.album, IDS.otherAlbum]);
  await db.from('albums').delete().eq('composer_id', m.userId).eq('is_singles', true);
  await db.from('posts').delete().eq('id', IDS.post);
  await db.from('profiles').delete().eq('user_id', IDS.otherUser);
  await db.from('users').delete().eq('id', IDS.otherUser);
  const { data: objs } = await db.storage.from('music').list(m.userId);
  const mine = (objs ?? []).filter((o) => o.name.startsWith('harness-') || o.name.startsWith('album-7e57a1b0')).map((o) => `${m.userId}/${o.name}`);
  if (mine.length) await db.storage.from('music').remove(mine);
  await db.storage.from('music').remove([`${IDS.otherUser}/harness-${IDS.otherTrack}.wav`]);
  await resetMembership();
  console.log(`[teardown] removed seed rows + objects; cancelled ${subs} test subscription(s); test account reset to free`);
}

// ── Stripe TEST mode ──
const SK = () => {
  const k = E('STRIPE_SECRET_KEY');
  if (!k.startsWith('sk_test_')) throw new Error('harness refuses: STRIPE_SECRET_KEY is not a TEST key');
  return k;
};
export async function stripe<T = Record<string, unknown>>(path: string, init: { method?: string; body?: Record<string, string> } = {}): Promise<T> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${SK()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: init.body ? new URLSearchParams(init.body) : undefined,
  });
  const j = await r.json();
  if (j.error) throw new Error(`stripe ${path}: ${j.error.message}`);
  return j as T;
}

/** Cancel every active test subscription carrying this account's privyUserId (teardown). */
async function cancelAllTestSubs(): Promise<number> {
  // By the harness customers (exact list) — Stripe's search index lags up to a minute.
  let n = 0;
  const cs = await stripe<{ data: { id: string }[] }>(`customers?limit=100&email=${encodeURIComponent('harness+test@example.com')}`);
  for (const c of cs.data) {
    const subs = await stripe<{ data: { id: string }[] }>(`subscriptions?status=active&customer=${c.id}`);
    for (const s of subs.data) { await stripe(`subscriptions/${s.id}`, { method: 'DELETE' }); n++; }
  }
  return n;
}

/**
 * Forward the real test-mode events about `objectIds` (session / subscription / customer ids)
 * created since `sinceSec` to the local webhook, signed like Stripe signs them. Returns each
 * event's type + the webhook's HTTP status.
 */
export async function relay(sinceSec: number, objectIds: string[], types: string[]): Promise<{ type: string; status: number; body: string }[]> {
  const secret = E('STRIPE_WEBHOOK_SECRET');
  const out: { type: string; status: number; body: string }[] = [];
  const ev = await stripe<{ data: Record<string, unknown>[] }>(`events?limit=100&created[gte]=${sinceSec}`);
  const mine = ev.data
    .filter((e) => types.includes(e.type as string))
    .filter((e) => { const o = (e.data as { object: Record<string, unknown> }).object; return [o.id, o.customer, o.subscription].some((v) => objectIds.includes(String(v))); })
    .sort((a, b) => (a.created as number) - (b.created as number));
  for (const e of mine) {
    const payload = JSON.stringify(e);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    const r = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}`, 'content-type': 'application/json' }, body: payload });
    out.push({ type: e.type as string, status: r.status, body: (await r.text()).slice(0, 160) });
  }
  return out;
}

export const uuid = () => randomUUID();

/**
 * The PAYMENT leg without the iframe (Stripe serves hCaptcha to automated checkout): a real
 * test-mode customer + pm_card_visa + subscription on the plan's Price, with the SAME metadata
 * checkout's subscription_data sets. Returns the real ids.
 */
export async function subscribeViaApi(plan: string, priceId: string): Promise<{ customer: string; subscription: string }> {
  const did = sessionDid();
  const c = await stripe<{ id: string }>('customers', { method: 'POST', body: { email: 'harness+test@example.com', 'metadata[privyUserId]': did } });
  const pm = await stripe<{ id: string }>('payment_methods/pm_card_visa/attach', { method: 'POST', body: { customer: c.id } });
  const s = await stripe<{ id: string; status: string }>('subscriptions', { method: 'POST', body: {
    customer: c.id, 'items[0][price]': priceId, default_payment_method: pm.id,
    'metadata[privyUserId]': did, 'metadata[plan]': plan,
  } });
  if (s.status !== 'active') throw new Error(`test subscription not active: ${s.status}`);
  return { customer: c.id, subscription: s.id };
}

/** checkout.session.completed for those REAL ids (the one constructed event), signed + delivered. */
export async function deliverCheckoutCompleted(ids: { customer: string; subscription: string }, plan: string): Promise<number> {
  const evt = {
    id: `evt_harness_${Date.now()}`, object: 'event', api_version: '2024-06-20', created: Math.floor(Date.now() / 1000), livemode: false,
    type: 'checkout.session.completed', pending_webhooks: 1, request: { id: null, idempotency_key: null },
    data: { object: { id: `cs_test_harness_${Date.now()}`, object: 'checkout.session', mode: 'subscription', status: 'complete', payment_status: 'paid',
      customer: ids.customer, subscription: ids.subscription, metadata: { privyUserId: sessionDid(), plan } } },
  };
  const payload = JSON.stringify(evt);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', E('STRIPE_WEBHOOK_SECRET')).update(`${t}.${payload}`).digest('hex');
  const r = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}`, 'content-type': 'application/json' }, body: payload });
  return r.status;
}
