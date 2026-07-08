'use client';
// ── DESKTOP POST SCROLL — the 1-up post view (Figma 229:892) ──────────────────
// Mounted by DesktopProfile's morph (Brief 2). Fixed letterboxed stage (the
// theatre discipline — never resizes between posts), actions + caption below,
// the right panel (ticker/MC/collectors · First Cut leaderboard · comments).
// Self-fetches per post; stepping re-keys the fetches.

import { useEffect, useMemo, useRef, useState } from 'react';
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

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };
const HAIR = 'rgba(255,255,255,0.14)';

const timeAgo = (iso: string): string => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
};

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
      <path d="M1 1L8.6 11L1 21" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DesktopPostView({
  posts, index, onStep, location,
}: {
  posts: Record<string, unknown>[];
  index: number;
  onStep: (dir: 1 | -1) => void;
  /** The profile owner's location (the frame's location row under the caption). */
  location: string | null;
}) {
  const { user } = usePrivy();
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
  const [collectOpen, setCollectOpen] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
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
  // rendered media width as a fraction of the stage (height-bound below 2.39)
  const STAGE_AR = 2.39;
  const mediaFrac = Math.min(ar / STAGE_AR, 1); // 1 = fills the width
  const arrowInset = `calc(${(1 - mediaFrac) * 50}% - 30px)`; // media edge − pocket − glyph

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 80, marginTop: 0 }}> {/* frame seat ~y299 (measured 319 at mt12 — the last 20 trimmed here + the 3-box row) */}
      {/* ═══ LEFT: the stage + below-media rows ═══ */}
      {/* FRAME GEOMETRY (round 3): narrow ~20px ARROW POCKETS hugging the media
          (frame x86/x1083 vs stage x103/1077); stage right edge ~30px from the
          panel (20px pocket + 12px gap). The media is the star. */}
      <div style={{ flex: 1, minWidth: 0, padding: '0 20px', marginTop: 60 }}> {/* media midline = panel midline (measured +60) */}
        <div style={{ position: 'relative' }}>
          {/* prev / next — Batang > glyphs, mid-media */}
          {index > 0 && (
            <button onClick={() => onStep(-1)} aria-label="Previous"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75'; }}
              style={{ position: 'absolute', left: arrowInset, top: '50%', transform: 'translate(0, -50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, lineHeight: 0, opacity: 0.75, transition: 'opacity 120ms ease' }}>
              <Chevron dir={-1} />
            </button>
          )}
          {index < posts.length - 1 && (
            <button onClick={() => onStep(1)} aria-label="Next"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75'; }}
              style={{ position: 'absolute', right: arrowInset, top: '50%', transform: 'translate(0, -50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, lineHeight: 0, opacity: 0.75, transition: 'opacity 120ms ease' }}>
              <Chevron dir={1} />
            </button>
          )}

          {/* THE STAGE — fixed 2.75:1 letterbox; the shared-element morph target */}
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? '#FF0000' : 'none'} stroke={isLiked ? '#FF0000' : 'rgba(255,255,255,0.85)'} strokeWidth="2" strokeLinejoin="round"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z"/></svg>
            <span style={{ ...SKB, fontSize: 12, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>{likes.length}</span>
          </button>
          <button onClick={() => { commentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); commentInputRef.current?.focus(); }} aria-label="Comment" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg>
            <span style={{ ...SKB, fontSize: 12, color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>{comments.length}</span>
          </button>
          {coinAddr && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ border: `1px solid ${HAIR}`, borderRadius: 3, padding: '2px 5px', display: 'inline-flex' }}>
                <img src="/badges/first-cut-badge-min-design-01.png" alt="" style={{ width: 13, height: 13, objectFit: 'contain', display: 'block' }} />
              </span>
              <span style={{ ...SKB, fontSize: 11, color: fcCount > 0 ? '#FF0000' : 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{fcCount} / 10</span>
            </span>
          )}
          {coinAddr && (
            <button onClick={() => setCollectOpen(true)} style={{ marginLeft: 'auto', ...SKB, fontSize: 11, letterSpacing: '0.1em', color: '#FFF', textTransform: 'uppercase', width: 82, height: 22, border: '1.2px solid #525252', background: 'transparent', cursor: 'pointer', lineHeight: 1 }}>
              COLLECT
            </button>
          )}
        </div>

        {/* caption + location */}
        {typeof post?.caption === 'string' && post.caption && (
          <p style={{ ...SKR, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: '12px 0 0', maxWidth: 381 }}>{post.caption}</p>
        )}
        {location && (
          <p style={{ ...SKB, fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8"><path d="M12 21s-6.5-5.4-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></svg>
            {location}
          </p>
        )}
      </div>

      {/* ═══ RIGHT PANEL (309×573, #030303) ═══ */}
      <div style={{ width: 309, flexShrink: 0, height: 573, marginTop: -25, background: '#030303', border: '0.25px solid rgba(255,255,255,0.27)', display: 'flex', flexDirection: 'column' }}>
        {/* header strip: ticker · MC · collectors */}
        {/* three zones distributed across the panel width, hairlines between */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0' }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            {(post?.ticker as string) ? <TickerMark ticker={post.ticker as string} size={11} /> : <span style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>—</span>}
          </div>
          <div style={{ width: 1, height: 28, background: HAIR }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ ...SKB, fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>MC</p>
            <p style={{ ...SKB, fontSize: 11, color: '#FFF', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{market ? usd(market.mcUsd) : '…'}</p>
          </div>
          <div style={{ width: 1, height: 28, background: HAIR }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ ...SKB, fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>COLLECTORS</p>
            <p style={{ ...SKB, fontSize: 11, color: '#FFF', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{market?.holders ?? '…'}</p>
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
                <span style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.25, flex: 1 }}>FIRST CUT<br />LEADERBOARD</span>
                <span style={{ ...SKB, fontSize: 11, color: fcCount > 0 ? '#FF0000' : 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>{fcCount} / 10</span>
              </div>
              <div style={{ margin: '10px 0 0' }}>
                {(fcHolders ?? []).map((h) => (
                  <div key={h.rank} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                    <span style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 18, fontVariantNumeric: 'tabular-nums' }}>{String(h.rank).padStart(2, '0')}</span>
                    {h.avatarUrl ? (
                      <img src={feedImage(h.avatarUrl, 48)} alt="" style={{ width: 12, height: 12, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#2a2a2a', display: 'inline-block' }} />}
                    <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', flex: 1 }}>@{h.username ?? '—'}</span>
                  </div>
                ))}
                {fcHolders && fcHolders.length === 0 && (
                  <p style={{ ...SKR, fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', margin: '4px 0 0' }}>ALL 10 SLOTS OPEN</p>
                )}
              </div>
            </div>
          )}
          <div style={{ height: 1, background: HAIR, margin: '6px 0' }} />

          {/* COMMENTS */}
          <div style={{ padding: '6px 12px 12px' }}>
            <p style={{ ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>COMMENTS ( {comments.length} )</p>
            {comments.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, margin: '0 0 9px' }}>
                {c.username && avatars.get(c.username) ? (
                  <img src={feedImage(avatars.get(c.username) as string, 96)} alt="" style={{ width: 12, height: 12, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#2a2a2a', flexShrink: 0, marginTop: 2 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...SKB, fontSize: 10, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>@{c.username}</span>
                  <span style={{ ...SKR, fontSize: 10, color: 'rgba(255,255,255,0.44)', marginLeft: 7 }}>{c.content}</span>
                </div>
                {c.created_at && <span style={{ ...SKR, fontSize: 9, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{timeAgo(c.created_at)}</span>}
              </div>
            ))}
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
            style={{ ...SKR, flex: 1, fontSize: 10, color: '#FFF', background: 'rgba(75,75,75,0.17)', border: 'none', outline: 'none', padding: '7px 9px', letterSpacing: '0.02em' }} /* NO text-transform — comments type & render as typed */
          />
          <button onClick={submitComment} aria-label="Send" style={{ background: 'transparent', border: 'none', cursor: 'pointer', ...SKB, fontSize: 11, color: 'rgba(255,255,255,0.7)', padding: 4 }}>↑</button>
        </div>
      </div>

      <CollectSheetGate post={post as any} visible={collectOpen} onClose={() => setCollectOpen(false)} />
    </div>
  );
}
