// ── BRIEF MUS-2 — contribution flow + album management gates ─────────────────────────────────────
// TEST ACCOUNT ONLY (global-setup refuses Eric's session before anything runs). Reuses the MUS-1
// seed (one album "Harness Auburn" with 3 approved tracks + a throwaway OTHER composer for 403s).
//   API  — /api/music/release: new album with 3 files → album + tracks at 1..3 · single tracks →
//          Singles (appended) · existing album → appended positions · 401 / 403 / foreign-file 400.
//          /api/music/manage: move Singles → album · album from tracks · delete empty album ·
//          Singles can't be renamed/deleted · non-owner 403 on every write.
//   UI   — /music/add at 1440 and 375, dark + light: empty · 3 files analyzing · ready · submit →
//          DB album + 3 tracks positioned 1..3; composer page shows the album to its owner only;
//          manage page (move / new album from selected) screenshots.
// Everything this creates is titled "MUS2 …" and removed in afterAll (rows + storage objects).
//   BASE_URL=http://localhost:3000 AUTH_STATE=<shared throwaway.json> npx playwright test test/mus-2.spec.ts --workers=1
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BASE, IDS, ALBUM_TITLE, db, me, seed, teardown, sessionToken } from './mus-aug-harness';

const OUT = 'test/shots-mus2';
mkdirSync(OUT, { recursive: true });
const THEMES = ['dark', 'light'] as const;
const authed = () => ({ Authorization: `Bearer ${sessionToken()}`, 'content-type': 'application/json' });

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

// ── fixtures ──
function wav(freq: number, seconds = 3): Buffer {
  const rate = 8000, n = rate * seconds, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const env = 0.3 + 0.7 * Math.abs(Math.sin((Math.PI * i) / (rate * 0.7)));
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 9000 * env), 44 + i * 2);
  }
  return buf;
}
const FILE_NAMES = ['MUS2 Morning Light.wav', 'MUS2 Copper Field.wav', 'MUS2 Last Train.wav'];
const FILES = FILE_NAMES.map((name, i) => { const p = join(tmpdir(), name); writeFileSync(p, wav(220 * (i + 2))); return p; });

const created = { paths: new Set<string>() };
async function upload(owner: string): Promise<{ id: string; url: string }> {
  const id = randomUUID();
  const path = `${owner}/${id}.wav`;
  const { error } = await db.storage.from('music').upload(path, wav(330, 2), { contentType: 'audio/wav', upsert: true });
  if (error) throw new Error(error.message);
  created.paths.add(path);
  return { id, url: db.storage.from('music').getPublicUrl(path).data.publicUrl };
}
const track = (u: { id: string; url: string }, title: string) =>
  ({ id: u.id, title, keywords: ['cinematic', 'ambient'], durationSeconds: 2, fileUrl: u.url });
const release = (body: unknown, headers: Record<string, string> = authed()) =>
  fetch(`${BASE}/api/music/release`, { method: 'POST', headers, body: JSON.stringify(body) });
const manage = (body: unknown, headers: Record<string, string> = authed()) =>
  fetch(`${BASE}/api/music/manage`, { method: 'POST', headers, body: JSON.stringify(body) });
const tracksIn = async (albumId: string) =>
  ((await db.from('tracks').select('id, title, position, status').eq('album_id', albumId).order('position')).data ?? []);

async function cleanup() {
  const m = await me();
  const { data: albums } = await db.from('albums').select('id').eq('composer_id', m.userId).like('title', 'MUS2%');
  const ids = (albums ?? []).map((a) => a.id);
  const { data: trs } = await db.from('tracks').select('id, file_url').eq('composer_user_id', m.userId).like('title', 'MUS2%');
  for (const t of trs ?? []) {
    const p = String(t.file_url).split('/object/public/music/')[1];
    if (p) created.paths.add(decodeURIComponent(p));
  }
  await db.from('tracks').delete().eq('composer_user_id', m.userId).like('title', 'MUS2%');
  if (ids.length) await db.from('albums').delete().in('id', ids);
  for (const id of ids) created.paths.add(`${m.userId}/album-${id}.webp`);
  if (created.paths.size) await db.storage.from('music').remove([...created.paths]);
}

test.beforeAll(async () => { await cleanup(); await seed(); });
test.afterAll(async () => { if (process.env.MUS_KEEP !== '1') { await cleanup(); await teardown(); } });

// ═══ API ═════════════════════════════════════════════════════════════════════════════════════════
test('MUS-2 · release API: new album / singles / existing — positions', async ({}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'API gate runs once');
  const m = await me();

  // new album with 3 files → album + 3 tracks positioned 1..3
  const ups = await Promise.all([0, 1, 2].map(() => upload(m.userId)));
  let r = await release({ target: 'album', album: { title: 'MUS2 Api Album', year: 2026 }, tracks: ups.map((u, i) => track(u, `MUS2 Api ${i + 1}`)) });
  expect(r.status).toBe(200);
  const j = await r.json();
  const rows = await tracksIn(j.albumId);
  expect(rows.map((t) => [t.title, t.position, t.status])).toEqual([['MUS2 Api 1', 1, 'pending'], ['MUS2 Api 2', 2, 'pending'], ['MUS2 Api 3', 3, 'pending']]);
  const { data: al } = await db.from('albums').select('title, year, composer_id, is_singles').eq('id', j.albumId).single();
  expect(al).toMatchObject({ title: 'MUS2 Api Album', year: 2026, composer_id: m.userId, is_singles: false });

  // single tracks → Singles, appended after whatever is there
  const { data: s0 } = await db.from('albums').select('id').eq('composer_id', m.userId).eq('is_singles', true).maybeSingle();
  const before = s0 ? (await tracksIn(s0.id)).length : 0;
  const singles = await Promise.all([0, 1].map(() => upload(m.userId)));
  r = await release({ target: 'singles', tracks: singles.map((u, i) => track(u, `MUS2 Single ${i + 1}`)) });
  expect(r.status).toBe(200);
  const sj = await r.json();
  const { data: sAl } = await db.from('albums').select('is_singles, title').eq('id', sj.albumId).single();
  expect(sAl).toMatchObject({ is_singles: true, title: 'Singles' });
  const sRows = (await tracksIn(sj.albumId)).filter((t) => t.title.startsWith('MUS2 Single'));
  expect(sRows.map((t) => t.position)).toEqual([before + 1, before + 2]);

  // add to existing album (the seeded one holds 1..3) → appended 4, 5
  const ex = await Promise.all([0, 1].map(() => upload(m.userId)));
  r = await release({ target: 'existing', albumId: IDS.album, tracks: ex.map((u, i) => track(u, `MUS2 Appended ${i + 1}`)) });
  expect(r.status).toBe(200);
  const exRows = await tracksIn(IDS.album);
  expect(exRows.filter((t) => t.title.startsWith('MUS2 Appended')).map((t) => t.position)).toEqual([4, 5]);
  expect(exRows.slice(0, 3).map((t) => t.position)).toEqual([1, 2, 3]);

  // non-owner / unauthenticated / foreign files
  const u = await upload(m.userId);
  expect((await release({ target: 'existing', albumId: IDS.otherAlbum, tracks: [track(u, 'MUS2 Nope')] })).status).toBe(403);
  expect((await release({ target: 'singles', tracks: [track(u, 'MUS2 Nope')] }, { 'content-type': 'application/json' })).status).toBe(401);
  const foreign = await upload(IDS.otherUser);
  expect((await release({ target: 'singles', tracks: [track(foreign, 'MUS2 Nope')] })).status).toBe(400);
  expect((await release({ target: 'album', album: { title: 'Singles' }, tracks: [track(u, 'MUS2 Nope')] })).status).toBe(400);
  expect((await db.from('tracks').select('id').eq('title', 'MUS2 Nope')).data ?? []).toHaveLength(0);
});

test('MUS-2 · manage API: move · album from tracks · delete empty · Singles fixed · 403s', async ({}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'API gate runs once');
  const m = await me();
  const { data: singles } = await db.from('albums').select('id').eq('composer_id', m.userId).eq('is_singles', true).single();
  const { data: apiAlbum } = await db.from('albums').select('id').eq('composer_id', m.userId).eq('title', 'MUS2 Api Album').single();
  const singleTracks = (await tracksIn(singles!.id)).filter((t) => t.title.startsWith('MUS2 Single'));

  // move a track out of Singles into an album → appended at 4; Singles renumbered 1..n
  let r = await manage({ action: 'move', trackId: singleTracks[0].id, albumId: apiAlbum!.id });
  expect(r.status).toBe(200);
  const inAlbum = await tracksIn(apiAlbum!.id);
  expect(inAlbum.map((t) => t.title)).toEqual(['MUS2 Api 1', 'MUS2 Api 2', 'MUS2 Api 3', 'MUS2 Single 1']);
  expect(inAlbum.map((t) => t.position)).toEqual([1, 2, 3, 4]);
  const left = await tracksIn(singles!.id);
  expect(left.map((t) => t.position)).toEqual(left.map((_, i) => i + 1));
  // and back into Singles
  expect((await manage({ action: 'move', trackId: singleTracks[0].id, albumId: singles!.id })).status).toBe(200);
  expect((await tracksIn(apiAlbum!.id)).map((t) => t.position)).toEqual([1, 2, 3]);

  // a new album from selected tracks, in the order given
  r = await manage({ action: 'album_from_tracks', title: 'MUS2 From Selected', year: 2025, trackIds: [singleTracks[1].id, singleTracks[0].id] });
  expect(r.status).toBe(200);
  const fromId = (await r.json()).id;
  expect((await tracksIn(fromId)).map((t) => [t.title, t.position])).toEqual([['MUS2 Single 2', 1], ['MUS2 Single 1', 2]]);

  // delete: non-empty → 409; empty → gone; Singles → refused; Singles rename → refused
  expect((await manage({ action: 'album_delete', albumId: fromId })).status).toBe(409);
  await manage({ action: 'move', trackId: singleTracks[0].id, albumId: singles!.id });
  await manage({ action: 'move', trackId: singleTracks[1].id, albumId: singles!.id });
  expect((await manage({ action: 'album_delete', albumId: fromId })).status).toBe(200);
  expect((await db.from('albums').select('id').eq('id', fromId)).data ?? []).toHaveLength(0);
  expect((await manage({ action: 'album_delete', albumId: singles!.id })).status).toBe(400);
  expect((await manage({ action: 'album_update', albumId: singles!.id, title: 'Renamed' })).status).toBe(400);

  // non-owner 403 on every write (and nothing changes)
  const theirs = await tracksIn(IDS.otherAlbum);
  const writes: Record<string, unknown>[] = [
    { action: 'move', trackId: IDS.otherTrack, albumId: apiAlbum!.id },
    { action: 'move', trackId: singleTracks[0].id, albumId: IDS.otherAlbum },
    { action: 'album_from_tracks', title: 'MUS2 Steal', trackIds: [IDS.otherTrack] },
    { action: 'album_from_tracks', title: 'MUS2 Steal', trackIds: [singleTracks[0].id, IDS.otherTrack] },
    { action: 'album_delete', albumId: IDS.otherAlbum },
    { action: 'album_update', albumId: IDS.otherAlbum, title: 'MUS2 Steal' },
    { action: 'reorder', albumId: IDS.otherAlbum, trackIds: [IDS.otherTrack] },
    { action: 'track_rename', trackId: IDS.otherTrack, title: 'MUS2 Steal' },
  ];
  for (const w of writes) expect((await manage(w)).status, JSON.stringify(w)).toBe(403);
  for (const w of writes) expect((await manage(w, { 'content-type': 'application/json' })).status, `401 ${w.action}`).toBe(401);
  expect(await tracksIn(IDS.otherAlbum)).toEqual(theirs);
  expect((await db.from('albums').select('id').like('title', 'MUS2 Steal')).data ?? []).toHaveLength(0);
});

// ═══ UI ══════════════════════════════════════════════════════════════════════════════════════════
async function themed(page: Page, theme: string) {
  await page.addInitScript((t) => { try { localStorage.setItem('scope.theme', t); } catch { /* */ } }, theme);
}
const shot = (page: Page, project: string, theme: string, name: string) =>
  page.screenshot({ path: `${OUT}/${project}-${theme}-${name}.png`, fullPage: false });

for (const theme of THEMES) {
  test(`MUS-2 · contribution page: new album with 3 files · ${theme}`, async ({ page }, info) => {
    const p = info.project.name;
    const m = await me();
    const albumTitle = `MUS2 Auburn ${p === 'desktop-chromium' ? 'Desk' : 'Phone'} ${theme}`;
    await themed(page, theme);

    // Hold the storage PUTs so the "analyzing" state is visible long enough to capture.
    let hold = true;
    await page.route('**/storage/v1/object/upload/sign/**', async (route) => {
      while (hold) await new Promise((r) => setTimeout(r, 200));
      await route.continue();
    });

    await page.goto('/music/add', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('dropzone')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await shot(page, p, theme, '1-empty');

    await page.getByTestId('album-title').fill(albumTitle);
    await page.getByTestId('audio-input').setInputFiles(FILES);
    await expect(page.getByTestId('track-row')).toHaveCount(3, { timeout: 20_000 });
    await expect(page.locator('[data-testid="track-row"][data-status="analyzing"]')).toHaveCount(3);
    await expect(page.getByTestId('release-count')).toHaveText(`3 tracks · ${albumTitle}`);
    await expect(page.getByTestId('release-submit')).toBeDisabled();
    await page.getByTestId('track-list').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, p, theme, '2-analyzing');

    hold = false;
    await expect(page.locator('[data-testid="track-row"][data-status="ready"]')).toHaveCount(3, { timeout: 60_000 });
    // titles default to the filename without its extension
    for (const [i, n] of FILE_NAMES.entries()) await expect(page.getByTestId('track-title').nth(i)).toHaveValue(n.replace(/\.wav$/, ''));
    // drag the last row to the top → that's the album order
    const handles = page.getByTestId('drag-handle');
    await page.getByTestId('track-list').scrollIntoViewIfNeeded();
    const from = await handles.nth(2).boundingBox(); const to = await handles.nth(0).boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y - 6, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('track-title').first()).toHaveValue('MUS2 Last Train');
    await page.getByTestId('kw-cinematic').first().click();
    await page.getByTestId('kw-ambient').first().click();
    await page.getByTestId('license').click();
    await expect(page.getByTestId('release-submit')).toBeEnabled();
    await page.getByTestId('track-list').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, p, theme, '3-ready');

    await page.getByTestId('release-submit').click();
    await expect(page.getByTestId('release-done')).toBeVisible({ timeout: 30_000 });
    await shot(page, p, theme, '4-submitted');

    const { data: al } = await db.from('albums').select('id').eq('composer_id', m.userId).eq('title', albumTitle).single();
    expect((await tracksIn(al!.id)).map((t) => [t.title, t.position, t.status])).toEqual([
      ['MUS2 Last Train', 1, 'pending'], ['MUS2 Morning Light', 2, 'pending'], ['MUS2 Copper Field', 3, 'pending'],
    ]);

    // the owner sees the new album on their composer page ("In review"); nobody else does
    await page.goto(`/composer/${m.username}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(albumTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/in review · only you see this/i).first()).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, p, theme, '5-composer-owner');
    const anon = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
    const ap = await anon.newPage();
    await ap.goto(`${BASE}/composer/${m.username}`, { waitUntil: 'domcontentloaded' });
    await expect(ap.getByText(ALBUM_TITLE).first()).toBeVisible({ timeout: 20_000 });
    await expect(ap.getByText(albumTitle)).toHaveCount(0);
    await anon.close();
  });
}

for (const theme of THEMES) {
  test(`MUS-2 · manage: move + new album from selected · ${theme}`, async ({ page }, info) => {
    const p = info.project.name;
    const m = await me();
    await themed(page, theme);
    await page.goto(`/composer/${m.username}/manage`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(ALBUM_TITLE).first()).toBeVisible({ timeout: 30_000 });
    // the seeded album is first in page order → already selected
    await expect(page.getByTestId('manage-pick').first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('manage-pick').nth(0).click();
    await page.getByTestId('manage-pick').nth(1).click();
    await expect(page.getByTestId('manage-from-picked')).toBeVisible();
    await page.getByTestId('manage-from-picked-title').fill('MUS2 Selected Preview');
    await page.getByTestId('manage-move').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, p, theme, '6-manage');
  });
}
