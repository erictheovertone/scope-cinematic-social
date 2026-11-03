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
