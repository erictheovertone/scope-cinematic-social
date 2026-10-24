// ── src/lib/tabNav.ts — mobile tab transitions + per-tab scroll memory (Brief M20) ──
// Tabs are ROUTES (the footer pill's <Link>s), so a tab change unmounts the old page.
//
// navigateTab(router, href): wraps router.push in document.startViewTransition. The
// update callback must not resolve until the NEW route has committed — otherwise the
// browser snapshots the old page twice and the new one pops in after the fade — so it
// parks a resolver that SlideShell fires from a layout effect on the pathname change
// (after the page's own layout effects, i.e. after Home's anchor restore). A timeout releases
// the frozen frame if the route never commits. No VT API / reduced motion → plain push.
//
// Landing (M20b, below): every tab opens at the top; Home returns to a deliberate anchor.
"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type VTDocument = Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
type Router = { push: (href: string) => void };

const COMMIT_TIMEOUT_MS = 700;
let pendingCommit: (() => void) | null = null;

// M20a — tapping the ACTIVE tab: no navigation, no transition. The tab's scroller goes to the
// top (useTabTop / useHomeAnchor) and the page may refresh (useTabReselect — Home refetches).
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

// ── tab landing (Brief M20b) ─────────────────────────────────────────────────
// Every tab opens at the TOP, except Home, which returns to the post you deliberately
// scrolled to. M20 remembered every tab's raw scrollTop for the whole session — and a PWA
// session lasts hours — so tabs landed at stale depths; and once the feed cache expired
// (fresh first page), a missing anchor fell back to raw pixels on a different feed.
//
// useTabTop(href, ref): no memory; an active-tab tap (M20a) smooth-scrolls it to the top.
// useHomeAnchor(key, ref, enabled, { anchorAttr, landingPx }): remembers ONE anchor
//   (item id + offset from the scroller top), saved on leave only if the user TOUCHED the
//   scroller this visit and left it past the landing block (or an anchor restored this
//   visit was left untouched). Restored in a layout effect before the incoming page paints;
//   held while cards above settle (async rows/images), so nothing visibly jumps. Anchor not
//   in the rendered list → top, and the anchor is dropped. Cleared by clearTabAnchor (fresh
//   fetch) and by relaunch (module memory). Active-tab tap → top + cleared.
type Anchor = { id: string; offset: number };
const anchors = new Map<string, Anchor>();
const TAB_KEY = "tab:"; // keys are "tab:<href>" — the reselect event carries the href
const SETTLE_WINDOW_MS = 2500;

export function clearTabAnchor(key: string): void { anchors.delete(key); }
/** The saved anchor id for `key`, if Home will restore one (P4: render through it first). */
export function peekTabAnchor(key: string): string | undefined { return anchors.get(key)?.id; }

/** Attach `make(el)` whenever the scroller ELEMENT appears/changes (pages render a loader
 *  first, so it isn't there on mount): an identity check after every commit, before paint. */
function useScrollerBinding(ref: RefObject<HTMLElement | null>, enabled: boolean, make: (el: HTMLElement) => () => void): void {
  const bound = useRef<{ el: HTMLElement | null; detach: (() => void) | null }>({ el: null, detach: null });
  useLayoutEffect(() => {
    const el = enabled ? ref.current : null;
    if (el === bound.current.el) return;
    bound.current.detach?.();
    bound.current = { el, detach: el ? make(el) : null };
  });
  useLayoutEffect(() => () => { bound.current.detach?.(); bound.current = { el: null, detach: null }; }, []);
}

function onReselectTop(href: string, el: HTMLElement, also?: () => void): () => void {
  const on = (e: Event) => {
    if ((e as CustomEvent<string>).detail !== href) return;
    also?.();
    el.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  };
  window.addEventListener(TAB_RESELECT, on);
  return () => window.removeEventListener(TAB_RESELECT, on);
}

export function useTabTop(href: string, ref: RefObject<HTMLElement | null>, enabled = true): void {
  useScrollerBinding(ref, enabled, (el) => onReselectTop(href, el));
}

export function useHomeAnchor(
  key: string, ref: RefObject<HTMLElement | null>, enabled: boolean,
  opts: { anchorAttr: string; landingPx: number },
): void {
  useScrollerBinding(ref, enabled, (el) => attachAnchor(key, el, opts.anchorAttr, opts.landingPx));
}

function readAnchor(el: HTMLElement, attr: string): Anchor | undefined {
  const top = el.getBoundingClientRect().top;
  for (const item of Array.from(el.querySelectorAll<HTMLElement>(`[${attr}]`))) {
    const r = item.getBoundingClientRect();
    if (r.bottom > top) return { id: item.getAttribute(attr)!, offset: r.top - top };
  }
  return undefined;
}

function attachAnchor(key: string, el: HTMLElement, attr: string, landingPx: number): () => void {
  let touched = false;     // the user scrolled this scroller (touch / wheel) during this visit
  let restored = false;    // a deliberate anchor was restored on arrival
  let ro: ResizeObserver | null = null, timer = 0;
  const target = anchors.get(key);

  const stopSettle = () => { ro?.disconnect(); ro = null; clearTimeout(timer); };
  const onUser = () => { touched = true; stopSettle(); };
  // Re-pin the anchor post at its saved offset (programmatic → useScrollChrome re-bases, M19).
  const pin = (): boolean => {
    const item = target && el.querySelector<HTMLElement>(`[${attr}="${CSS.escape(target.id)}"]`);
    if (!item) return false;
    const delta = item.getBoundingClientRect().top - el.getBoundingClientRect().top - target!.offset;
    if (Math.abs(delta) >= 1) el.scrollTop += delta;
    return true;
  };

  if (target) {
    if (pin()) {
      restored = true;
      ro = new ResizeObserver(() => { pin(); }); // hold it while cards above settle
      Array.from(el.children).forEach((c) => ro!.observe(c));
      timer = window.setTimeout(stopSettle, SETTLE_WINDOW_MS);
    } else {
      anchors.delete(key); // not in the rendered list → top, never a guess
    }
  }
  el.addEventListener("touchstart", onUser, { passive: true });
  el.addEventListener("wheel", onUser, { passive: true });
  const offReselect = onReselectTop(key.slice(TAB_KEY.length), el, () => { stopSettle(); anchors.delete(key); restored = false; touched = false; });

  return () => {
    stopSettle();
    offReselect();
    el.removeEventListener("touchstart", onUser);
    el.removeEventListener("wheel", onUser);
    // Layout cleanup on leave: the element is still in the DOM, so the anchor can be read.
    const deliberate = touched || restored;
    const anchor = deliberate && el.isConnected && el.scrollTop > landingPx ? readAnchor(el, attr) : undefined;
    if (anchor) anchors.set(key, anchor); else anchors.delete(key);
  };
}
