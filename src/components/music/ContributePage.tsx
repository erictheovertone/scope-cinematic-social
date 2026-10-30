// ── ContributePage — the composer contribution flow, as a page (Brief MUS-2 §1) ──────────────────
// Replaces the mobile-width ContributeMusicFlow sheet. Designed for desktop, stacked on mobile from
// the same parts:
//   RELEASE (left ≥1024 / top <1024) — New album (title · year · square cover) | Single tracks
//   (→ Singles) | Add to existing album (dropdown); release-wide keywords; the license.
//   TRACKS (right / below) — a drop zone for many files at once; each row = thumb · editable title
//   (filename) · duration · waveform once analyzed · status (analyzing / ready / error) · ×; drag
//   the ⋮⋮ handle to reorder — that order IS the album position. A row can override the release
//   keywords ("Tags").
//   FOOTER — "Submit for review" + "3 tracks · Auburn".
// Mechanics kept from the sheet: direct-to-storage upload (/api/music/sign → Supabase signed PUT),
// peaks decoded client-side, abandoned uploads deleted on leave. Submission is ONE verified call
// (/api/music/release) that places the album + positioned tracks; a new album's cover is baked
// after it exists (/api/music/manage/cover). Approval is unchanged — tracks wait in /admin/music.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId } from "@/lib/userService";
import { supabase } from "@/lib/supabase/client";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { peaksFromFile } from "@/lib/waveform";
import { fmtDur } from "@/lib/musicCatalog";
import {
  MUSIC_TAXONOMY, KEYWORDS_MIN, KEYWORDS_MAX, TITLE_MAX,
  AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, AUDIO_MIME_EXT, MUSIC_LICENSE_COPY,
} from "@/lib/musicTaxonomy";
import PageScroller from "@/components/PageScroller";
import TrackArt from "@/components/TrackArt";
import Waveform from "@/components/Waveform";
import { downscaleCover } from "@/components/music/manageUpload";
import {
  SKB, SKM, SKR, HAIR, DOT, MUTE, INK, LBL, TIME,
  SecHead, Act, PageHeader, ErrLine, CoverPlaceholder,
} from "@/components/music/musicUi";

const RELEASE_MAX = 24;
const INPUT: React.CSSProperties = {
  ...SKR, width: "100%", boxSizing: "border-box", fontSize: 16, color: INK, background: "rgb(var(--ink-rgb) / 0.05)",
  border: `1px solid ${HAIR}`, borderRadius: 0, outline: "none", padding: "9px 10px",
};

type Target = "album" | "singles" | "existing";
interface MAlbum { id: string; title: string; cover_url: string | null; year: number | null; is_singles: boolean }
interface Row {
  localId: string; file: File; trackId: string; title: string; duration: number;
  fileUrl: string | null; failed: boolean;
  peaks: number[] | null | undefined; // undefined = still analyzing
  keywords: string[] | null;          // null = the release keywords
  artUrl: string | null; artBusy: boolean;
}
type Status = "analyzing" | "ready" | "error";
const statusOf = (r: Row): Status => (r.failed ? "error" : r.fileUrl && r.peaks !== undefined ? "ready" : "analyzing");

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const cleanTitle = (name: string) => name.replace(/\.[^.]+$/, "").trim().slice(0, TITLE_MAX);
function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => { const d = isFinite(el.duration) ? el.duration : 0; try { URL.revokeObjectURL(el.src); } catch {} resolve(d); };
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(file);
  });
}
async function directUpload(file: File, userId: string, trackId: string): Promise<string> {
  const ext = AUDIO_MIME_EXT[(file.type || "").toLowerCase()];
  if (!ext) throw new Error("unsupported audio type");
  const res = await fetch("/api/music/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, trackId, ext }) });
  const sign = await res.json().catch(() => ({}));
  if (!res.ok || !sign.token || !sign.path || !sign.publicUrl) throw new Error(sign.error || "sign failed");
  const { error } = await supabase.storage.from("music").uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type });
  if (error) throw error;
  return sign.publicUrl as string;
}

export default function ContributePage() {
  const router = useRouter();
  const search = useSearchParams();
  const isDesktop = useIsDesktop();
  const { ready, user, login, getAccessToken } = usePrivy();

  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [albums, setAlbums] = useState<MAlbum[]>([]);
  const [target, setTarget] = useState<Target>("album");
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumYear, setAlbumYear] = useState(String(new Date().getFullYear()));
  const [cover, setCover] = useState<{ file: File; preview: string } | null>(null);
  const [existingId, setExistingId] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [tagsOpen, setTagsOpen] = useState<string | null>(null);
  const [licensed, setLicensed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ n: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const artInput = useRef<HTMLInputElement>(null);
  const artFor = useRef<string | null>(null);

  const rowsRef = useRef<Row[]>([]);
  const uidRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { uidRef.current = userUuid; }, [userUuid]);
  const patchRow = (localId: string, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.localId === localId ? { ...r, ...p } : r)));

  // ── who + their albums ──
  useEffect(() => {
    if (!ready || !user) return;
    let dead = false;
    getUserByPrivyId(user.id).then((u) => { if (!dead && u) setUserUuid(u.id); }).catch(() => {});
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/music/manage", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      if (!res.ok || dead) return;
      const j = await res.json();
      setHandle(j.profile?.username ?? null);
      const list = ((j.albums ?? []) as MAlbum[]);
      setAlbums(list);
      const want = search?.get("album");
      if (want && list.some((a) => a.id === want && !a.is_singles)) { setTarget("existing"); setExistingId(want); }
    })().catch(() => {});
    return () => { dead = true; };
  }, [ready, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile: the flow is a focused page — hide the footer pill while it's open (same flag the sheet used).
  useEffect(() => {
    if (isDesktop) return;
    const had = document.documentElement.dataset.suiteOpen;
    document.documentElement.dataset.suiteOpen = "1";
    window.dispatchEvent(new CustomEvent("scope:takeover-change"));
    return () => { if (!had) delete document.documentElement.dataset.suiteOpen; window.dispatchEvent(new CustomEvent("scope:takeover-change")); };
  }, [isDesktop]);

  // Abandon cleanup — uploaded-but-unsubmitted audio + art are deleted when the page goes away.
  useEffect(() => () => {
    if (submittedRef.current) return;
    const urls = rowsRef.current.flatMap((r) => [r.fileUrl, r.artUrl]).filter((u): u is string => !!u);
    const uid = uidRef.current;
    if (urls.length && uid) fetch("/api/music/upload", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: uid, fileUrls: urls }), keepalive: true }).catch(() => {});
  }, []);
  useEffect(() => () => { if (cover) URL.revokeObjectURL(cover.preview); }, [cover]);

  // ── files ──
  const upload = useCallback(async (row: Row) => {
    const uid = uidRef.current;
    if (!uid) { patchRow(row.localId, { failed: true }); return; }
    patchRow(row.localId, { failed: false });
    try { patchRow(row.localId, { fileUrl: await directUpload(row.file, uid, row.trackId) }); }
    catch { patchRow(row.localId, { failed: true }); }
  }, []);

  const addFiles = async (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    setErr(null);
    const list = Array.from(files);
    const room = RELEASE_MAX - rowsRef.current.length;
    if (room <= 0) { setErr(`Up to ${RELEASE_MAX} tracks per release.`); return; }
    const accepted: Row[] = [];
    for (const file of list.slice(0, room)) {
      if (!AUDIO_MIME_EXT[(file.type || "").toLowerCase()]) { setErr(`${file.name}: use MP3, AAC or WAV.`); continue; }
      if (file.size > AUDIO_MAX_BYTES) { setErr(`${file.name}: too large (max 15MB).`); continue; }
      const duration = await readAudioDuration(file);
      if (duration > AUDIO_MAX_SECONDS + 5) { setErr(`${file.name}: too long (max ~6 min).`); continue; }
      accepted.push({ localId: newId(), file, trackId: newId(), title: cleanTitle(file.name), duration, fileUrl: null, failed: false, peaks: undefined, keywords: null, artUrl: null, artBusy: false });
    }
    if (list.length > room) setErr(`Only ${room} more fit in this release (max ${RELEASE_MAX}).`);
    if (!accepted.length) return;
    setRows((cur) => [...cur, ...accepted]);
    for (const r of accepted) {
      void upload(r);
      // Peaks are decoded locally (serialized in waveform.ts); a file that won't decode still submits — the
      // waveform self-heals from the stored file on first view.
      peaksFromFile(r.file).then((p) => patchRow(r.localId, { peaks: p.length ? p : null })).catch(() => patchRow(r.localId, { peaks: null }));
    }
  };

  const removeRow = (localId: string) => {
    const row = rowsRef.current.find((r) => r.localId === localId);
    const urls = [row?.fileUrl, row?.artUrl].filter((u): u is string => !!u);
    if (urls.length && uidRef.current) fetch("/api/music/upload", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: uidRef.current, fileUrls: urls }), keepalive: true }).catch(() => {});
    setRows((cur) => cur.filter((r) => r.localId !== localId));
  };

  // Single tracks carry their own art (an album's tracks wear the album cover).
  const onArt = async (file: File | undefined) => {
    const localId = artFor.current; const uid = uidRef.current;
    const row = rowsRef.current.find((r) => r.localId === localId);
    if (!file || !row || !uid) return;
    patchRow(row.localId, { artBusy: true });
    try {
      const blob = await downscaleCover(file);
      const res = await fetch(`/api/music/artwork?userId=${encodeURIComponent(uid)}&trackId=${encodeURIComponent(row.trackId)}`, { method: "POST", headers: { "content-type": blob.type || "image/jpeg" }, body: blob });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      patchRow(row.localId, { artUrl: j.artwork_url ?? null, artBusy: false });
    } catch { patchRow(row.localId, { artBusy: false }); setErr("Artwork upload failed — try again."); }
  };

  // ── derived ──
  const realAlbums = albums.filter((a) => !a.is_singles);
  const existing = realAlbums.find((a) => a.id === existingId) ?? null;
  const releaseName = target === "album" ? albumTitle.trim() : target === "singles" ? "Singles" : existing?.title ?? "";
  const kwOf = (r: Row) => r.keywords ?? keywords;
  const kwOk = (k: string[]) => k.length >= KEYWORDS_MIN && k.length <= KEYWORDS_MAX;
  const nAnalyzing = rows.filter((r) => statusOf(r) === "analyzing").length;
  const nError = rows.filter((r) => statusOf(r) === "error").length;
  const blocker = useMemo(() => {
    if (!rows.length) return "Add audio files";
    if (target === "album" && !albumTitle.trim()) return "Name the album";
    if (target === "album" && /^singles$/i.test(albumTitle.trim())) return "“Singles” is reserved — pick another title";
    if (target === "existing" && !existing) return "Choose an album";
    if (nAnalyzing) return `${nAnalyzing} analyzing…`;
    if (nError) return `${nError} failed — retry or remove`;
    if (rows.some((r) => !r.title.trim())) return "Every track needs a title";
    if (rows.some((r) => !kwOk(kwOf(r)))) return `Pick ${KEYWORDS_MIN}–${KEYWORDS_MAX} keywords`;
    if (!licensed) return "Agree to the license";
    if (!userUuid) return "Signing you in…";
    return null;
  }, [rows, target, albumTitle, existing, nAnalyzing, nError, keywords, licensed, userUuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (blocker || submitting) return;
    setSubmitting(true); setErr(null);
    try {
      const token = await getAccessToken();
      const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const body = {
        target,
        ...(target === "album" ? { album: { title: albumTitle.trim(), year: albumYear.trim() || null } } : {}),
        ...(target === "existing" ? { albumId: existingId } : {}),
        tracks: rowsRef.current.map((r) => ({
          id: r.trackId, title: r.title.trim(), keywords: kwOf(r), durationSeconds: Math.round(r.duration),
          fileUrl: r.fileUrl, artworkUrl: target === "singles" ? r.artUrl : null, waveformPeaks: r.peaks ?? null,
        })),
      };
      const res = await fetch("/api/music/release", { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Submit failed (${res.status})`);
      submittedRef.current = true;
      // The album exists now → bake its cover (editable later from Manage music; a failure here never
      // undoes the release).
      if (target === "album" && cover && j.albumId) {
        try {
          const blob = await downscaleCover(cover.file);
          await fetch(`/api/music/manage/cover?albumId=${encodeURIComponent(j.albumId)}`, { method: "POST", headers: { "content-type": blob.type || "image/jpeg", ...auth }, body: blob });
        } catch { /* cover is optional now, editable later */ }
      }
      fetch("/api/music/notify-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count: rows.length }), keepalive: true }).catch(() => {});
      setDone({ n: rows.length, name: releaseName });
    } catch (e) { setErr((e as Error).message); }
    finally { setSubmitting(false); }
  };

  const back = () => { if (window.history.length > 1) router.back(); else router.push(handle ? `/composer/${encodeURIComponent(handle)}` : "/library"); };
  const count = `${rows.length} ${rows.length === 1 ? "track" : "tracks"}${releaseName ? ` · ${releaseName}` : ""}`;

  // ── RELEASE panel ──
  const choice = (t: Target, label: string, disabled = false) => (
    <button type="button" role="radio" aria-checked={target === t} disabled={disabled} data-testid={`release-${t}`}
      onClick={() => setTarget(t)}
      style={{ ...SKB, flex: 1, minWidth: 0, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", padding: "11px 6px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
        border: `1px solid ${target === t ? INK : HAIR}`, background: target === t ? INK : "transparent", color: target === t ? "var(--on-ink)" : INK, borderRadius: 0 }}>
      {label}
    </button>
  );
  const release = (
    <section aria-label="Release">
      <SecHead label="Release" first />
      <div role="radiogroup" aria-label="Where these tracks go" style={{ display: "flex", gap: 6 }}>
        {choice("album", "New album")}
        {choice("singles", "Single tracks")}
        {choice("existing", "Existing album", realAlbums.length === 0)}
      </div>

      {target === "album" && (
        <div style={{ display: "grid", gridTemplateColumns: "112px minmax(0, 1fr)", gap: 14, marginTop: 16, alignItems: "start" }}>
          <button type="button" onClick={() => coverInput.current?.click()} aria-label={cover ? "Change cover" : "Add cover"} data-testid="album-cover"
            style={{ position: "relative", width: 112, aspectRatio: "1 / 1", padding: 0, border: cover ? "none" : `1px dashed ${DOT}`, background: "var(--surface-2)", cursor: "pointer", overflow: "hidden" }}>
            {cover ? <img src={cover.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <span style={{ ...LBL, fontSize: 10, display: "block", padding: 8, lineHeight: 1.4 }}>+ Cover<br /><span style={{ ...SKR, textTransform: "none", letterSpacing: 0 }}>square · optional</span></span>}
          </button>
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ ...LBL, fontSize: 10 }}>Album title</span>
              <input value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value.slice(0, TITLE_MAX))} placeholder="Required" style={INPUT} data-testid="album-title" />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ ...LBL, fontSize: 10 }}>Year</span>
              <input value={albumYear} onChange={(e) => setAlbumYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} inputMode="numeric" style={{ ...INPUT, width: 96 }} data-testid="album-year" />
            </label>
          </div>
          <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) setCover({ file: f, preview: URL.createObjectURL(f) });
          }} />
        </div>
      )}
      {target === "singles" && (
        <p style={{ ...SKR, fontSize: 13, lineHeight: 1.5, color: MUTE, margin: "14px 0 0" }}>
          Each track lands in your <b style={{ color: INK }}>Singles</b>. Tap a track&rsquo;s artwork to give it its own cover.
        </p>
      )}
      {target === "existing" && (
        <label style={{ display: "grid", gap: 4, marginTop: 16 }}>
          <span style={{ ...LBL, fontSize: 10 }}>Album</span>
          <select value={existingId} onChange={(e) => setExistingId(e.target.value)} style={{ ...INPUT, appearance: "auto" }} data-testid="album-select">
            <option value="">Choose…</option>
            {realAlbums.map((a) => <option key={a.id} value={a.id}>{a.title}{a.year ? ` (${a.year})` : ""}</option>)}
          </select>
          <span style={{ ...SKR, fontSize: 12, color: MUTE }}>New tracks are added after the album&rsquo;s last track.</span>
        </label>
      )}

    </section>
  );
  // Keywords + license — the left column's tail on desktop; below the tracks on mobile, so the files
  // you just chose are on screen right under the release choice.
  const releaseMeta = (
    <section aria-label="Keywords and license">
      <SecHead label="Keywords" aside={`${keywords.length}/${KEYWORDS_MAX} · every track`} />
      <Chips value={keywords} onChange={setKeywords} />

      <SecHead label="License" />
      <p style={{ ...SKR, fontSize: 12, lineHeight: 1.5, color: MUTE, margin: "0 0 10px" }}>{MUSIC_LICENSE_COPY}</p>
      <button type="button" role="checkbox" aria-checked={licensed} onClick={() => setLicensed((v) => !v)} data-testid="license"
        style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
        <span style={{ width: 18, height: 18, flexShrink: 0, border: `1px solid ${licensed ? INK : DOT}`, background: licensed ? INK : "transparent", display: "grid", placeItems: "center", ...SKB, fontSize: 12, color: "var(--on-ink)" }}>{licensed ? "✓" : ""}</span>
        <span style={{ ...SKR, fontSize: 13, color: INK }}>I own {rows.length > 1 ? "these tracks" : "this music"} and agree to the license.</span>
      </button>
    </section>
  );

  // ── TRACKS panel ──
  const thumb = (r: Row) => {
    if (target === "album") return cover ? <img src={cover.preview} alt="" style={{ width: 44, height: 44, objectFit: "cover", display: "block" }} /> : <div style={{ width: 44, height: 44, background: "var(--surface-2)" }}><CoverPlaceholder title={albumTitle || r.title} /></div>;
    if (target === "existing" && existing) return existing.cover_url ? <img src={existing.cover_url} alt="" style={{ width: 44, height: 44, objectFit: "cover", display: "block" }} /> : <div style={{ width: 44, height: 44, background: "var(--surface-2)" }}><CoverPlaceholder title={existing.title} /></div>;
    return (
      <button type="button" onClick={() => { artFor.current = r.localId; artInput.current?.click(); }} aria-label="Track artwork" disabled={r.artBusy || target !== "singles"}
        style={{ padding: 0, border: "none", background: "none", cursor: target === "singles" ? "pointer" : "default", opacity: r.artBusy ? 0.5 : 1, display: "block" }}>
        <TrackArt url={r.artUrl} title={r.title} id={r.trackId} size={44} />
      </button>
    );
  };
  const tracks = (
    <section aria-label="Tracks">
      <SecHead label="Tracks" first={isDesktop} aside={rows.length > 1 ? "Drag ⋮⋮ to set the order" : undefined} />
      <div
        role="button" tabIndex={0} data-testid="dropzone"
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
        style={{
          border: `1px dashed ${dragOver ? INK : DOT}`, background: dragOver ? "rgb(var(--ink-rgb) / 0.06)" : "rgb(var(--ink-rgb) / 0.02)",
          padding: rows.length ? "16px" : isDesktop ? "72px 24px" : "40px 16px", textAlign: "center", cursor: "pointer",
        }}>
        <p style={{ ...SKB, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: INK, margin: "0 0 6px" }}>
          {isDesktop ? (rows.length ? "Drop more audio, or click to choose" : "Drop audio files here, or click to choose") : rows.length ? "Add more audio" : "Choose audio files"}
        </p>
        <p style={{ ...SKR, fontSize: 12, color: MUTE, margin: 0 }}>MP3 · AAC · WAV — up to 15MB and ~6 min each · {rows.length}/{RELEASE_MAX}</p>
      </div>
      <input ref={fileInput} type="file" multiple accept="audio/mpeg,audio/aac,audio/mp4,audio/x-m4a,audio/wav,audio/*" hidden data-testid="audio-input"
        onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={artInput} type="file" accept="image/*" hidden onChange={(e) => { void onArt(e.target.files?.[0]); e.target.value = ""; }} />

      {rows.length > 0 && (
        <TrackList rows={rows} setRows={setRows} isDesktop={isDesktop} thumb={thumb}
          onTitle={(id, t) => patchRow(id, { title: t.slice(0, TITLE_MAX) })}
          onRemove={removeRow} onRetry={(r) => void upload(r)}
          tagsOpen={tagsOpen} setTagsOpen={setTagsOpen}
          releaseKw={keywords} onRowKw={(id, k) => patchRow(id, { keywords: k })} />
      )}
    </section>
  );

  // ── page ──
  let body: React.ReactNode;
  if (!ready) body = <p style={{ ...SKR, fontSize: 13, color: MUTE, padding: 20 }}>Loading…</p>;
  else if (!user) body = (
    <div style={{ padding: "40px 0", maxWidth: 520 }}>
      <p style={{ ...SKM, fontSize: 18, color: INK, margin: "0 0 12px" }}>Sign in to contribute music.</p>
      <Act fill onClick={login}>Sign in</Act>
    </div>
  );
  else if (done) body = (
    <div style={{ padding: isDesktop ? "48px 0" : "24px 0", maxWidth: 560 }} data-testid="release-done">
      <p style={{ ...LBL, margin: "0 0 10px" }}>Submitted for review</p>
      <p style={{ ...SKM, fontSize: 24, color: INK, margin: "0 0 10px", lineHeight: 1.15 }}>{done.n} {done.n === 1 ? "track" : "tracks"} · {done.name}</p>
      <p style={{ ...SKR, fontSize: 14, lineHeight: 1.5, color: MUTE, margin: "0 0 24px" }}>
        You&rsquo;ll be notified as each track is approved. {target === "album" ? "The album is on your Manage music page now and goes public with its first approved track." : ""} Approved contributors earn the COMPOSER badge.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {handle && <Act fill onClick={() => router.push(`/composer/${encodeURIComponent(handle)}/manage`)}>Manage music</Act>}
        <Act onClick={() => { submittedRef.current = false; setRows([]); setDone(null); setLicensed(false); setAlbumTitle(""); setCover(null); }}>Add more</Act>
      </div>
    </div>
  );
  else body = isDesktop ? (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 400px) minmax(0, 1fr)", gap: 48, alignItems: "start" }}>
      <div>{release}{releaseMeta}</div>{tracks}
    </div>
  ) : (<>{release}<div style={{ height: 8 }} />{tracks}{releaseMeta}</>);

  const showFooter = ready && !!user && !done;
  return (
    <PageScroller style={{ background: "var(--canvas)", paddingTop: "var(--safe-top)" }} chrome={false}>
      {isDesktop ? (
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 24, padding: "0 32px", borderBottom: `1px solid ${HAIR}`, maxWidth: 1200, margin: "0 auto", boxSizing: "border-box" }}>
          <button type="button" onClick={back} style={{ ...SKB, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
          <span style={{ ...LBL, flex: 1, color: INK }}>Add music</span>
        </div>
      ) : (
        <PageHeader title="Add music" onBack={back} />
      )}
      <div style={{ maxWidth: isDesktop ? 1200 : undefined, margin: "0 auto", padding: isDesktop ? "28px 32px 40px" : "0 20px 28px", boxSizing: "border-box" }}>
        {body}
      </div>
      {showFooter && (
        <div style={{ position: "sticky", bottom: 0, zIndex: 2, background: "var(--canvas)", borderTop: `1px solid ${HAIR}` }}>
          <div style={{ maxWidth: isDesktop ? 1200 : undefined, margin: "0 auto", boxSizing: "border-box", padding: isDesktop ? "14px 32px" : "12px 20px calc(12px + var(--safe-bottom))", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...SKM, fontSize: 14, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} data-testid="release-count">{count}</div>
              <div style={{ ...SKR, fontSize: 12, color: MUTE, marginTop: 2 }}>{err ?? blocker ?? "Ready — tracks wait for review before they go public."}</div>
            </div>
            <Act fill onClick={submit} disabled={!!blocker || submitting} testId="release-submit">{submitting ? "Submitting…" : "Submit for review"}</Act>
          </div>
        </div>
      )}
      {!showFooter && <ErrLine msg={err} />}
    </PageScroller>
  );
}

// ── keyword chips (the taxonomy, grouped) ────────────────────────────────────────────────────────
function Chips({ value, onChange }: { value: string[]; onChange: (k: string[]) => void }) {
  const toggle = (w: string) => onChange(value.includes(w) ? value.filter((x) => x !== w) : value.length >= KEYWORDS_MAX ? value : [...value, w]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {MUSIC_TAXONOMY.map((g) => (
        <div key={g.label}>
          <p style={{ ...LBL, fontSize: 10, margin: "0 0 6px" }}>{g.label}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {g.words.map((w) => {
              const on = value.includes(w);
              return (
                <button key={w} type="button" onClick={() => toggle(w)} aria-pressed={on} data-testid={`kw-${w}`}
                  style={{ ...SKR, fontSize: 12, textTransform: "lowercase", padding: "5px 10px", cursor: "pointer", borderRadius: 0,
                    color: on ? "var(--on-ink)" : INK, background: on ? INK : "transparent", border: `1px solid ${on ? INK : HAIR}` }}>{w}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── the track list: drag the handle to reorder (pointer events — mouse + touch) ──────────────────
function TrackList({ rows, setRows, isDesktop, thumb, onTitle, onRemove, onRetry, tagsOpen, setTagsOpen, releaseKw, onRowKw }: {
  rows: Row[]; setRows: React.Dispatch<React.SetStateAction<Row[]>>; isDesktop: boolean; thumb: (r: Row) => React.ReactNode;
  onTitle: (id: string, t: string) => void; onRemove: (id: string) => void; onRetry: (r: Row) => void;
  tagsOpen: string | null; setTagsOpen: (id: string | null) => void;
  releaseKw: string[]; onRowKw: (id: string, k: string[] | null) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const onMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const y = e.clientY;
    setRows((cur) => {
      const from = cur.findIndex((r) => r.localId === dragId);
      let to = from;
      for (let i = 0; i < cur.length; i++) {
        const el = els.current.get(cur[i].localId); if (!el || i === from) continue;
        const b = el.getBoundingClientRect(); const mid = b.top + b.height / 2;
        if (i < from && y < mid) { to = i; break; }
        if (i > from && y > mid) to = i;
      }
      if (to === from) return cur;
      const next = cur.slice(); const [m] = next.splice(from, 1); next.splice(to, 0, m);
      return next;
    });
  };
  const end = () => setDragId(null);
  return (
    <div onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} style={{ marginTop: 14 }} data-testid="track-list">
      {rows.map((r, i) => {
        const st = statusOf(r);
        const kw = r.keywords ?? releaseKw;
        return (
          <div key={r.localId} ref={(el) => { if (el) els.current.set(r.localId, el); else els.current.delete(r.localId); }}
            data-testid="track-row" data-status={st}
            style={{ borderTop: `1px solid ${HAIR}`, borderBottom: i === rows.length - 1 ? `1px solid ${HAIR}` : "none", padding: "10px 0", background: dragId === r.localId ? "rgb(var(--ink-rgb) / 0.06)" : "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span role="button" aria-label="Drag to reorder" data-testid="drag-handle"
                onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setDragId(r.localId); }}
                style={{ color: DOT, fontSize: 14, letterSpacing: -2, width: 16, flexShrink: 0, cursor: dragId ? "grabbing" : "grab", touchAction: "none", userSelect: "none", padding: "10px 0" }}>⋮⋮</span>
              <span style={{ ...TIME, width: 20, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ flexShrink: 0 }}>{thumb(r)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input value={r.title} onChange={(e) => onTitle(r.localId, e.target.value)} aria-label="Track title" data-testid="track-title"
                  style={{ ...SKM, width: "100%", boxSizing: "border-box", fontSize: isDesktop ? 14 : 16, color: INK, background: "transparent", border: "none", borderBottom: `1px solid ${r.title.trim() ? HAIR : INK}`, outline: "none", padding: "3px 0", borderRadius: 0 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                  <span style={TIME}>{fmtDur(r.duration) || "–:––"}</span>
                  <span data-testid="track-status" style={{ ...LBL, fontSize: 10, color: st === "ready" ? INK : MUTE }}>{st === "error" ? "Error" : st === "analyzing" ? "Analyzing…" : "Ready"}</span>
                  {st === "error" && <button type="button" onClick={() => onRetry(r)} style={{ ...SKB, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: INK, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>Retry</button>}
                  <button type="button" onClick={() => setTagsOpen(tagsOpen === r.localId ? null : r.localId)} data-testid="track-tags"
                    style={{ ...SKR, fontSize: 11, color: kw.length >= KEYWORDS_MIN ? MUTE : INK, background: "none", border: "none", padding: 0, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isDesktop ? 280 : 180 }}>
                    {r.keywords ? `Tags: ${kw.join(" · ") || "none"}` : kw.length ? `Tags: release (${kw.length})` : "Tags: none yet"}
                  </button>
                </div>
              </div>
              {isDesktop && (
                <div style={{ width: 220, flexShrink: 0, opacity: st === "ready" ? 1 : 0.35 }} aria-hidden={st !== "ready"}>
                  {st === "ready" ? <Waveform peaks={r.peaks} height={28} /> : <div style={{ height: 28, background: "repeating-linear-gradient(90deg, rgb(var(--ink-rgb) / 0.12) 0 2px, transparent 2px 5px)" }} />}
                </div>
              )}
              <button type="button" onClick={() => onRemove(r.localId)} aria-label={`Remove ${r.title}`} data-testid="track-remove"
                style={{ ...SKR, flexShrink: 0, width: 32, height: 32, fontSize: 18, lineHeight: 1, color: MUTE, background: "none", border: "none", cursor: "pointer", padding: 0 }}>×</button>
            </div>
            {!isDesktop && st === "ready" && r.peaks && (
              <div style={{ margin: "8px 0 0 48px" }}><Waveform peaks={r.peaks} height={22} /></div>
            )}
            {tagsOpen === r.localId && (
              <div style={{ margin: "12px 0 4px", paddingLeft: isDesktop ? 48 : 0 }}>
                <Chips value={kw} onChange={(k) => onRowKw(r.localId, k)} />
                {r.keywords && <button type="button" onClick={() => onRowKw(r.localId, null)} style={{ ...SKB, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, background: "none", border: "none", padding: "10px 0 0", cursor: "pointer" }}>Use the release keywords</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
