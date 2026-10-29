// ── TrackView — THE track view (Brief MUS-1 §1, docs/design/scope-music-mock.html §1) ────────────
// ONE component for every entry point: the /track/[id] route (main library, composer page, bio
// sheet MUSIC covers) and the EDIT & POST library sheet (MusicPicker, `embedded` — no navigation,
// the create flow stays mounted). Composer first, then artwork · title · player · actions; below,
// the album this track belongs to (current track marked; tapping a row switches the view) and the
// composer's other albums (cover → that album's first track).
//   mobile / embedded : one column (the mock's phone)
//   desktop           : 420px left (art/meta/player/actions/composer card) · right (album + 4-up)
// One <audio> element for the whole view. Download goes through useDownload (server decides the
// tier). "Save" from the mock ships as SHARE — the product has no bookmark/save, ever.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useDownload } from "@/lib/useDownload";
import { trackView, fmtDur, albumCover, type CatalogTrack, type CatalogAlbum, type Composer } from "@/lib/musicCatalog";
import { backfillPeaks } from "@/lib/waveform";
import Waveform from "@/components/Waveform";
import TrackArt from "@/components/TrackArt";
import {
  SKB, SKM, SKR, HAIR, MUTE, INK, LBL, TIME,
  SecHead, Act, PlayButton, TrackRow, AlbumTile, Avatar, PageHeader, ErrLine, albumMeta,
} from "@/components/music/musicUi";

/** sessionStorage key the create flow can read to preselect a track (no URL param exists yet). */
export const PRESELECT_TRACK_KEY = "scope:preselect-track";

type View = NonNullable<Awaited<ReturnType<typeof trackView>>>;

export interface TrackViewProps {
  trackId: string;
  /** Called when the view switches to another track (album row / album cover). The route uses it
   *  to keep the URL in step; the view switches internally either way. */
  onNavigateTrack?: (id: string) => void;
  /** "Use in a post". Given → called (EDIT & POST sheet selects the track). Absent → /create with
   *  the id stashed in sessionStorage[PRESELECT_TRACK_KEY]. */
  onUse?: (track: CatalogTrack, composer: Composer | null) => void;
  /** Back / close. Absent → history.back(). */
  onClose?: () => void;
  /** Inside a sheet: always the one-column layout, and never navigates away (composer row inert). */
  embedded?: boolean;
}

export default function TrackView({ trackId, onNavigateTrack, onUse, onClose, embedded = false }: TrackViewProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const wide = isDesktop && !embedded;
  const { download, busy: dlBusy, error: dlError } = useDownload();

  const [curId, setCurId] = useState(trackId);
  const [view, setView] = useState<View | null | undefined>(undefined); // undefined = loading, null = missing
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [time, setTime] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurId(trackId); }, [trackId]);

  // Load the view for the current track. Switching tracks stops (or hands over) playback.
  useEffect(() => {
    let dead = false;
    const a = audioRef.current;
    resumeRef.current = playing;
    try { a?.pause(); } catch {}
    setPlaying(false); setLoaded(false); setTime(0); setNote(null);
    trackView(curId)
      .then((v) => { if (dead) return; setView(v); setPeaks(v?.track.waveform_peaks ?? null); })
      .catch(() => { if (!dead) setView(null); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId]);

  const track = view?.track ?? null;

  // Legacy self-heal — peakless track decodes once (guarded + serialized in waveform.ts).
  useEffect(() => {
    if (!track || (track.waveform_peaks && track.waveform_peaks.length) || !track.file_url) return;
    let dead = false;
    backfillPeaks(track.id, track.file_url).then((p) => { if (p && !dead) setPeaks(p); });
    return () => { dead = true; };
  }, [track]);

  // Hand playback over to the newly switched track if the previous one was playing.
  useEffect(() => {
    if (!track || !resumeRef.current) return;
    resumeRef.current = false;
    const a = audioRef.current; if (!a) return;
    a.src = track.file_url; setLoaded(true);
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [track]);

  // Stop on unmount (the sheet closing must never leave audio running).
  useEffect(() => () => { try { audioRef.current?.pause(); } catch {} }, []);

  const togglePlay = () => {
    const a = audioRef.current; if (!a || !track) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (!loaded) { a.src = track.file_url; setLoaded(true); }
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const seek = (pct: number) => {
    const a = audioRef.current; if (!a || !track) return;
    const apply = () => { if (a.duration && isFinite(a.duration)) { a.currentTime = pct * a.duration; setTime(a.currentTime); } };
    if (!loaded) {
      a.src = track.file_url; setLoaded(true);
      a.addEventListener("loadedmetadata", apply, { once: true });
      a.play().then(() => setPlaying(true)).catch(() => {});
      return;
    }
    apply();
  };

  const go = useCallback((id: string) => {
    if (id === curId) return;
    setCurId(id);
    onNavigateTrack?.(id);
    try { rootRef.current?.scrollIntoView({ block: "start" }); } catch {}
  }, [curId, onNavigateTrack]);

  const firstTrackOfAlbum = useCallback((al: CatalogAlbum) => {
    const ts = (view?.allTracks ?? []).filter((t) => t.album_id === al.id).sort((x, y) => x.position - y.position);
    return ts[0]?.id ?? null;
  }, [view]);

  const close = () => { try { audioRef.current?.pause(); } catch {} if (onClose) onClose(); else history.back(); };

  const use = () => {
    if (!track) return;
    try { audioRef.current?.pause(); } catch {}
    if (onUse) { onUse(track, view?.composer ?? null); return; }
    try { sessionStorage.setItem(PRESELECT_TRACK_KEY, track.id); } catch {}
    router.push("/create");
  };

  const share = async () => {
    if (!track) return;
    const url = `${window.location.origin}/track/${track.id}`;
    setNote(null);
    try {
      if (navigator.share) { await navigator.share({ title: track.title, url }); return; }
    } catch (e) { if ((e as Error)?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); setNote("Link copied"); }
    catch { setNote(url); }
  };

  const composer = view?.composer ?? null;
  const album = view?.album ?? null;
  const composerName = composer ? (composer.display_name || composer.username) : "";
  const meta = useMemo(() => {
    if (!track) return "";
    return [album?.title, album?.year ? String(album.year) : null, fmtDur(track.duration_seconds)].filter(Boolean).join(" · ");
  }, [track, album]);
  const totalTracks = view?.allTracks.length ?? 0;
  const totalAlbums = view ? view.otherAlbums.length + (album ? 1 : 0) : 0;
  const toComposer = !embedded && composer?.username ? () => { try { audioRef.current?.pause(); } catch {} router.push(`/composer/${composer.username}`); } : undefined;

  // ── pieces ───────────────────────────────────────────────────────────────────
  const hero = track && (
    <div style={{ width: "100%", aspectRatio: "1 / 1", background: "var(--surface-2)", overflow: "hidden" }}>
      {track.artwork_url
        ? <img src={track.artwork_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <ArtFill track={track} />}
    </div>
  );

  const metaBlock = track && (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...SKM, fontSize: wide ? 32 : 26, letterSpacing: "-0.01em", lineHeight: 1.05, color: INK, overflowWrap: "anywhere" }}>{track.title}</div>
      {meta && <div style={{ ...SKR, fontSize: 13, color: MUTE, marginTop: 6 }}>{meta}</div>}
    </div>
  );

  const player = track && (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
      <PlayButton playing={playing} onClick={togglePlay} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Waveform peaks={peaks} audio={loaded ? audioRef : undefined} onSeek={seek} height={40} />
      </div>
      <span style={{ ...TIME, minWidth: 30, textAlign: "right" }}>{fmtDur(time) || "0:00"}</span>
    </div>
  );

  const actions = track && (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 8, marginTop: 14 }}>
        <Act fill onClick={use}>Use in a post</Act>
        <Act onClick={() => { void download("track", track.id); }} disabled={dlBusy} testId="track-download">{dlBusy ? "…" : "Download"}</Act>
        <Act onClick={share}>Share</Act>
      </div>
      <ErrLine msg={dlError} />
      {note && <p style={{ ...SKR, fontSize: 12, color: MUTE, margin: "10px 0 0", overflowWrap: "anywhere" }}>{note}</p>}
    </>
  );

  const composerRow = composer && (
    <div onClick={toComposer} role={toComposer ? "link" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0 14px", cursor: toComposer ? "pointer" : "default" }}>
      <Avatar url={composer.profile_image_url} size={40} />
      <div style={{ minWidth: 0 }}>
        <div style={LBL}>Composer</div>
        <div style={{ ...SKM, fontSize: 15, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{composerName}</div>
      </div>
      {toComposer && <span aria-hidden style={{ marginLeft: "auto", color: MUTE, fontSize: 20, lineHeight: 1 }}>›</span>}
    </div>
  );

  const composerCard = composer && (
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${HAIR}`, padding: 14, marginTop: 22 }}>
      <Avatar url={composer.profile_image_url} size={40} />
      <div style={{ minWidth: 0 }}>
        <div style={LBL}>Composer</div>
        <div style={{ ...SKM, fontSize: 15, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{composerName}</div>
        <div style={{ ...SKR, fontSize: 12, color: MUTE, marginTop: 2 }}>{totalAlbums} {totalAlbums === 1 ? "album" : "albums"} · {totalTracks} {totalTracks === 1 ? "track" : "tracks"}</div>
      </div>
      {toComposer && <Act small onClick={toComposer} style={{ marginLeft: "auto" }}>View</Act>}
    </div>
  );

  const albumList = album && view && view.albumTracks.length > 0 && (
    <>
      <SecHead label="From the album" name={album.title} first={wide} />
      <div>
        {view.albumTracks.map((t, i) => (
          <TrackRow key={t.id} index={i} title={t.title} dur={fmtDur(t.duration_seconds)}
            current={t.id === track?.id} playing={t.id === track?.id && playing}
            last={i === view.albumTracks.length - 1}
            onClick={() => (t.id === track?.id ? togglePlay() : go(t.id))} />
        ))}
      </div>
    </>
  );

  const moreFrom = view && view.otherAlbums.length > 0 && (
    <>
      <SecHead label={`More from ${composerName}`} />
      <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        {view.otherAlbums.map((al) => (
          <AlbumTile key={al.id} cover={albumCover(al, view.allTracks)} title={al.title} meta={albumMeta(al.year, al.trackCount)}
            onClick={() => { const id = firstTrackOfAlbum(al); if (id) go(id); }} />
        ))}
      </div>
    </>
  );

  // ── frame ────────────────────────────────────────────────────────────────────
  const status = view === undefined
    ? <p style={{ ...SKR, fontSize: 13, color: MUTE, padding: "20px 0" }}>Loading…</p>
    : view === null
      ? <p style={{ ...SKR, fontSize: 13, color: MUTE, padding: "20px 0" }}>This track isn&apos;t available.</p>
      : null;

  return (
    <div ref={rootRef} data-testid="track-view" data-track-id={track?.id ?? curId} style={{ color: INK }}>
      <audio ref={audioRef} preload="none"
        onEnded={() => { setPlaying(false); setTime(0); }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => { const a = audioRef.current; if (a) setTime(a.currentTime); }} />

      {wide ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 32px 48px" }}>
          <button type="button" onClick={close} style={{ ...SKB, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 20 }}>← Back</button>
          {status}
          {track && (
            <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 40, alignItems: "start" }}>
              <div>{hero}{metaBlock}{player}{actions}{composerCard}</div>
              <div>{albumList}{moreFrom}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <PageHeader title="Track" onBack={close}
            right={track ? <button type="button" onClick={share} aria-label="More" style={{ ...SKB, fontSize: 18, color: INK, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: 0 }}>···</button> : null} />
          <div style={{ padding: "0 20px 32px" }}>
            {status}
            {composerRow}
            {hero}{metaBlock}{player}{actions}
            {albumList}
            {moreFrom}
          </div>
        </>
      )}
    </div>
  );
}

/** No artwork → the deterministic generated face, scaled to fill the hero square. */
function ArtFill({ track }: { track: CatalogTrack }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize(el.clientWidth));
    ro.observe(el); setSize(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return <div ref={box} style={{ width: "100%", height: "100%" }}>{size > 0 && <TrackArt url={null} title={track.title} id={track.id} size={size} />}</div>;
}
