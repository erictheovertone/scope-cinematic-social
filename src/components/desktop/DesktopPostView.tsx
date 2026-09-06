'use client';
// ── DESKTOP POST SCROLL — the 1-up post view (Figma 229:892) ──────────────────
// Mounted by DesktopProfile's morph (Brief 2). Fixed letterboxed stage (the
// theatre discipline — never resizes between posts), actions + caption below,
// the right panel (ticker/MC/collectors · First Cut leaderboard · comments).
// Self-fetches per post; stepping re-keys the fetches.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';
import { useEconomy, isCoinPost } from '@/components/EconomyProvider';
import { getPostLikes, getPostComments, addComment, likePost, unlikePost } from '@/lib/postsService';
import { getUserByPrivyId, getProfile, isProMember } from '@/lib/userService';
import { useFirstCutLedger } from '@/lib/firstCutLedger';
import { getAspectRatio } from '@/lib/aspectRatio';
import { feedImage } from '@/lib/mediaUrl';
import GradedVideo from '@/components/finishing/GradedVideo';
import VideoTransport from '@/components/finishing/VideoTransport';
import { useUpsell } from '@/components/UpsellProvider';
import { streamGradedProps } from "@/lib/editor/videoGrade";
import CollectSheetGate from '@/components/economy/CollectSheetGate';
import CommentList, { useCommentLikes, ReplyComposer, type UIComment } from '@/components/CommentList';
import { replyToComment } from '@/lib/commentInteractions';
// Brief D6 — the owner affordance reuses mobile's exact action sheets (no new
// edit/delete logic; ProfilePostViewer is the reference). DeckPicker gates on an
// authed Privy user internally, mirroring mobile.
import DeckPickerSheet from '@/components/DeckPickerSheet';
import CreateCoinSheet from '@/components/economy/CreateCoinSheet';
import DeletePostSheet from '@/components/DeletePostSheet';

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(229,225,219,0.14)';

const usd = (n: number) => (n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`);

// Thin OPEN chevron (the nit): ~105° between the legs (a wide V rotated —
// wider than a text '>'), 1.5px stroke, hairline-adjacent. One component,
// mirrored for prev. Hover 0.75 → 1.
function Chevron({ dir }: { dir: 1 | -1 }) {
  return (
    <svg
      width="11" height="24" viewBox="0 0 11 24" fill="none"
      style={{ display: 'block', transform: dir === -1 ? 'scaleX(-1)' : undefined, filter: 'blur(0.3px)' }}
    >
      <path d="M1 1L9.4 12L1 23" stroke="#E5E1DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DesktopPostView({
  posts, index, onStep, location, framing = 'profile', belowLeft, onPostDeleted,
}: {
  posts: Record<string, unknown>[];
  index: number;
  onStep: (dir: 1 | -1) => void;
  /** The profile owner's location (the frame's location row under the caption). */
  location: string | null;
  /** 'lightbox' (home feed) raises the stage so its TOP aligns with the panel top
   *  (frame 775:4), tightens the bottom, and widens the letterbox; 'profile'
   *  (default) keeps the centered post-scroll seat — unchanged. */
  framing?: 'profile' | 'lightbox';
  /** Extra content in the LEFT column below the caption (the MORE FROM row). */
  belowLeft?: React.ReactNode;
  /** Brief D6 — called after the owner soft-deletes a post, so the parent (lightbox
   *  nav / profile grid) can drop it from its list. Optional; the soft-delete itself
   *  is done by DeletePostSheet regardless. */
  onPostDeleted?: (postId: string) => void;
}) {
  const lightbox = framing === 'lightbox';
  const { user } = usePrivy();
  const router = useRouter();
  const economy = useEconomy();
  const post = posts[index];
  const postId = String(post?.id ?? '');
  const coinAddr = (post?.coin_address as string | null) ?? null;

  const [likes, setLikes] = useState<{ user_id?: string }[]>([]);
  const [comments, setComments] = useState<{ id?: string; username?: string; content?: string; created_at?: string }[]>([]);
  const [market, setMarket] = useState<{ mcUsd: number; holders: number | null; live: boolean } | null>(null);
  const [viewer, setViewer] = useState<{ uuid: string; name: string; avatar: string | null; isPro: boolean } | null>(null);
  // Brief P3 — viewer-controls state (lightbox = FULL context). userPaused resets per post.
  const [userPaused, setUserPaused] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const { goPro } = useUpsell();
  useEffect(() => { setUserPaused(false); }, [postId]);
  // Brief Q1 — measure the stage box so the IMAGE requests a display-sized rendition (the
  // 2560 tier once the stage exceeds ~1600px; ≤ that stays 1600). Lightbox stage ≈ 1452 @1920
  // → 1600, ≈ 2092 @2560 → 2560; the profile framing's capped stage stays 1600. Poster path
  // (posterWidth 1600) untouched.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(1600);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => { const w = el.clientWidth; if (w > 0) setStageW(w); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<UIComment | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  // Brief D6 — owner affordance (own posts only). Menu + the three reused sheets.
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [showCreateCoin, setShowCreateCoin] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deckToast, setDeckToast] = useState('');
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { likeStates, toggleLike: toggleCommentLike } = useCommentLikes(comments as UIComment[], user?.id ?? null, viewer?.name ?? null);
  const fcHolders = useFirstCutLedger(coinAddr);

  useEffect(() => {
    if (!user) return;
    let dead = false;
    getUserByPrivyId(user.id)
      .then((su) => (su ? getProfile(su.id).then((p) => ({ su, p })) : null))
      .then((r) => { if (!dead && r) setViewer({ uuid: r.su.id, name: (r.p as { username?: string })?.username ?? 'user', avatar: (r.p as { profile_image_url?: string })?.profile_image_url ?? null, isPro: isProMember(r.p as { is_paid_member?: boolean; paid_member_until?: string | null }) }); })
      .catch(() => {});
    return () => { dead = true; };
  }, [user?.id]);

  useEffect(() => {
    let dead = false;
    setLikes([]); setComments([]); setMarket(null);
    if (!postId) return;
    getPostLikes(postId).then((l) => { if (!dead) setLikes(l as { user_id?: string }[]); }).catch(() => {});
    getPostComments(postId).then(async (c) => {
      if (dead) return;
      setComments(c as typeof comments);
      // real commenter avatars — ONE batched profiles read by username
      const names = [...new Set((c as { username?: string }[]).map((x) => x.username).filter(Boolean))] as string[];
      if (names.length) {
        const { supabase } = await import('@/lib/supabase/client');
        const { data } = await supabase.from('profiles').select('username, profile_image_url').in('username', names);
        if (!dead) setAvatars(new Map((data ?? []).filter((p) => p.profile_image_url).map((p) => [p.username as string, p.profile_image_url as string])));
      }
    }).catch(() => {});
    economy.getPostMarket(postId).then((m) => { if (!dead) setMarket({ mcUsd: m.mcUsd, holders: m.holders, live: m.live }); }).catch(() => {});
    return () => { dead = true; };
  }, [postId, economy]);

  // likes.user_id holds the PRIVY DID (the mobile comparison) — NOT the uuid.
  const isLiked = useMemo(() => !!user && likes.some((l) => l.user_id === user.id), [likes, user]);
  const toggleLike = async () => {
    if (!user || !viewer) return;
    // optimistic — the PostModal pattern
    setLikes((prev) => isLiked ? prev.filter((l) => l.user_id !== user.id) : [...prev, { user_id: user.id }]);
    try { isLiked ? await unlikePost(postId, user.id) : await likePost(postId, user.id, viewer.name); } catch { /* refetch below */ }
    getPostLikes(postId).then((l) => setLikes(l as { user_id?: string }[])).catch(() => {});
  };

  const submitComment = async () => {
    const text = newComment.trim();
    if (!text || !user || !viewer) return;
    setNewComment('');
    setComments((prev) => [...prev, { id: `tmp-${prev.length}`, username: viewer.name, content: text, created_at: new Date().toISOString() }]);
    try { await addComment(postId, user.id, viewer.name, text); } catch { /* keep optimistic */ }
  };

  // REPLIES → centered composer; optimistic nested insert.
  const submitReply = async (text: string) => {
    if (!user || !viewer || !replyingTo) return;
    const parentId = replyingTo.parent_comment_id ? replyingTo.parent_comment_id : replyingTo.id;
    const av = viewer.avatar ?? undefined;
    setComments((prev) => [...prev, { id: `tmp-${prev.length}`, username: viewer.name, content: text, created_at: new Date().toISOString(), parent_comment_id: parentId, profile_image_url: av } as typeof prev[number]]);
    try { await replyToComment(postId, parentId, user.id, viewer.name, text); }
    catch (e) { throw e; }
  };

  // Stage geometry — MEASURED binder (3C): media is HEIGHT-constrained (a
  // 1.85 post rendered 645w inside the 960w container; the arrows hugged the
  // CONTAINER, 159px off the media). Stage aspect 2.75 → 2.39 grows the
  // binding height (402 at 960w); arrows anchor to the MEDIA's edges via the
  // per-post width fraction. Ratios ≥2.39 fill the width (vertical bands);
  // narrower ratios pillar inside — with the arrows hugging THEIR edges.
  const arStr = String(getAspectRatio((post?.layout_id as string) ?? ''));
  const [aw, ah] = arStr.split('/').map((x) => parseFloat(x));
  const ar = isFinite(aw) && isFinite(ah) && ah > 0 ? aw / ah : 2.39;
  const mediaUrl = (post?.media_urls as string[] | undefined)?.[0] ?? '';
  const poster = (post?.poster_url as string) || (post?.thumbnail_url as string) || null;
  const isVideo = post?.media_type === 'video';
  const fcCount = fcHolders?.length ?? 0;
  const STAGE_AR = 2.39;

  // Brief D6 — OWNERSHIP (the identity landmine): posts.user_id is the SUPABASE UUID,
  // and viewer.uuid is that same users.id (getUserByPrivyId → getProfile). Compare
  // those two — NOT user.id (the Privy DID, which likes/comments use and which would
  // never equal post.user_id). Works in both framings: own-profile → all true, other
  // profile → all false, lightbox → per-post.
  const isOwner = !!viewer && String(post?.user_id ?? '') === viewer.uuid;
  // Coin-pending retry mirrors mobile: offered only when the post has no coin AND is
  // not a legacy 1155 mint.
  const coinPending = !isCoinPost(post as { coin_address?: string | null; token_standard?: string | null }) && !(post as { is_minted?: boolean }).is_minted;
  // Close the menu when the post changes under it (arrows / strip tap).
  useEffect(() => { setMenuOpen(false); }, [postId]);
  // ROUND-2 REVERSAL (hit-target stability): the arrows' seats derive from the
  // STAGE frame — constant pockets at its edges — NOT the media's rendered
  // width (3C's media-anchoring moved them between ratios, under the cursor).

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: lightbox ? 0 : 80, marginTop: 0 }}> {/* frame seat ~y299 (measured 319 at mt12 — the last 20 trimmed here + the 3-box row) */}
      {/* ═══ LEFT: the stage + below-media rows ═══ */}
      {/* FRAME GEOMETRY (round 3): narrow ~20px ARROW POCKETS hugging the media
          (frame x86/x1083 vs stage x103/1077); stage right edge ~30px from the
          panel (20px pocket + 12px gap). The media is the star. */}
      <div style={{ flex: 1, minWidth: 0, padding: lightbox ? '0 14px' : '0 20px', marginTop: lightbox ? 0 : 60, ...(lightbox ? { display: 'flex', flexDirection: 'column', minHeight: 600 } : {}) }}> {/* profile: media midline = panel midline (+60). lightbox: tighter pockets (wider stage), stage TOP = panel top, column runs the full panel height (600) so MORE FROM bottom-aligns lower. */}
        <div style={{ position: 'relative' }}>
          {/* prev / next — Batang > glyphs, mid-media */}
          {/* HIT TARGET NEVER MOVES: 44px outer buttons, stage-anchored seats,
              data-no-pop (no press scale); feedback = brightness on the inner
              glyph only (filters don't move geometry). */}
          {index > 0 && (
            <button onClick={() => onStep(-1)} aria-label="Previous" data-no-pop
              style={{ position: 'absolute', left: lightbox ? -30 : -46, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="dk-arrow-glyph" style={{ display: 'block', opacity: 0.75, transition: 'opacity 120ms ease, filter 120ms ease' }}><Chevron dir={-1} /></span>
            </button>
          )}
          {index < posts.length - 1 && (
            <button onClick={() => onStep(1)} aria-label="Next" data-no-pop
              style={{ position: 'absolute', right: lightbox ? -30 : -46, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="dk-arrow-glyph" style={{ display: 'block', opacity: 0.75, transition: 'opacity 120ms ease, filter 120ms ease' }}><Chevron dir={1} /></span>
            </button>
          )}

          {/* THE STAGE — fixed 2.39 letterbox (both surfaces); the shared-element
              morph target. Each post sits at its own ratio within. 2.39 lets the
              common scope/pana posts FILL the width so the media hugs the arrows
              (the #8 binding-dimension fix — a 2.75 box pillarboxed them small). */}
          {/* Brief P3 §1 — click the stage toggles pause (desktop). No backdrop-close here, so
              no collision; prev/next are separate absolute buttons. */}
          <motion.div ref={stageRef} layoutId={`dpost-${postId}`} transition={{ layout: { duration: 0.18, ease: 'easeOut' } }} onClick={isVideo ? () => setUserPaused((p) => !p) : undefined} style={{ width: '100%', aspectRatio: '2.39 / 1', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: isVideo ? 'pointer' : 'default' }}>
            <div style={{ position: 'relative', ...(ar >= 2.39 ? { width: '100%' } : { height: '100%' }), aspectRatio: `${ar}`, overflow: 'hidden', background: '#0a0a0a' }}>
              {isVideo ? (
                <>
                <GradedVideo
                  key={postId}
                  url={mediaUrl}
                  posterUrl={((post?.stream_poster_url as string) ?? poster)}
                  posterWidth={1600}
                  clipUrl={(post?.autoplay_clip_url as string) ?? null}
                  editParams={post?.edit_params}
                  cropX={(post?.crop_x as number) ?? 0}
                  cropY={(post?.crop_y as number) ?? 0}
                  cropWidth={(post?.crop_width as number) ?? 1}
                  cropHeight={(post?.crop_height as number) ?? 1}
                  forcePlay
                  {...streamGradedProps(post as unknown as Record<string, unknown>)}
                  showSoundToggle
                  onVideoEl={setVideoEl}
                  userPaused={userPaused}
                  style={{ width: '100%', height: '100%' }}
                />
                <VideoTransport videoEl={videoEl} platform="desktop" paused={userPaused} onTogglePause={() => setUserPaused((p) => !p)} isPro={viewer?.isPro ?? false} onUpsell={goPro} />
                </>
              ) : (
                mediaUrl && <img src={feedImage(mediaUrl, Math.min(2560, Math.round(stageW)))} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> /* Brief Q1 — stage-sized rendition (2560 above ~1600px) */
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Actions row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, margin: '14px 0 0' }}>
          <button onClick={toggleLike} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? '#E5E1DB' : 'none'} stroke={isLiked ? '#E5E1DB' : 'rgba(229,225,219,0.85)'} strokeWidth="2" strokeLinejoin="round"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z"/></svg>
            <span style={{ ...SKB, fontSize: 12, color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{likes.length}</span>
          </button>
          <button onClick={() => { commentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); commentInputRef.current?.focus(); }} aria-label="Comment" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.85)" strokeWidth="2" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>
            <span style={{ ...SKB, fontSize: 12, color: '#E5E1DB', fontVariantNumeric: 'tabular-nums' }}>{comments.length}</span>
          </button>
          {coinAddr && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ border: `1px solid ${HAIR}`, borderRadius: 3, padding: '2px 5px', display: 'inline-flex' }}>
                <img src="/badges/first-cut-badge-min-design-01.png" alt="" style={{ width: 13, height: 13, objectFit: 'contain', display: 'block' }} />
              </span>
              {/* numerals 95 Black per frame */}
              <span style={{ fontFamily: 'var(--font-black)', fontWeight: 900, fontSize: 11.5, color: fcCount > 0 ? '#E5E1DB' : 'rgba(229,225,219,0.6)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>{fcCount} / 10</span>
            </span>
          )}
          {coinAddr && (
            <button onClick={() => setCollectOpen(true)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, letterSpacing: 'var(--track-display)', color: 'rgba(229,225,219,0.7)', textTransform: 'uppercase' }}>
              COLLECT
            </button>
          )}

          {/* Brief D6 — owner affordance: 3-dot beside COLLECT (or right-aligned when
              there's no COLLECT). Same action set as mobile's post-owner menu, wired to
              the same reused sheets. ≥44px effective target via the −11px hit inset. */}
          {isOwner && (
            <div style={{ position: 'relative', marginLeft: coinAddr ? 14 : 'auto', display: 'inline-flex' }}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Post options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '13px 8px', margin: '-13px -8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden style={{ display: 'block' }}>
                  <circle cx="3" cy="9" r="1.5" fill="#E5E1DB" opacity="0.7" />
                  <circle cx="9" cy="9" r="1.5" fill="#E5E1DB" opacity="0.7" />
                  <circle cx="15" cy="9" r="1.5" fill="#E5E1DB" opacity="0.7" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  {/* click-away */}
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 120 }} />
                  {/* menu — canvas fill + hairline, opens downward-right (below the row,
                      clear of the media). House vocabulary; no new component. */}
                  <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 121, minWidth: 148, background: 'var(--canvas)', border: `1px solid ${HAIR}` }}>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); setShowDeckPicker(true); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, cursor: 'pointer', padding: '11px 14px' }}>
                      <span style={{ ...SKB, fontSize: 11, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ADD TO DECK</span>
                    </button>
                    {coinPending && (
                      <button role="menuitem" onClick={() => { setMenuOpen(false); setShowCreateCoin(true); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid ${HAIR}`, cursor: 'pointer', padding: '11px 14px' }}>
                        <span style={{ ...SKB, fontSize: 11, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CREATE COIN</span>
                      </button>
                    )}
                    <button role="menuitem" onClick={() => { setMenuOpen(false); setShowDelete(true); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '11px 14px' }}>
                      <span style={{ ...SKB, fontSize: 11, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>DELETE</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* CREATOR ROW (lightbox, frame order: actions → pfp+handle → caption →
            location·date): avatar + @handle → the creator's profile. */}
        {lightbox && (post?.username as string) && (
          <button onClick={() => router.push(`/profile/${post.username as string}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, margin: '12px 0 0' }}>
            {(post?.profile_image_url as string) ? (
              <img src={feedImage(post.profile_image_url as string, 96)} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
            ) : <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2a2a2a' }} />}
            <span style={{ ...SKB, fontSize: 12, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>@{post.username as string}</span>
          </button>
        )}

        {/* caption + location·date */}
        {typeof post?.caption === 'string' && post.caption && (
          <p style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.5)', lineHeight: 1.07, letterSpacing: 'var(--track-body)', margin: lightbox ? '10px 0 0' : '12px 0 0', maxWidth: 440 }}>{post.caption}</p>
        )}
        {(location || (lightbox && !!post?.created_at)) && (
          <p style={{ fontFamily: 'var(--font-medium)', fontWeight: 500, fontSize: 8, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
            {location && <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.45)" strokeWidth="1.8"><path d="M12 21s-6.5-5.4-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></svg>{location}</>}
            {!!location && lightbox && !!post?.created_at && <span style={{ opacity: 0.5 }}>·</span>}
            {lightbox && !!post?.created_at && <span>{new Date(post.created_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          </p>
        )}
        {belowLeft && <div style={{ marginTop: lightbox ? 'auto' : undefined, paddingTop: 14 }}>{belowLeft}</div>}
      </div>

      {/* ═══ RIGHT PANEL (node 69:196 — 309×573, transparent, softened hairline
          border, no radius) ═══ */}
      <div style={{ position: 'relative', width: 309, flexShrink: 0, height: lightbox ? 600 : 573, marginTop: lightbox ? 0 : -25, background: 'transparent', display: 'flex', flexDirection: 'column' }}>
        {/* Border layer — 0.25px ivory, ~30%, softened 0.9px (ledger-recipe kin, no radius). */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, border: '0.25px solid #E5E1DB', opacity: 0.3, filter: 'blur(0.9px)', pointerEvents: 'none' }} />

        {/* Ticker header — [ TICKER ] left · MC + COLLECTORS right. Dash rule for
            unminted (no coin) across ticker + both values. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '15px 12px 11px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: 'var(--track-wide)', color: 'rgba(229,225,219,0.8)', marginTop: 6 }}>
            {coinAddr && (post?.ticker as string) ? `[ ${String(post.ticker).toUpperCase()} ]` : '[ — ]'}
          </span>
          <div style={{ display: 'flex', gap: 22 }}>
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, color: 'rgba(229,225,219,0.46)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', margin: 0 }}>MC</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'rgba(229,225,219,0.67)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>{coinAddr ? (market ? usd(market.mcUsd) : '…') : '—'}</p>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, color: 'rgba(229,225,219,0.46)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', margin: 0 }}>COLLECTORS</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'rgba(229,225,219,0.67)', margin: '3px 0 0', fontVariantNumeric: 'tabular-nums' }}>{coinAddr ? (market?.holders ?? '…') : '—'}</p>
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', height: 1, background: HAIR }} />

        {/* scrollable body: First Cut + comments */}
        <div style={{ position: 'relative', flex: 1, overflowY: 'auto' }}>
          {coinAddr && (
            <div style={{ padding: '12px 12px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ border: `1px solid ${HAIR}`, borderRadius: 4, width: 28, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="/badges/first-cut-badge-min-design-01.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', flex: 1 }}>FIRST CUT</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: fcCount > 0 ? 'rgba(229,225,219,0.7)' : 'rgba(229,225,219,0.5)', fontVariantNumeric: 'tabular-nums' }}>{fcCount} / 10</span>
              </div>
              {/* ranked list — rank · avatar · @handle. Per-holder PRICE is FLAGGED
                  out: the FC ledger carries no price field (adding it = FC-logic). */}
              <div style={{ margin: '12px 0 0' }}>
                {(fcHolders ?? []).map((h) => (
                  <button key={h.rank} onClick={() => h.username && router.push('/profile/' + h.username)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', width: '100%', background: 'none', border: 'none', cursor: h.username ? 'pointer' : 'default', textAlign: 'left' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'rgba(229,225,219,0.5)', width: 18, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{String(h.rank).padStart(2, '0')}</span>
                    {h.avatarUrl ? (
                      <img src={feedImage(h.avatarUrl, 48)} alt="" style={{ width: 12, height: 12, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#2a2a2a', display: 'inline-block', flexShrink: 0 }} />}
                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 10, color: 'rgba(229,225,219,0.44)', textTransform: 'uppercase', letterSpacing: 'var(--track-wide)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@ {h.username ?? '—'}</span>
                  </button>
                ))}
                {fcHolders && fcHolders.length === 0 && (
                  <p style={{ ...SKR, fontSize: 10, color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', margin: '4px 0 0' }}>ALL 10 SLOTS OPEN</p>
                )}
              </div>
            </div>
          )}
          <div style={{ height: 1, background: HAIR, margin: '6px 0' }} />

          {/* COMMENTS — retheme + relayout of the presentation; CommentList engine
              (likes, one-level replies) unchanged. */}
          <div style={{ padding: '6px 12px 12px' }}>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: 'var(--track-body)', margin: '0 0 8px' }}>COMMENTS ( {comments.length} )</p>
            <CommentList
              comments={comments as UIComment[]}
              variant="desktop"
              desktopLightbox={lightbox}
              likeStates={likeStates}
              onToggleLike={toggleCommentLike}
              onReply={(c) => setReplyingTo(c)}
              onProfile={(h) => router.push('/profile/' + h)}
              viewerDid={user?.id ?? null}
              avatarUrl={(c) => (c.username ? avatars.get(c.username) ?? null : null) ?? c.profile_image_url ?? null}
            />
          </div>
        </div>

        {/* COMPOSER — ivory ~5% fill strip, no border (node 69:196). Input font-size
            kept at 13px (desktop sanity — the frame's 8px placeholder is display-only). */}
        <div style={{ position: 'relative', padding: '8px 12px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(229,225,219,0.05)', padding: '0 8px' }}>
            <input
              ref={commentInputRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); e.stopPropagation(); }}
              placeholder="Add a comment..."
              style={{ ...SKR, flex: 1, fontSize: 13, color: '#E5E1DB', background: 'transparent', border: 'none', outline: 'none', padding: '8px 2px', letterSpacing: 'var(--track-body)' }}
            />
            <button onClick={submitComment} aria-label="Send" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.7)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          </div>
        </div>
        {replyingTo && (
          <ReplyComposer
            parent={replyingTo}
            variant="desktop"
            onClose={() => setReplyingTo(null)}
            onSubmit={submitReply}
          />
        )}
      </div>

      <style>{`button:hover > .dk-arrow-glyph { opacity: 1 !important; }`}</style>
      <CollectSheetGate post={post as any} visible={collectOpen} onClose={() => setCollectOpen(false)} />

      {/* ── Brief D6 owner sheets — the SAME components mobile mounts (no new logic) ── */}
      {showDeckPicker && user && (
        <DeckPickerSheet
          postId={postId}
          onClose={() => setShowDeckPicker(false)}
          onAdded={(deckTitle) => { setShowDeckPicker(false); setDeckToast(deckTitle); setTimeout(() => setDeckToast(''), 2500); }}
        />
      )}
      <CreateCoinSheet post={post as any} visible={showCreateCoin} onClose={() => setShowCreateCoin(false)} onDone={() => { setTimeout(() => setShowCreateCoin(false), 1400); }} />
      <DeletePostSheet
        visible={showDelete}
        postId={postId}
        userId={viewer?.uuid ?? ''}
        onClose={() => setShowDelete(false)}
        onDeleted={(id) => { setShowDelete(false); onPostDeleted?.(id); }}
      />
      {deckToast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 'calc(28px + var(--safe-bottom))', transform: 'translateX(-50%)', zIndex: 700, background: 'var(--canvas)', border: `1px solid ${HAIR}`, padding: '10px 16px', pointerEvents: 'none' }}>
          <span style={{ ...SKB, fontSize: 11, color: '#E5E1DB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ADDED TO {deckToast}</span>
        </div>
      )}
    </div>
  );
}
