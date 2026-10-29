// ── /composer/[handle] — the COMPOSER page (Brief MUS-1 §2; mock §2) ─────────────────────────────
// The composer badge's door. Header (avatar · name · bio · links · stats · Follow), then ALBUMS as
// square covers (2-up mobile / 4-up desktop; cover → that album's first track in the track view),
// then ALL TRACKS (newest first, album + length; desktop carries the column header). The owner
// sees "Manage music" → /composer/[handle]/manage. Reads through musicCatalog (public data only:
// approved tracks + the albums that hold them). Zero approved tracks = no badge = unreachable by
// design → the quiet "no discography" state if the URL is hit directly.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { supabase } from "@/lib/supabase/client";
import { getUserByPrivyId, getUserById, followUser, unfollowUser, isFollowing } from "@/lib/userService";
import { useIsDesktop } from "@/lib/useIsDesktop";
import {
  composerByHandle, composerCatalog, postsScored, albumCover, fmtDur,
  type CatalogAlbum, type CatalogTrack, type Composer,
} from "@/lib/musicCatalog";
import ContributeMusicFlow from "@/components/ContributeMusicFlow";
import PageScroller from "@/components/PageScroller";
import {
  SKB, SKM, SKR, MUTE, INK, LBL, HAIR,
  SecHead, Act, TrackRow, AlbumTile, Avatar, PageHeader, ErrLine, albumMeta,
} from "@/components/music/musicUi";

export default function ComposerPage() {
  const params = useParams<{ handle: string }>();
  const handle = decodeURIComponent(String(params?.handle ?? ""));
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { user, login } = usePrivy();

  const [composer, setComposer] = useState<Composer | null | undefined>(undefined);
  const [albums, setAlbums] = useState<CatalogAlbum[]>([]);
  const [tracks, setTracks] = useState<CatalogTrack[] | null>(null);
  const [scored, setScored] = useState(0);
  const [viewerIsComposer, setViewerIsComposer] = useState<boolean | null>(null);
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [targetPrivyId, setTargetPrivyId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followErr, setFollowErr] = useState<string | null>(null);
  const [showContribute, setShowContribute] = useState(false);

  // Composer + public catalog + the posts-scored stat.
  useEffect(() => {
    if (!handle) return;
    let dead = false;
    (async () => {
      const c = await composerByHandle(handle).catch(() => null);
      if (dead) return;
      setComposer(c);
      if (!c) { setTracks([]); return; }
      const cat = await composerCatalog(c.user_id).catch(() => ({ albums: [] as CatalogAlbum[], tracks: [] as CatalogTrack[] }));
      if (dead) return;
      setAlbums(cat.albums);
      setTracks(cat.tracks);
      if (cat.tracks.length) postsScored(cat.tracks.map((t) => t.id)).then((n) => { if (!dead) setScored(n); }).catch(() => {});
      getUserById(c.user_id).then((u) => { if (!dead) setTargetPrivyId(u?.privy_id ?? null); }).catch(() => {});
    })();
    return () => { dead = true; };
  }, [handle]);

  // Viewer: owner? a composer already (drives the recruitment CTA)?
  useEffect(() => {
    if (!user) { setViewerIsComposer(false); setViewerIsOwner(false); setFollowing(false); return; }
    if (!composer) return;
    let dead = false;
    getUserByPrivyId(user.id).then(async (u) => {
      if (dead || !u) { setViewerIsComposer(false); return; }
      setViewerIsOwner(u.id === composer.user_id);
      const { count } = await supabase.from("tracks").select("id", { count: "exact", head: true }).eq("composer_user_id", u.id).eq("status", "approved");
      if (!dead) setViewerIsComposer((count ?? 0) > 0);
    }).catch(() => { if (!dead) setViewerIsComposer(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, composer?.user_id]);

  // Follow state — the app's ONE follow mechanism (userService, Privy DIDs, same as profiles).
  useEffect(() => {
    if (!user || !targetPrivyId || user.id === targetPrivyId) return;
    let dead = false;
    isFollowing(user.id, targetPrivyId).then((f) => { if (!dead) setFollowing(f); }).catch(() => {});
    return () => { dead = true; };
  }, [user?.id, targetPrivyId]);

  const toggleFollow = async () => {
    if (!user) { login(); return; }
    if (!targetPrivyId || followBusy) return;
    setFollowBusy(true); setFollowErr(null);
    const was = following;
    setFollowing(!was); // optimistic, reverted on failure
    try {
      if (was) await unfollowUser(user.id, targetPrivyId);
      else await followUser(user.id, targetPrivyId);
    } catch {
      setFollowing(was);
      setFollowErr(was ? "Couldn't unfollow — try again." : "Couldn't follow — try again.");
    } finally { setFollowBusy(false); }
  };

  const allTracks = useMemo(() => [...(tracks ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), [tracks]);
  const albumTitle = useMemo(() => new Map(albums.map((a) => [a.id, a.title])), [albums]);
  const firstTrack = (al: CatalogAlbum) =>
    (tracks ?? []).filter((t) => t.album_id === al.id).sort((x, y) => x.position - y.position)[0]?.id ?? null;

  const empty = tracks !== null && tracks.length === 0;
  const name = composer ? (composer.display_name || composer.username) : handle;
  const openTrack = (id: string) => router.push(`/track/${id}`);
  const back = () => { if (window.history.length > 1) router.back(); else router.push("/library"); };
  const isSelf = !!user && !!targetPrivyId && user.id === targetPrivyId;

  // ── header ─────────────────────────────────────────────────────────────────────
  const nTracks = tracks?.length ?? 0;
  const stats = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: isDesktop ? "flex-start" : "center", ...LBL }}>
      <span><b style={{ color: INK }}>{albums.length}</b> {albums.length === 1 ? "album" : "albums"}</span>
      <span><b style={{ color: INK }}>{nTracks}</b> {nTracks === 1 ? "track" : "tracks"}</span>
      <span><b style={{ color: INK }}>{scored}</b> posts scored</span>
    </div>
  );
  const links = composer && composer.composer_links.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", justifyContent: isDesktop ? "flex-start" : "center" }}>
      {composer.composer_links.map((l, i) => (
        <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noopener noreferrer"
          style={{ ...SKM, fontSize: 13, color: INK, textDecoration: "none", borderBottom: `1px solid ${HAIR}` }}>{l.label}</a>
      ))}
    </div>
  );
  const bio = composer?.composer_bio && (
    <div style={{ ...SKR, fontSize: 13, lineHeight: 1.45, color: "rgb(var(--ink-rgb) / 0.8)", maxWidth: isDesktop ? "60ch" : "36ch", whiteSpace: "pre-wrap" }}>{composer.composer_bio}</div>
  );
  const ctaStyle = isDesktop ? undefined : { width: "100%", marginTop: 4 };
  const cta = viewerIsOwner
    ? <Act fill onClick={() => router.push(`/composer/${encodeURIComponent(composer?.username ?? handle)}/manage`)} style={ctaStyle}>Manage music</Act>
    : isSelf ? null
      : <Act fill={!following} onClick={toggleFollow} disabled={followBusy || (!!user && !targetPrivyId)} style={ctaStyle}>{following ? "Following" : "Follow"}</Act>;

  const header = composer && (isDesktop ? (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 24, padding: "8px 0 18px" }}>
      <Avatar url={composer.profile_image_url} size={104} alt={name} />
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div style={{ ...SKM, fontSize: 24, letterSpacing: "-0.01em", lineHeight: 1, color: INK }}>{name}</div>
        {bio}{links}{!empty && stats}
      </div>
      <div>{cta}<ErrLine msg={followErr} /></div>
    </div>
  ) : (
    <div style={{ display: "grid", justifyItems: "center", textAlign: "center", gap: 10, padding: "10px 0 6px" }}>
      <Avatar url={composer.profile_image_url} size={88} alt={name} />
      <div style={{ ...SKM, fontSize: 24, letterSpacing: "-0.01em", lineHeight: 1, color: INK }}>{name}</div>
      {bio}{links}{!empty && stats}
      {cta}
      <ErrLine msg={followErr} />
    </div>
  ));

  const ctaLink: React.CSSProperties = { ...SKB, fontSize: 12, color: INK, textTransform: "uppercase", letterSpacing: "0.06em", background: "none", border: "none", cursor: "pointer", padding: 0 };

  return (
    // The page's ONE scroller (scroll-trap rule).
    <PageScroller style={{ background: "var(--canvas)", paddingTop: "var(--safe-top)" }}>
      {!isDesktop && <PageHeader title="Composer" onBack={back} />}
      <div style={{ maxWidth: isDesktop ? 1200 : undefined, margin: "0 auto", padding: isDesktop ? "24px 32px 48px" : "0 20px 32px" }}>
        {isDesktop && (
          <button type="button" onClick={back} style={{ ...SKB, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 20 }}>← Back</button>
        )}
        {composer === undefined && <p style={{ ...SKR, fontSize: 13, color: MUTE, padding: "20px 0" }}>Loading…</p>}
        {header}
        {composer === null && <p style={{ ...SKR, fontSize: 13, color: MUTE, padding: "20px 0" }}>No discography yet.</p>}
        {composer && empty && <p style={{ ...SKR, fontSize: 13, color: MUTE, padding: "20px 0", textAlign: isDesktop ? "left" : "center" }}>No discography yet.</p>}

        {/* ── ALBUMS ── */}
        {albums.length > 0 && (
          <>
            <SecHead label="Albums" />
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 14 }}>
              {albums.map((al) => (
                <AlbumTile key={al.id} cover={albumCover(al, tracks ?? [])} title={al.title} meta={albumMeta(al.year, al.trackCount)}
                  onClick={() => { const id = firstTrack(al); if (id) openTrack(id); }} />
              ))}
            </div>
          </>
        )}

        {/* ── ALL TRACKS ── */}
        {allTracks.length > 0 && (
          <>
            <SecHead label="All tracks" aside="Newest" />
            {isDesktop && (
              <div style={{ display: "flex", gap: 12, paddingBottom: 8, ...LBL, fontSize: 11 }}>
                <span style={{ width: 22, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Title</span>
                <span style={{ width: 150, flexShrink: 0 }}>Album</span>
                <span style={{ width: 40, flexShrink: 0, textAlign: "right" }}>Length</span>
                <span style={{ width: 24, flexShrink: 0 }} />
              </div>
            )}
            <div>
              {allTracks.map((t, i) => (
                <TrackRow key={t.id} index={i} title={t.title} album={(t.album_id && albumTitle.get(t.album_id)) || ""}
                  albumW={isDesktop ? 150 : 96} dur={fmtDur(t.duration_seconds)} last={i === allTracks.length - 1}
                  onClick={() => openTrack(t.id)} />
              ))}
            </div>
          </>
        )}

        {/* ── FOOTER — the library line + the non-composer recruitment CTA (kept from M11) ── */}
        {composer && !empty && (
          <div style={{ padding: "32px 0 48px", display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <button onClick={() => router.push("/library")} style={{ ...SKB, fontSize: 12, color: MUTE, textTransform: "uppercase", letterSpacing: "0.16em", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              [ SCOPE ORIGINAL MUSIC LIBRARY ]
            </button>
            {viewerIsComposer === false && !viewerIsOwner && (
              <button onClick={() => setShowContribute(true)} style={ctaLink}>Contribute to wear the badge →</button>
            )}
          </div>
        )}
        {composer && empty && viewerIsOwner && (
          <div style={{ padding: "8px 0 48px" }}>
            <button onClick={() => setShowContribute(true)} style={ctaLink}>Contribute to wear the badge →</button>
          </div>
        )}
      </div>

      {showContribute && <ContributeMusicFlow onClose={() => setShowContribute(false)} />}
    </PageScroller>
  );
}
