# VID-2 — finishing edits at playback (WebGL): integration points

Prep notes written while Eric runs the §0 device FPS gate. **No `GradedVideo` changes yet** — this
records where the graded render path plugs in so item 1 is a surgical change, not a sprawl.

## The one chokepoint: `src/components/finishing/GradedVideo.tsx`

Every HLS player in the app renders through **one** component, `GradedVideo`. The surfaces pass
`hlsUrl` + `editParams` + a context, and GradedVideo owns playback, the attach budget, and the
grade. So **VID-2's render-path change lives entirely inside GradedVideo** — the surfaces below do
not change.

Today's HLS grade is a **CSS approximation**, decided at `GradedVideo.tsx`:

```
const usePipeline = !isHls && effectiveForcePlay && playing && looked && !failed;   // line ~222
```

`!isHls` is why HLS never touches the real `Pipeline`. The VID-2 change is to let HLS use the
Pipeline when `shouldAttemptGraded(isHls, looked)` (the flag + a real look) AND runtime GL is
viable; otherwise keep the exact CSS path (`cssFilter` / `videoOverlays`) as the fallback.

- **Display:** when graded, the gl-react `Pipeline` canvas is shown (it already accepts a
  `<video>` source and re-uploads each frame); the `<video>` stays in the DOM muted for audio +
  decode, visually replaced by the canvas (same as the current legacy-forcePlay path at
  `GradedVideo.tsx` ~603).
- **Audio:** stays on the `<video>` element (unchanged). Only the *picture* moves to the canvas.
- **Rendition switches (mid-stream dims change):** already handled by `Pipeline` — `capVideo`
  recomputes `capW/capH` from `source.videoWidth/Height` each render and rebuilds `frameCanvas`
  when the needed size leaves `[current/2, current]`. A 720p→1080p ABR upgrade just resizes the
  capped texture; no special-casing in GradedVideo.
- **DPR / size cap:** `Pipeline` caps the texture at display box × DPR (`texCap`, never source
  size) — the §1 "cap at display size × DPR" requirement is already met by the preview path we
  reuse. GradedVideo passes `width/height = geom.renderW/renderH` (tile-res, `RENDER_CAP=720`).

## The standing rules are already enforced (by GradedVideo, not the surfaces)

VID-2 §2 says "one `<video>` + one GL context per ACTIVE player, window ±1, posters otherwise."
GradedVideo already does this and the WebGL path inherits it — the canvas only mounts where the
`<video>` already does:

- **ATTACH budget** (`acquireAttach`/`releaseAttach`, ~3 concurrent) gates which players mount a
  `<video>` at all → the GL canvas rides the same gate.
- **NEAR window ±1** (`NEAR_ROOT_MARGIN` + dwell) + the feed **coordinator** (1 mobile / 2 desktop
  most-visible) decide who plays; everything else rests on the **baked graded poster** (`posterUrl`,
  already grade-baked).
- The Pipeline mounts only while `playing` (the RAF loop runs only when the element is playing;
  paused draws once) → no idle GL churn.

## Per-surface call sites (all pass `hlsUrl`; context noted)

| Surface | File | Props | Context |
|---|---|---|---|
| Home feed | `PostItem.tsx` ~339 | `autoplayFlag`, `fullPlayback={!card}`, `gridMode` | full (feed) |
| Profile grid | `PostCell.tsx` ~92 | `autoplayFlag`, `gridMode`, `context="snippet"` | snippet |
| Profile scroll | `ProfilePostViewer.tsx` ~242 | `autoplayFlag`, `gridMode`, `inOverlay` | full |
| Lightbox | `PostModal.tsx` ~565 | `forcePlay`, `hlsUrl` | full |
| Theatre | `TheatreMode.tsx` ~455 | `forcePlay={center}` (3 slots, center only) | full |
| Mirage | `MirageView.tsx` ~130/145 | `forcePlay` (focus), snippet collage | both |

Both **snippet** and **full** contexts must be graded (M15). **Arrival theatre stays
poster-only** for now (it renders `Arrival.tsx`, force-dark, no GradedVideo — leave it).

## Fallback, never a black player (§3)

Decided at runtime inside GradedVideo (item 1): if GL context creation fails, the context is lost,
or the first drawn frame reads black → drop to the plain `<video>` + today's CSS approximation and
report `fallback`. The existing `PipelineBoundary` ErrorBoundary already catches a thrown pipeline
and sets `failed → plain playback`; VID-2 adds the **black-first-frame** probe and the crumb.

## Scaffolded now (survives either gate outcome)

- `src/lib/gradedPlayback.ts` — `gradedPlaybackEnabled()` (reads `NEXT_PUBLIC_GRADED_PLAYBACK`) +
  `shouldAttemptGraded(isHls, hasLook)` (the static gate).
- `src/lib/videoGfx.ts` — the `gfx:` crumb store: `setGfx(id, 'graded'|'fallback', fps)` /
  `clearGfx(id)` / `gfxSummary()`. GradedVideo wires it in §1.
- `VideoDebugOverlay.tsx` — a `gfx:` header line: `<on|off> · <summary>` (flag state + per-player
  graded/fallback + fps range).

## Flag rollout (§4)

`NEXT_PUBLIC_GRADED_PLAYBACK` — set to `1` in **Preview** first (Eric's device pass on Preview),
then **Production** after it passes. (Env var set in Vercel by Eric; the code reads it.)

## The gate (§0) decides item 1

Eric runs `/debug/hls-webgl?debug=video` → PLAY → MEASURE 10s → Copy report. **If sustained upload
FPS < ~20 at 720p on device, stop and report** — do not build GradedVideo's graded path.

---

## (a) Rendition-switch texture resize — spec

This Stream serves 360→480→720→1080 and switches constantly (ABR). GradedVideo must re-size the
texture on every `videoWidth/videoHeight` change with **no black frame and no stretch**. It does,
because the `Pipeline` (not GradedVideo) owns the texture and resizes it per frame:

- **Capped path** (feed/grid tiles, most players): `capW/capH` are recomputed from
  `source.videoWidth/Height` each render; `frameCanvas` is a `useMemo` keyed on `[source, capW, capH]`,
  so a dims change rebuilds it — and the SAME render immediately `paintFrame()`s the CURRENT frame
  into the new canvas before handing it to gl-react (never a null/empty texture for a frame). The GL
  canvas size is the DISPLAY box × DPR (`texCap`), never the source, so a 360→1080 switch changes
  only the capped texture's pixels, not the on-screen size → **no stretch**.
- **Direct path** (measured-fast devices): the `<video>` element itself is the texture; gl-react
  re-uploads `texImage2D(video)` each frame at the element's current intrinsic size → the switch is
  automatic.
- AR is constant across renditions (same frame, more pixels) → the cover/crop `geom` is unchanged →
  no reflow.

Verified on the §0 decision page: a live 1364×720 → 2048×1080 switch mid-measurement with no black
and a continuous 60fps upload. **Spec (CI):** `test/vid2-graded.spec.ts` drives a forced rendition
change and asserts the graded canvas never reads black across it.

## (b) clientBandwidthHint — findings + policy (report, not tuned)

**What it is:** a float query param on the Stream manifest URL (`…/manifest/video.m3u8?clientBandwidthHint=1.8`)
to steer rendition selection. Cloudflare's docs call it a **last resort** and prefer the player's own
ABR config. ([docs](https://developers.cloudflare.com/stream/viewing-videos/using-own-player/),
[changelog](https://developers.cloudflare.com/stream/changelog/))

**The catch (community, not docs):** multiple reports say the hint behaves as a **blunt override** —
it can collapse the manifest to a **single rendition** or enforce a **minimum-quality floor**, which
**breaks ABR's ability to downgrade** on a slow connection → stalls/buffering. ([community bug
report](https://community.cloudflare.com/t/cloudflare-stream-clientbandwidthhint-doesnt-work-as-expected-possible-bug/349156),
[default-quality thread](https://community.cloudflare.com/t/how-do-you-set-the-default-stream-video-quality-to-1080p/143764))

**Why we even care:** Eric's device started at 360p on good wifi — Safari's native-HLS ABR is
conservative, and on iOS we have **no hls.js `startLevel` lever** (hls.js is only used off-iOS, where
we already set `startLevel` to top for forcePlay — see GradedVideo §P2a). So the hint is the only
starting-rendition lever on iOS.

**Recommended policy (to validate on device before adopting — do NOT ship blind):**
- **Do not** apply the hint to FEED/grid players: a low ABR start is correct there (instant first
  frame, data-thrifty) and a locked rendition would hurt.
- **Consider** the hint ONLY for `forcePlay` focus surfaces (lightbox / theatre), where quality
  matters and the player is singular — and only after a device test confirms it does **not** lock out
  downgrade on this account's ladder. If it collapses the manifest to one rendition on our target
  players, **reject it** and instead lean on the already-baked graded poster to cover the 1–2s that
  native ABR takes to climb from 360p.
- Off-iOS is already handled by hls.js `startLevel`; no hint needed there.

Net: the hint is a risk, not a free win. The safe default is **no hint**; a focus-only experiment is
worth one device measurement, gated behind its own flag, never global.
