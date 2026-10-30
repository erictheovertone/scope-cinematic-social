// ── /composer/[handle]/manage — composer self-service (Brief MUS-1 §4; mock §3) ──────────────────
// Owner only. Display name / bio / links (inline edit; Save publishes immediately), ALBUMS (replace
// cover, rename + year, new album), and the selected album's tracks (drag to reorder — pointer
// events, works on touch; tap a title to rename; Replace audio → a PENDING version for review).
// The GET is per-CALLER (it returns the viewer's own catalog), so a viewer whose username isn't
// this page's handle sees "Not your page" — never another user's catalog, never their own catalog
// under someone else's URL. Every write goes through /api/music/manage (ownership verified there).
// MUS-2 §3 — each track can MOVE to another album (Singles included, both ways); ticked tracks can
// become a NEW album; an empty album can be deleted. Singles can't be renamed or deleted.
// Inline errors only.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { getUserByPrivyId } from "@/lib/userService";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { fmtDur } from "@/lib/musicCatalog";
import PageScroller from "@/components/PageScroller";
import { uploadReplacementAudio, downscaleCover } from "@/components/music/manageUpload";
import {
  SKB, SKM, SKR, HAIR, DOT, MUTE, INK, LBL, TIME,
  SecHead, Act, PageHeader, ErrLine, CoverPlaceholder, albumMeta, num2,
} from "@/components/music/musicUi";

interface MAlbum { id: string; title: string; cover_url: string | null; year: number | null; position: number; is_singles: boolean }
interface MTrack { id: string; title: string; album_id: string | null; position: number; duration_seconds: number | null; status: string; artwork_url: string | null; file_url: string }
interface MProfile { display_name: string | null; username: string | null; composer_bio: string | null; composer_links: { label: string; url: string }[] | null; profile_image_url: string | null }
interface Catalog { profile: MProfile | null; albums: MAlbum[]; tracks: MTrack[]; pendingVersions: { track_id: string }[] }

const INPUT: React.CSSProperties = {
  ...SKR, width: "100%", boxSizing: "border-box", fontSize: 16, color: INK, background: "rgb(var(--ink-rgb) / 0.05)",
  border: `1px solid ${HAIR}`, borderRadius: 0, outline: "none", padding: "8px 10px",
};
const Pen = () => <i aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderLeft: `1px solid ${DOT}`, borderBottom: `1px solid ${DOT}`, transform: "rotate(-45deg) translate(2px,-2px)", marginLeft: 8, flexShrink: 0 }} />;
const FINE = "Edits to titles, covers and your bio go live immediately. Audio files stay as approved; to replace audio, submit a new version for review.";

export default function ManageMusicPage() {
  const params = useParams<{ handle: string }>();
  const handle = decodeURIComponent(String(params?.handle ?? ""));
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { ready, user, login, getAccessToken } = usePrivy();

  const [cat, setCat] = useState<Catalog | null>(null);
  const [state, setState] = useState<"loading" | "signedout" | "notyours" | "ok" | "error">("loading");
  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const api = useCallback(async (body: Record<string, unknown>) => {
    const token = await getAccessToken();
    const res = await fetch("/api/music/manage", {
      method: "POST", headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Save failed (${res.status})`);
    return j as { ok: true; id?: string };
  }, [getAccessToken]);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    const res = await fetch("/api/music/manage", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
    if (res.status === 401) { setState("signedout"); return; }
    if (!res.ok) { setState("error"); return; }
    const j = (await res.json()) as Catalog;
    // Per-caller GET → only show it on the caller's OWN page.
    if (!j.profile?.username || j.profile.username.toLowerCase() !== handle.toLowerCase()) { setCat(null); setState("notyours"); return; }
    setCat({ ...j, albums: j.albums ?? [], tracks: j.tracks ?? [], pendingVersions: j.pendingVersions ?? [] });
    setState("ok");
  }, [getAccessToken, handle]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setState("signedout"); return; }
    load().catch(() => setState("error"));
    getUserByPrivyId(user.id).then((u) => setUserUuid(u?.id ?? null)).catch(() => {});
  }, [ready, user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const albums = useMemo(() => [...(cat?.albums ?? [])].sort((a, b) => Number(a.is_singles) - Number(b.is_singles) || a.position - b.position), [cat]);
  useEffect(() => { if (!selected && albums.length) setSelected(albums[0].id); }, [albums, selected]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const t of cat?.tracks ?? []) if (t.album_id) m.set(t.album_id, (m.get(t.album_id) ?? 0) + 1); return m; }, [cat]);
  const pending = useMemo(() => new Set((cat?.pendingVersions ?? []).map((v) => v.track_id)), [cat]);
  const selAlbum = albums.find((a) => a.id === selected) ?? null;
  const albumTracks = useMemo(() => (cat?.tracks ?? []).filter((t) => t.album_id === selected).sort((a, b) => a.position - b.position), [cat, selected]);
  const unfiled = useMemo(() => (cat?.tracks ?? []).filter((t) => !t.album_id), [cat]);

  const patchCat = (fn: (c: Catalog) => Catalog) => setCat((c) => (c ? fn(c) : c));
  const back = () => router.push(`/composer/${encodeURIComponent(handle)}`);

  // ── profile fields ──────────────────────────────────────────────────────────
  const saveProfile = async (patch: Partial<Pick<MProfile, "display_name" | "composer_bio" | "composer_links">>) => {
    setErr(null);
    await api({ action: "profile", ...patch });
    await load();
  };

  // ── albums ──────────────────────────────────────────────────────────────────
  const replaceCover = async (albumId: string, file: File) => {
    setErr(null);
    try {
      const blob = await downscaleCover(file);
      const token = await getAccessToken();
      const res = await fetch(`/api/music/manage/cover?albumId=${encodeURIComponent(albumId)}`, {
        method: "POST", headers: { "content-type": blob.type || "image/jpeg", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: blob,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.cover_url) throw new Error(j.error || "Cover upload failed");
      patchCat((c) => ({ ...c, albums: c.albums.map((a) => (a.id === albumId ? { ...a, cover_url: j.cover_url } : a)) }));
    } catch (e) { setErr((e as Error).message || "Cover upload failed — try again."); }
  };
  const updateAlbum = async (albumId: string, title: string, year: string) => {
    setErr(null);
    await api({ action: "album_update", albumId, title, year: year.trim() === "" ? null : Number(year) });
    patchCat((c) => ({ ...c, albums: c.albums.map((a) => (a.id === albumId ? { ...a, title: title.trim(), year: year.trim() === "" ? null : Number(year) } : a)) }));
  };
  const createAlbum = async (title: string, year: string) => {
    setErr(null);
    const j = await api({ action: "album_create", title, year: year.trim() === "" ? null : Number(year) });
    await load();
    if (j.id) setSelected(j.id);
  };

  // ── tracks ──────────────────────────────────────────────────────────────────
  const commitOrder = async (ids: string[], albumId: string) => {
    setErr(null);
    const prev = cat;
    patchCat((c) => ({ ...c, tracks: c.tracks.map((t) => { const i = ids.indexOf(t.id); return i < 0 ? t : { ...t, album_id: albumId, position: i + 1 }; }) }));
    try { await api({ action: "reorder", albumId, trackIds: ids }); }
    catch (e) { setCat(prev); setErr((e as Error).message); }
  };
  const moveTrack = async (trackId: string, albumId: string) => {
    setErr(null);
    try { await api({ action: "move", trackId, albumId }); await load(); }
    catch (e) { setErr((e as Error).message); }
  };
  const albumFromPicked = async (title: string, year: string) => {
    setErr(null);
    const j = await api({ action: "album_from_tracks", title, year: year.trim() === "" ? null : Number(year), trackIds: picked });
    setPicked([]);
    await load();
    if (j.id) setSelected(j.id);
  };
  const deleteAlbum = async (albumId: string) => {
    setErr(null);
    try { await api({ action: "album_delete", albumId }); setSelected(null); await load(); }
    catch (e) { setErr((e as Error).message); }
  };
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const renameTrack = async (trackId: string, title: string) => {
    setErr(null);
    await api({ action: "track_rename", trackId, title });
    patchCat((c) => ({ ...c, tracks: c.tracks.map((t) => (t.id === trackId ? { ...t, title: title.trim() } : t)) }));
  };
  const replaceAudio = async (trackId: string, file: File) => {
    setErr(null);
    if (!userUuid) { setErr("Still signing you in — try again in a moment."); return; }
    const up = await uploadReplacementAudio(file, userUuid);
    await api({ action: "replace_audio", trackId, ...up });
    patchCat((c) => ({ ...c, pendingVersions: [...c.pendingVersions.filter((v) => v.track_id !== trackId), { track_id: trackId }] }));
  };

  // ── render ──────────────────────────────────────────────────────────────────
  const gate = (msg: string, action?: React.ReactNode) => (
    <div style={{ padding: "40px 20px", maxWidth: 520, margin: "0 auto" }}>
      <p style={{ ...SKM, fontSize: 18, color: INK, margin: "0 0 10px" }}>{msg}</p>
      {action}
    </div>
  );

  let body: React.ReactNode;
  if (state === "loading") body = <p style={{ ...SKR, fontSize: 13, color: MUTE, padding: "20px" }}>Loading…</p>;
  else if (state === "signedout") body = gate("Sign in to manage your music.", <Act fill onClick={login}>Sign in</Act>);
  else if (state === "notyours") body = gate("Not your page.", <p style={{ ...SKR, fontSize: 13, color: MUTE, margin: 0 }}>Only this composer can manage this music.</p>);
  else if (state === "error" || !cat) body = gate("Couldn't load your music.", <Act onClick={() => { setState("loading"); load().catch(() => setState("error")); }}>Retry</Act>);
  else {
    const p = cat.profile!;
    const left = (
      <div>
        <SecHead label="Composer page" first />
        <FieldRow label="Display name" value={p.display_name || p.username || ""} kind="text" maxLength={50}
          onSave={(v) => saveProfile({ display_name: v })} wide={isDesktop} />
        <FieldRow label="Bio" value={p.composer_bio || ""} kind="textarea" maxLength={600} placeholder="A few lines about your music"
          onSave={(v) => saveProfile({ composer_bio: v })} wide={isDesktop} />
        <LinksRow links={p.composer_links ?? []} onSave={(links) => saveProfile({ composer_links: links })} wide={isDesktop} />

        <SecHead label="Albums" aside={isDesktop ? "Click Replace cover to change it" : "Tap Replace cover to change it"} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          {albums.map((a) => (
            <ManageAlbum key={a.id} album={a} count={counts.get(a.id) ?? 0}
              cover={a.cover_url ?? cat.tracks.find((t) => t.album_id === a.id && t.artwork_url)?.artwork_url ?? null}
              selected={a.id === selected} onSelect={() => setSelected(a.id)}
              onCover={(f) => replaceCover(a.id, f)} onSave={(t, y) => updateAlbum(a.id, t, y)} />
          ))}
          <NewAlbum onCreate={createAlbum} />
        </div>
        {!isDesktop && <ErrLine msg={err} />}
      </div>
    );
    const right = (
      <div>
        {selAlbum ? (
          <>
            <SecHead label={`${selAlbum.title} · tracks`} first={isDesktop} aside={isDesktop ? "Drag to reorder · click a title to rename" : "Drag to reorder"} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }}>
              <Act small onClick={() => router.push(selAlbum.is_singles ? "/music/add" : `/music/add?album=${encodeURIComponent(selAlbum.id)}`)} testId="manage-add-tracks">Add tracks</Act>
              {!selAlbum.is_singles && albumTracks.length === 0 && (
                <Act small onClick={() => deleteAlbum(selAlbum.id)} testId="manage-delete-album">Delete album</Act>
              )}
            </div>
            {albumTracks.length === 0
              ? <p style={{ ...SKR, fontSize: 13, color: MUTE, margin: "6px 0" }}>No tracks in this album yet.</p>
              : <DragList key={selAlbum.id} tracks={albumTracks} pending={pending}
                  albums={albums} albumId={selAlbum.id} picked={picked} onPick={togglePick} onMoveTrack={moveTrack}
                  onOrder={(ids) => commitOrder(ids, selAlbum.id)} onRename={renameTrack} onReplace={replaceAudio} />}
            {picked.length > 0 && <FromPicked n={picked.length} onCreate={albumFromPicked} onClear={() => setPicked([])} />}
          </>
        ) : albums.length === 0 ? (
          <p style={{ ...SKR, fontSize: 13, color: MUTE, margin: "20px 0 6px" }}>Create an album to organise your tracks.</p>
        ) : null}

        {unfiled.length > 0 && (
          <>
            <SecHead label="Not in an album" />
            {unfiled.map((t, i) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, borderTop: `1px solid ${HAIR}`, borderBottom: i === unfiled.length - 1 ? `1px solid ${HAIR}` : "none" }}>
                <span style={{ ...SKM, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={TIME}>{fmtDur(t.duration_seconds)}</span>
                <MoveTo albums={albums} current={null} onMove={(a) => moveTrack(t.id, a)} />
              </div>
            ))}
          </>
        )}
        {isDesktop && <ErrLine msg={err} />}
        <p style={{ ...SKR, fontSize: 12, lineHeight: 1.5, color: MUTE, margin: "18px 0 0" }}>{FINE}</p>
      </div>
    );
    body = isDesktop ? (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 40, alignItems: "start" }}>{left}{right}</div>
    ) : (<>{left}{right}</>);
  }

  return (
    <PageScroller style={{ background: "var(--canvas)", paddingTop: "var(--safe-top)" }}>
      {isDesktop ? (
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 24, padding: "0 32px", borderBottom: `1px solid ${HAIR}`, maxWidth: 1200, margin: "0 auto", boxSizing: "border-box" }}>
          <button type="button" onClick={back} style={{ ...SKB, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
          <span style={{ ...LBL, flex: 1 }}>Manage music</span>
          {state === "ok" && <Act fill small onClick={back}>Done</Act>}
        </div>
      ) : (
        <PageHeader title="Manage music" onBack={back}
          right={state === "ok" ? <button type="button" onClick={back} style={{ ...SKB, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: INK, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Done</button> : null} />
      )}
      <div style={{ maxWidth: isDesktop ? 1200 : undefined, margin: "0 auto", padding: isDesktop ? "24px 32px 48px" : "0 20px 40px" }}>{body}</div>
    </PageScroller>
  );
}

// ── Field row (the mock's `.field`): label · value · pen → inline editor ─────────────────────────
function FieldRow({ label, value, kind, maxLength, placeholder, onSave, wide }: {
  label: string; value: string; kind: "text" | "textarea"; maxLength: number; placeholder?: string;
  onSave: (v: string) => Promise<void>; wide: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!edit) setDraft(value); }, [value, edit]);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await onSave(draft); setEdit(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderTop: `1px solid ${HAIR}`, padding: "14px 0" }}>
      <span style={{ ...LBL, width: wide ? 120 : 96, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      {edit ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          {kind === "textarea"
            ? <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={maxLength} rows={4} placeholder={placeholder} style={{ ...INPUT, resize: "vertical", lineHeight: 1.45 }} autoFocus />
            : <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={maxLength} placeholder={placeholder} style={INPUT} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEdit(false); }} />}
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <Act fill small onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Act>
            <Act small onClick={() => { setEdit(false); setErr(null); }} disabled={busy}>Cancel</Act>
            {kind === "textarea" && <span style={{ ...TIME, marginLeft: "auto" }}>{draft.length}/{maxLength}</span>}
          </div>
          <ErrLine msg={err} />
        </div>
      ) : (
        <button type="button" onClick={() => setEdit(true)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: INK }}>
          <span style={{ ...SKR, flex: 1, fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: value ? INK : MUTE }}>{value || placeholder || "—"}</span>
          <span style={{ paddingTop: 4 }}><Pen /></span>
        </button>
      )}
    </div>
  );
}

function LinksRow({ links, onSave, wide }: { links: { label: string; url: string }[]; onSave: (l: { label: string; url: string }[]) => Promise<void>; wide: boolean }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(links);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!edit) setDraft(links); }, [links, edit]);
  const set = (i: number, k: "label" | "url", v: string) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    setBusy(true); setErr(null);
    try { await onSave(draft.filter((l) => l.url.trim())); setEdit(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}`, padding: "14px 0" }}>
      <span style={{ ...LBL, width: wide ? 120 : 96, flexShrink: 0, paddingTop: 2 }}>Links</span>
      {edit ? (
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 8 }}>
          {draft.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.4fr) auto", gap: 6 }}>
              <input value={l.label} onChange={(e) => set(i, "label", e.target.value)} placeholder="Label" maxLength={40} style={INPUT} />
              <input value={l.url} onChange={(e) => set(i, "url", e.target.value)} placeholder="https://…" inputMode="url" style={INPUT} />
              <button type="button" aria-label="Remove link" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} style={{ ...SKR, background: "none", border: `1px solid ${HAIR}`, color: MUTE, cursor: "pointer", width: 36, fontSize: 16 }}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {draft.length < 6 && <Act small onClick={() => setDraft((d) => [...d, { label: "", url: "" }])}>Add link</Act>}
            <Act fill small onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Act>
            <Act small onClick={() => { setEdit(false); setErr(null); }} disabled={busy}>Cancel</Act>
          </div>
          <ErrLine msg={err} />
        </div>
      ) : (
        <button type="button" onClick={() => { setDraft(links.length ? links : [{ label: "", url: "" }]); setEdit(true); }} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: INK }}>
          <span style={{ ...SKR, flex: 1, fontSize: 14, lineHeight: 1.45, color: links.length ? INK : MUTE, overflowWrap: "anywhere" }}>{links.length ? links.map((l) => l.label).join(" · ") : "Add a link"}</span>
          <span style={{ paddingTop: 4 }}><Pen /></span>
        </button>
      )}
    </div>
  );
}

// ── Album tile (manage): select · Replace cover · rename + year ──────────────────────────────────
function ManageAlbum({ album, cover, count, selected, onSelect, onCover, onSave }: {
  album: MAlbum; cover: string | null; count: number; selected: boolean; onSelect: () => void;
  onCover: (f: File) => Promise<void>; onSave: (title: string, year: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(album.title);
  const [year, setYear] = useState(album.year ? String(album.year) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await onSave(title, year); setEdit(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ minWidth: 0 }}>
      <div onClick={onSelect} role="button" tabIndex={0} aria-pressed={selected}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
        style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-2)", overflow: "hidden", cursor: "pointer", outline: selected ? `2px solid ${INK}` : "none", outlineOffset: 2 }}>
        {cover ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <CoverPlaceholder title={album.title} />}
        <button type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} disabled={coverBusy}
          style={{ ...SKB, position: "absolute", left: 8, right: 8, bottom: 8, textAlign: "center", border: `1px solid ${INK}`, background: "rgb(var(--canvas-rgb) / 0.6)", color: INK, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", padding: "7px 0", cursor: "pointer" }}>
          {coverBusy ? "Uploading…" : "Replace cover"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return; setCoverBusy(true); try { await onCover(f); } finally { setCoverBusy(false); }
        }} />
      </div>
      {edit ? (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Album title" style={INPUT} autoFocus />
          <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="Year" inputMode="numeric" style={INPUT} />
          <div style={{ display: "flex", gap: 6 }}>
            <Act fill small onClick={save} disabled={busy || !title.trim()}>{busy ? "…" : "Save"}</Act>
            <Act small onClick={() => { setEdit(false); setTitle(album.title); setYear(album.year ? String(album.year) : ""); setErr(null); }}>Cancel</Act>
          </div>
          <ErrLine msg={err} />
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setEdit(true)} disabled={album.is_singles}
            style={{ ...SKM, display: "flex", alignItems: "center", width: "100%", marginTop: 8, fontSize: 14, color: INK, background: "none", border: "none", padding: 0, cursor: album.is_singles ? "default" : "pointer", textAlign: "left" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{album.title}</span>
            {!album.is_singles && <Pen />}
          </button>
          <div style={{ ...SKR, fontSize: 12, color: MUTE, marginTop: 2 }}>{albumMeta(album.year, count)}</div>
        </>
      )}
    </div>
  );
}

function NewAlbum({ onCreate }: { onCreate: (title: string, year: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    setBusy(true); setErr(null);
    try { await onCreate(title, year); setOpen(false); setTitle(""); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} style={{ aspectRatio: "1 / 1", border: `1px dashed ${DOT}`, background: "transparent", color: MUTE, cursor: "pointer", ...SKB, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
      + New album
    </button>
  );
  return (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Album title" style={INPUT} autoFocus />
      <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="Year" inputMode="numeric" style={INPUT} />
      <div style={{ display: "flex", gap: 6 }}>
        <Act fill small onClick={create} disabled={busy || !title.trim()}>{busy ? "…" : "Create"}</Act>
        <Act small onClick={() => { setOpen(false); setErr(null); }}>Cancel</Act>
      </div>
      <ErrLine msg={err} />
    </div>
  );
}

// ── Drag-to-reorder track list (pointer events: mouse + touch) ───────────────────────────────────
// Dragging from the ⋮⋮ handle live-reorders rows as the pointer crosses neighbours' midpoints; the
// handle is touch-action:none so it never fights the page scroller. On drop, if the order changed,
// the FULL order is POSTed (reorder) — reverted by the parent on failure.
function DragList({ tracks, pending, albums, albumId, picked, onPick, onMoveTrack, onOrder, onRename, onReplace }: {
  tracks: MTrack[]; pending: Set<string>;
  albums: MAlbum[]; albumId: string; picked: string[]; onPick: (id: string) => void; onMoveTrack: (trackId: string, albumId: string) => Promise<void>;
  onOrder: (ids: string[]) => void; onRename: (id: string, title: string) => Promise<void>; onReplace: (id: string, f: File) => Promise<void>;
}) {
  const [order, setOrder] = useState(() => tracks.map((t) => t.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const startOrder = useRef<string[]>([]);
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  // Parent data changed (rename, revert, add-to-album) → resync when not dragging.
  useEffect(() => { if (!dragId) setOrder(tracks.map((t) => t.id)); }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    startOrder.current = order;
    setDragId(id);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const y = e.clientY;
    setOrder((cur) => {
      const from = cur.indexOf(dragId);
      let to = from;
      for (let i = 0; i < cur.length; i++) {
        const el = rows.current.get(cur[i]); if (!el || cur[i] === dragId) continue;
        const r = el.getBoundingClientRect(); const mid = r.top + r.height / 2;
        if (i < from && y < mid) { to = i; break; }
        if (i > from && y > mid) to = i;
      }
      if (to === from) return cur;
      const next = cur.slice(); next.splice(from, 1); next.splice(to, 0, dragId);
      return next;
    });
  };
  const onUp = () => {
    if (!dragId) return;
    setDragId(null);
    if (order.join() !== startOrder.current.join()) onOrder(order);
  };

  return (
    <div onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {order.map((id, i) => {
        const t = byId.get(id); if (!t) return null;
        return (
          <div key={id} ref={(el) => { if (el) rows.current.set(id, el); else rows.current.delete(id); }}
            style={{ borderTop: `1px solid ${HAIR}`, borderBottom: i === order.length - 1 ? `1px solid ${HAIR}` : "none", background: dragId === id ? "rgb(var(--ink-rgb) / 0.06)" : "transparent" }}>
            <ManageTrackRow track={t} index={i} pending={pending.has(id)} dragging={dragId === id}
              handleProps={{ onPointerDown: onDown(id) }} onRename={(v) => onRename(id, v)} onReplace={(f) => onReplace(id, f)}
              picked={picked.includes(id)} onPick={() => onPick(id)}
              moveTo={<MoveTo albums={albums} current={albumId} onMove={(a) => onMoveTrack(id, a)} />} />
          </div>
        );
      })}
    </div>
  );
}

function ManageTrackRow({ track, index, pending, dragging, handleProps, onRename, onReplace, picked, onPick, moveTo }: {
  track: MTrack; index: number; pending: boolean; dragging: boolean;
  handleProps: { onPointerDown: (e: React.PointerEvent) => void };
  onRename: (v: string) => Promise<void>; onReplace: (f: File) => Promise<void>;
  picked: boolean; onPick: () => void; moveTo: React.ReactNode;
}) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(track.title);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saving = useRef(false); // Enter + blur both commit — one write
  const save = async () => {
    if (saving.current) return;
    if (draft.trim() === track.title || !draft.trim()) { setEdit(false); setDraft(track.title); return; }
    saving.current = true; setBusy(true); setErr(null);
    try { await onRename(draft); setEdit(false); } catch (e) { setErr((e as Error).message); } finally { saving.current = false; setBusy(false); }
  };
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 36 }}>
        <span {...handleProps} aria-label="Drag to reorder" role="button"
          style={{ color: DOT, fontSize: 14, letterSpacing: -2, width: 18, flexShrink: 0, cursor: dragging ? "grabbing" : "grab", touchAction: "none", userSelect: "none", padding: "8px 0" }}>⋮⋮</span>
        <button type="button" role="checkbox" aria-checked={picked} aria-label={`Select ${track.title}`} onClick={onPick} data-testid="manage-pick"
          style={{ width: 16, height: 16, flexShrink: 0, padding: 0, border: `1px solid ${picked ? INK : DOT}`, background: picked ? INK : "transparent", color: "var(--on-ink)", fontSize: 11, lineHeight: 1, cursor: "pointer", borderRadius: 0 }}>{picked ? "✓" : ""}</button>
        <span style={{ ...TIME, width: 22, flexShrink: 0 }}>{num2(index)}</span>
        {edit ? (
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} autoFocus readOnly={busy} style={{ ...INPUT, flex: 1, padding: "6px 8px" }}
            onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") { setEdit(false); setDraft(track.title); } }}
            onBlur={() => { void save(); }} />
        ) : (
          <button type="button" onClick={() => { setDraft(track.title); setEdit(true); }}
            style={{ ...SKM, flex: 1, minWidth: 0, display: "flex", alignItems: "center", fontSize: 14, color: INK, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: `1px dashed ${DOT}`, paddingBottom: 2 }}>{track.title}</span>
            <Pen />
          </button>
        )}
        <span style={{ ...TIME, width: 36, textAlign: "right", flexShrink: 0 }}>{fmtDur(track.duration_seconds)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 80, marginTop: 2, flexWrap: "wrap" }}>
        {track.status !== "approved" && <span style={{ ...LBL, fontSize: 10 }}>{track.status}</span>}
        {pending
          ? <span style={{ ...LBL, fontSize: 10, color: INK }}>Audio pending review</span>
          : null}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={audioBusy}
          style={{ ...SKB, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, background: "none", border: "none", padding: "4px 0", cursor: "pointer" }}>
          {audioBusy ? "Uploading…" : pending ? "Replace again" : "Replace audio"}
        </button>
        {moveTo}
        <input ref={fileRef} type="file" accept="audio/mpeg,audio/mp3,audio/aac,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/wave" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return; setAudioBusy(true); setErr(null);
          try { await onReplace(f); } catch (er) { setErr((er as Error).message || "Upload failed — try again."); } finally { setAudioBusy(false); }
        }} />
      </div>
      <ErrLine msg={err} />
    </div>
  );
}

// ── MUS-2 §3 — "Move to…" (any other album, Singles included) ────────────────────────────────────
function MoveTo({ albums, current, onMove }: { albums: MAlbum[]; current: string | null; onMove: (albumId: string) => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const others = albums.filter((a) => a.id !== current);
  if (!others.length) return null;
  return (
    <select value="" disabled={busy} aria-label="Move to album" data-testid="manage-move"
      onChange={async (e) => { const v = e.target.value; if (!v) return; setBusy(true); try { await onMove(v); } finally { setBusy(false); } }}
      style={{ ...SKB, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE, background: "transparent", border: "none", padding: "4px 0", cursor: "pointer", maxWidth: 160 }}>
      <option value="">{busy ? "Moving…" : "Move to…"}</option>
      {others.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
    </select>
  );
}

// ── MUS-2 §3 — a new album from the ticked tracks ────────────────────────────────────────────────
function FromPicked({ n, onCreate, onClear }: { n: number; onCreate: (title: string, year: string) => Promise<void>; onClear: () => void }) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onCreate(title, year); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 14, padding: 12, border: `1px solid ${INK}`, display: "grid", gap: 8 }} data-testid="manage-from-picked">
      <span style={LBL}>New album from {n} selected {n === 1 ? "track" : "tracks"}</span>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 88px", gap: 6 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Album title" style={INPUT} data-testid="manage-from-picked-title" />
        <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="Year" inputMode="numeric" style={INPUT} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Act fill small onClick={go} disabled={busy || !title.trim()} testId="manage-from-picked-create">{busy ? "…" : "Create album"}</Act>
        <Act small onClick={onClear} disabled={busy}>Clear selection</Act>
      </div>
      <ErrLine msg={err} />
    </div>
  );
}
