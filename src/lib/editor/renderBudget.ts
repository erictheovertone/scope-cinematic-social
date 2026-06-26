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
 * unknown platform, missing APIs, or any throw all resolve to 2048. We never
 * gamble the full 4096 unless every signal says "capable desktop".
 *
 * The cap is on the render target ONLY — input texture, look math, node chain,
 * aspect ratio and the downstream upload path are all unchanged (fewer pixels).
 */

const CAPPED_WIDTH = 2048; // safe on iOS / mobile GPU budgets
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
      if (typeof maxTex === 'number' && maxTex < 8192) {
        console.log('[BUDGET] capped via MAX_TEXTURE_SIZE', maxTex); // TEMP DIAGNOSTIC
        if (typeof window !== 'undefined') window.__dbg?.(`[BUDGET] MAX_TEXTURE_SIZE=${maxTex} → ${CAPPED_WIDTH}`); // TEMP DEBUG
        return CAPPED_WIDTH;
      }
    }

    // SSR / no DOM → fail safe.
    if (typeof window === 'undefined') {
      console.log('[BUDGET] capped via SSR/no-window'); // TEMP DIAGNOSTIC
      return CAPPED_WIDTH;
    }

    // 2. Touch device (coarse pointer AND no hover) → constrained GPU budget.
    const mm = typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null;
    if (mm) {
      const coarse = mm('(pointer: coarse)').matches;
      const noHover = mm('(hover: none)').matches;
      if (coarse && noHover) {
        console.log('[BUDGET] capped via coarse-pointer'); // TEMP DIAGNOSTIC
        if (typeof window !== 'undefined') window.__dbg?.(`[BUDGET] coarse-pointer → ${CAPPED_WIDTH}`); // TEMP DEBUG
        return CAPPED_WIDTH;
      }
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
      if (isIOS || isIPadOS) {
        console.log('[BUDGET] capped via iOS', { platform, touchPoints, isIOS, isIPadOS }); // TEMP DIAGNOSTIC
        if (typeof window !== 'undefined') window.__dbg?.(`[BUDGET] iOS plat=${platform} tp=${touchPoints} → ${CAPPED_WIDTH}`); // TEMP DEBUG
        return CAPPED_WIDTH;
      }
    }

    // 4. Confident desktop (fine pointer, capable GPU) → full resolution.
    console.log('[BUDGET] FULL 4096 desktop'); // TEMP DIAGNOSTIC
    if (typeof window !== 'undefined') window.__dbg?.(`[BUDGET] FULL desktop → ${FULL_WIDTH}`); // TEMP DEBUG
    return FULL_WIDTH;
  } catch (e) {
    // 5. Any throw → fail safe.
    console.log('[BUDGET] capped via catch', e); // TEMP DIAGNOSTIC
    if (typeof window !== 'undefined') window.__dbg?.(`[BUDGET] catch → ${CAPPED_WIDTH}`); // TEMP DEBUG
    return CAPPED_WIDTH;
  }
}
