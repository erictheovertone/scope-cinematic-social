"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { supabase } from "@/lib/supabase/client";
import { getUserByPrivyId, getProfileLinks, saveProfileLinks, type ProfileLink } from "@/lib/userService";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

type LinkDraft = Omit<ProfileLink, "id" | "created_at"> & { id?: string };

export default function LinkManager() {
  const router = useRouter();
  const { user } = usePrivy();
  const [mounted, setMounted] = useState(false);
  const [privyUserId, setPrivyUserId] = useState("");
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [pendingLink, setPendingLink] = useState<LinkDraft | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [uploadingThumb, setUploadingThumb] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const sbUser = await getUserByPrivyId(user.id);
        if (!sbUser) return;
        setPrivyUserId(user.id);
        const existing = await getProfileLinks(user.id);
        setLinks(existing);
      } catch (e) {
        console.error("LinkManager load error:", e);
      }
    };
    load();
  }, [user?.id]);

  const fetchPreview = async (url: string) => {
    if (!url.trim()) return;
    setFetchingPreview(true);
    setPendingLink(null);
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      setPendingLink({
        user_id: privyUserId,
        url,
        title: data.title || "",
        thumbnail_url: data.thumbnail_url || null,
        video_url: data.video_url || null,
        is_video: data.is_video || false,
        position: links.length,
        description: null,
        custom_thumbnail_url: null,
      });
    } catch {
      setPendingLink({
        user_id: privyUserId,
        url,
        title: "",
        thumbnail_url: null,
        video_url: null,
        is_video: false,
        position: links.length,
        description: null,
        custom_thumbnail_url: null,
      });
    } finally {
      setFetchingPreview(false);
    }
  };

  const handleCustomThumbUpload = async (idx: number, file: File) => {
    setUploadingThumb(idx);
    try {
      // Compress via canvas
      const bitmap = await createImageBitmap(file);
      const MAX = 800;
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.82));

      const filename = `link-thumb-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from("profile-images").upload(filename, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("profile-images").getPublicUrl(data.path);
      setLinks(prev => prev.map((l, j) => j === idx ? { ...l, custom_thumbnail_url: pub.publicUrl } : l));
    } catch (e) {
      console.error("Thumbnail upload error:", e);
    } finally {
      setUploadingThumb(null);
    }
  };

  const handleSave = async () => {
    if (!privyUserId) return;
    setSaving(true);
    try {
      await saveProfileLinks(
        privyUserId,
        links.map((l, i) => ({
          user_id: privyUserId,
          title: l.title,
          url: l.url,
          thumbnail_url: l.thumbnail_url,
          video_url: l.video_url,
          is_video: l.is_video,
          position: i,
          description: l.description ?? null,
          custom_thumbnail_url: l.custom_thumbnail_url ?? null,
        })),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error("saveProfileLinks error:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return <div className="bg-black" style={{ position: "fixed", inset: 0 }} />;

  return (
    <div className="bg-black" style={{ position: "fixed", inset: 0, overflowY: "auto" }}>

      {/* Header */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "14px 16px" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#FF0000", flexShrink: 0, marginRight: 10 }} />
        <button
          onClick={() => router.back()}
          style={{ ...MONO, fontSize: 11, color: "white", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          ← Back
        </button>
        <span style={{ ...MONO, fontSize: 11, color: "white", position: "absolute", left: "50%", transform: "translateX(-50%)", letterSpacing: "0.05em" }}>
          LINK MANAGER
        </span>
        {links.length > 0 && !addingLink && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...MONO, fontSize: 11, color: saved ? "#FF0000" : "white", background: "none", border: "none", cursor: "pointer", padding: 0, marginLeft: "auto", opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "SAVE"}
          </button>
        )}
      </div>

      <div style={{ height: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />

      <div style={{ padding: "16px 20px 40px" }}>

        {/* Existing links */}
        {links.map((link, i) => {
          const isExpanded = expandedIdx === i;
          const thumbSrc = link.custom_thumbnail_url || link.thumbnail_url;
          return (
            <div key={i} style={{ marginBottom: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              {/* Summary row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                <div
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  style={{ width: 36, height: 36, flexShrink: 0, overflow: "hidden", background: "#1a1a1a", cursor: "pointer" }}
                >
                  {thumbSrc
                    ? <img src={thumbSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <div style={{ width: "100%", height: "100%" }} />}
                </div>
                <div style={{ flex: 1, overflow: "hidden", cursor: "pointer" }} onClick={() => setExpandedIdx(isExpanded ? null : i)}>
                  <input
                    value={link.title || ""}
                    onChange={e => setLinks(prev => prev.map((l, j) => j === i ? { ...l, title: e.target.value } : l))}
                    onClick={e => e.stopPropagation()}
                    placeholder="Title"
                    style={{ ...MONO, fontSize: 10, color: "white", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", outline: "none", width: "100%", padding: "2px 0", marginBottom: 2 }}
                  />
                  <p style={{ ...MONO, fontSize: 8, color: "white", opacity: 0.4, margin: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {link.url}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => { if (i === 0) return; setLinks(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; }); }}
                    style={{ ...MONO, fontSize: 10, color: i === 0 ? "rgba(255,255,255,0.2)" : "white", background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", padding: "0 2px", lineHeight: 1 }}
                  >▴</button>
                  <button
                    onClick={() => { if (i === links.length - 1) return; setLinks(prev => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; }); }}
                    style={{ ...MONO, fontSize: 10, color: i === links.length - 1 ? "rgba(255,255,255,0.2)" : "white", background: "none", border: "none", cursor: i === links.length - 1 ? "default" : "pointer", padding: "0 2px", lineHeight: 1 }}
                  >▾</button>
                </div>
                <button
                  onClick={() => { setLinks(prev => prev.filter((_, j) => j !== i)); if (expandedIdx === i) setExpandedIdx(null); }}
                  style={{ ...MONO, fontSize: 16, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                >×</button>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: "0 10px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {/* Description */}
                  <div style={{ marginTop: 8 }}>
                    <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: "0 0 4px" }}>DESCRIPTION</p>
                    <textarea
                      value={link.description || ""}
                      onChange={e => {
                        const val = e.target.value.slice(0, 120);
                        setLinks(prev => prev.map((l, j) => j === i ? { ...l, description: val || null } : l));
                      }}
                      placeholder="Short description (optional)"
                      rows={2}
                      style={{ ...MONO, fontSize: 9, color: "white", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", outline: "none", width: "100%", padding: "6px 8px", resize: "none", boxSizing: "border-box", lineHeight: 1.4 }}
                    />
                    <p style={{ ...MONO, fontSize: 8, color: "white", opacity: 0.3, margin: "2px 0 0", textAlign: "right" }}>
                      {(link.description || "").length}/120
                    </p>
                  </div>

                  {/* Custom thumbnail */}
                  <div style={{ marginTop: 10 }}>
                    <p style={{ ...MONO, fontSize: 9, color: "white", opacity: 0.5, margin: "0 0 6px" }}>CUSTOM IMAGE</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {link.custom_thumbnail_url && (
                        <div style={{ width: 60, height: 60, overflow: "hidden", flexShrink: 0 }}>
                          <img src={link.custom_thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            if (file) await handleCustomThumbUpload(i, file);
                            e.target.value = "";
                          }}
                          id={`thumb-upload-${i}`}
                        />
                        <label
                          htmlFor={`thumb-upload-${i}`}
                          style={{ ...MONO, fontSize: 9, color: uploadingThumb === i ? "rgba(255,255,255,0.4)" : "white", border: "1px solid rgba(255,255,255,0.2)", padding: "6px 10px", cursor: uploadingThumb === i ? "default" : "pointer", display: "inline-block" }}
                        >
                          {uploadingThumb === i ? "Uploading…" : link.custom_thumbnail_url ? "CHANGE IMAGE" : "UPLOAD IMAGE"}
                        </label>
                        {link.custom_thumbnail_url && (
                          <button
                            onClick={() => setLinks(prev => prev.map((l, j) => j === i ? { ...l, custom_thumbnail_url: null } : l))}
                            style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", marginLeft: 8, padding: 0 }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Expand toggle */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                style={{ ...MONO, fontSize: 8, color: "rgba(255,255,255,0.3)", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", width: "100%", padding: "4px 0", textAlign: "center" }}
              >
                {isExpanded ? "▴ less" : "▾ description & image"}
              </button>
            </div>
          );
        })}

        {/* Add link form */}
        {addingLink ? (
          <div style={{ border: "1px solid rgba(255,255,255,0.15)", padding: 12, marginBottom: 8 }}>
            <input
              autoFocus
              type="url"
              value={newLinkUrl}
              onChange={e => setNewLinkUrl(e.target.value)}
              onBlur={() => { if (newLinkUrl.trim()) fetchPreview(newLinkUrl.trim()); }}
              onKeyDown={e => { if (e.key === "Enter" && newLinkUrl.trim()) fetchPreview(newLinkUrl.trim()); }}
              placeholder="Paste any URL…"
              style={{ ...MONO, fontSize: 10, color: "white", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", outline: "none", width: "100%", padding: "4px 0", marginBottom: 10, boxSizing: "border-box" }}
            />
            {fetchingPreview && (
              <p style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", margin: "0 0 8px" }}>Fetching preview…</p>
            )}
            {pendingLink && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, flexShrink: 0, overflow: "hidden", background: "#1a1a1a" }}>
                  {pendingLink.thumbnail_url
                    ? <img src={pendingLink.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <div style={{ width: "100%", height: "100%" }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    value={pendingLink.title || ""}
                    onChange={e => setPendingLink(p => p ? { ...p, title: e.target.value } : p)}
                    placeholder="Title"
                    style={{ ...MONO, fontSize: 10, color: "white", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", outline: "none", width: "100%", padding: "2px 0" }}
                  />
                  {pendingLink.is_video && (
                    <p style={{ ...MONO, fontSize: 8, color: "#FF0000", opacity: 0.8, margin: "3px 0 0" }}>VIDEO</p>
                  )}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  if (!pendingLink) return;
                  setLinks(prev => [...prev, pendingLink]);
                  setPendingLink(null);
                  setNewLinkUrl("");
                  setAddingLink(false);
                }}
                disabled={!pendingLink}
                style={{ ...MONO, fontSize: 10, color: "white", background: "transparent", border: "1px solid white", cursor: pendingLink ? "pointer" : "default", padding: "6px 12px", opacity: pendingLink ? 1 : 0.3 }}
              >ADD</button>
              <button
                onClick={() => { setAddingLink(false); setNewLinkUrl(""); setPendingLink(null); }}
                style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.5)", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: "6px 12px" }}
              >CANCEL</button>
            </div>
          </div>
        ) : links.length < 6 ? (
          <button
            onClick={() => { setAddingLink(true); setPendingLink(null); setNewLinkUrl(""); }}
            style={{ ...MONO, fontSize: 10, color: "white", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: "8px 12px", width: "100%", textAlign: "left" }}
          >
            + ADD LINK
          </button>
        ) : null}

        {links.length > 0 && !addingLink && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...MONO, fontSize: 11, color: "white", background: "#FF0000", border: "none", cursor: "pointer", padding: "12px", width: "100%", marginTop: 16, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "SAVE LINKS"}
          </button>
        )}

      </div>
    </div>
  );
}
