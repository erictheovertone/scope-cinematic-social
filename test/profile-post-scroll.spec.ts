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

  // Brief P0b — decoded-image memory at open must stay well under the iOS kill threshold
  // (~1.5GB, far less on older phones). Sum naturalW×naturalH×4 across every decoded post-media
  // <img> + videoW×videoH×4 across <video>. The scroll windows media to the visible post ±1, so
  // this stays bounded regardless of post count. (Headless releases offscreen decodes, so this is
  // a floor, not the device peak — device validation still owns the final word.)
  const mem = await page.evaluate(() => {
    let bytes = 0;
    for (const i of [...document.querySelectorAll('img')]) { const im = i as HTMLImageElement; if (im.naturalWidth > 0 && (im.currentSrc || im.src).includes('/post-media/')) bytes += im.naturalWidth * im.naturalHeight * 4; }
    for (const v of [...document.querySelectorAll('video')]) { const vd = v as HTMLVideoElement; if (vd.videoWidth > 0) bytes += vd.videoWidth * vd.videoHeight * 4; }
    return Math.round(bytes / 1048576);
  });
  expect(mem, `decoded-image memory at open = ${mem}MB (gate < 200MB)`).toBeLessThan(200);
});
