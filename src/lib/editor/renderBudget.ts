"use client";

/**
 * renderBudget — how wide the finishing BAKE may render on this client.
 *
 * The finishing chain (Pipeline.tsx) renders ~10 full-size framebuffers + a
 * preserveDrawingBuffer through ONE WebGL Surface. At the cinematic export width
 * (4096) the GPU peak (~hundreds of MB) exceeds the iOS WebKit per-context budget
 * and the WebContent process is killed → app crash. So we cap the bake's RENDER
 * TARGET width on memory-constrained / mobile clients and only allow the full
 * 4096 on confidently high-headroom desktop GPUs.
 *
 * FAIL-SAFE: default to the CAPPED width whenever we can't be confident — SSR,
 * unknown platform, missing APIs, or any throw all resolve to the capped width. We
 * never gamble the full 4096 unless every signal says "capable desktop".
 *
 * The cap is on the render target ONLY — input texture, look math, node chain,
 * aspect ratio and the downstream upload path are all unchanged (fewer pixels).
 */

const CAPPED_WIDTH = 1024; // iOS / mobile GPU budget (present + per-context ceiling)
const FULL_WIDTH = 4096;   // desktop with comfortable headroom

/**
 * Return the maximum width the finishing bake Surface may render at on this
 * client. Pass a live WebGL context when one is available (lets us read the GPU's
 * MAX_TEXTURE_SIZE); otherwise the platform/pointer heuristics decide.
 */
export function getMaxBakeWidth(gl?: WebGLRenderingContext | WebGL2RenderingContext): number {
  try {
    // 1. GPU texture-size headroom — a 4096 render target needs comfortable room
    //    ABOVE 4096 (intermediate framebuffers, glow/clarity branches). Anything
    //    under 8192 is treated as constrained.
    if (gl) {
      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      if (typeof maxTex === 'number' && maxTex < 8192) return CAPPED_WIDTH;
    }

    // SSR / no DOM → fail safe.
    if (typeof window === 'undefined') return CAPPED_WIDTH;

    // 2. Touch device (coarse pointer AND no hover) → constrained GPU budget.
    const mm = typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null;
    if (mm) {
      const coarse = mm('(pointer: coarse)').matches;
      const noHover = mm('(hover: none)').matches;
      if (coarse && noHover) return CAPPED_WIDTH;
    }

    // 3. iOS / iPadOS — tightest GPU budget, no deviceMemory API. Catch iPhone/iPod/
    //    iPad directly AND modern iPadOS, which reports navigator.platform 'MacIntel'
    //    (masquerading as desktop) but exposes multi-touch.
    if (typeof navigator !== 'undefined') {
      const platform = navigator.platform || '';
      const ua = navigator.userAgent || '';
      const touchPoints = navigator.maxTouchPoints || 0;
      const isIOS = /iPad|iPhone|iPod/.test(platform) || /iPad|iPhone|iPod/.test(ua);
      const isIPadOS = platform === 'MacIntel' && touchPoints > 1;
      if (isIOS || isIPadOS) return CAPPED_WIDTH;
    }

    // 4. Confident desktop (fine pointer, capable GPU) → full resolution.
    return FULL_WIDTH;
  } catch {
    // 5. Any throw → fail safe.
    return CAPPED_WIDTH;
  }
}
