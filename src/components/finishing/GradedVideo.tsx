"use client";

/**
 * GradedVideo — the ONE reusable graded-video player used by every surface (grid,
 * feed, standalone post view, profile scroll). Honors the per-post AUTOPLAY flag
 * and applies the post's stored look at playback:
 *
 *   • At rest → the graded POSTER (a plain <img>, zero cost).
 *   • Playing → the video (an IN-DOM <video> — reliable autoplay/decode) through
 *     the gl-react Pipeline with the post's edit_params (look applied live), the
 *     crop framed to the container; pipeline rendered at ~tile resolution.
 *   • gridMode (profile grid) → ALIVE: every in-view autoplay tile ATTEMPTS to
 *     play; the device's decoder limit caps it, so any tile whose play() rejects
 *     rests as a graded poster and retries (most-visible win as others scroll off).
 *   • Feed / profile-scroll → coordinator-capped (1 mobile / 2 desktop most-visible).
 *   • forcePlay (standalone/lightbox) → always plays graded.
 *   • Unedited videos (no real look) → plain playback, no pipeline.
 *   • Pipeline failure → ErrorBoundary falls back to plain playback (logged).
 *
 * Off-viewport (or losing priority) → the <video> unmounts → decoder + pipeline
 * freed (no accumulation). Photo rendering is untouched.
 */

import { Component, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { EditParams } from "@/lib/editor/params";
import { hasLookEdits } from "@/lib/editor/bakeLook";
import { lookById } from "./looksCatalog";
import { ensureLut } from "@/lib/editor/lut";
import { registerAutoplayVideo, reportVisibility } from "@/lib/videoPlayback";
import { feedImage } from "@/lib/mediaUrl";
import { videoCssFilter, videoOverlays } from "@/lib/editor/videoGrade";
import { acquireAttach, releaseAttach, onAttachSlotFree } from "@/lib/videoAttachBudget";
import type HlsType from "hls.js"; // TYPE ONLY (erased) — the runtime import is dynamic (§2)

// Brief V3d — the NEAR window. A card WITHIN ~1.5 viewports (this rootMargin) may attach +
// buffer (not play); outside it, nothing loads (FAR). Debounced so a fast scroll that flicks
// past a card never attaches (no manifest/segment request churn).
const NEAR_ROOT_MARGIN = "150% 0px";
const NEAR_DWELL_MS = 200;

const Pipeline = dynamic(() => import("./Pipeline"), { ssr: false });

const RENDER_CAP = 720; // max pipeline render dimension — small tiles render smaller (tile-res)


class PipelineBoundary extends Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn("[GradedVideo] pipeline failed → plain playback:", e); this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

interface Props {
  url: string;
  posterUrl?: string | null;
  /** Resize the at-rest poster IMAGE to this display width via feedImage (loading-only;
   *  video element + crop render untouched). Unset → full-res poster. */
  posterWidth?: number;
  /** Pre-baked 3–5s graded MUTED clip (post.autoplay_clip_url). Autoplay loops THIS
   *  as a plain <video> — no pipeline. Null/absent → autoplay shows the poster. */
  clipUrl?: string | null;
  editParams?: unknown;
  cropX?: number; cropY?: number; cropWidth?: number; cropHeight?: number;
  /** post.autoplay — coordinator-managed (feed) or attempt-all (gridMode). */
  autoplayFlag?: boolean;
  /** Profile grid: attempt to play EVERY in-view tile (alive), decoder-capped. */
  gridMode?: boolean;
  /** Always play graded (standalone post view / lightbox). */
  forcePlay?: boolean;
  /** Brief W3 §1 — mobile feed: autoplay the FULL source (url), muted+looping, plain
   *  (NO grading pipeline — stays cheap), instead of the pre-baked 3–5s clip. Still
   *  in-view-gated by the IntersectionObserver below (off-screen unmounts). */
  fullPlayback?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  showSoundToggle?: boolean;
  /** Brief V2 — Stream is still encoding (video_status='processing'). The poster shows
   *  (or a placeholder) with a quiet PROCESSING label; no playback attempt. */
  processing?: boolean;
  /** Brief V3 — Stream HLS manifest (stream_playback_url) for a READY video. Its PRESENCE
   *  is the dual-path branch: set → HLS playback (native <video> on Safari/iOS, hls.js via
   *  dynamic import elsewhere) + the look via CSS filter (no gl-react pipeline, no crop-
   *  double-work). Absent → the legacy url/clip path is UNTOUCHED. */
  hlsUrl?: string | null;
  /** Brief P1 §4 — above-the-fold card (first 2–3 in the feed): the POSTER is the initial
   *  paint, so it loads EAGER + high fetch-priority instead of lazy. Off-screen cards stay
   *  lazy (P1b). Native-HLS Safari especially leans on this poster for instant paint. */
  priority?: boolean;
  /** Brief P1c §2 — gridMode PLAY gate: a card plays once it's ≥ this fraction visible
   *  (Eric's rule "visible → plays", no top bias). Default 0 = any-visibility (grid/profile,
   *  unchanged). The feed passes 0.5. */
  minPlayRatio?: number;
  /** Brief M10 §3 — MIRAGE ONLY. Loop just this [windowStart, windowStart+windowLength]
   *  slice (seconds), muted — the Mirage preview gesture. Mirage passes windowLength ALWAYS
   *  (the post's saved snippet, else the standard length from 0). Every OTHER surface
   *  (feed / profile-scroll / theatre / SR) passes NOTHING → full-video playback, UNCHANGED.
   *  This is a preview window, NOT a playback cap — it lives only in Mirage. */
  windowStart?: number | null;
  windowLength?: number | null;
}

export default function GradedVideo({
  url, posterUrl, posterWidth, clipUrl, editParams, cropX = 0, cropY = 0, cropWidth = 1, cropHeight = 1,
  autoplayFlag = false, gridMode = false, forcePlay = false, fullPlayback = false, style, onClick, showSoundToggle = false,
  processing = false, hlsUrl = null, priority = false, minPlayRatio = 0,
  windowStart = null, windowLength = null,
}: Props) {
  const isHls = !!hlsUrl; // Brief V3 — the dual-path branch: Stream HLS vs legacy source.
  const id = useId();
  const [inView, setInView] = useState(false);          // gridMode visibility (→ PLAY)
  const [coordActive, setCoordActive] = useState(false); // feed coordinator grant (→ PLAY)
  const [nearStable, setNearStable] = useState(false);   // Brief V3d — within NEAR + dwelt (→ ATTACH)
  const [bufferSlot, setBufferSlot] = useState(false);   // Brief V3d — budget granted (→ ATTACH)
  const [playing, setPlaying] = useState(false);         // ACTUAL play state (drives visible output)
  const [failed, setFailed] = useState(false);           // pipeline failure → plain playback
  const [errored, setErrored] = useState(false);         // video element error → poster (contain to this tile)
  const [muted, setMuted] = useState(true);
  const [manualPlay, setManualPlay] = useState(false); // non-autoplay video: user tapped the play affordance
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [activeLut, setActiveLut] = useState<{ canvas: HTMLCanvasElement; size: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryRef = useRef<number | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Stable ref callback so the <video> isn't churned every render.
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => { videoRef.current = el; setVideoEl(el); }, []);

  // Brief P1a — lifecycle instrumentation (DEV ONLY; strip-safe via NODE_ENV). Names the
  // break in the attach→teardown→re-attach cycle per card.
  const tagRef = useRef("");
  tagRef.current = ((hlsUrl || url || id) as string).slice(-10);
  const dlog = useCallback((ev: string) => {
    if (process.env.NODE_ENV !== "production") console.log(`[vid ${tagRef.current}] ${ev}`);
  }, []);

  const params = useMemo<EditParams | null>(() => {
    if (!editParams || typeof editParams !== "object") return null;
    const { v: _v, ...rest } = editParams as Record<string, unknown>;
    void _v;
    return rest as unknown as EditParams;
  }, [editParams]);
  const looked = !!params && hasLookEdits(params);

  // Brief M10 §3 — the active MIRAGE loop window. A ref (not effect deps) so a window value
  // never re-runs the ATTACH effect — windows are stable per post, and the media event
  // handlers read the latest here. Null → no window → full playback (every non-Mirage
  // surface passes nothing). windowLength ≤ 0 is treated as no window.
  const windowRef = useRef<{ start: number; end: number } | null>(null);
  windowRef.current = windowLength != null && windowLength > 0
    ? { start: Math.max(0, windowStart ?? 0), end: Math.max(0, windowStart ?? 0) + windowLength }
    : null;

  // Autoplay plays the pre-baked GRADED CLIP (plain <video>, already graded — no
  // pipeline). The live pipeline runs ONLY for full playback (forcePlay = lightbox/
  // standalone). Autoplay with no clip (legacy / bake failure) → poster only.
  // A manual tap on a non-autoplay video plays the FULL video (graded), exactly
  // like the standalone/lightbox path — so it shares forcePlay's behavior.
  const effectiveForcePlay = forcePlay || manualPlay;
  // Brief V3 — HLS (Stream) overrides source selection: the manifest plays in ALL modes
  // (feed/grid/forcePlay), in-view-gated the same way. Legacy selection is UNCHANGED.
  // Brief W3 §1 — fullPlayback (mobile feed) plays the full source plain (no pipeline).
  const playbackUrl = isHls ? hlsUrl : (effectiveForcePlay ? url : (fullPlayback ? (url ?? null) : (clipUrl ?? null)));
  // Brief V3d — the THREE tiers, split from the old single shouldAttach:
  //  · ATTACH (mount + buffer, NOT playing): forcePlay (single-focus, budget-exempt) OR an
  //    autoplay tile that is NEAR-and-dwelt AND holds a budget slot. FAR = neither → nothing.
  //  · PLAY: forcePlay OR an autoplay tile IN-VIEW (gridMode) / coordinator-active (feed).
  const shouldAttach = !!playbackUrl && (effectiveForcePlay || (autoplayFlag && bufferSlot));
  const shouldPlay = !!playbackUrl && (effectiveForcePlay || (autoplayFlag && (gridMode ? inView : coordActive)));
  // HLS carries its grade via CSS filter (below), NOT the gl-react pipeline — so the
  // pipeline stays a legacy-only path (zero re-encode, keeps HLS cheap).
  const usePipeline = !isHls && effectiveForcePlay && playing && looked && !failed;

  // Brief V3a §2 — GRADE via the shared video kit (CSS filter + overlay layers), HLS path
  // only. The SAME videoCssFilter/videoOverlays drive the NEW POST preview → preview ==
  // playback (parity). Non-mappable (tier-3) params are hidden for video, so nothing to drop.
  const cssFilter = useMemo(() => (isHls ? videoCssFilter(params) : undefined), [isHls, params]);
  const overlays = useMemo(() => (isHls ? videoOverlays(params) : []), [isHls, params]);

  // ── Visibility ──
  useEffect(() => {
    if (forcePlay || !autoplayFlag) return;
    const el = boxRef.current;
    if (!el) return;
    const unregister = gridMode ? () => {} : registerAutoplayVideo(id, setCoordActive);
    const io = new IntersectionObserver(
      ([e]) => {
        if (gridMode) {
          // Brief P1c §2 — PLAY when ≥ minPlayRatio visible (feed 0.5; grid/profile 0 = any).
          setInView(e.isIntersecting && e.intersectionRatio >= minPlayRatio);
        } else if (e.isIntersecting) {
          // ANY visibility makes it ELIGIBLE; the cap + this score (distance of the
          // tile centre from the viewport centre) admit the most-visible. The old
          // `>= 0.5` gate left in-view feed/scroll videos ineligible inside the
          // feed's inner scroll container and the profile scroll's fixed/translate
          // overlay → the coordinator never admitted them → frozen posters.
          const r = e.boundingClientRect;
          reportVisibility(id, Math.abs((r.top + r.height / 2) - window.innerHeight / 2));
        } else {
          reportVisibility(id, Infinity);
        }
      },
      // Finer steps so the distance-to-centre score updates as the user scrolls
      // (the cap follows the most-centred video).
      { threshold: gridMode ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    io.observe(el);
    return () => { io.disconnect(); unregister(); };
  }, [id, autoplayFlag, forcePlay, gridMode, minPlayRatio]);

  // Brief P1a — RESURRECTION: reset `errored` on a new source AND on NEAR RE-ENTRY. Before,
  // it only cleared on playbackUrl change — so a fatal error latched during teardown
  // (hls.destroy / src detach) stuck forever for the same source, and the mount gate
  // ({shouldAttach && !errored}) then blocked the card from EVER re-attaching → frozen on
  // scroll-return. Re-entry (nearStable→true) now gives the card a clean fresh chance.
  useEffect(() => { setErrored(false); }, [playbackUrl, nearStable]);

  // Brief V3d — NEAR observer (ATTACH tier). Expanded rootMargin so a card WITHIN ~1.5vp
  // counts; DWELL-debounced so a fast flick-past never attaches (no manifest/segment churn).
  useEffect(() => {
    if (forcePlay || !autoplayFlag) return;
    const el = boxRef.current;
    if (!el) return;
    let dwell: number | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        dlog("NEAR-enter");
        if (dwell == null) dwell = window.setTimeout(() => { dwell = null; dlog("dwell-fire→nearStable"); setNearStable(true); }, NEAR_DWELL_MS);
      } else {
        dlog("NEAR-exit");
        if (dwell != null) { clearTimeout(dwell); dwell = null; }
        setNearStable(false);
      }
    }, { rootMargin: NEAR_ROOT_MARGIN, threshold: 0 });
    io.observe(el);
    return () => { io.disconnect(); if (dwell != null) clearTimeout(dwell); };
  }, [forcePlay, autoplayFlag]);

  // Brief V3d — BUDGET: cap concurrent attached autoplay players (~3). Acquire when
  // NEAR-stable; release on cleanup (leaving NEAR / unmount). If capped, wait for a freed
  // slot then retry. forcePlay (single-focus) is exempt — it never enters here.
  useEffect(() => {
    // Brief P1c §2 — a VISIBLE (inView / coordActive) card attaches IMMEDIATELY, not only
    // after the NEAR dwell — so a card entering mid/bottom-viewport plays without waiting
    // (kills the "near-top" feel). NEAR-but-not-visible cards still prebuffer via the dwell.
    if (forcePlay || !autoplayFlag || !(nearStable || inView || coordActive)) { setBufferSlot(false); return; }
    let held = false;
    const grab = () => { if (!held && acquireAttach()) { held = true; dlog("slot-acquired"); setBufferSlot(true); return true; } return false; };
    if (grab()) return () => { held && dlog("slot-released"); if (held) releaseAttach(); };
    const off = onAttachSlotFree(() => { if (grab()) off(); });
    return () => { off(); held && dlog("slot-released"); if (held) releaseAttach(); };
  }, [forcePlay, autoplayFlag, nearStable, inView, coordActive]);

  // ── ATTACH (source + buffer, the NEAR tier) — NO play here. HLS: native <video src> on
  //    Safari/iOS (no lib); hls.js via DYNAMIC import elsewhere (its own chunk). Legacy:
  //    src direct. hls.js loadSource/attachMedia + preload="auto" BUFFER without playing.
  //    Cleanup on leaving ATTACH → hls.destroy (no unbounded buffer down a long feed). ──
  useEffect(() => {
    const v = videoEl;
    if (!shouldAttach || errored || !v || !playbackUrl) { setPlaying(false); return; }
    // crossOrigin BEFORE src so WebGL (texImage2D) can read a remote video's frames.
    if (v.crossOrigin !== "anonymous") v.crossOrigin = "anonymous";
    let cancelled = false;
    let hls: HlsType | null = null;
    const feedMode = !effectiveForcePlay; // feed/grid/scroll = capped; theatre/modal = full quality
    // Brief P1 §3 — TTFF (dev only): attach → first painted frame.
    const attachAt = typeof performance !== "undefined" ? performance.now() : 0;
    let ttffLogged = false;
    const onPlaying = () => {
      if (cancelled) return;
      setPlaying(true);
      dlog("playing");
      if (!ttffLogged) {
        ttffLogged = true;
        if (process.env.NODE_ENV !== "production" && attachAt) {
          const path = isHls ? (v.canPlayType("application/vnd.apple.mpegurl") ? "hls-native" : "hls.js") : "legacy";
          console.log(`[TTFF] ${Math.round(performance.now() - attachAt)}ms · ${feedMode ? "feed" : "theatre"} · ${path}`);
        }
      }
    };
    const onPause = () => { if (!cancelled) setPlaying(false); };
    // Brief P1c §1b/§2 — LOOP EXPLICITLY. The `loop` attribute is unreliable with hls.js on
    // iOS → the video stops at 'ended' → frozen mid-view (the ~75% loop freeze). Seek 0 +
    // play() on 'ended'. The budget slot is NOT touched (it's keyed on visibility/NEAR, not
    // playback), so an ended-then-looped card keeps its slot and never dies in view.
    // Brief M10 §3 — loop back to the WINDOW start (Mirage), else to 0 (every full-video
    // surface, unchanged). w is null for all non-Mirage consumers → identical to before.
    const onEnded = () => { if (cancelled) return; const w = windowRef.current; try { v.currentTime = w ? w.start : 0; const p = v.play(); if (p) p.catch(() => {}); } catch { /* not ready */ } };
    // Brief M10 §3 — MIRAGE WINDOW LOOP. Seek into the window once metadata is ready, and
    // snap back to start whenever playback crosses the window end. timeupdate fires ~4×/s,
    // so the loop-back lands within ~250ms of the boundary — imperceptible for a muted
    // preview slice. No-op when w is null (all full-video surfaces).
    const onLoadedMeta = () => { const w = windowRef.current; if (w && (v.currentTime < w.start || v.currentTime >= w.end)) { try { v.currentTime = w.start; } catch { /* not seekable yet */ } } };
    const onTimeUpdate = () => { const w = windowRef.current; if (!w) return; if (v.currentTime >= w.end || v.currentTime < w.start - 0.25) { try { v.currentTime = w.start; } catch { /* ignore */ } } };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("timeupdate", onTimeUpdate);
    const nativeHls = !!v.canPlayType("application/vnd.apple.mpegurl");
    if (isHls && !nativeHls) {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          // Brief P1 §1/§2 — rendition + buffer discipline SPLIT BY CONTEXT. Feed players:
          // cap segments to the rendered card size (~360p on a 375px card, never 1080p),
          // start at the LOWEST level for instant first frame (ABR upgrades during play),
          // tight 8s buffer, no back-buffer. With V3d's 3-player cap → bounded memory
          // (~8s of ~360p × 3 ≈ a few MB). Theatre/modal (forcePlay): NO cap, generous
          // buffer — the work deserves full quality.
          hls = new Hls(feedMode
            ? { capLevelToPlayerSize: true, startLevel: 0, maxBufferLength: 8, backBufferLength: 0, enableWorker: true }
            : { maxBufferLength: 30, enableWorker: true });
          // Brief P1a — !cancelled so hls.destroy()'s own teardown error can't LATCH errored
          // (which would block the card from ever re-attaching on scroll-return).
          hls.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean }) => { if (!cancelled && data?.fatal) setErrored(true); });
          hls.loadSource(playbackUrl);
          hls.attachMedia(v);
          dlog("attached (hls.js)");
        } else { setErrored(true); }
      }).catch(() => setErrored(true));
    } else {
      // Native HLS (Safari/iOS): Safari runs its OWN ABR keyed to the element size — we
      // don't fight it (no per-level API here); the card size already governs its choice.
      if (v.getAttribute("src") !== playbackUrl) v.src = playbackUrl;
      dlog("attached (native)");
    }
    return () => {
      cancelled = true; // set FIRST so onError/hls-ERROR during teardown can't latch errored
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("timeupdate", onTimeUpdate);
      // hls.destroy() detaches the MediaSource. The <video> itself UNMOUNTS (shouldAttach
      // gate) → a FRESH element mounts on re-entry, so we never re-use a dead MediaSource
      // and never force-clear the native src (which would fire onError → re-latch errored).
      if (hls) { try { hls.destroy(); } catch { /* already gone */ } }
      dlog("destroyed");
    };
  }, [shouldAttach, videoEl, playbackUrl, errored, isHls, effectiveForcePlay]);

  // ── PLAY / PAUSE (the IN-VIEW tier). Attached+buffered → play() with RETRY (autoplay
  //    policy / decoder); leaving view → pause (buffer stays until it also leaves NEAR). ──
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    if (shouldPlay && shouldAttach && !errored) {
      let cancelled = false;
      const tryPlay = () => {
        if (cancelled || !v) return;
        v.play().then(() => { if (!cancelled) setPlaying(true); }).catch(() => {
          if (cancelled) return;
          setPlaying(false);
          if (retryRef.current) clearTimeout(retryRef.current);
          retryRef.current = window.setTimeout(tryPlay, 1200);
        });
      };
      tryPlay();
      return () => { cancelled = true; if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; } };
    }
    dlog("view-exit→pause");
    try { v.pause(); } catch { /* not ready */ }
  }, [shouldPlay, shouldAttach, videoEl, errored]);

  useEffect(() => { if (videoEl) videoEl.muted = muted; }, [videoEl, muted]);

  // Load the LOOK LUT — ONLY for full playback (forcePlay), the only path that
  // runs the pipeline. Autoplay clips are already graded (baked), so no LUT.
  useEffect(() => {
    if (!effectiveForcePlay || !shouldAttach || !looked) { setActiveLut(null); return; }
    let cancelled = false;
    const look = lookById(params?.lutId ?? null);
    if (!look) { setActiveLut(null); return; }
    ensureLut(look.id, look.file)
      .then((e) => { if (!cancelled) setActiveLut({ canvas: e.canvas, size: e.parsed.size }); })
      .catch(() => { if (!cancelled) setActiveLut(null); });
    return () => { cancelled = true; };
  }, [effectiveForcePlay, shouldAttach, looked, params?.lutId]);

  // Measure the container for the cover/crop pipeline geometry.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cover/crop placement (render capped; small tiles render at ~tile resolution).
  const geom = useMemo(() => {
    if (box.w <= 0 || box.h <= 0) return null;
    const cw = Math.max(cropWidth, 0.0001), ch = Math.max(cropHeight, 0.0001);
    const fullW = box.w / cw, fullH = box.h / ch;
    const scale = Math.min(1, RENDER_CAP / Math.max(fullW, fullH));
    return {
      left: -cropX * fullW, top: -cropY * fullH, fullW, fullH,
      renderW: Math.max(1, Math.round(fullW * scale)),
      renderH: Math.max(1, Math.round(fullH * scale)),
      upscale: 1 / scale,
    };
  }, [box, cropX, cropY, cropWidth, cropHeight]);

  return (
    <div ref={boxRef} onClick={onClick} style={{ position: "relative", overflow: "hidden", cursor: onClick ? "pointer" : "default", background: "#0a0a0a", ...style }}>
      {/* Graded poster — the at-rest layer, and what shows until a tile actually plays.
          Brief V3c §2 — for HLS the poster is Stream's UNGRADED thumbnail, so it gets the
          SAME CSS grade (filter here + the overlay layers below cover it) → no ungraded
          pixel ever paints between poster and the graded video. Legacy posters are already
          baked-graded, so no filter there (isHls false). */}
      {posterUrl && (
        <img src={feedImage(posterUrl, posterWidth ?? 750)} alt="" draggable={false} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", filter: isHls ? cssFilter : undefined }} />
      )}

      {/* Brief V2 — Stream still encoding: poster (above) or the #0a0a0a placeholder (the
          box bg), with a quiet PROCESSING label. No playback is attempted (media_urls is
          empty for processing videos). Overlay only; playback logic untouched (V3). */}
      {processing && (
        <div style={{ position: "absolute", left: 8, bottom: 8, zIndex: 4, pointerEvents: "none", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(229,225,219,0.4)" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 9, letterSpacing: "var(--track-wide)", textTransform: "uppercase", color: "rgba(229,225,219,0.4)" }}>Processing</span>
        </div>
      )}

      {/* The <video> — for AUTOPLAY this is the pre-baked graded CLIP (plain, no
          pipeline); for forcePlay it's the full video (the pipeline canvas covers it
          when graded). crossOrigin set before src. Visible whenever playing AND the
          pipeline isn't covering it (i.e. always for the autoplay clip). src assigned
          imperatively in the play effect — NOT a prop here. */}
      {shouldAttach && !errored && (
        <video
          ref={setVideoRef}
          crossOrigin="anonymous"
          muted={muted}
          loop
          playsInline
          preload="auto"
          onError={() => { console.warn("[GradedVideo] video element error → poster:", playbackUrl); setErrored(true); }}
          // FRAMING INTEGRITY: the plain <video> uses the SAME crop geometry as
          // the graded pipeline path and the poster bake — the full frame laid
          // out at fullW×fullH and offset so the chosen [cx,cy,cw,ch] region
          // exactly fills the container (clipped by overflow:hidden). The old
          // cropStyle() double-cropped (objectFit:cover + an extra scale) and
          // played back zoomed. fullW/fullH preserve the video's AR, so the
          // frame maps cleanly with no distortion.
          style={geom
            ? { position: "absolute", left: geom.left, top: geom.top, width: geom.fullW, height: geom.fullH, objectFit: "cover", display: "block", opacity: playing && !usePipeline ? 1 : 0, filter: cssFilter, transition: "opacity 60ms linear" }
            : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: playing && !usePipeline ? 1 : 0, filter: cssFilter, transition: "opacity 60ms linear" }}
        />
      )}

      {/* Graded playback — look applied live. Only while actually playing. */}
      {usePipeline && geom && videoEl && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: geom.left, top: geom.top, width: geom.fullW, height: geom.fullH }}>
            <div style={{ width: geom.renderW, height: geom.renderH, transform: geom.upscale !== 1 ? `scale(${geom.upscale})` : undefined, transformOrigin: "top left" }}>
              <PipelineBoundary onError={() => setFailed(true)}>
                <Pipeline source={videoEl} params={params!} width={geom.renderW} height={geom.renderH} activeLut={activeLut} />
              </PipelineBoundary>
            </div>
          </div>
        </div>
      )}

      {/* Brief V3a §2 — video grade OVERLAY layers (vignette / fade / white-balance tint),
          HLS path only. Over the media, under the controls. Same recipe as the preview. */}
      {isHls && overlays.map((s, i) => (
        <div key={i} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 3, ...s }} />
      ))}

      {/* Non-autoplay videos get a small RED play triangle, lower-right — the
          austere corner affordance. Tap plays the full graded video in place.
          Hidden once playing, and never shown for autoplay/forcePlay (already live). */}
      {!autoplayFlag && !forcePlay && !playing && !manualPlay && (
        <button
          onClick={(e) => { e.stopPropagation(); setManualPlay(true); }}
          aria-label="Play"
          style={{ position: "absolute", bottom: 8, right: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, zIndex: 10, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))" }}
        >
          <svg width="16.5" height="18.5" viewBox="0 0 13 15" fill="#E5E1DB"><path d="M1 1l11 6.5L1 14z" /></svg>
        </button>
      )}

      {showSoundToggle && playing && (
        <button
          onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
          style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg width="17.5" height="17.5" viewBox="0 0 24 24" fill="#E5E1DB"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
          ) : (
            <svg width="17.5" height="17.5" viewBox="0 0 24 24" fill="#E5E1DB"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
