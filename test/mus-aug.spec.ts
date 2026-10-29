// ── BRIEF MUS-1 + AUG-1 — harness gates ──────────────────────────────────────────────────────────
// TEST ACCOUNT ONLY (global-setup refuses Eric's session before anything runs).
//   MUS-1: track route from all four entry points (library · composer page · bio sheet · the
//          EDIT & POST library sheet) · manage endpoints 401/403 for a non-owner · Singles
//          backfill + new submissions land in Singles · manage page refuses a non-owner.
//   AUG-1: download gate (free → upsell sheet; augmented → 200 signed URL, dead after 60s) ·
//          Stripe TEST flow end to end: join annual (pre-selected), join monthly, cancel → tier
//          holds to period end → subscription ends → tier reverts.
// Needs: docs/migrations/mus1_aug1.sql run; a seam build (NEXT_PUBLIC_TEST_SEAM=1) on :3000;
// .env.local with sk_test_ + the four test STRIPE_PRICE_* + STRIPE_WEBHOOK_SECRET.
//   BASE_URL=http://localhost:3000 AUTH_STATE=<shared throwaway.json> npx playwright test test/mus-aug.spec.ts --workers=1
import { test, expect, type Page } from '@playwright/test';
import { BASE, IDS, TITLES, ALBUM_TITLE, db, me, seed, teardown, resetMembership, profileRow, relay, sessionToken, stripe, uuid } from './mus-aug-harness';
import { toEdit } from './v3-harness';

const T1 = IDS.tracks[0];
const authed = () => ({ Authorization: `Bearer ${sessionToken()}` });

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { await seed(); await resetMembership(); });
test.afterAll(async () => { if (process.env.MUS_KEEP !== '1') await teardown(); });

async function openTrackFrom(page: Page, click: () => Promise<void>) {
  await click();
  await expect(page.getByTestId('track-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('track-view').getByText(TITLES[0]).first()).toBeVisible();
}

// ═══ MUS-1 ═══════════════════════════════════════════════════════════════════════════════════════
test('MUS-1 · track route from the main library', async ({ page }) => {
  await page.goto('/library');
  await openTrackFrom(page, () => page.getByText(TITLES[0], { exact: true }).first().click());
  await expect(page).toHaveURL(new RegExp(`/track/${T1}`));
});

test('MUS-1 · track route from the composer page (album cover → first track)', async ({ page }) => {
  const m = await me();
  await page.goto(`/composer/${m.username}`);
  await expect(page.getByText(ALBUM_TITLE).first()).toBeVisible({ timeout: 20_000 });
  await openTrackFrom(page, () => page.getByText(ALBUM_TITLE).first().click());
  await expect(page).toHaveURL(new RegExp(`/track/${T1}`));
});

test('MUS-1 · track route from the bio sheet MUSIC section', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: /^bio$/i }).first().click({ timeout: 20_000 });
  const music = page.getByTestId('bio-music');
  await expect(music).toBeVisible({ timeout: 15_000 });
  await openTrackFrom(page, () => music.getByText(ALBUM_TITLE).first().click());
});

test('MUS-1 · track view inside the EDIT & POST library sheet (create flow stays mounted)', async ({ page }) => {
  await toEdit(page, 'v-20s.mp4');
  await page.getByText(/\+ ADD MUSIC/).first().click();
  await page.getByTestId(`picker-art-${T1}`).click({ timeout: 15_000 });
  await expect(page.getByTestId('track-view')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/edit & post/i).first()).toBeAttached(); // never navigated away
  await page.getByTestId('track-view').getByRole('button', { name: /use in a post/i }).click();
  await expect(page.getByTestId('track-view')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/^CHANGE$/).first()).toBeVisible({ timeout: 10_000 }); // the track is on the post
});

test('MUS-1 · manage endpoints: 401 without a token, 403 for a non-owner, 200 for the owner', async ({ request }) => {
  const post = (data: object, headers: Record<string, string> = authed()) => request.post(`${BASE}/api/music/manage`, { data, headers });
  expect((await post({ action: 'track_rename', trackId: T1, title: 'x' }, {})).status()).toBe(401);
  expect((await post({ action: 'track_rename', trackId: IDS.otherTrack, title: 'Hijack' })).status()).toBe(403);
  expect((await post({ action: 'album_update', albumId: IDS.otherAlbum, title: 'Hijack' })).status()).toBe(403);
  expect((await post({ action: 'reorder', albumId: IDS.otherAlbum, trackIds: [IDS.otherTrack] })).status()).toBe(403);
  expect((await post({ action: 'reorder', albumId: IDS.album, trackIds: [IDS.otherTrack] })).status()).toBe(403); // can't pull someone else's track in
  expect((await post({ action: 'replace_audio', trackId: IDS.otherTrack, fileUrl: 'x/storage/v1/object/public/music/x.wav' })).status()).toBe(403);
  const cover = await request.post(`${BASE}/api/music/manage/cover?albumId=${IDS.otherAlbum}`, { data: Buffer.from('x'), headers: { ...authed(), 'content-type': 'image/png' } });
  expect(cover.status()).toBe(403);
  const { data: other } = await db.from('tracks').select('title').eq('id', IDS.otherTrack).single();
  expect(other!.title).toBe('Harness Not Yours'); // nothing changed

  // owner: rename + reorder publish immediately
  expect((await post({ action: 'track_rename', trackId: IDS.tracks[2], title: 'Harness Lantern II' })).status()).toBe(200);
  expect((await post({ action: 'reorder', albumId: IDS.album, trackIds: [IDS.tracks[0], IDS.tracks[2], IDS.tracks[1]] })).status()).toBe(200);
  const { data: rows } = await db.from('tracks').select('id, title, position').in('id', IDS.tracks).order('position');
  expect(rows!.map((r) => r.id)).toEqual([IDS.tracks[0], IDS.tracks[2], IDS.tracks[1]]);
  expect(rows!.find((r) => r.id === IDS.tracks[2])!.title).toBe('Harness Lantern II');
  // restore for the screenshots
  await post({ action: 'track_rename', trackId: IDS.tracks[2], title: TITLES[2] });
  await post({ action: 'reorder', albumId: IDS.album, trackIds: IDS.tracks });
});

test('MUS-1 · manage page refuses a non-owner', async ({ page }) => {
  await page.goto(`/composer/${IDS.otherHandle}/manage`);
  await expect(page.getByText(/not your page/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Harness Other Album')).toHaveCount(0);
});

test('MUS-1 · Singles: backfill left no homeless track; a new submission lands in Singles', async ({ request }) => {
  const { count: homeless } = await db.from('tracks').select('id', { count: 'exact', head: true }).is('album_id', null);
  const { count: singles } = await db.from('albums').select('id', { count: 'exact', head: true }).eq('is_singles', true);
  console.log(`[singles] tracks without an album: ${homeless} · Singles albums: ${singles}`);
  expect(homeless).toBe(0);

  const m = await me();
  const id = uuid();
  const res = await request.post(`${BASE}/api/music/submit`, { data: { id, userId: m.userId, title: 'Harness Single', keywords: ['cinematic', 'ambient'], durationSeconds: 2, fileUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/music/${m.userId}/harness-${IDS.tracks[0]}.wav` } });
  expect(res.status()).toBe(200);
  const { data: t } = await db.from('tracks').select('album_id, status').eq('id', id).single();
  const { data: a } = await db.from('albums').select('is_singles, title').eq('id', t!.album_id).single();
  expect(a).toMatchObject({ is_singles: true, title: 'Singles' });
  expect(t!.status).toBe('pending');
});

// ═══ AUG-1 ═══════════════════════════════════════════════════════════════════════════════════════
test('AUG-1 · download gate: free → upsell sheet (UI) + 403 (API)', async ({ page, request }) => {
  await resetMembership();
  const api = await request.get(`${BASE}/api/download/track?id=${T1}`, { headers: authed() });
  expect(api.status()).toBe(403);
  expect((await api.json()).error).toBe('augmented_required');
  expect((await request.get(`${BASE}/api/download/track?id=${T1}`)).status()).toBe(401);

  await page.goto(`/track/${T1}`);
  await page.getByTestId('track-download').click({ timeout: 20_000 });
  const sheet = page.getByTestId('augmented-sheet');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('plan-augmented_annual')).toHaveAttribute('aria-checked', 'true'); // annual pre-selected
  await expect(sheet.getByText(/2 months free/i)).toBeVisible();
});

/** Pay the Stripe Embedded Checkout with the 4242 test card. */
async function payEmbedded(page: Page) {
  const frame = page.frameLocator('iframe[name*="embedded-checkout"], iframe[src*="checkout.stripe.com"]').first();
  const email = frame.locator('#email');
  await email.waitFor({ timeout: 45_000 });
  await email.fill('harness+test@example.com');
  await frame.locator('#cardNumber').fill('4242424242424242');
  await frame.locator('#cardExpiry').fill('12 / 34');
  await frame.locator('#cardCvc').fill('123');
  const name = frame.locator('#billingName');
  if (await name.count()) await name.fill('Harness Test');
  const zip = frame.locator('#billingPostalCode');
  if (await zip.count()) await zip.fill('10001');
  await frame.locator('button[type="submit"], .SubmitButton').first().click();
}

async function joinViaSheet(page: Page, plan: 'augmented_annual' | 'augmented_monthly') {
  await page.goto(`/track/${T1}`);
  await page.getByTestId('track-download').click({ timeout: 20_000 });
  await expect(page.getByTestId('augmented-sheet')).toBeVisible();
  await page.getByTestId(`plan-${plan}`).click();
  await page.getByTestId('augmented-join').click();
  await payEmbedded(page);
  await expect.poll(async () => (await profileRow()).membership_tier, { timeout: 60_000, intervals: [1000] }).toBe('augmented');
  return profileRow();
}

test('AUG-1 · Stripe TEST: join ANNUAL → augmented → download 200, signed URL dead after 60s', async ({ page, request, browserName }) => {
  test.skip(browserName !== 'chromium', 'Stripe flow runs once, on desktop-chromium');
  test.setTimeout(240_000);
  await resetMembership();
  const since = Math.floor(Date.now() / 1000) - 5;
  const row = await joinViaSheet(page, 'augmented_annual');
  expect(row.augmented_since).toBeTruthy();
  const sub = await stripe<{ items: { data: { price: { id: string; recurring: { interval: string } } }[] }; status: string }>(`subscriptions/${row.stripe_subscription_id}`);
  expect(sub.status).toBe('active');
  expect(sub.items.data[0].price.recurring.interval).toBe('year'); // annual is a yearly SUBSCRIPTION now
  expect(sub.items.data[0].price.id).toBe(process.env.STRIPE_PRICE_AUGMENTED_ANNUAL || sub.items.data[0].price.id);
  const until = new Date(row.paid_member_until!).getTime();
  expect(until - Date.now()).toBeGreaterThan(360 * 86_400_000);

  // the webhook path, with Stripe's real events for this checkout
  const delivered = await relay(since, [row.stripe_customer_id!, row.stripe_subscription_id!], ['checkout.session.completed', 'invoice.payment_succeeded', 'customer.subscription.updated']);
  console.log('[webhook relay]', delivered.map((d) => `${d.type}→${d.status}`).join(' · '));
  expect(delivered.length).toBeGreaterThan(0);
  expect(delivered.every((d) => d.status === 200)).toBeTruthy();
  expect((await profileRow()).membership_tier).toBe('augmented');

  // download: 200 + signed URL that works now and is dead after 60s
  const res = await request.get(`${BASE}/api/download/track?id=${T1}`, { headers: authed() });
  expect(res.status()).toBe(200);
  const { url, expiresIn } = await res.json();
  expect(expiresIn).toBe(60);
  expect(url).toContain('/storage/v1/object/sign/');
  const first = await fetch(url);
  expect(first.status).toBe(200);
  expect(first.headers.get('content-disposition') ?? '').toMatch(/attachment/);
  const post = await request.get(`${BASE}/api/download/post?id=${IDS.tracks[0]}`, { headers: authed() });
  expect([404]).toContain(post.status()); // gate passed; not a post id → 404 (not 403)
  const { count } = await db.from('downloads').select('id', { count: 'exact', head: true }).eq('user_id', (await me()).userId).eq('asset_id', T1);
  expect(count).toBeGreaterThan(0);
  await page.waitForTimeout(62_000);
  const dead = await fetch(url);
  console.log(`[signed url] t+0 → ${first.status} · t+62s → ${dead.status}`);
  expect(dead.status).not.toBe(200);
});

test('AUG-1 · Stripe TEST: cancel → tier holds to period end → subscription ends → tier reverts', async ({ request, browserName }) => {
  test.skip(browserName !== 'chromium', 'Stripe flow runs once, on desktop-chromium');
  const m = await me();
  const before = await profileRow();
  expect(before.membership_tier).toBe('augmented');
  const since = Math.floor(Date.now() / 1000) - 5;
  const c = await request.post(`${BASE}/api/stripe/cancel-subscription`, { data: { userId: m.did } });
  expect(c.status()).toBe(200);
  const cj = await c.json();
  expect(cj.mode).toBe('subscription');
  const held = await profileRow();
  expect(held.membership_cancels_at).toBeTruthy();
  expect(held.membership_tier).toBe('augmented'); // still Augmented until the period ends

  // "period end": end the subscription now (test mode) and deliver Stripe's real events
  await stripe(`subscriptions/${before.stripe_subscription_id}`, { method: 'DELETE' });
  const delivered = await relay(since, [before.stripe_subscription_id!], ['customer.subscription.updated', 'customer.subscription.deleted']);
  console.log('[webhook relay]', delivered.map((d) => `${d.type}→${d.status}`).join(' · '));
  expect(delivered.some((d) => d.type === 'customer.subscription.deleted' && d.status === 200)).toBeTruthy();
  const after = await profileRow();
  expect(after.membership_tier).toBe('free');
  expect(after.augmented_since).toBeNull();
  expect((await request.get(`${BASE}/api/download/track?id=${T1}`, { headers: authed() })).status()).toBe(403);
});

test('AUG-1 · Stripe TEST: join MONTHLY → augmented, monthly Price', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Stripe flow runs once, on desktop-chromium');
  test.setTimeout(180_000);
  await resetMembership();
  const row = await joinViaSheet(page, 'augmented_monthly');
  const sub = await stripe<{ items: { data: { price: { recurring: { interval: string }; unit_amount: number } }[] } }>(`subscriptions/${row.stripe_subscription_id}`);
  expect(sub.items.data[0].price.recurring.interval).toBe('month');
  expect(sub.items.data[0].price.unit_amount).toBe(2999);
});
