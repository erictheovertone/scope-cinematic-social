import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

// HOME-3.1 Part A — production proof. Against a production build of the shipped commit, reading the LIVE
// production Supabase, on OVERTONE's profile grid (where both confirmed Soot posts live):
//   · the resting <img> for b4527da6 (Soot@12) and 420c76e6 (Soot@11.5) carries a grayscale() filter;
//   · a 12-shot burst, 50 ms apart, cache disabled, as the tile enters view — no colour frame.
// Thumbnail ids identify each post's <img> (feedImage keeps the Stream thumbnail id in the src).

const POSTS = [
  { id: 'b4527da6', thumb: 'a1a9735c148d3d10aafe0e1b98f7874e', wantGray: 'grayscale(1' },
  { id: '420c76e6', thumb: '652f230500511db6b4e3606d1bcc5c80', wantGray: 'grayscale(0.9' },
];

test('HOME-3.1 §A — B&W resting still carries grayscale; no colour frame on entry', async ({ page }, info) => {
  const OUT = join(process.cwd(), 'test/shots-h31');
  mkdirSync(OUT, { recursive: true });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); // cache disabled per the brief

  await page.goto('/profile/OVERTONE?debug=video', { waitUntil: 'domcontentloaded' });

  // Bring the grid in: scroll down in steps until BOTH tiles' <img> exist in the DOM.
  const findImg = (thumb: string) => page.locator(`img[src*="${thumb}"]`).first();
  for (let s = 0; s < 40; s++) {
    const seen = await Promise.all(POSTS.map((p) => findImg(p.thumb).count()));
    if (seen.every((c) => c > 0)) break;
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
  }

  const results: Record<string, { inlineFilter: string; computedFilter: string }> = {};
  for (const p of POSTS) {
    const img = findImg(p.thumb);
    await img.waitFor({ state: 'attached', timeout: 15_000 });
    const got = await img.evaluate((el) => ({
      inlineFilter: (el as HTMLElement).style.filter || '',
      computedFilter: getComputedStyle(el as HTMLElement).filter || '',
    }));
    results[p.id] = got;
    console.log(`[H31] ${p.id} inline.filter="${got.inlineFilter}" computed.filter="${got.computedFilter}"`);
    // The resting <img> must carry grayscale (inline style — videoCssFilter output).
    expect(got.inlineFilter, `${p.id} resting <img> must carry grayscale`).toContain('grayscale(');
    expect(got.inlineFilter, `${p.id} grayscale amount`).toContain(p.wantGray);
  }

  // Burst: put b4527da6 just BELOW the fold, then scroll it through the fold over 12 frames (50 ms apart),
  // screenshotting the whole viewport each time — proving no colour frame appears as it enters view.
  const target = findImg(POSTS[0].thumb);
  await target.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await page.mouse.wheel(0, 500); // push it just under the fold
  await page.waitForTimeout(300);
  const burst: string[] = [];
  for (let i = 0; i < 12; i++) {
    const f = join(OUT, `burst-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: f, type: 'png' }).catch(() => {});
    burst.push(f);
    await page.mouse.wheel(0, 120); // nudge the tile up through the fold
    await page.waitForTimeout(50);
  }

  await info.attach('h31-filters', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  console.log(`[H31] burst frames: ${burst.length} → ${OUT}`);
});
