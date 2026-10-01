"use client";

/**
 * neutralTestFrame — a small synthetic frame (luminance ramp + skin/sky/foliage
 * patches) used as the FALLBACK source for PALETTE tiles whose burned-in
 * thumbnail is missing (pre-existing saves or a failed capture). Baking a look
 * onto it shows the look's CHARACTER (exposure / contrast / WB / saturation /
 * LUT) so a thumb-less tile is never a black box. Cached after first build.
 */

let cached: Promise<HTMLImageElement> | null = null;

export function neutralTestFrame(): Promise<HTMLImageElement> {
  if (cached) return cached;
  cached = (async () => {
    const S = 240;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d')!;
    // Horizontal luminance ramp (dark → mid → light) — reads exposure/contrast.
    const g = ctx.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, '#0a0a0a'); g.addColorStop(0.5, '#808080'); g.addColorStop(1, '#f2f2f2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // Colour patches — read white balance, saturation, and LUT colour response.
    const patches = ['#c08a6a', '#5a86b0', '#6f8f55', '#b04a4a'];
    const pw = S / patches.length;
    patches.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * pw, S * 0.62, pw, S * 0.38); });
    const img = new Image();
    img.src = cv.toDataURL('image/jpeg', 0.9);
    await img.decode().catch(() => { /* fall through; bakeLook waits on its own draw */ });
    return img;
  })();
  return cached;
}
