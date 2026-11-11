// ── Video grade kit (Brief V3a) ──────────────────────────────────────────────
//
// The look for VIDEO posts, expressed with CSS filters + overlay divs (NOT the
// gl-react pipeline — zero re-encode, travels with the post). ONE recipe, shared by
// the NEW POST preview (FinishingPreview) and HLS playback (GradedVideo) so
// preview == playback (the parity acceptance bar).
//
// TIERS
//  · FILTERS  → CSS filter() on the <video>: exposure, contrast, saturation, blur,
//               whiteBalance.t (warm/cool ≈ hue-rotate).
//  · OVERLAYS → absolute divs over the video (pointer-events:none): vignette (radial
//               gradient), fade (lifted blacks), whiteBalance.tint (green/magenta).
//
// CALIBRATION (Brief V3a §3): these constants are FIRST-PASS approximations of the
// photo pipeline. Method to tune: grade a shared test frame in the photo finishing
// suite, screenshot it, render the SAME frame + params through videoCssFilter/
// videoOverlays, overlay the two, and nudge the constants below until they match.
// Every knob is here — this is the ONLY file to touch when Eric's walk says "warmer"
// or "less vignette".

import type { EditParams } from "./params";
import type { CSSProperties } from "react";

// The EXACT param set the video finishing suite exposes (everything else is tier-3,
// hidden for video — see FinishingShell gating). Photos are unaffected.
export const VIDEO_PARAM_KEYS = [
  "exposure", "contrast", "saturation", "blur", "whiteBalance", "vignette", "fade",
] as const;
export type VideoParamKey = (typeof VIDEO_PARAM_KEYS)[number];
const VIDEO_KEY_SET = new Set<string>(VIDEO_PARAM_KEYS);
export const isVideoParam = (key: string): boolean => VIDEO_KEY_SET.has(key);

// ── Tunable constants (nudge-round). Suite scale: bipolar −6..+6, additive 0..12. ──
export const VIDEO_GRADE = {
  exposurePerStop: 0.4 / 6,   // brightness() delta per exposure stop
  contrastPerStop: 0.5 / 6,   // contrast() delta per contrast stop
  saturationPerStop: 0.6 / 6, // saturate() delta per saturation stop
  blurPxPerStop: 0.6,         // blur() px per blur stop (0..12)
  wbHueDegPerStop: 2.5,       // hue-rotate() deg per temperature stop (warm/cool)
  vignetteMaxAlpha: 0.55,     // radial edge darkness at vignette +6
  fadeMaxAlpha: 0.22,         // lifted-black wash strength at fade +12
  wbTintMaxAlpha: 0.18,       // green(+)/magenta(−) tint at |tint| = 6
};

const num = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : d);

// HOME-3 §C.2 + addendum — the resting/cover still sources every video surface hands GradedVideo.
// Spread it: `<GradedVideo {...videoPosterSources(post)} {...streamGradedProps(post)} ... />`.
// GradedVideo owns the per-context choice (autoplay → start frame; else → hero poster) and the raw
// Stream fallback (crop geometry + grade approximation + frame time). So NO surface composes a poster
// precedence any more — the single landmine that let a raw/ungraded frame onto the feed is gone.
export function videoPosterSources(post: Record<string, unknown> | null | undefined): {
  posterUrl: string | null; startPosterUrl: string | null; streamPosterUrl: string | null; thumbnailUrl: string | null;
} {
  const s = (k: string): string | null => {
    const v = post?.[k];
    return typeof v === "string" && v ? v : null;
  };
  return {
    posterUrl: s("poster_url"),           // baked HERO frame — graded + cropped
    startPosterUrl: s("start_poster_url"), // baked START frame — graded + cropped (addendum; may be absent pre-migration)
    streamPosterUrl: s("stream_poster_url"), // raw Stream thumbnail — fallback
    thumbnailUrl: s("thumbnail_url"),      // custom/auto thumbnail — last resort
  };
}

// Brief V3a §1 — the Stream props every video surface passes to GradedVideo. Spread it:
// `<GradedVideo {...streamGradedProps(post)} ... />`.
export function streamGradedProps(post: Record<string, unknown> | null | undefined): { processing: boolean; hlsUrl: string | null } {
  const status = post?.video_status as string | undefined;
  return {
    processing: status === "processing",
    hlsUrl: status === "ready" ? ((post?.stream_playback_url as string | null) ?? null) : null,
  };
}

/** CSS `filter` string for the mappable params, or undefined when neutral. */
export function videoCssFilter(params: EditParams | null | undefined): string | undefined {
  if (!params) return undefined;
  const p = params as unknown as { exposure?: number; contrast?: number; saturation?: number; blur?: number; whiteBalance?: { t?: number } };
  const parts: string[] = [];
  const exp = num(p.exposure), con = num(p.contrast), sat = num(p.saturation), bl = num(p.blur), wbT = num(p.whiteBalance?.t);
  if (exp) parts.push(`brightness(${(1 + exp * VIDEO_GRADE.exposurePerStop).toFixed(3)})`);
  if (con) parts.push(`contrast(${(1 + con * VIDEO_GRADE.contrastPerStop).toFixed(3)})`);
  if (sat) parts.push(`saturate(${(1 + sat * VIDEO_GRADE.saturationPerStop).toFixed(3)})`);
  if (bl > 0) parts.push(`blur(${(bl * VIDEO_GRADE.blurPxPerStop).toFixed(2)}px)`);
  if (wbT) parts.push(`hue-rotate(${(wbT * VIDEO_GRADE.wbHueDegPerStop).toFixed(1)}deg)`);
  return parts.length ? parts.join(" ") : undefined;
}

/** Overlay layer styles (each an absolute, pointer-events:none div OVER the video). */
export function videoOverlays(params: EditParams | null | undefined): CSSProperties[] {
  if (!params) return [];
  const p = params as unknown as { vignette?: number; fade?: number; whiteBalance?: { tint?: number } };
  const layers: CSSProperties[] = [];
  const vig = num(p.vignette), fade = num(p.fade), tint = num(p.whiteBalance?.tint);
  if (vig > 0) {
    const a = (Math.min(vig, 6) / 6 * VIDEO_GRADE.vignetteMaxAlpha).toFixed(3);
    layers.push({ background: `radial-gradient(ellipse at center, transparent 45%, rgb(var(--black-rgb) / ${a}) 100%)` });
  }
  if (fade > 0) {
    const a = (Math.min(fade, 12) / 12 * VIDEO_GRADE.fadeMaxAlpha).toFixed(3);
    layers.push({ background: `rgba(190,190,190,${a})`, mixBlendMode: "screen" });
  }
  if (tint) {
    const a = (Math.min(Math.abs(tint), 6) / 6 * VIDEO_GRADE.wbTintMaxAlpha).toFixed(3);
    layers.push({ background: `rgba(${tint > 0 ? "0,255,0" : "255,0,255"},${a})`, mixBlendMode: "soft-light" });
  }
  return layers;
}
