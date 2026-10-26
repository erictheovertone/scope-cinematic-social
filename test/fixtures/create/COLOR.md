# C3-2 — colour-management fixtures & the three-readout assert

## RESOLVED (commit 667230c) — the wash was NOT colour management

Eric's device readout (grey byte-identical; red/green/orange each pulled toward
their own luma; blue on orange 0→29) reproduced to the byte under a 0.8 saturation
factor. Root cause: `saturation` is the only asymmetric bi tool ([-1, 0.6]) and
`mapStop` rested the zero-stop at the midpoint (-0.2), not the identity (0) — so
`mix(luma, rgb, 0.8)` ran on EVERY image at rest, in preview and bake alike. Fixed
by anchoring bi tools at a declared `neutral` (saturation → 0). The three-readout
scaffold below stays as the plumbing guard; the colour-managed decode + sRGB
texture pin remain correct hardening, but they were never the wash. The sections
below are kept for the methodology.


## The fixtures (real wide-gamut, not just tagged)

Generated with ImageMagick + the macOS system profile
`/System/Library/ColorSync/Profiles/Display P3.icc`:

- **`p3-swatch.jpg`** — 320×200, embedded **Display P3** ICC (536 bytes, "Copyright
  Apple Inc., 2022"). Two regions, split left/right:
  - **left = green**, stored bytes `[0,255,0]` in P3
  - **right = orange** (the mid-tone), stored bytes `[255,117,0]` in P3
- **`srgb-swatch.jpg`** — the sRGB twin, same visual intent, no P3 profile:
  - **left = green**, stored bytes `[0,255,1]`
  - **right = orange**, stored bytes `[255,127,0]`

`p3-tagged.jpg` (the older fixture, still used by `create-matrix`) only *tags* an
sRGB grid as P3 — it does not carry out-of-sRGB pixels. These two swatches do.

## Why the orange region is the discriminator

Pure P3 primaries are **outside** sRGB and gamut-map (clamp) to the same sRGB
bytes as the unmanaged read, so the **green** region is NOT a reliable
managed-vs-unmanaged discriminator (and a neutral grey is colour-space
invariant). The **orange mid-tone** sits inside both gamuts at different
coordinates, so a correct P3→sRGB conversion lands it near the sRGB twin's
`[255,127,0]`, while an unmanaged read leaves the raw P3 `[255,117,0]` — a
measurable divergence. The twin pair makes "managed or not" a **difference**
measurement, not an absolute one.

> NOTE on `sharp`: `sharp(...).toColorspace('srgb')` returns the stored bytes
> unchanged for these files — it does not model a browser's P3→sRGB display
> transform. That is exactly why the readout has to happen **in the browser**,
> not in Node.

## The three readouts (per Eric's C3-2 spec)

The wash Eric sees is in the **finishing preview**, so the assert samples the
swatch at three hops and localises the first that diverges:

1. **Decode** — the bitmap after `Pipeline`'s
   `createImageBitmap(img,{colorSpaceConversion:'default'})`, drawn onto the
   sRGB-pinned texture-source canvas. Exposed test-only as
   `window.__scopeColorReadout1` and mirrored to the 5-tap overlay as
   `[c3-2] readout1 …` (gated on `NEXT_PUBLIC_TEST_SEAM`).
2. **GL preview** — the gl-react texture readback the finishing preview actually
   displays. Sampled by screenshotting `[data-testid="finishing-step"] canvas`.
3. **Bake** — `bakeLook`'s GL readback (`putImageData` of already-managed
   pixels). Previously ruled out as the wash suspect; covered by its own path.

**If (1) is clean and (2) is washed → the fix is the texture upload (unmanaged
bitmap → GL), not the decode.** Fix at the first hop that diverges.

## Headless WebKit is the plumbing guard — the device is the arbiter

Headless WebKit's colour handling is **not** iPhone Safari's. `create-color`
asserts the *plumbing* (every readout renders a real, non-degenerate swatch; the
twins don't blow apart beyond a gross budget; the discriminator is wired) and
**logs** the per-readout twin Δ so the first diverging hop is visible. The
authoritative check is Eric's phone screenshot of the swatch in the finishing
suite, read off the `[c3-2]` overlay.
