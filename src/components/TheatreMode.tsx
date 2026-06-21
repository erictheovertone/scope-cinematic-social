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
import { usePrivy } from '@privy-io/react-auth';
import { useEconomy, isCoinPost } from '@/components/EconomyProvider';
import { getPostLikes, getPostComments, addComment, likePost, unlikePost, isPostLikedByUser } from '@/lib/postsService';
import { getUserByPrivyId, getProfile } from '@/lib/userService';
import { getAspectRatio } from '@/lib/aspectRatio';
import CollectSheetGate from '@/components/economy/CollectSheetGate';
import FirstCutLedger from '@/components/economy/FirstCutLedger';
import GradedVideo from '@/components/finishing/GradedVideo';
import MediaRenderer from '@/components/MediaRenderer';
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
    try {
      if (isLiked) { await unlikePost(id, user.id); setLikes((p) => p.filter((l) => l.user_id !== user.id)); setIsLiked(false); }
      else { const l = await likePost(id, user.id, viewerName); setLikes((p) => [...p, l as { user_id?: string }]); setIsLiked(true); }
    } catch (e) { console.error('[theatre] like failed', e); }
  };
  const handleAddComment = async () => {
    if (!post || !user || !newComment.trim()) return;
    const id = f(post, 'id') as string;
    try {
      const c = await addComment(id, user.id, viewerName, newComment.trim());
      setComments((p) => [...p, c as { id?: string; username?: string; content?: string }]);
      setNewComment('');
    } catch (e) { console.error('[theatre] comment failed', e); }
  };

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
  // ── Arrows: ALWAYS in the side margins, vertically centered, moderate size ──
  // (authoritative spec). The media width is capped so a guaranteed side margin
  // remains for the arrows — they never overlap the media, for any AR.
  const ARROW_AR = 72 / 140;                       // asset w/h (a tall chevron)
  const ARROW_PAD = 6;                             // tap padding around the glyph
  const arrowH = Math.min(46, stageH * 0.13);      // moderate, restrained
  const arrowW = arrowH * ARROW_AR;
  const MIN_SIDE = arrowW + ARROW_PAD * 2 + 12;    // margin reserved each side

  const availW = Math.min(stageW * 0.92, stageW - MIN_SIDE * 2);
  const availH = stageH * (showData ? 0.5 : 0.86);
  let boxW = availW, boxH = availW / arNum;
  if (boxH > availH) { boxH = availH; boxW = availH * arNum; }
  const sideMargin = (stageW - boxW) / 2;          // ≥ MIN_SIDE, so arrows clear the media

  const isVideo = f(post, 'media_type') === 'video';
  const mediaUrl = (post['media_urls'] as string[] | undefined)?.[0];
  const poster = f(post, 'poster_url') || f(post, 'thumbnail_url') || undefined;

  // Stage transform: rotate to landscape on a portrait phone; direct otherwise.
  const stageStyle: React.CSSProperties = portrait
    ? { position: 'fixed', top: 0, left: '100%', width: '100vh', height: '100vw', transform: 'rotate(90deg)', transformOrigin: 'top left' }
    : { position: 'fixed', inset: 0, width: '100vw', height: '100vh' };

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const isCoin = !!coinAddr;

  return (
    <>
    {/* Stage z=490: BELOW the collect sheet (500/501), First Cut celebration (600)
        and whip (650), so a collect from theatre layers those above it. */}
    <div style={{ ...stageStyle, zIndex: 490 }}>
      {/* Black field — tapping the empty space (not the image / panel) exits. On
          desktop a near-opaque dim lets the profile bleed ~8% (matches the ref);
          on a rotated phone the field is solid so the portrait profile behind
          never shows through the rotation. */}
      <div
        onClick={() => { if (showData) setShowData(false); else handleClose(); }}
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
          {/* Hero media — true AR box, objectFit cover (same crop as the feed).
              Tapping the media: closes the data panel if open; otherwise does
              nothing (the empty black field is what exits). */}
          <div
            onClick={(e) => { stop(e); if (showData) setShowData(false); }}
            style={{ width: boxW, height: boxH, background: '#000', overflow: 'hidden', flexShrink: 0, transition: `height 300ms ${EASE}, width 300ms ${EASE}` }}
          >
            {/* Reuse the feed's SHARED graded-media components so the grade is
                inherited automatically — never a forked raw element. Video grade is
                render-time (GradedVideo applies edit_params via the gl-react
                pipeline + the baked graded poster/clip); image grade is baked into
                media_urls[0] (MediaRenderer just loads it, no runtime crop — matches
                the feed image path exactly). forcePlay = always-graded playback. */}
            {isVideo ? (
              <GradedVideo
                key={f(post, 'id')}
                url={mediaUrl ?? ''}
                posterUrl={poster ?? null}
                clipUrl={f(post, 'autoplay_clip_url') ?? null}
                editParams={post['edit_params']}
                cropX={(post['crop_x'] as number | undefined) ?? 0}
                cropY={(post['crop_y'] as number | undefined) ?? 0}
                cropWidth={(post['crop_width'] as number | undefined) ?? 1}
                cropHeight={(post['crop_height'] as number | undefined) ?? 1}
                forcePlay
                showSoundToggle
                style={{ width: '100%', height: '100%' }}
                onClick={() => { if (showData) setShowData(false); }}
              />
            ) : (
              <MediaRenderer
                url={mediaUrl ?? ''}
                mediaType={f(post, 'media_type')}
                thumbnailUrl={poster ?? null}
                autoplay
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onClick={() => { if (showData) setShowData(false); }}
              />
            )}
          </div>
        </div>

        {/* ── Prev (<) / Next (>) arrows — ALWAYS in the side black margins,
            vertically centered, clear of the media. The asset points RIGHT, so the
            LEFT arrow is mirrored (points left → prev) and the RIGHT arrow is as-is
            (points right → next). Hidden while the data panel is up. ── */}
        {!showData && index > 0 && (
          <button
            onClick={(e) => { stop(e); go(-1); }}
            aria-label="Previous"
            style={{ position: 'absolute', left: sideMargin / 2, top: '50%', transform: 'translate(-50%, -50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: ARROW_PAD, opacity: 0.85 }}
          >
            <img src="/theatre-mode-arrow-01.png" alt="Previous" style={{ height: arrowH, width: 'auto', display: 'block', transform: 'scaleX(-1)' }} />
          </button>
        )}
        {!showData && index < posts.length - 1 && (
          <button
            onClick={(e) => { stop(e); go(1); }}
            aria-label="Next"
            style={{ position: 'absolute', left: stageW - sideMargin / 2, top: '50%', transform: 'translate(-50%, -50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: ARROW_PAD, opacity: 0.85 }}
          >
            <img src="/theatre-mode-arrow-01.png" alt="Next" style={{ height: arrowH, width: 'auto', display: 'block' }} />
          </button>
        )}

        {/* ── BACK — top-LEFT, all surfaces (exits Theatre View) ── */}
        <button
          onClick={(e) => { stop(e); handleClose(); }}
          style={{ position: 'absolute', left: 16, top: 14, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <span style={{ ...SKB, fontSize: 11, color: '#FFF', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Back</span>
        </button>

        {/* ── Framed-eye close (top-right) ── */}
        <button
          onClick={(e) => { stop(e); handleClose(); }}
          aria-label="Close theatre"
          style={{ position: 'absolute', right: 14, top: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}
        >
          <img src="/theatre-mode-eye-framed.png" alt="" style={{ height: 22, width: 'auto', display: 'block', opacity: 0.92 }} />
        </button>

        {/* ── "+" data toggle — bottom-LEFT, beneath the media (reveals the panel).
            Hidden while the panel is up; the panel closes by tapping the image/away. ── */}
        {!showData && (
          <button
            onClick={(e) => { stop(e); setShowData(true); }}
            aria-label="Show data"
            style={{ position: 'absolute', bottom: 8, left: 16, background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, zIndex: 3 }}
          >
            <span style={{ ...SKL, fontSize: 34, lineHeight: 1, color: '#FFF', display: 'block' }}>+</span>
          </button>
        )}

        {/* ── DATA PANEL — slides up when "+" is tapped. Mirrors the home-feed
            shelf: COLLECT, First Cut ledger (tappable ripple), likes, comments
            (ripple up), MC, price — all from real/hardened sources. ── */}
        <div
          onClick={stop}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            background: '#000', borderTop: '1px solid #FF0000',
            padding: '14px 22px 16px', maxHeight: '72%', overflowY: 'auto',
            transform: showData ? 'translateY(0)' : 'translateY(101%)',
            transition: `transform ${reduceMotion.current ? 0 : 360}ms ${EASE}`,
            zIndex: 2,
          }}
        >
          {/* @handle + caption + COLLECT */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span style={{ ...SKB, fontSize: 13, color: '#FFF', textTransform: 'uppercase', letterSpacing: '0.02em' }}>@{f(post, 'username') ?? '—'}</span>
            {f(post, 'caption') && (
              <span style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{f(post, 'caption')}</span>
            )}
            {isCoin && (
              <button
                onClick={(e) => { stop(e); setShowCollect(true); }}
                style={{ ...SKB, fontSize: 10, letterSpacing: '0.08em', color: '#FF0000', textTransform: 'uppercase', background: 'transparent', border: '1px solid #FF0000', cursor: 'pointer', padding: '6px 14px', flexShrink: 0 }}
              >
                Collect
              </button>
            )}
          </div>

          {/* Stat shelf — LIKES (tap to like) · COMMENTS (tap → ripple up) · MC · price */}
          <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,0.08)' }}>
            <button onClick={(e) => { stop(e); handleLike(); }} style={{ flex: 1, background: '#000', padding: '10px 8px', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <p style={{ ...SKB, fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>LIKES</p>
              <p style={{ ...SKB, fontSize: 13, color: isLiked ? '#FF0000' : '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{likes.length.toLocaleString()}</p>
            </button>
            <button onClick={(e) => { stop(e); setShowComments((v) => !v); }} style={{ flex: 1, background: '#000', padding: '10px 8px', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <p style={{ ...SKB, fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>COMMENTS</p>
              <p style={{ ...SKB, fontSize: 13, color: showComments ? '#FF0000' : '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{comments.length.toLocaleString()}</p>
            </button>
            {isCoin && (
              <div style={{ flex: 1, background: '#000', padding: '10px 8px' }}>
                <p style={{ ...SKB, fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>MARKET CAP</p>
                <p style={{ ...SKB, fontSize: 13, color: '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{market ? usd(market.mcUsd) : '…'}</p>
              </div>
            )}
            {isCoin && (
              <div style={{ flex: 1, background: '#000', padding: '10px 8px' }}>
                <p style={{ ...SKB, fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 5px' }}>PRICE / PIECE</p>
                <p style={{ ...SKB, fontSize: 13, color: '#FFF', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{market ? (market.priceUsd != null ? usd(market.priceUsd) : '—') : '…'}</p>
              </div>
            )}
          </div>

          {/* First Cut — the tappable ripple-down ledger + whip target (coin posts) */}
          {isCoin && coinAddr && (
            <div style={{ marginTop: 14 }}>
              <FirstCutLedger coinAddress={coinAddr} postId={f(post, 'id')} />
            </div>
          )}

          {/* Comments — ripple up when COMMENTS is tapped */}
          {showComments && (
            <div className="fc-slot" style={{ marginTop: 14, animation: reduceMotion.current ? 'none' : `fcSlotRipple 0.32s ${EASE} both` }}>
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {comments.length === 0 ? (
                  <span style={{ ...SKR, fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>No comments yet</span>
                ) : comments.map((c, i) => (
                  <div key={c.id ?? i} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                    <span style={{ ...SKB, fontSize: 10, color: '#FFF', textTransform: 'uppercase', flexShrink: 0 }}>@{c.username ?? '—'}</span>
                    <span style={{ ...SKR, fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.35 }}>{c.content}</span>
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
                    style={{ ...SKR, flex: 1, fontSize: 11, color: '#FFF', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.18)', outline: 'none', padding: '6px 0' }}
                  />
                  <button onClick={(e) => { stop(e); handleAddComment(); }} disabled={!newComment.trim()} style={{ ...SKB, fontSize: 9, letterSpacing: '0.1em', color: newComment.trim() ? '#FF0000' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase', background: 'transparent', border: 'none', cursor: newComment.trim() ? 'pointer' : 'default', flexShrink: 0 }}>Post</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Position counter — subtle, lower-right (which post you're on) */}
        <div style={{ position: 'absolute', right: 16, bottom: 14, ...SKB, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', pointerEvents: 'none' }}>
          {index + 1} / {posts.length}
        </div>
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
