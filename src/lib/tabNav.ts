// ── src/lib/tabNav.ts — mobile tab transitions + per-tab scroll memory (Brief M20) ──
// Tabs are ROUTES (the footer pill's <Link>s), so a tab change unmounts the old page.
//
// navigateTab(router, href): wraps router.push in document.startViewTransition. The
// update callback must not resolve until the NEW route has committed — otherwise the
// browser snapshots the old page twice and the new one pops in after the fade — so it
// parks a resolver that SlideShell fires from a layout effect on the pathname change
// (after the page's own layout effects, i.e. after scroll restore). A timeout releases
// the frozen frame if the route never commits. No VT API / reduced motion → plain push.
//
// useScrollMemory(key, ref): remembers a tab's scrollTop for the session and restores it
// before first paint on return; when the content arrives async (fetch on mount) it keeps
// re-applying as the scroller grows, until reached or the user touches it.
"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type VTDocument = Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
type Router = { push: (href: string) => void };

const COMMIT_TIMEOUT_MS = 700;
let pendingCommit: (() => void) | null = null;

// M20a — tapping the ACTIVE tab: no navigation, no transition. The tab's scroller goes to the
// top (useScrollMemory) and the page may refresh (useTabReselect — Home refetches).
const TAB_RESELECT = "scope:tab-reselect";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function navigateTab(router: Router, href: string): void {
  if (typeof window === "undefined") { router.push(href); return; }
  if (window.location.pathname === href) { window.dispatchEvent(new CustomEvent(TAB_RESELECT, { detail: href })); return; }
  const d = document as VTDocument;
  if (!d.startViewTransition || reduceMotion()) { router.push(href); return; }
  pendingCommit?.(); // a previous nav still in flight — release it
  d.startViewTransition(() => new Promise<void>((resolve) => {
    const done = () => { if (pendingCommit === done) pendingCommit = null; resolve(); };
    pendingCommit = done;
    setTimeout(done, COMMIT_TIMEOUT_MS);
    router.push(href);
  }));
}

/** SlideShell calls this from a layout effect when the pathname changes. */
export function tabRouteCommitted(): void { pendingCommit?.(); }

/** Run `cb` when the active tab `href` is tapped again. */
export function useTabReselect(href: string, cb: () => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === href) ref.current(); };
    window.addEventListener(TAB_RESELECT, on);
    return () => window.removeEventListener(TAB_RESELECT, on);
  }, [href]);
}

/** Resolves once `el` has (smooth-)scrolled to the top, or after `maxMs`. */
export function scrolledToTop(el: HTMLElement, maxMs = 1200): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => (el.scrollTop <= 1 || performance.now() - t0 > maxMs ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

// ── per-tab scroll memory ────────────────────────────────────────────────────
// Saved per key for the session. With `anchorAttr` (e.g. "data-post-id") the position is
// stored as "this item, this far from the top" rather than raw pixels, and re-applied while
// content settles — cards above that grow after mount (async rows, images) can't drift it.
type Saved = { top: number; anchor?: { id: string; offset: number } };
const saved = new Map<string, Saved>();
const TAB_KEY = "tab:"; // keys are "tab:<href>" — the reselect event carries the href
const RESTORE_WINDOW_MS = 2500;

export function useScrollMemory(key: string, ref: RefObject<HTMLElement | null>, enabled = true, anchorAttr?: string): void {
  // Attach whenever the scroller ELEMENT appears/changes (pages render a loader first, so
  // it isn't there on mount): a cheap identity check after every commit, before paint.
  const bound = useRef<{ el: HTMLElement | null; detach: (() => void) | null }>({ el: null, detach: null });
  useLayoutEffect(() => {
    const el = enabled ? ref.current : null;
    if (el === bound.current.el) return;
    bound.current.detach?.();
    bound.current = { el, detach: el ? attach(key, el, anchorAttr) : null };
  });
  useLayoutEffect(() => () => { bound.current.detach?.(); bound.current = { el: null, detach: null }; }, []);
}

function readAnchor(el: HTMLElement, attr: string): Saved["anchor"] {
  const top = el.getBoundingClientRect().top;
  for (const item of Array.from(el.querySelectorAll<HTMLElement>(`[${attr}]`))) {
    const r = item.getBoundingClientRect();
    if (r.bottom > top) return { id: item.getAttribute(attr)!, offset: r.top - top };
  }
  return undefined;
}

function attach(key: string, el: HTMLElement, anchorAttr?: string): () => void {
  let snap: Saved = { top: el.scrollTop };
  const onScroll = () => { snap = { top: el.scrollTop }; }; // anchor is read lazily on leave

  const target = saved.get(key);
  let ro: ResizeObserver | null = null, timer = 0;
  const stopRestore = () => {
    ro?.disconnect(); ro = null; clearTimeout(timer);
    el.removeEventListener("touchstart", stopRestore); el.removeEventListener("wheel", stopRestore);
  };
  // Programmatic → useScrollChrome re-bases instead of hiding (M19 intent gate).
  const apply = (): boolean => {
    if (!target) return true;
    if (target.anchor && anchorAttr) {
      const item = el.querySelector<HTMLElement>(`[${anchorAttr}="${CSS.escape(target.anchor.id)}"]`);
      if (item) {
        const delta = item.getBoundingClientRect().top - el.getBoundingClientRect().top - target.anchor.offset;
        if (Math.abs(delta) >= 1) el.scrollTop += delta;
        return false; // anchored: keep holding it while content settles (window / user touch ends it)
      }
    }
    el.scrollTop = target.top;
    return el.scrollTop >= target.top - 1;
  };
  if (target && target.top > 0) {
    if (!apply()) {
      // Content still loading / settling: re-apply as it grows; the user's own touch wins.
      ro = new ResizeObserver(() => { if (apply()) stopRestore(); });
      Array.from(el.children).forEach((c) => ro!.observe(c));
      el.addEventListener("touchstart", stopRestore, { passive: true });
      el.addEventListener("wheel", stopRestore, { passive: true });
      timer = window.setTimeout(stopRestore, RESTORE_WINDOW_MS);
    }
    snap = { top: el.scrollTop };
  }
  // M20a — active-tab tap: back to the top and forget the saved position/anchor.
  const onReselect = (e: Event) => {
    if ((e as CustomEvent<string>).detail !== key.slice(TAB_KEY.length)) return;
    stopRestore();
    saved.delete(key);
    el.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  };
  el.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener(TAB_RESELECT, onReselect);
  return () => {
    stopRestore();
    el.removeEventListener("scroll", onScroll);
    window.removeEventListener(TAB_RESELECT, onReselect);
    // On leave the element is still in the DOM (layout cleanup), so the anchor can be read.
    const anchor = anchorAttr && el.isConnected ? readAnchor(el, anchorAttr) : undefined;
    saved.set(key, { top: snap.top, anchor });
  };
}
