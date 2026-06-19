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
// Design system: pure black, #FF0000, SK-Modernist, sharp corners, no shadow/blur,
// signature easing cubic-bezier(0.16,0.84,0.3,1). No IBM Plex Mono.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEconomy, isCoinPost } from '@/components/EconomyProvider';
import { useFirstCutLedger, FIRST_CUT_SLOTS } from '@/lib/firstCutLedger';
import { getPostLikes, getPostComments } from '@/lib/postsService';
import { getAspectRatio } from '@/lib/aspectRatio';
import type { PostMarket } from '@/lib/economy/types';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const SKL: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 300 };
const EASE = 'cubic-bezier(0.16,0.84,0.3,1)';
const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

type AnyPost = Record<string, unknown>;
const f = (p: AnyPost, k: string) => p[k] as string | undefined;

export default function TheatreMode({
  posts,
  startIndex = 0,
  onClose,
}: {
  posts: AnyPost[];
  startIndex?: number;
  onClose: () => void;
}) {
  const economy = useEconomy();
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, posts.length - 1)));
  const [showData, setShowData] = useState(false);
  const [shown, setShown] = useState(false); // enter/exit transition flag
  const reduceMotion = useRef(false);

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

  // ── Enter / exit animation (signature easing; reduced-motion = plain fade) ──
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  const handleClose = useCallback(() => {
    setShown(false);
    const t = setTimeout(onClose, reduceMotion.current ? 120 : 360);
    return () => clearTimeout(t);
  }, [onClose]);

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

  // Swipe. In forced-landscape (rotated 90°) the visual-horizontal axis is the
  // device's VERTICAL axis, so we read dy there; otherwise dx. (Flip the sign in
  // one place if it ever feels inverted on device.)
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    const TH = 44;
    if (portrait) { if (dy > TH) go(1); else if (dy < -TH) go(-1); }   // rotated: down = next
    else { if (dx < -TH) go(1); else if (dx > TH) go(-1); }            // normal: left = next
  };

  // ── Current-post data (real / hardened sources) for the "+" panel ──
  const holders = useFirstCutLedger(coinAddr);
  const [market, setMarket] = useState<PostMarket | null>(null);
  const [counts, setCounts] = useState<{ likes: number; comments: number }>({ likes: 0, comments: 0 });
  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    const id = f(post, 'id') as string;
    setMarket(null);
    setCounts({ likes: 0, comments: 0 });
    if (coinAddr) economy.getPostMarket(id).then((m) => { if (!cancelled) setMarket(m); }).catch(() => {});
    Promise.all([getPostLikes(id), getPostComments(id)])
      .then(([l, c]) => { if (!cancelled) setCounts({ likes: (l ?? []).length, comments: (c ?? []).length }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [post, coinAddr, economy]);

  if (!post || posts.length === 0) {
    // Nothing to show — exit straight back to the profile.
    return (
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>No posts</span>
      </div>
    );
  }

  // True AR of the current post (its immutable layout) → fitted media box.
  const arStr = getAspectRatio(f(post, 'layout_id') ?? '');
  const [aw, ah] = String(arStr).split('/').map((s) => parseFloat(s));
  const arNum = isFinite(aw) && isFinite(ah) && ah > 0 ? aw / ah : 2.39;
  const availW = stageW * 0.9;
  const availH = stageH * (showData ? 0.56 : 0.84);
  let boxW = availW, boxH = availW / arNum;
  if (boxH > availH) { boxH = availH; boxW = availH * arNum; }

  const isVideo = f(post, 'media_type') === 'video';
  const mediaUrl = (post['media_urls'] as string[] | undefined)?.[0];
  const poster = f(post, 'poster_url') || f(post, 'thumbnail_url') || undefined;

  // Stage transform: rotate to landscape on a portrait phone; direct otherwise.
  const stageStyle: React.CSSProperties = portrait
    ? { position: 'fixed', top: 0, left: '100%', width: '100vh', height: '100vw', transform: 'rotate(90deg)', transformOrigin: 'top left' }
    : { position: 'fixed', inset: 0, width: '100vw', height: '100vh' };

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const fcCount = holders?.length ?? 0;

  return (
    <div style={{ ...stageStyle, zIndex: 900 }}>
      {/* Black field — tapping the empty space (not the image / panel) exits. On
          desktop a near-opaque dim lets the profile bleed ~8% (matches the ref);
          on a rotated phone the field is solid so the portrait profile behind
          never shows through the rotation. */}
      <div
        onClick={handleClose}
        onTouchStart={onTouchStart}
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
          {/* Hero media — true AR box, objectFit cover (same crop as the feed). */}
          <div
            onClick={stop}
            style={{ width: boxW, height: boxH, background: '#000', overflow: 'hidden', flexShrink: 0, transition: `height 300ms ${EASE}, width 300ms ${EASE}` }}
          >
            {isVideo ? (
              <video
                key={f(post, 'id')}
                src={mediaUrl}
                poster={poster}
                muted
                loop
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              mediaUrl && <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
          </div>
        </div>

        {/* ── Prev / Next arrows (theatre-mode-arrow-01.png) — mid-height sides ── */}
        {index > 0 && (
          <button
            onClick={(e) => { stop(e); go(-1); }}
            aria-label="Previous"
            style={{ position: 'absolute', left: '2.5%', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, opacity: 0.85 }}
          >
            <img src="/theatre-mode-arrow-01.png" alt="" style={{ height: Math.min(110, stageH * 0.3), width: 'auto', display: 'block' }} />
          </button>
        )}
        {index < posts.length - 1 && (
          <button
            onClick={(e) => { stop(e); go(1); }}
            aria-label="Next"
            style={{ position: 'absolute', right: '2.5%', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, opacity: 0.85 }}
          >
            <img src="/theatre-mode-arrow-01.png" alt="" style={{ height: Math.min(110, stageH * 0.3), width: 'auto', display: 'block', transform: 'scaleX(-1)' }} />
          </button>
        )}

        {/* ── BACK (top-left) — mobile out (per the mobile node) ── */}
        {portrait && (
          <button
            onClick={(e) => { stop(e); handleClose(); }}
            style={{ position: 'absolute', left: 16, top: 14, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <span style={{ ...SKB, fontSize: 11, color: '#FFF', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Back</span>
          </button>
        )}

        {/* ── Framed-eye close (top-right) ── */}
        <button
          onClick={(e) => { stop(e); handleClose(); }}
          aria-label="Close theatre"
          style={{ position: 'absolute', right: 14, top: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}
        >
          <img src="/theatre-mode-eye-framed.png" alt="" style={{ height: 22, width: 'auto', display: 'block', opacity: 0.92 }} />
        </button>

        {/* ── "+" data toggle (lower area) — hidden-by-default reveal ── */}
        <button
          onClick={(e) => { stop(e); setShowData((v) => !v); }}
          aria-label={showData ? 'Hide data' : 'Show data'}
          style={{ position: 'absolute', bottom: showData ? 'auto' : 14, top: showData ? 12 : 'auto', left: '50%', transform: 'translateX(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, zIndex: 3 }}
        >
          <span style={{ ...SKL, fontSize: 34, lineHeight: 1, color: '#FFF', display: 'block', transform: showData ? 'rotate(45deg)' : 'none', transition: `transform 280ms ${EASE}` }}>+</span>
        </button>

        {/* ── DATA PANEL — slides up over the black field when "+" is tapped ── */}
        <div
          onClick={stop}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            background: '#000', borderTop: '1px solid #FF0000',
            padding: '16px 22px 18px',
            transform: showData ? 'translateY(0)' : 'translateY(101%)',
            transition: `transform ${reduceMotion.current ? 0 : 360}ms ${EASE}`,
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.02em' }}>@{f(post, 'username') ?? '—'}</span>
            {f(post, 'caption') && (
              <span style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{f(post, 'caption')}</span>
            )}
          </div>
          {/* Stat row — likes · comments · First Cut · MC · price (real sources) */}
          <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,0.08)' }}>
            {[
              { k: 'LIKES', v: counts.likes.toLocaleString() },
              { k: 'COMMENTS', v: counts.comments.toLocaleString() },
              ...(coinAddr ? [
                { k: 'FIRST CUT', v: `${fcCount} / ${FIRST_CUT_SLOTS}` },
                { k: 'MARKET CAP', v: market ? usd(market.mcUsd) : '…' },
                { k: 'PRICE / PIECE', v: market ? (market.priceUsd != null ? usd(market.priceUsd) : '—') : '…' },
              ] : []),
            ].map((c) => (
              <div key={c.k} style={{ flex: 1, background: '#000', padding: '10px 8px' }}>
                <p style={{ ...SKB, fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>{c.k}</p>
                <p style={{ ...SKB, fontSize: 13, color: c.k === 'FIRST CUT' && fcCount > 0 ? '#FF0000' : '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{c.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Position counter — subtle, lower-right (which post you're on) */}
        <div style={{ position: 'absolute', right: 16, bottom: 14, ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', pointerEvents: 'none' }}>
          {index + 1} / {posts.length}
        </div>
      </div>
    </div>
  );
}
