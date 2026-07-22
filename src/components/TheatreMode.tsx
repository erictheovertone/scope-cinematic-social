'use client';
// ── TheatreMode — landscape full-screen viewing of a profile's posts ─────────
//
// Triggered by the eye icon in the profile tab row (between DECKS and COLLECTED).
// A full-screen, LANDSCAPE viewing surface over a black field — built on the same
// "landscape toggle" idea as the finishing suite (present landscape WITHOUT
// requiring the user to physically rotate the phone). On a portrait phone we
// force-landscape via a CSS rotate (the mobile Figma node 4089-681 was itself
// authored in a rotated coordinate space); on a landscape phone / desktop we lay
// the same composition out directly (desktop node 4014-522: dimmed profile, hero
// centered, side arrows, "+" for data, framed-eye close).
//
// Each post shows at its TRUE aspect ratio (post.layout_id) — wides fill, 4:3
// pillarboxes. Images + videos; the current video autoplays (muted/loop) and only
// the current post's media is mounted (no stacked playback). Swipe (mobile) +
// arrows (both) move prev/next, in the profile's order.
//
// The "+" (lower area) reveals a clean data panel — likes, comments, First Cut,
// MC, price/piece — from the real (hardened) sources. Exit: tap the black field,
// the framed-eye top-right, or BACK (mobile).
//
// Design system: pure black, #E5E1DB, SK-Modernist, sharp corners, no shadow/blur,
// signature easing cubic-bezier(0.16,0.84,0.3,1). No IBM Plex Mono.

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useEconomy, isCoinPost } from '@/components/EconomyProvider';
import { getPostLikes, getPostComments, addComment, likePost, unlikePost, isPostLikedByUser } from '@/lib/postsService';
import { getUserByPrivyId, getProfile } from '@/lib/userService';
import { getAspectRatio } from '@/lib/aspectRatio';
import { useFirstCutLedger, FIRST_CUT_SLOTS } from '@/lib/firstCutLedger';
import { BADGES } from '@/lib/economy/badges';
import CollectSheetGate from '@/components/economy/CollectSheetGate';
import FirstCutLedger from '@/components/economy/FirstCutLedger';
import GradedVideo from '@/components/finishing/GradedVideo';
import { feedImage } from '@/lib/mediaUrl';
import MusicWaveButton from '@/components/music/MusicWaveButton';
import MediaRenderer from '@/components/MediaRenderer';
import type { PostMarket } from '@/lib/economy/types';

const FC_MARK = BADGES.firstCut.bannerSrc ?? BADGES.firstCut.src;

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKL: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 300 };
const EASE = 'cubic-bezier(0.16,0.84,0.3,1)';
// THEATRE media tier — the largest presentation surface (fullscreen rotated ≈
// up to ~2500 physical px long-edge on a 15). 1600 WebP @78 is sharp there at a
// fraction of original bytes; bump to 2000 only if device softness shows. The
// editor's full-res no-width default is untouched — this is an explicit tier.
const THEATRE_IMG_WIDTH = 1600;
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

type AnyPost = Record<string, unknown>;
const f = (p: AnyPost, k: string) => p[k] as string | undefined;

export default function TheatreMode({
  posts,
  startIndex = 0,
  onClose,
  source = 'profile',
  zBase = 490,
  exitOnPortrait = false,
  onIndexChange,
  ranks,
}: {
  posts: AnyPost[];
  startIndex?: number;
  onClose: () => void;
  /** Stage stacking base (default 490); surfaces above that pass higher. */
  zBase?: number;
  /** 'feed' = home-feed entry (many creators, infinite) → show @handle + always-on
      stats, no counter. 'profile' = one creator → expand-only stats, counter kept.
      'screening' = Screening Room lineup → no counter; a quiet rank indicator instead. */
  source?: 'feed' | 'profile' | 'screening';
  /** Brief M3b §3 — SR-origin only: the lineup rank per index (1–50), shown below-left. */
  ranks?: number[];
  /** When theatre was ENTERED by physically rotating to landscape, rotating BACK to
      portrait exits it through the normal close chain — the gesture is symmetric.
      Eye-entered sessions (false) keep the force-rotate rule and NEVER exit on
      orientation. At entry the device is landscape (portrait=false), so this can't
      self-trigger on mount. */
  exitOnPortrait?: boolean;
  /** Reports the current post index up so the caller can restore its scroll on exit. */
  onIndexChange?: (i: number) => void;
}) {
  const isFeed = source === 'feed';
  const isScreening = source === 'screening';
  const economy = useEconomy();
  const { user } = usePrivy();
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, posts.length - 1)));
  const [showData, setShowData] = useState(false);
  const [shown, setShown] = useState(false); // enter/exit transition flag
  const reduceMotion = useRef(false);

  // ── Home-feed data shelf state (COLLECT, likes, comments) ──
  const [viewerName, setViewerName] = useState('user');
  const [showCollect, setShowCollect] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likes, setLikes] = useState<{ user_id?: string }[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [comments, setComments] = useState<{ id?: string; username?: string; content?: string }[]>([]);
  const [newComment, setNewComment] = useState('');

  // Viewer's @handle for like/comment writes (same path PostItem uses).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUserByPrivyId(user.id)
      .then((su) => (su ? getProfile(su.id) : null))
      .then((p) => { if (!cancelled && p) setViewerName(((p as { username?: string }).username) ?? 'user'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // Viewport + orientation. Portrait phone → force-landscape (rotate the stage).
  const [vp, setVp] = useState(() => (typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 0, h: 0 }));
  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, []);

  const portrait = vp.h >= vp.w;          // taller than wide → rotate to present landscape
  const stageW = portrait ? vp.h : vp.w;  // landscape width
  const stageH = portrait ? vp.w : vp.h;  // landscape height

  const post = posts[index] as AnyPost | undefined;
  const coinAddr = post && isCoinPost(post as { coin_address?: string | null; token_standard?: string | null })
    ? (f(post, 'coin_address') ?? null) : null;

  // First Cut count for the always-on feed stat row (cheap; the panel ledger
  // self-fetches separately). null on non-coin posts.
  const fcHolders = useFirstCutLedger(coinAddr);
  const fcCount = fcHolders?.length ?? 0;

  // TAKEOVER STANDDOWN: theatre owns all gestures while open — global page-
  // swipe navigation is off wholesale (the finishing-suite gate).
  useEffect(() => {
    document.documentElement.dataset.suiteOpen = '1';
    window.dispatchEvent(new CustomEvent('scope:takeover-change')); // AppShell hides the footer
    return () => {
      delete document.documentElement.dataset.suiteOpen;
      window.dispatchEvent(new CustomEvent('scope:takeover-change'));
    };
  }, []);

  // ── Enter / exit animation (signature easing; reduced-motion = plain fade) ──
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  const closing = useRef(false);
  const handleClose = useCallback(() => {
    if (closing.current) return; // idempotent — rapid rotations can't stack exits
    closing.current = true;
    setShown(false);
    const t = setTimeout(onClose, reduceMotion.current ? 120 : 360);
    return () => clearTimeout(t);
  }, [onClose]);

  // Report the current index up so the profile can land on the last-viewed post.
  useEffect(() => { onIndexChange?.(index); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Symmetric rotation gesture — a rotation-entered session exits when the device
  // returns to portrait. Routed through handleClose so it uses the SAME animated
  // exit chain as the black-tap / eye (no bespoke teardown). Eye-entered sessions
  // (exitOnPortrait=false) never reach here → they keep the force-rotate rule.
  useEffect(() => {
    if (exitOnPortrait && portrait) handleClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitOnPortrait, portrait]);

  // PRELOAD (fetch AND decode) both neighbors' theatre-tier images the moment
  // the index settles — img.decode() finishes the pixel work off-gesture, so a
  // swipe lands on an already-decoded surface (videos preload via their slot's
  // poster; the media file itself streams on demand).
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const p = posts[i] as AnyPost | undefined;
      if (!p) return;
      const vid = f(p, 'media_type') === 'video';
      const raw = vid
        ? (f(p, 'poster_url') || f(p, 'thumbnail_url'))
        : (p['media_urls'] as string[] | undefined)?.[0];
      if (!raw) return;
      const im = new window.Image();
      im.src = feedImage(raw, THEATRE_IMG_WIDTH);
      im.decode?.().catch(() => { /* decode-on-paint fallback */ });
    });
  }, [index, posts]);

  // ── Navigation ──
  const go = useCallback((dir: 1 | -1) => {
    setShowData(false);
    setIndex((i) => {
      const n = i + dir;
      return n < 0 || n >= posts.length ? i : n;
    });
  }, [posts.length]);

  // Keyboard (desktop): ←/→ navigate, Esc exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, handleClose]);

  // ── FINGER-TRACKING swipe — the media physically follows the drag (the
  // PfpCropModal touch-drag pattern: raw touch handlers + rAF-free state,
  // transforms only). In forced-landscape (rotated 90°) the VISUAL horizontal
  // axis is the device's vertical, so drags map dy there, dx otherwise.
  // Horizontal-intent lock; 32%-width or velocity commit; 0.3× rubber-band at
  // the ends; neighbors peek from their edges (posters — cheap, no decoders).
  const [dragX, setDragX] = useState(0);        // visual-x offset (stage px)
  const [dragAnim, setDragAnim] = useState(false); // release animation in flight
  const drag = useRef<{ x: number; y: number; axis: 'h' | 'v' | null; lastX: number; lastT: number; vx: number } | null>(null);
  const commitRef = useRef<1 | -1 | 0>(0);

  const visualDelta = (t: React.Touch) => {
    if (!drag.current) return { h: 0, v: 0 };
    const dx = t.clientX - drag.current.x;
    const dy = t.clientY - drag.current.y;
    // rotated stage: visual-h = device dy (down = next → negative visual-x)
    return portrait ? { h: dy, v: dx } : { h: dx, v: dy };
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (dragAnim) return;
    const t = e.touches[0];
    // Brief M3b §2 — ~24px dead zones on the PHYSICAL screen edges (device coords, read
    // pre-rotation) so the iOS system back-swipe is never captured as a lineup swipe. In
    // the forced-rotate stage the visual-horizontal swipe is a device-VERTICAL drag across
    // mid-screen, so this rarely touches a real swipe. (Shared hardening; profile theatre
    // swipes across the media, unaffected.)
    if (t.clientX < 24 || t.clientX > window.innerWidth - 24) { drag.current = null; return; }
    drag.current = { x: t.clientX, y: t.clientY, axis: null, lastX: portrait ? t.clientY : t.clientX, lastT: e.timeStamp, vx: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current || dragAnim) return;
    const t = e.touches[0];
    const { h, v } = visualDelta(t);
    if (!drag.current.axis) {
      if (Math.abs(h) < 8 && Math.abs(v) < 8) return;
      drag.current.axis = Math.abs(h) > Math.abs(v) ? 'h' : 'v'; // intent lock
    }
    if (drag.current.axis !== 'h') return;
    const cur = portrait ? t.clientY : t.clientX;
    const dt = Math.max(1, e.timeStamp - drag.current.lastT);
    drag.current.vx = (cur - drag.current.lastX) / dt;
    drag.current.lastX = cur; drag.current.lastT = e.timeStamp;
    // rubber-band past the ends (no neighbor that side)
    const atStart = index === 0 && h > 0;
    const atEnd = index === posts.length - 1 && h < 0;
    setDragX(atStart || atEnd ? h * 0.3 : h);
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'h') { setDragX(0); return; }
    const canNext = index < posts.length - 1;
    const canPrev = index > 0;
    const commit = Math.abs(dragX) > stageW * 0.32 || Math.abs(d.vx) > 0.5;
    const dir: 1 | -1 | 0 = commit ? (dragX < 0 ? (canNext ? 1 : 0) : (canPrev ? -1 : 0)) : 0;
    commitRef.current = dir;
    setDragAnim(true);
    setDragX(dir === 0 ? 0 : dir === 1 ? -stageW : stageW);
    window.setTimeout(() => {
      if (commitRef.current !== 0) go(commitRef.current);
      commitRef.current = 0;
      setDragAnim(false);
      setDragX(0); // the new current renders centered, transition disabled below
    }, dir === 0 ? 200 : 250);
  };

  // ── Current-post data (real / hardened sources) for the "+" panel ──
  const [market, setMarket] = useState<PostMarket | null>(null);
  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    const id = f(post, 'id') as string;
    setMarket(null); setLikes([]); setComments([]); setIsLiked(false);
    setShowCollect(false); setShowComments(false);
    // MC/price from the hardened boundary; likes/comments + viewer's like state.
    if (coinAddr) economy.getPostMarket(id).then((m) => { if (!cancelled) setMarket(m); }).catch(() => {});
    Promise.all([
      getPostLikes(id),
      getPostComments(id),
      user ? isPostLikedByUser(id, user.id) : Promise.resolve(false),
    ])
      .then(([l, c, liked]) => {
        if (cancelled) return;
        setLikes((l ?? []) as { user_id?: string }[]);
        setComments((c ?? []) as { id?: string; username?: string; content?: string }[]);
        setIsLiked(!!liked);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [post, coinAddr, economy, user]);

  // Like / comment — same services + identifiers PostItem uses.
  const handleLike = async () => {
    if (!post || !user) return;
    const id = f(post, 'id') as string;
    // OPTIMISTIC: flip now, network in background, revert on error.
    const wasLiked = isLiked;
    const prevLikes = likes;
    setIsLiked(!wasLiked);
    setLikes((p) => wasLiked ? p.filter((l) => l.user_id !== user.id) : [...p, { user_id: user.id }]);
    try {
      if (wasLiked) await unlikePost(id, user.id);
      else await likePost(id, user.id, viewerName);
    } catch (e) {
      console.error('[theatre] like failed', e);
      setIsLiked(wasLiked);
      setLikes(prevLikes);
    }
  };
  const handleAddComment = async () => {
    if (!post || !user || !newComment.trim()) return;
    const id = f(post, 'id') as string;
    // OPTIMISTIC: render immediately, reconcile on success / mark failed.
    const text = newComment.trim();
    const tempId = `temp-${Date.now()}`;
    setComments((p) => [...p, { id: tempId, username: viewerName, content: text, pending: true } as { id?: string; username?: string; content?: string }]);
    setNewComment('');
    try {
      const c = await addComment(id, user.id, viewerName, text);
      setComments((p) => p.map((x) => x.id === tempId ? (c as { id?: string; username?: string; content?: string }) : x));
    } catch (e) {
      console.error('[theatre] comment failed', e);
      setComments((p) => p.map((x) => x.id === tempId ? ({ ...x, pending: false, failed: true } as { id?: string; username?: string; content?: string }) : x));
    }
  };

  if (!post || posts.length === 0) {
    // Nothing to screen — a quiet explainer with an EXPLICIT way back. Tapping
    // anywhere also exits, but the button makes the escape obvious → never stuck.
    return (
      <div onClick={() => handleClose()} style={{ position: 'fixed', inset: 0, zIndex: 900, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: '0 40px' }}>
        <span style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.6 }}>
          Nothing to screen yet<br />— post your first work
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.12em', background: 'transparent', border: '1px solid rgba(229,225,219,0.5)', cursor: 'pointer', padding: '12px 26px', touchAction: 'manipulation' }}
        >
          Back to profile
        </button>
      </div>
    );
  }

  // True AR of the current post (its immutable layout) → fitted media box.
  const arStr = getAspectRatio(f(post, 'layout_id') ?? '');
  const [aw, ah] = String(arStr).split('/').map((s) => parseFloat(s));
  const arNum = isFinite(aw) && isFinite(ah) && ah > 0 ? aw / ah : 2.39;
  // ── Arrows: ALWAYS in the side margins, vertically centered, moderate size ──
  // (authoritative spec). The media width is capped so a guaranteed side margin
  // remains for the arrows — they never overlap the media, for any AR.
  const ARROW_AR = 72 / 140;                       // asset w/h (a tall chevron)
  const ARROW_PAD = 6;                             // tap padding around the glyph
  const isDesktopVp = vp.w >= 1024;                // desktop seam: arrows stay primary
  const arrowH = isDesktopVp ? Math.min(46, stageH * 0.13) : Math.min(30, stageH * 0.09); // mobile ~65%
  const arrowW = arrowH * ARROW_AR;
  const MIN_SIDE = arrowW + ARROW_PAD * 2 + 12;    // margin reserved each side

  const availW = Math.min(stageW * 0.92, stageW - MIN_SIDE * 2);
  // Height cap ALSO reserves the controls band below the media (mobile row
  // needs ~46px) — the row can never touch the media at any aspect ratio.
  const availH = Math.min(stageH * (showData ? 0.74 : 0.86), stageH - 76);
  let boxW = availW, boxH = availW / arNum;
  if (boxH > availH) { boxH = availH; boxW = availH * arNum; }
  const sideMargin = (stageW - availW) / 2;        // CONSTANT (fixed stage) — arrows never drift per-post

  // Fit helper for ANY post (the drag strip sizes neighbor peeks by their own AR).
  const fitBox = (p: AnyPost) => {
    const a = String(getAspectRatio(f(p, 'layout_id') ?? '')).split('/').map((x) => parseFloat(x));
    const ar = isFinite(a[0]) && isFinite(a[1]) && a[1] > 0 ? a[0] / a[1] : 2.39;
    let w = availW, h = availW / ar;
    if (h > availH) { h = availH; w = availH * ar; }
    return { w, h };
  };
  // ── THE 3-POST WINDOW (the flash fix) — prev/current/next stay MOUNTED and
  // PRELOADED, keyed by post id so a commit re-orders slots WITHOUT remounting
  // anything: the incoming surface is already rendered/decoded and simply
  // slides to center. Images render as plain <img> (same feedImage URL in
  // every slot → cached, decoded offscreen); videos mount GradedVideo in all
  // three slots with forcePlay ONLY at center — neighbors sit at their poster
  // (zero decoders) and the prop flip on commit starts playback in place. */
  const slotEl = (i: number) => {
    const p = posts[i] as AnyPost | undefined;
    if (!p) return null;
    const { w, h } = fitBox(p);
    const center = i === index;
    const vid = f(p, 'media_type') === 'video';
    const url = (p['media_urls'] as string[] | undefined)?.[0];
    const pstr = f(p, 'poster_url') || f(p, 'thumbnail_url') || undefined;
    return (
      <div
        key={(f(p, 'id') as string) ?? String(i)}
        style={{
          position: 'absolute', left: '50%', top: '50%',
          width: availW, height: availH,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: `translate(calc(-50% + ${(i - index) * stageW + dragX}px), -50%)`,
          transition: dragAnim ? `transform 250ms ${EASE}` : 'none',
          pointerEvents: center ? 'auto' : 'none',
        }}
      >
        <div
          onClick={center ? (e) => { e.stopPropagation(); if (showData) setShowData(false); } : undefined}
          style={{ position: 'relative', width: w, height: h, background: '#000', overflow: 'hidden', flexShrink: 0 }}
        >
          {center && <MusicWaveButton post={p as { music_track_id?: string | null; music_mode?: string | null; music_start_seconds?: number | null; media_type?: string | null }} />}
          {vid ? (
            <GradedVideo
              url={url ?? ''}
              posterUrl={pstr ?? null}
              posterWidth={THEATRE_IMG_WIDTH}
              clipUrl={f(p, 'autoplay_clip_url') ?? null}
              editParams={p['edit_params']}
              cropX={(p['crop_x'] as number | undefined) ?? 0}
              cropY={(p['crop_y'] as number | undefined) ?? 0}
              cropWidth={(p['crop_width'] as number | undefined) ?? 1}
              cropHeight={(p['crop_height'] as number | undefined) ?? 1}
              forcePlay={center}
              showSoundToggle={center}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            url && <img src={feedImage(url, THEATRE_IMG_WIDTH)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
        </div>
      </div>
    );
  };

  // Stage transform: rotate to landscape on a portrait phone; direct otherwise.
  const stageStyle: React.CSSProperties = portrait
    ? { position: 'fixed', top: 0, left: '100%', width: '100dvh', height: '100vw', transform: 'rotate(90deg)', transformOrigin: 'top left' }
    : { position: 'fixed', inset: 0, width: '100vw', height: '100dvh' };

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const isCoin = !!coinAddr;

  return (
    <>
    {/* Stage z=490: BELOW the collect sheet (500/501), First Cut celebration (600)
        and whip (650), so a collect from theatre layers those above it. */}
    <div style={{ ...stageStyle, zIndex: zBase }}>
      {/* Black field — tapping the empty space (not the image / panel) exits. On
          desktop a near-opaque dim lets the profile bleed ~8% (matches the ref);
          on a rotated phone the field is solid so the portrait profile behind
          never shows through the rotation. */}
      <div
        // STRAY-TAP FIX (runtime-proven culprit): the field tap used to exit.
        // Exits are EXPLICIT ONLY — BACK, the eye, Escape. A stray tap now just
        // dismisses the data panel if open, else does nothing.
        onClick={() => { if (showData) setShowData(false); }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'absolute', inset: 0, background: portrait ? '#000' : 'rgba(0,0,0,0.92)',
          opacity: shown ? 1 : 0, transition: `opacity ${reduceMotion.current ? 120 : 360}ms ${EASE}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {/* Content wrapper — scales/fades in as the toggle animation. */}
        <div
          style={{
            position: 'absolute', inset: 0,
            opacity: shown ? 1 : 0,
            transform: reduceMotion.current ? 'none' : (shown ? 'scale(1)' : 'scale(0.965)'),
            transition: `opacity ${reduceMotion.current ? 120 : 360}ms ${EASE}, transform ${reduceMotion.current ? 0 : 380}ms ${EASE}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* The 3-post window — keyed slots slide together; nothing mounts
              or resizes mid-gesture (the flash + jerk fixes hold together). */}
          {[index - 1, index, index + 1].map((i) => slotEl(i))}
        </div>

        {/* ── Prev (<) / Next (>) arrows — ALWAYS in the side black margins,
            vertically centered, clear of the media. The asset points RIGHT, so the
            LEFT arrow is mirrored (points left → prev) and the RIGHT arrow is as-is
            (points right → next). Hidden while the data panel is up. ── */}
        {!showData && index > 0 && (
          <button
            onClick={(e) => { stop(e); go(-1); }}
            aria-label="Previous"
            style={{ position: 'absolute', left: sideMargin / 2, top: '50%', transform: 'translate(-50%, -50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: ARROW_PAD, opacity: 1 }}
          >
            {/* DESKTOP: full opacity + a white glow so the arrows read clearly.
                MOBILE: full opacity + a softer brightness (no glow) so they read
                clearly without the harsh desktop halo — the 0.85 button opacity
                plus a missing filter were the only mobile dimmers. */}
            <img src="/theatre-mode-arrow-01.png" alt="Previous" style={{ height: arrowH, width: 'auto', display: 'block', transform: 'scaleX(-1)', filter: isDesktopVp ? 'brightness(1.3) drop-shadow(0 0 6px rgba(229,225,219,0.55))' : 'brightness(1.2)' }} />
          </button>
        )}
        {!showData && index < posts.length - 1 && (
          <button
            onClick={(e) => { stop(e); go(1); }}
            aria-label="Next"
            style={{ position: 'absolute', left: stageW - sideMargin / 2, top: '50%', transform: 'translate(-50%, -50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: ARROW_PAD, opacity: 1 }}
          >
            <img src="/theatre-mode-arrow-01.png" alt="Next" style={{ height: arrowH, width: 'auto', display: 'block', filter: isDesktopVp ? 'brightness(1.3) drop-shadow(0 0 6px rgba(229,225,219,0.55))' : 'brightness(1.2)' }} />
          </button>
        )}

        {/* ── BACK — top-LEFT, all surfaces (exits Theatre View) ── */}
        <button
          onClick={(e) => { stop(e); handleClose(); }}
          style={{ position: 'absolute', left: 16, top: 14, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: '#E5E1DB', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Back</span>
        </button>

        {/* ── Framed-eye close (top-right) ── */}
        <button
          onClick={(e) => { stop(e); handleClose(); }}
          aria-label="Close theatre"
          style={{ position: 'absolute', right: 14, top: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}
        >
          <img src="/theatre-mode-eye-framed-v2.png" alt="" style={{ height: 26, width: 'auto', display: 'block', opacity: 0.92 }} />
        </button>

        {/* ── Bottom-LEFT cluster — the "+" (reveals the full panel), plus (FEED
            only) an always-on stats row: likes (tap to like) · comments (tap →
            opens the panel's ripple-up) · First Cut X/10. Profile view shows just
            the "+" (stats are expand-only there). Hidden while the panel is up. ── */}
        {/* Centered in the letterbox band BELOW the media (stage coordinates —
            on a rotated phone the stage's "below" is the visual below). The
            availH cap guarantees the band ≥ ~38px at every ratio; the row's
            visual height (~34px) centers inside it. */}
        {!showData && (
          <div style={{ position: 'absolute', top: stageH / 2 + boxH / 2 + Math.max(2, (stageH / 2 - boxH / 2 - 34) / 2), left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, zIndex: 3, height: 34 }}>
            {/* Brief M3c §2 — rank lives INSIDE this data bar, at its LEFT end (SR-origin
                only). Same bar as the "+"/stats; quiet two-digit, 75 Bold --track-wide 50%.
                Updates live on swipe. Other origins render the bar exactly as before. */}
            {isScreening && ranks?.[index] != null && (
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: 'var(--track-wide)', color: 'rgba(229,225,219,0.5)', pointerEvents: 'none' }}>
                {String(ranks[index]).padStart(2, '0')}
              </span>
            )}
            {/* "+" — ≥44px tap target (the 12 couldn't hit the old padding-0 glyph),
                inset-relative bottom. Handle sits immediately to its right —
                everything lives BELOW the media in the black band. */}
            <button
              onClick={(e) => { stop(e); setShowData(true); }}
              aria-label="Show data"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 0 }}
            >
              {/* −3px optical trim: the '+' glyph draws low in its em box (math-
                  axis baseline), which read as sitting below the handle/icons even
                  though the flex row centers every box. One row, no offsets. */}
              <span style={{ ...SKL, fontSize: 'var(--fs-30)', lineHeight: 1, color: '#E5E1DB', display: 'block', transform: 'translateY(-3px)' }}>+</span>
            </button>
            {isFeed && f(post, 'username') && (
              <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.85)', letterSpacing: '0.02em', textTransform: 'uppercase', pointerEvents: 'none', marginRight: 6 }}>
                @{f(post, 'username')}
              </span>
            )}
            {isFeed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* +6px icons, ≥44px targets — visual size up, still in the band. */}
                <button onClick={(e) => { stop(e); handleLike(); }} aria-label="Like" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44, padding: 0 }}>
                  <svg width="20.5" height="20.5" viewBox="0 0 24 24" fill={isLiked ? '#E5E1DB' : 'none'} stroke={isLiked ? '#E5E1DB' : 'rgba(229,225,219,0.85)'} strokeWidth="2" strokeLinejoin="round"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z"/></svg>
                  <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{likes.length}</span>
                </button>
                <button onClick={(e) => { stop(e); setShowData(true); setShowComments(true); }} aria-label="Comments" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44, padding: 0 }}>
                  <svg width="20.5" height="20.5" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.85)" strokeWidth="2" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>
                  <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{comments.length}</span>
                </button>
                {coinAddr && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44 }}>
                    <img src={FC_MARK} alt="First Cut" style={{ width: 18, height: 18, objectFit: 'contain', display: 'block' }} />
                    <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: fcCount > 0 ? '#E5E1DB' : '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{fcCount}/{FIRST_CUT_SLOTS}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── DATA PANEL — slides up when "+" is tapped. Mirrors the home-feed
            shelf: COLLECT, First Cut ledger (tappable ripple), likes, comments
            (ripple up), MC, price — all from real/hardened sources. ── */}
        <div
          onClick={stop}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            background: '#000', borderTop: '1px solid #E5E1DB',
            padding: '9px 16px 11px', maxHeight: '40%', overflowY: 'auto',
            transform: showData ? 'translateY(0)' : 'translateY(101%)',
            transition: `transform ${reduceMotion.current ? 0 : 360}ms ${EASE}`,
            zIndex: 2,
          }}
        >
          {/* @handle + caption + COLLECT — compact */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={{ ...SKB, fontSize: 'var(--fs-12)', color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.02em' }}>@{f(post, 'username') ?? '—'}</span>
            {f(post, 'caption') && (
              <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.55)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{f(post, 'caption')}</span>
            )}
            {isCoin && (
              <button
                onClick={(e) => { stop(e); setShowCollect(true); }}
                style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.08em', color: '#E5E1DB', textTransform: 'uppercase', background: 'transparent', border: '1px solid #E5E1DB', cursor: 'pointer', padding: '4px 12px', flexShrink: 0 }}
              >
                Collect
              </button>
            )}
          </div>

          {/* Stat shelf — LIKES (tap to like) · COMMENTS (tap → ripple up) · MC · price */}
          <div style={{ display: 'flex', gap: 1, background: 'rgba(229,225,219,0.08)' }}>
            <button onClick={(e) => { stop(e); handleLike(); }} style={{ flex: 1, background: '#000', padding: '7px 6px', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <p style={{ ...SKB, fontSize: 'var(--fs-6_5)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>LIKES</p>
              <p style={{ ...SKB, fontSize: 'var(--fs-13)', color: isLiked ? '#E5E1DB' : '#E5E1DB', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{likes.length.toLocaleString()}</p>
            </button>
            <button onClick={(e) => { stop(e); setShowComments((v) => !v); }} style={{ flex: 1, background: '#000', padding: '7px 6px', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <p style={{ ...SKB, fontSize: 'var(--fs-6_5)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>COMMENTS</p>
              <p style={{ ...SKB, fontSize: 'var(--fs-13)', color: showComments ? '#E5E1DB' : '#E5E1DB', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{comments.length.toLocaleString()}</p>
            </button>
            {isCoin && (
              <div style={{ flex: 1, background: '#000', padding: '7px 6px' }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-6_5)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>MARKET CAP</p>
                <p style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#E5E1DB', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{market ? usd(market.mcUsd) : '…'}</p>
              </div>
            )}
            {isCoin && (
              <div style={{ flex: 1, background: '#000', padding: '7px 6px' }}>
                <p style={{ ...SKB, fontSize: 'var(--fs-6_5)', color: 'rgba(229,225,219,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>PRICE / FRAGMENT</p>
                <p style={{ ...SKB, fontSize: 'var(--fs-13)', color: '#E5E1DB', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{market ? (market.priceUsd != null ? usd(market.priceUsd) : '—') : '…'}</p>
              </div>
            )}
          </div>

          {/* First Cut — the tappable ripple-down ledger + whip target (coin posts) */}
          {isCoin && coinAddr && (
            <div style={{ marginTop: 9 }}>
              <FirstCutLedger coinAddress={coinAddr} postId={f(post, 'id')} />
            </div>
          )}

          {/* Comments — ripple up when COMMENTS is tapped */}
          {showComments && (
            <div className="fc-slot" style={{ marginTop: 9, animation: reduceMotion.current ? 'none' : `fcSlotRipple 0.32s ${EASE} both` }}>
              <div style={{ maxHeight: 96, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {comments.length === 0 ? (
                  <span style={{ ...SKR, fontSize: 'var(--fs-10)', color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>No comments yet</span>
                ) : comments.map((c, i) => (
                  <div key={c.id ?? i} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                    <span style={{ ...SKB, fontSize: 'var(--fs-10)', color: '#E5E1DB', textTransform: 'uppercase', flexShrink: 0 }}>@{c.username ?? '—'}</span>
                    <span style={{ ...SKR, fontSize: 'var(--fs-11)', color: 'rgba(229,225,219,0.7)', lineHeight: 1.35 }}>{c.content}</span>
                  </div>
                ))}
              </div>
              {user && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(); }}
                    placeholder="Add a comment…"
                    style={{ ...SKR, flex: 1, fontSize: 'max(16px, var(--fs-11))', color: '#E5E1DB', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(229,225,219,0.18)', outline: 'none', padding: '6px 0' }}
                  />
                  <button onClick={(e) => { stop(e); handleAddComment(); }} disabled={!newComment.trim()} style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: '0.1em', color: newComment.trim() ? '#E5E1DB' : 'rgba(229,225,219,0.3)', textTransform: 'uppercase', background: 'transparent', border: 'none', cursor: newComment.trim() ? 'pointer' : 'default', flexShrink: 0 }}>Post</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Position counter — PROFILE only (finite posts). The feed is effectively
            infinite (removed there); the Screening Room shows a rank instead (below). */}
        {source === 'profile' && (
          <div style={{ position: 'absolute', right: 16, bottom: 14, ...SKB, fontSize: 'var(--fs-9)', color: 'rgba(229,225,219,0.45)', letterSpacing: '0.08em', pointerEvents: 'none' }}>
            {index + 1} / {posts.length}
          </div>
        )}
      </div>
    </div>

    {/* Collect flow — rendered OUTSIDE the rotated stage so its fixed positioning
        is viewport-true (not trapped by the rotate). Its own sheet (z 500/501),
        the First Cut celebration (600) and the whip (650) all layer above the
        theatre; the whip lands on the First Cut ledger in the panel. */}
    {isCoin && (
      <CollectSheetGate
        post={post as unknown as React.ComponentProps<typeof CollectSheetGate>['post']}
        visible={showCollect}
        onClose={() => setShowCollect(false)}
      />
    )}
    </>
  );
}
