import { test, expect } from '@playwright/test';

// ── Brief P0 — profile + post-scroll rendition guard (PERMANENT) ──────────────
// The regression: post-media images published before renditions existed (or whose bake
// failed) 404'd their `.{w}.webp`; the global fallback reverted every visible tile to its
// full-res MASTER, and decoding several masters at once killed the tab on iOS ("four 400s,
// then the tab dies, no JS error"). The fix gates rendition URLs on posts.media_has_renditions
// (MediaRenderer img + poster) and loads uploaded video posters / deck thumbnails directly,
// so a legacy profile never requests a rendition that doesn't exist.
//
// This asserts: opening the profile and the post scroll produces ZERO 404 rendition
// responses and ZERO <img> error events. Run on iphone-webkit @375 (the device that died).
//   BASE_URL=http://localhost:3100 AUTH_STATE=test/.auth/throwaway.json \
//     npx playwright test test/profile-post-scroll.spec.ts --project=iphone-webkit

test('profile + post scroll — no 404 renditions, no image error events', async ({ page }) => {
  const badRenditions: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && /\.(?:600|1600|2560)\.webp(\?|$)/.test(r.url())) badRenditions.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
  });
  await page.addInitScript(() => {
    (window as unknown as { __imgErr: string[] }).__imgErr = [];
    document.addEventListener('error', (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'IMG') (window as unknown as { __imgErr: string[] }).__imgErr.push((t as HTMLImageElement).currentSrc || (t as HTMLImageElement).src);
    }, true);
  });

  await page.goto('/profile', { waitUntil: 'domcontentloaded' });
  // Wait for the authed grid (clickable post tiles with media) — also renders the decks strip.
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('div')].some((d) => {
      try { return getComputedStyle(d).cursor === 'pointer' && !!d.querySelector('img,video') && d.getBoundingClientRect().width > 80; } catch { return false; }
    });
  }, { timeout: 20_000 });

  // Open the post scroll on the first tile (the reported crash gesture).
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('div')].find((d) => {
      try { return getComputedStyle(d).cursor === 'pointer' && !!d.querySelector('img,video') && d.getBoundingClientRect().width > 80; } catch { return false; }
    });
    (t as HTMLElement | undefined)?.click();
  });
  await page.waitForTimeout(3500); // the scroll + its media settle

  const imgErr = await page.evaluate(() => (window as unknown as { __imgErr: string[] }).__imgErr);
  expect(badRenditions, `rendition 404s on profile/post-scroll:\n${badRenditions.join('\n')}`).toEqual([]);
  expect(imgErr, `<img> error events on profile/post-scroll:\n${imgErr.join('\n')}`).toEqual([]);

  // Brief SCROLL-GUARD — no scroll <img> may load a MASTER. Every content image (post-media
  // rendition or Cloudflare Stream thumbnail; avatars/deck-covers excluded) must resolve to a
  // ≤1600 rendition. Measure the widest decoded natural width AND the decoded-image memory.
  //   • max naturalWidth ≤ 1600  (hard cap: anything > 2048 is a leaked master → fail)
  //   • decoded MB < 120         (tightened from P0b's 200; the poster leak was the hog)
  // (Headless releases offscreen decodes, so MB here is a floor, not the device peak — device
  // validation still owns the final word; the naturalWidth cap is exact regardless.)
  const { maxW, widest, mem } = await page.evaluate(() => {
    const isContent = (s: string) => s.includes('/post-media/') || s.includes('cloudflarestream.com/');
    let bytes = 0, maxW = 0, widest = '';
    for (const i of [...document.querySelectorAll('img')]) {
      const im = i as HTMLImageElement; const src = im.currentSrc || im.src;
      if (im.naturalWidth > 0 && isContent(src)) {
        bytes += im.naturalWidth * im.naturalHeight * 4;
        if (im.naturalWidth > maxW) { maxW = im.naturalWidth; widest = src.replace(/^https?:\/\/[^/]+/, ''); }
      }
    }
    for (const v of [...document.querySelectorAll('video')]) { const vd = v as HTMLVideoElement; if (vd.videoWidth > 0) bytes += vd.videoWidth * vd.videoHeight * 4; }
    return { maxW, widest, mem: Math.round(bytes / 1048576) };
  });
  console.log(`[SCROLL-GUARD] widest scroll image = ${maxW}px (${widest || 'none'}) · decoded = ${mem}MB`);
  expect(maxW, `widest scroll image = ${maxW}px (gate ≤ 1600) — ${widest}`).toBeLessThanOrEqual(1600);
  expect(mem, `decoded-image memory at open = ${mem}MB (gate < 120MB)`).toBeLessThan(120);
});
