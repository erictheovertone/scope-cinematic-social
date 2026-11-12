# HOME-3 — graded from the first frame

Eric's rule: a graded video shows graded **at rest, at start, and on every loop, on every surface**. The
feed was flashing Stream's raw ungraded frame at start and again on every loop, and the resting still was
Stream's raw thumbnail (uncropped) because the baked poster was almost always missing.

## What shipped (playback side — commit 1037c55)

- **§A Loop without teardown.** `usePipeline` was gated on the instantaneous `playing`, which blips false
  for a moment at every loop boundary (ended → pause → play). The WebGL pipeline was therefore destroyed
  and rebuilt each loop, flashing the raw frame in the gap. It now mounts on `shouldAttach` and **latches**
  until the player truly detaches / the source changes / it fails.
- **§B Reveal only when graded.** The graded resting still stays on top (zIndex 2) until the pipeline draws
  its first frame (gl-react `onLoad`); then it drops below.
- **§C Resting still, graded + framed, per context.** Autoplay surfaces rest on the **start** frame
  (time 0 / snippet_start); non-autoplay on the **hero** poster. Baked stills are shown as-is; a missing
  baked still falls back to the raw Stream thumbnail laid out with the video's **crop geometry** + the
  right **frame time** + the **CSS grade approximation** — never raw, never the wrong crop.
- **§E** Preempt the **least-visible** holder for a more-visible requester (was off-screen-only); the
  loop-boundary pause is no longer mislabelled `OURS:view-exit` (the reason is timestamped, honoured only
  within 400 ms).

### Verification (trace)

On a local production build with `?debug=video` and `GRADED_PLAYBACK_ALLOWLIST=*`:

- **desktop-chromium (graded WebGL path):** the first graded card looped **17×** with **0** `pipeline unmount`.
- **iphone-webkit (CSS path — headless WebKit can't texture HLS, so it exercises the non-pipeline path):**
  looped **10×** with **0** teardown.

Before HOME-3 every loop logged `pipeline unmount → pipeline mount`. The brief asked for zero across 5
loops. Contact sheets (`contact-sheet-*.png`) sample the first graded card every 300 ms across those loops;
no frame shows the raw picture. Tiles are small — the per-frame grade arbiter is a real device.

## The bake diagnosis (publish side)

Of the last 18 video posts, **17 had `poster_url = null`**; all 18 had `heroFrameTime = 0` and real look
edits; all had `stream_poster_url`. `heroFrameTime = 0` everywhere rules out a seek hang. The poster bake's
look step (`bakeLook`) renders an **offscreen gl-react WebGL Surface** and reads it back; but the bake first
ran `captureVideoFrameFile`, which **opened a SECOND `<video>` to decode the raw clip**. Under iOS WebKit's
one-hardware-decoder limit (the create flow's `edit` element already holds the decoder), that second decode
stalls → the 25 s best-effort timeout fires → `poster_url` stays null. Publishing proceeds (best-effort),
so it was silent. Not reproducible on headless Playwright-WebKit (no device decoder limit) — the iPhone is
the arbiter.

## The fix (publish side — approved: capture from the live finishing Surface, no second decode)

`bakeGradedVideoFrame(editVideo, params, timeSec)` captures the **exact graded frame** from the
already-decoded EDIT & POST preview element (seek → read back through the finishing pipeline's child-FBO,
the same iOS-proven readback photos use) — **no re-decode of the raw clip**. At publish we bake **two**
stills, grade-then-crop (matching what the preview showed), upload with renditions, and write both:

- `poster_url` = the **hero** frame (cover where the video does not autoplay).
- `start_poster_url` = the **start** frame, time 0 (the resting still on autoplay surfaces). When
  `heroFrameTime` is 0 (today's posts) the two are the same frame, so it is baked once and reused.

Publishing **never blocks** on it (best-effort + 25 s timeout); on failure both stay null and the §C live
fallback renders the graded, cropped resting frame from the Stream thumbnail.

Column (run by Eric): `alter table posts add column if not exists start_poster_url text;`

## Autoplay surfaces (resting still = start frame)

Home feed, profile grid (mobile + desktop), profile scroll, lightbox/PostModal, desktop post view,
Mirage, screening room (mobile + desktop), theatre (when centered), collect sheet (while open). Snippet
contexts (grids, Mirage, SR) start at `snippet_start`; full contexts at 0. Non-autoplay (resting still =
hero `poster_url`): any post with `autoplay = false`, the collect sheet while closed, and the non-GradedVideo
hero consumers — coin image, notifications, link previews.

## Section D (existing posts without a baked still) — HELD for Eric's choice

1. Owner-device backfill on self-view (recommended). 2. One-time "regrade my posts" owner action.
3. Server batch backfill (raw frame only — can't apply the LUT server-side; low value).
4. Do nothing — the §C live fallback already renders existing posts graded + cropped (interim, in effect).
