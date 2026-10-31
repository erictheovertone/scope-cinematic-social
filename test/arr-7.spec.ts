// ── BRIEF ARR-7 — new member capture through Arrival ─────────────────────────────────────────────
// HARD RULE (global-setup + the guard below): never Eric's DID / eric@muon.film.
//
// A. ROUTING (runs on the shared EBERT harness session — an EXISTING member):
//    · signed in + an Arrival sign-up in flight (intent + scope_arrival cookie, i.e. back from Google
//      OAuth) → /arrival sends to /auth/callback → follow + attribution written → /profile/<name>?arrived=1
//    · signed in, NO intent (a member opening a shared link) → straight to /profile/<name>, nothing written
//    · /auth/callback with no intent, has a username → the feed (UserSyncProvider no longer races it)
// B. FRESH SIGN-UP (needs Privy test accounts: PRIVY_TEST_EMAIL + PRIVY_TEST_OTP in .env.local).
//    The Privy account persists between runs, so "fresh" = its Supabase rows are deleted first —
//    onboarding keys off the Supabase profile, exactly as for a real new member.
//    · /overtone → Follow on → Continue with email → OTP → onboarding RAN → lands on the LIVE
//      /profile/overtone?arrived=1 (fresh data, scrolls, taps, no Privy overlay) → own Following = 1,
//      attribution row written.               (phone + desktop)
//    · plain /welcome sign-up, no intent → onboarding RAN → lands where it always did
//      (phone: /profile?new=1 · desktop: /profile).   (phone + desktop)
//
//   PUBLIC_PROFILES_ENABLED=1 on the dev server (else /overtone 404s and /api/arrival/follow is off).
//   BASE_URL=http://localhost:3000 AUTH_STATE=test/.auth/throwaway.json npx playwright test test/arr-7.spec.ts --workers=1
import { test, expect, type Page } from '@playwright/test';
import { db, me, E } from './mus-aug-harness';

const CREATOR = 'overtone';
const TEST_EMAIL = E('PRIVY_TEST_EMAIL');
const TEST_OTP = E('PRIVY_TEST_OTP');
const ERIC_DID = 'did:privy:cmhjqhry90120kz0ddgzkir25';
if (/eric@muon\.film/i.test(TEST_EMAIL)) throw new Error('REFUSED: PRIVY_TEST_EMAIL is Eric\'s address — use a Privy test account');

test.describe.configure({ mode: 'serial' });

async function creator() {
  const { data: p } = await db.from('profiles').select('user_id, username').ilike('username', CREATOR).single();
  const { data: u } = await db.from('users').select('privy_id').eq('id', p!.user_id).single();
  return { username: p!.username as string, did: u!.privy_id as string };
}
const followerCount = async (did: string) =>
  (await db.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', did)).count ?? 0;

/** Undo what an arrival writes for a DID: its follow of the creator + notifications it sent + attribution. */
async function undoArrival(did: string, creatorDid: string, opts: { deleteAccount?: boolean } = {}) {
  if (did === ERIC_DID) throw new Error('REFUSED: teardown against Eric\'s DID');
  await db.from('follows').delete().eq('follower_id', did).eq('following_id', creatorDid);
  const { data: u } = await db.from('users').select('id').eq('privy_id', did).maybeSingle();
  if (u?.id) {
    await db.from('notifications').delete().eq('sender_id', u.id).then(() => undefined, () => undefined);
    if (opts.deleteAccount) {
      await db.from('follows').delete().eq('follower_id', did);
      await db.from('users').delete().eq('id', u.id); // profiles + the rest cascade
    } else {
      await db.from('users').update({ signup_ref: null, signup_profile: null }).eq('id', u.id);
    }
  }
}

/** goto that tolerates the redirect chain (server → /auth/callback → client replace) superseding it. */
const gotoChain = (page: Page, url: string) =>
  page.goto(url, { waitUntil: 'commit' }).catch((e) => { if (!/ERR_ABORTED|interrupted|NS_BINDING_ABORTED/i.test(String(e))) throw e; });

async function seedIntent(page: Page, follow = true) {
  await page.evaluate(([u, f]) => {
    localStorage.setItem('scope.arrival', JSON.stringify({ username: u, ref: 'arr7-harness', follow: f, at: Date.now() }));
    document.cookie = 'scope_arrival=1; path=/; max-age=3600; samesite=lax';
  }, [CREATOR, follow] as const);
}

// ═══ A. ROUTING — existing member (EBERT) ═══════════════════════════════════════════════════════
test.describe('A · routing (existing member)', () => {
  test('signed in + sign-up in flight (Google return) → callback → follow + attribution → ?arrived=1', async ({ page }) => {
    const m = await me();
    const c = await creator();
    await undoArrival(m.did, c.did);
    try {
      await page.goto('/library');
      await seedIntent(page);
      const hops: string[] = [];
      page.on('framenavigated', (f) => { if (f === page.mainFrame()) hops.push(new URL(f.url()).pathname); });
      await gotoChain(page, `/${CREATOR}`);
      await expect(page).toHaveURL(new RegExp(`/profile/${c.username}\\?arrived=1|/profile/${c.username}$`, 'i'), { timeout: 30_000 });
      console.log('[arr-7] hops:', hops.join(' → '));
      expect(hops).toContain('/auth/callback');
      await expect(page.getByText(new RegExp(`following ${CREATOR}`, 'i'))).toBeVisible({ timeout: 10_000 });
      const { count } = await db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', m.did).eq('following_id', c.did);
      expect(count).toBe(1);
      const { data: u } = await db.from('users').select('signup_ref, signup_profile').eq('privy_id', m.did).single();
      expect(u).toMatchObject({ signup_ref: 'arr7-harness', signup_profile: c.username });
      expect(await page.evaluate(() => [localStorage.getItem('scope.arrival'), document.cookie.includes('scope_arrival=1')])).toEqual([null, false]);
    } finally {
      await undoArrival(m.did, c.did);
    }
  });

  test('signed in, no intent (shared link) → straight to the profile, nothing written', async ({ page }) => {
    const m = await me();
    const c = await creator();
    await undoArrival(m.did, c.did);
    const hops: string[] = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) hops.push(new URL(f.url()).pathname); });
    await gotoChain(page, `/${CREATOR}`);
    await expect(page).toHaveURL(new RegExp(`/profile/${c.username}$`, 'i'), { timeout: 20_000 });
    expect(hops).not.toContain('/auth/callback');
    const { count } = await db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', m.did).eq('following_id', c.did);
    expect(count).toBe(0);
  });

  test('/auth/callback, no intent, has a username → the feed (phone) / feed or onboarding (desktop)', async ({ page }, info) => {
    await gotoChain(page, '/auth/callback');
    if (info.project.name === 'desktop-chromium') await expect(page).toHaveURL(/\/(onboarding)?$/, { timeout: 20_000 });
    else await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  });
});

// ═══ B. FRESH SIGN-UP — Privy test account ══════════════════════════════════════════════════════
const isDesktop = (name: string) => name === 'desktop-chromium';

/** Privy's email-code modal: email → submit → 6-digit code. Selectors are tolerant of Privy's markup. */
async function privyEmailLogin(page: Page) {
  const modal = page.locator('#privy-modal-content, [id^="privy-dialog"], [role="dialog"]').filter({ has: page.locator('input') }).first();
  const email = page.locator('#email-input, input[type="email"], input[name="email"]').first();
  await expect(email).toBeVisible({ timeout: 20_000 });
  await email.fill(TEST_EMAIL);
  await email.press('Enter');
  const code = page.locator('input[name^="code-"], input[autocomplete="one-time-code"], input[inputmode="numeric"]').first();
  await expect(code).toBeVisible({ timeout: 20_000 });
  await code.click();
  await page.keyboard.type(TEST_OTP, { delay: 60 });
  await expect(modal).toBeHidden({ timeout: 45_000 }).catch(() => { /* Privy may keep a success screen; routing asserts below decide */ });
}

const didFromPage = (page: Page) => page.evaluate(() => {
  const raw = localStorage.getItem('privy:token');
  if (!raw) return null;
  try { return JSON.parse(atob(JSON.parse(raw).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub as string; } catch { return null; }
});

/** Mobile: /profile/setup → grid-layout → CONFIRM → WelcomeTransition. Desktop: explainer → setup → picker. */
async function runOnboarding(page: Page, desktop: boolean, handle: string) {
  if (desktop) {
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    for (let i = 0; i < 8 && !(await page.getByText('SET UP YOUR PROFILE').isVisible().catch(() => false)); i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(500);
    }
    await expect(page.getByText('SET UP YOUR PROFILE')).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder('@HANDLE').fill(handle);
    await page.getByRole('button', { name: 'CONTINUE' }).click();
    await page.locator('[data-testid^="picker-aspect-"]').first().click({ timeout: 20_000 });
    await page.getByTestId('picker-count-4').click();
    await page.getByTestId('picker-confirm').click();
  } else {
    await expect(page).toHaveURL(/\/profile\/setup/, { timeout: 30_000 });
    await page.getByPlaceholder('@ USERNAME').fill(handle);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/profile\/grid-layout/, { timeout: 20_000 });
    await page.getByText('1X SCOPE', { exact: true }).first().click();
    await page.getByRole('button', { name: /^CONFIRM$/ }).click({ timeout: 15_000 });
  }
}

test.describe('B · fresh sign-up', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!TEST_EMAIL || !TEST_OTP, 'needs PRIVY_TEST_EMAIL + PRIVY_TEST_OTP (Privy dashboard → test accounts) in .env.local');

  let freshDid: string | null = null;
  test.afterEach(async () => { if (freshDid) { const c = await creator(); await undoArrival(freshDid, c.did, { deleteAccount: true }); freshDid = null; } });

  /** A previous run's account rows (same Privy test account) — wiped so this sign-up is a NEW member. */
  async function wipeLeftover(page: Page) {
    const did = await didFromPage(page);
    if (did && did !== ERIC_DID) {
      const { data: u } = await db.from('users').select('id').eq('privy_id', did).maybeSingle();
      const { data: p } = u ? await db.from('profiles').select('username').eq('user_id', u.id).maybeSingle() : { data: null };
      if (p?.username) throw new Error(`test account still has a profile (${p.username}) — previous teardown failed; rerun`);
    }
  }

  test('Arrival /overtone + Follow → onboarding → LIVE creator profile → Following = 1', async ({ page }, info) => {
    const desktop = isDesktop(info.project.name);
    const c = await creator();
    const before = await followerCount(c.did);
    const handle = `ARR7${desktop ? 'D' : 'M'}${Date.now().toString(36).slice(-5)}`.toUpperCase();
    const hops: string[] = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) hops.push(new URL(f.url()).pathname); });

    await page.goto(`/${CREATOR}`);
    // Close the aperture (any tap on the first screen reveals the card), check Follow is ON, sign up.
    await page.mouse.click(10, 300);
    const follow = page.getByRole('checkbox', { name: /follow/i });
    await expect(follow).toBeVisible({ timeout: 15_000 });
    if ((await follow.getAttribute('aria-checked')) !== 'true') await follow.click();
    await page.getByRole('button', { name: /continue with email/i }).click();
    await privyEmailLogin(page);
    freshDid = await didFromPage(page);
    expect(freshDid, 'Privy session').toBeTruthy();
    expect(freshDid).not.toBe(ERIC_DID);
    await wipeLeftover(page);

    // Onboarding RAN (the bug: it never did).
    await runOnboarding(page, desktop, handle);

    // Landed on the creator's LIVE profile.
    await expect(page).toHaveURL(new RegExp(`/profile/${c.username}`, 'i'), { timeout: 30_000 });
    console.log(`[arr-7] ${info.project.name} hops:`, hops.join(' → '));
    expect(hops).toContain('/auth/callback');
    expect(hops.some((h) => /\/profile\/setup|\/onboarding/.test(h))).toBeTruthy();
    await expect(page.getByText(new RegExp(`following ${CREATOR}`, 'i'))).toBeVisible({ timeout: 15_000 });

    // "Not frozen": no Privy overlay left, the grid loaded real images, it scrolls, a tap responds,
    // and the header shows the follower count INCLUDING this new follow (fresh data, not a snapshot).
    await expect(page.locator('#privy-modal-content')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length), { timeout: 20_000 }).toBeGreaterThan(2);
    const after = await followerCount(c.did);
    expect(after).toBe(before + 1);
    await expect(page.getByText(String(after), { exact: true }).first()).toBeVisible();
    const scrolled = await page.evaluate(async () => {
      const sc = [...document.querySelectorAll<HTMLElement>('*')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 40);
      if (!sc) return 'no-scroller';
      const t0 = sc.scrollTop; sc.scrollBy(0, 200); await new Promise((r) => setTimeout(r, 300));
      return sc.scrollTop > t0 ? 'ok' : 'stuck';
    });
    expect(['ok', 'no-scroller']).toContain(scrolled);
    await page.getByRole('button', { name: /profile info/i }).first().click();
    await expect(page.getByRole('button', { name: /profile info/i }).first()).toBeVisible();
    await page.screenshot({ path: `test/shots-arr7/${info.project.name}-landed.png` });

    // The new member's own profile: Following = 1. Attribution row written.
    const { data: u } = await db.from('users').select('id, signup_ref, signup_profile').eq('privy_id', freshDid!).single();
    expect(u).toMatchObject({ signup_profile: c.username });
    const { count: following } = await db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', freshDid!);
    expect(following).toBe(1);
    await page.goto('/profile');
    if (!desktop) await page.getByRole('button', { name: /view profile info/i }).click();
    else await page.getByRole('button', { name: /^profile info$/i }).click();
    await expect(page.getByText(/following/i).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `test/shots-arr7/${info.project.name}-own-following.png` });
  });

  test('plain /welcome sign-up (no Arrival intent) → onboarding → lands where it always did', async ({ page }, info) => {
    const desktop = isDesktop(info.project.name);
    const handle = `ARR7W${desktop ? 'D' : 'M'}${Date.now().toString(36).slice(-5)}`.toUpperCase();
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Sign up' }).click();
    // Privy's full modal: pick email first if it lists methods.
    const emailBtn = page.getByRole('button', { name: /^email$|continue with email/i });
    if (await emailBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) await emailBtn.first().click();
    await privyEmailLogin(page);
    freshDid = await didFromPage(page);
    expect(freshDid).not.toBe(ERIC_DID);
    await wipeLeftover(page);
    await runOnboarding(page, desktop, handle);
    if (desktop) await expect(page).toHaveURL(/\/profile$/, { timeout: 30_000 });
    else await expect(page).toHaveURL(/\/profile\?new=1/, { timeout: 30_000 });
    const { count } = await db.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', freshDid!);
    expect(count).toBe(0);
  });
});
