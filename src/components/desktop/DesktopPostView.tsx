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
import { useEconomy } from '@/components/EconomyProvider';
import { getPostLikes, getPostComments, addComment, likePost, unlikePost } from '@/lib/postsService';
import { getUserByPrivyId, getProfile } from '@/lib/userService';
import { useFirstCutLedger } from '@/lib/firstCutLedger';
import { getAspectRatio } from '@/lib/aspectRatio';
import { feedImage } from '@/lib/mediaUrl';
import GradedVideo from '@/components/finishing/GradedVideo';
import CollectSheetGate from '@/components/economy/CollectSheetGate';
import TickerMark from '@/components/economy/TickerMark';
import CommentList, { useCommentLikes, ReplyComposer, type UIComment } from '@/components/CommentList';
import { replyToComment } from '@/lib/commentInteractions';

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
      width="10" height="22" viewBox="0 0 10 22" fill="none"
      style={{ display: 'block', transform: dir === -1 ? 'scaleX(-1)' : undefined }}
    >
      <path d="M1 1L8.6 11L1 21" stroke="#E5E1DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DesktopPostView({
  posts, index, onStep, location, framing = 'profile', belowLeft,
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
  const [viewer, setViewer] = useState<{ uuid: string; name: string; avatar: string | null } | null>(null);
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<UIComment | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { likeStates, toggleLike: toggleCommentLike } = useCommentLikes(comments as UIComment[], user?.id ?? null, viewer?.name ?? null);
  const fcHolders = useFirstCutLedger(coinAddr);

  useEffect(() => {
    if (!user) return;
    let dead = false;
    getUserByPrivyId(user.id)
      .then((su) => (su ? getProfile(su.id).then((p) => ({ su, p })) : null))
      .then((r) => { if (!dead && r) setViewer({ uuid: r.su.id, name: (r.p as { username?: string })?.username ?? 'user', avatar: (r.p as { profile_image_url?: string })?.profile_image_url ?? null }); })
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
          <motion.div layoutId={`dpost-${postId}`} transition={{ layout: { duration: 0.18, ease: 'easeOut' } }} style={{ width: '100%', aspectRatio: '2.39 / 1', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ ...(ar >= 2.39 ? { width: '100%' } : { height: '100%' }), aspectRatio: `${ar}`, overflow: 'hidden', background: '#0a0a0a' }}>
              {isVideo ? (
                <GradedVideo
                  key={postId}
                  url={mediaUrl}
                  posterUrl={poster}
                  posterWidth={1600}
                  clipUrl={(post?.autoplay_clip_url as string) ?? null}
                  editParams={post?.edit_params}
                  cropX={(post?.crop_x as number) ?? 0}
                  cropY={(post?.crop_y as number) ?? 0}
                  cropWidth={(post?.crop_width as number) ?? 1}
                  cropHeight={(post?.crop_height as number) ?? 1}
                  forcePlay
                  showSoundToggle
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                mediaUrl && <img src={feedImage(mediaUrl, 1600)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
              <span style={{ ...SKB, fontSize: 11, color: fcCount > 0 ? '#E5E1DB' : 'rgba(229,225,219,0.6)', fontVariantNumeric: 'tabular-nums' }}>{fcCount} / 10</span>
            </span>
          )}
          {coinAddr && (
            <button onClick={() => setCollectOpen(true)} style={{ marginLeft: 'auto', ...SKB, fontSize: 11, letterSpacing: '0.1em', color: '#E5E1DB', textTransform: 'uppercase', width: 82, height: 22, border: '1.2px solid #525252', background: 'transparent', cursor: 'pointer', lineHeight: 1 }}>
              COLLECT
            </button>
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
          <p style={{ ...SKR, fontSize: 12, color: 'rgba(229,225,219,0.5)', lineHeight: 1.5, margin: lightbox ? '10px 0 0' : '12px 0 0', maxWidth: 381 }}>{post.caption}</p>
        )}
        {(location || (lightbox && !!post?.created_at)) && (
          <p style={{ ...SKB, fontSize: 8, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
            {location && <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(229,225,219,0.45)" strokeWidth="1.8"><path d="M12 21s-6.5-5.4-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></svg>{location}</>}
            {!!location && lightbox && !!post?.created_at && <span style={{ opacity: 0.5 }}>·</span>}
            {lightbox && !!post?.created_at && <span>{new Date(post.created_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          </p>
        )}
        {belowLeft && <div style={{ marginTop: lightbox ? 'auto' : undefined, paddingTop: 14 }}>{belowLeft}</div>}
      </div>

      {/* ═══ RIGHT PANEL (309×573, #030303) ═══ */}
      <div style={{ width: 309, flexShrink: 0, height: lightbox ? 600 : 573, marginTop: lightbox ? 0 : -25, background: '#030303', border: '0.25px solid rgba(229,225,219,0.27)', display: 'flex', flexDirection: 'column' }}>
        {/* header strip: ticker · MC · collectors */}
        {/* three zones distributed across the panel width, hairlines between */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0' }}>
          {/* Unminted posts (no coin) carry NO market — quiet dash, never $0.00/0. */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            {coinAddr && (post?.ticker as string) ? <TickerMark ticker={post.ticker as string} size={11} /> : <span style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.35)' }}>—</span>}
          </div>
          <div style={{ width: 1, height: 28, background: HAIR }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ ...SKB, fontSize: 8, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>MC</p>
            <p style={{ ...SKB, fontSize: 11, color: '#E5E1DB', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{coinAddr ? (market ? usd(market.mcUsd) : '…') : '—'}</p>
          </div>
          <div style={{ width: 1, height: 28, background: HAIR }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ ...SKB, fontSize: 8, color: 'rgba(229,225,219,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>COLLECTORS</p>
            <p style={{ ...SKB, fontSize: 11, color: '#E5E1DB', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{coinAddr ? (market?.holders ?? '…') : '—'}</p>
          </div>
        </div>
        <div style={{ height: 1, background: HAIR }} />

        {/* scrollable body: leaderboard + comments */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {coinAddr && (
            <div style={{ padding: '12px 12px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ border: `1px solid ${HAIR}`, borderRadius: 4, width: 28, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="/badges/first-cut-badge-min-design-01.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                </span>
                <span style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.25, flex: 1 }}>FIRST CUT<br />LEADERBOARD</span>
                <span style={{ ...SKB, fontSize: 11, color: fcCount > 0 ? '#E5E1DB' : 'rgba(229,225,219,0.5)', fontVariantNumeric: 'tabular-nums' }}>{fcCount} / 10</span>
              </div>
              <div style={{ margin: '10px 0 0' }}>
                {(fcHolders ?? []).map((h) => (
                  <div key={h.rank} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                    <span style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.5)', width: 18, fontVariantNumeric: 'tabular-nums' }}>{String(h.rank).padStart(2, '0')}</span>
                    {h.avatarUrl ? (
                      <img src={feedImage(h.avatarUrl, 48)} alt="" style={{ width: 12, height: 12, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#2a2a2a', display: 'inline-block' }} />}
                    <span style={{ ...SKB, fontSize: 10, color: 'rgba(229,225,219,0.65)', textTransform: 'uppercase', flex: 1 }}>@{h.username ?? '—'}</span>
                  </div>
                ))}
                {fcHolders && fcHolders.length === 0 && (
                  <p style={{ ...SKR, fontSize: 10, color: 'rgba(229,225,219,0.35)', textTransform: 'uppercase', margin: '4px 0 0' }}>ALL 10 SLOTS OPEN</p>
                )}
              </div>
            </div>
          )}
          <div style={{ height: 1, background: HAIR, margin: '6px 0' }} />

          {/* COMMENTS */}
          <div style={{ padding: '6px 12px 12px' }}>
            <p style={{ ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>COMMENTS ( {comments.length} )</p>
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

        {/* ADD A COMMENT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: `1px solid ${HAIR}` }}>
          {viewer?.avatar ? (
            <img src={feedImage(viewer.avatar, 96)} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#2a2a2a', flexShrink: 0 }} />
          )}
          <input
            ref={commentInputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); e.stopPropagation(); }}
            placeholder="ADD A COMMENT"
            style={{ ...SKR, flex: 1, fontSize: 10, color: '#E5E1DB', background: 'rgba(75,75,75,0.17)', border: 'none', outline: 'none', padding: '7px 9px', letterSpacing: '0.02em' }} /* NO text-transform — comments type & render as typed */
          />
          <button onClick={submitComment} aria-label="Send" style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...SKB, fontSize: 11, color: 'rgba(229,225,219,0.7)', padding: 4 }}>↑</button>
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
    </div>
  );
}
