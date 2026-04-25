"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getDeckById, removeFromDeck, updateDeck, addMediaToDeck, uploadImage,
  type DeckWithItems, type DeckItemWithMedia,
} from "@/lib/userService";
import PostModal from "@/components/PostModal";

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

const DECK_LAYOUTS = [
  { id: "1x-super-wide", label: "1 col · 2.4:1" },
  { id: "2x-super-wide", label: "2 col · 2.4:1" },
  { id: "2x-regular-wide", label: "2 col · 16:9" },
  { id: "3x-square", label: "3 col · square" },
];

function getGridCols(layoutId: string): string {
  switch (layoutId) {
    case "2x-super-wide":
    case "2x-regular-wide":
    case "collage":
      return "grid-cols-2";
    case "1x-super-wide":
      return "grid-cols-1";
    case "3x-square":
    default:
      return "grid-cols-3";
  }
}

function getItemAspect(layoutId: string): string {
  switch (layoutId) {
    case "2x-super-wide":
    case "1x-super-wide":
      return "aspect-[2.4/1]";
    case "2x-regular-wide":
      return "aspect-video";
    case "3x-square":
      return "aspect-square";
    default:
      return "aspect-[2.4/1]";
  }
}

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = usePrivy();
  const deckId = params?.deckId as string;
  const username = params?.username as string;

  const [deck, setDeck] = useState<DeckWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwn, setIsOwn] = useState(false);

  // Modal state
  const [modalPost, setModalPost] = useState<any>(null);
  const [lightboxItem, setLightboxItem] = useState<DeckItemWithMedia | null>(null);

  // Edit overlay
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLayout, setEditLayout] = useState("");
  const [saving, setSaving] = useState(false);

  // Collect toast
  const [collectToast, setCollectToast] = useState(false);

  // Media upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!deckId) return;
    const load = async () => {
      try {
        const d = await getDeckById(deckId);
        if (!d) { setLoading(false); return; }
        setDeck(d);
        setEditTitle(d.title);
        setEditDesc(d.description || "");
        setEditLayout(d.grid_layout || "1x-super-wide");
        setIsOwn(!!(user?.id && user.id === d.user_id));
      } catch (e) {
        console.error("DeckDetailPage load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [deckId, user?.id]);

  const handleRemoveItem = async (itemId: string) => {
    if (!deck) return;
    try {
      await removeFromDeck(deck.id, itemId);
      setDeck(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId), item_count: prev.item_count - 1 } : prev);
    } catch (e) {
      console.error("removeFromDeck error:", e);
    }
  };

  const handleSaveEdit = async () => {
    if (!deck || !editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await updateDeck(deck.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        grid_layout: editLayout,
      });
      setDeck(prev => prev ? { ...prev, ...updated } : prev);
      setShowEdit(false);
    } catch (e) {
      console.error("updateDeck error:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!deck || !user) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = "";
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadImage(file, "post-media", user.id);
        const item = await addMediaToDeck(deck.id, url);
        const newItem: DeckItemWithMedia = { ...item, media_url: url, post: null };
        setDeck(prev => prev ? { ...prev, items: [...prev.items, newItem], item_count: prev.item_count + 1 } : prev);
      }
    } catch (e) {
      console.error("addMediaToDeck error:", e);
    } finally {
      setUploading(false);
    }
  };

  const handleItemTap = (item: DeckItemWithMedia) => {
    if (item.post) {
      setModalPost({
        id: item.post.id,
        username: item.post.username,
        caption: item.post.caption,
        media_urls: item.post.media_urls,
        layout_id: item.post.layout_id,
        created_at: item.post.created_at,
        user_id: item.post.user_id,
      });
    } else if (item.media_url) {
      setLightboxItem(item);
    }
  };

  if (loading) {
    return (
      <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
        <div style={{ width: 11, height: 11, background: "#FF0000", borderRadius: "50%" }} />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto flex items-center justify-center">
        <p style={{ ...MONO, fontSize: 10, color: "white" }}>Deck not found</p>
      </div>
    );
  }

  const layoutId = deck.grid_layout || "1x-super-wide";

  return (
    <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto pb-[80px]">

      {/* Red dot */}
      <div
        className="absolute cursor-pointer"
        onClick={() => router.push("/")}
        style={{ left: 0, top: 0, width: 28, height: 28, padding: "3px 0 0 2px", zIndex: 10 }}
      >
        <div className="w-[11px] h-[11px] bg-[#FF0000] rounded-full" />
      </div>

      {/* Header */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", padding: "12px 4px 6px" }}>
        <button
          onClick={() => router.back()}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={{ ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>← Back</span>
        </button>
        <span
          style={{
            ...MONO, fontSize: 9, color: "white", letterSpacing: "-0.18px",
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {deck.title}
        </span>
        {isOwn && (
          <button
            onClick={() => setShowEdit(true)}
            style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
            aria-label="Edit deck"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
      </div>

      {/* Description */}
      {deck.description && (
        <p style={{ ...MONO, fontSize: 7, color: "white", padding: "0 4px 10px", margin: 0, lineHeight: 1.6 }}>
          {deck.description}
        </p>
      )}

      {/* Grid */}
      {deck.items.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
          <p style={{ ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
            {isOwn ? "No frames yet — add some below" : "No frames yet"}
          </p>
        </div>
      ) : (
        <div className={`grid ${getGridCols(layoutId)} gap-[1px] px-[2px]`}>
          {deck.items.map(item => (
            <div
              key={item.id}
              className={`relative bg-[#111] overflow-hidden ${getItemAspect(layoutId)}`}
              style={{ cursor: "pointer" }}
              onClick={() => handleItemTap(item)}
            >
              {item.media_url ? (
                <img
                  src={item.media_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[#1a1a1a]" />
              )}
              {/* Remove button for own deck */}
              {isOwn && (
                <button
                  onClick={e => { e.stopPropagation(); handleRemoveItem(item.id); }}
                  style={{
                    position: "absolute", top: 3, right: 3,
                    background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer",
                    width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                    lineHeight: 1,
                  }}
                >
                  <span style={{ ...MONO, fontSize: 11, color: "white", lineHeight: 1 }}>×</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ADD button + COLLECT DECK — own deck */}
      {isOwn && (
        <div style={{ padding: "20px 4px 0", display: "flex", gap: 12 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.35)", cursor: "pointer", padding: "5px 12px" }}
          >
            <span style={{ ...MONO, fontSize: 8, color: "white" }}>
              {uploading ? "UPLOADING…" : "+ ADD"}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} className="hidden" />
        </div>
      )}

      {/* COLLECT DECK */}
      <div style={{ padding: isOwn ? "12px 4px 0" : "20px 4px 0", display: "flex", alignItems: "center", gap: 10 }}>
        {collectToast && (
          <span style={{ ...MONO, fontSize: 7, color: "rgba(255,255,255,0.5)" }}>Collecting coming soon</span>
        )}
        <button
          onClick={() => { setCollectToast(true); setTimeout(() => setCollectToast(false), 2000); }}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.5)", cursor: "pointer", padding: "5px 12px" }}
        >
          <span style={{ ...MONO, fontSize: 8, color: "white" }}>COLLECT DECK</span>
        </button>
        {/* TODO: when deck collecting is live (ERC-1155 on Base), add collected decks
            to the user's COLLECTED tab with a deck icon overlaid on the cover thumbnail */}
      </div>

      {/* PostModal */}
      {modalPost && (
        <PostModal post={modalPost} onClose={() => setModalPost(null)} />
      )}

      {/* Lightbox for direct-upload items */}
      {lightboxItem && (
        <>
          <div
            className="bg-black"
            style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(0,0,0,0.96)" }}
            onClick={() => setLightboxItem(null)}
          />
          <div
            className="bg-black"
            style={{
              position: "fixed", inset: 0, zIndex: 131,
              display: "flex", flexDirection: "column", justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <img
              src={lightboxItem.media_url!}
              alt=""
              style={{ width: "100%", height: "auto", display: "block", pointerEvents: "auto" }}
              onClick={() => setLightboxItem(null)}
            />
          </div>
          {/* Close indicator */}
          <button
            onClick={() => setLightboxItem(null)}
            style={{ position: "fixed", top: 16, left: 16, zIndex: 132, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
              <path d="M8.5 1.5L3.5 6.5l5 5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ ...MONO, fontSize: 9, color: "white" }}>back</span>
          </button>
        </>
      )}

      {/* Edit deck overlay */}
      {showEdit && (
        <>
          <div
            className="bg-black"
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowEdit(false)}
          />
          <div
            className="bg-black"
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 81,
              maxWidth: 375, margin: "0 auto",
              background: "#000",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              padding: "20px 16px 48px",
            }}
          >
            <p style={{ ...MONO, fontSize: 9, color: "white", marginBottom: 16 }}>EDIT DECK</p>
            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Title"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)",
                outline: "none", ...MONO, fontSize: 11, color: "white",
                padding: "4px 0", marginBottom: 14, boxSizing: "border-box",
              }}
            />
            <input
              type="text"
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.1)",
                outline: "none", ...MONO, fontSize: 9, color: "white",
                padding: "4px 0", marginBottom: 18, boxSizing: "border-box",
              }}
            />
            {/* Layout picker */}
            <p style={{ ...MONO, fontSize: 7, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Layout</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              {DECK_LAYOUTS.map(l => (
                <button
                  key={l.id}
                  onClick={() => setEditLayout(l.id)}
                  style={{
                    background: "transparent", cursor: "pointer",
                    border: editLayout === l.id ? "1px solid white" : "1px solid rgba(255,255,255,0.25)",
                    padding: "3px 8px",
                  }}
                >
                  <span style={{ ...MONO, fontSize: 7, color: editLayout === l.id ? "white" : "rgba(255,255,255,0.55)" }}>
                    {l.label}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <button
                onClick={handleSaveEdit}
                disabled={!editTitle.trim() || saving}
                style={{ background: "transparent", border: "none", cursor: "pointer", ...MONO, fontSize: 9, color: editTitle.trim() ? "white" : "rgba(255,255,255,0.3)", padding: 0 }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setShowEdit(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", ...MONO, fontSize: 9, color: "rgba(255,255,255,0.4)", padding: 0 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
