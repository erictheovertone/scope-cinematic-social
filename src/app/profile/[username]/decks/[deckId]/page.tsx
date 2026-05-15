"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getDeckById, removeFromDeck, updateDeck, addMediaToDeck, uploadImage,
  type DeckWithItems, type DeckItemWithMedia,
} from "@/lib/userService";
import { getAspectRatio, getColCount } from "@/lib/aspectRatio";
import PostModal from "@/components/PostModal";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const DECK_LAYOUT_GROUPS = [
  {
    label: "PANA-WIDE",
    options: [
      { id: "pana-wide",      label: "1 COL · 2.75:1" },
      { id: "pana-wide-2col", label: "2 COL · 2.75:1" },
    ],
  },
  {
    label: "SCOPE",
    options: [
      { id: "scope",      label: "1 COL · 2.39:1" },
      { id: "scope-2col", label: "2 COL · 2.39:1" },
    ],
  },
  {
    label: "CINE-WIDE",
    options: [
      { id: "cine-wide",      label: "1 COL · 1.85:1" },
      { id: "cine-wide-2col", label: "2 COL · 1.85:1" },
    ],
  },
  {
    label: "LEGACY",
    options: [
      { id: "legacy", label: "3 COL · 4:3" },
    ],
  },
  {
    label: "COLLAGE",
    options: [
      { id: "collage", label: "2 COL · MIXED" },
    ],
  },
];

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

  // Description pull-down
  const [showDesc, setShowDesc] = useState(false);
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  // Toasts
  const [collectToast, setCollectToast] = useState(false);
  const [theatreToast, setTheatreToast] = useState(false);

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
        setEditLayout(d.grid_layout || "scope");
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

  const handleSaveDesc = async () => {
    if (!deck) return;
    setSavingDesc(true);
    try {
      const updated = await updateDeck(deck.id, {
        title: deck.title,
        description: descDraft.trim() || null,
        grid_layout: deck.grid_layout || "scope",
      });
      setDeck(prev => prev ? { ...prev, ...updated } : prev);
      setEditDesc(descDraft.trim());
      setDescEditing(false);
    } catch (e) {
      console.error("updateDeck (desc) error:", e);
    } finally {
      setSavingDesc(false);
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
        <p style={{ ...SKB, fontSize: 10, color: "white" }}>Deck not found</p>
      </div>
    );
  }

  const layoutId = deck.grid_layout || "scope";
  const hasDesc = !!deck.description;
  const showDescButton = isOwn || hasDesc;

  return (
    <div className="bg-black w-full max-w-[375px] min-h-screen mx-auto pb-[80px]">

      {/* Backdrop to dismiss description pull-down on outside tap */}
      {showDesc && (
        <div
          onClick={() => { setShowDesc(false); setDescEditing(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 8 }}
        />
      )}

      {/* Header area — above backdrop */}
      <div style={{ position: "relative", zIndex: 10 }}>

        {/* Nav row: ← Back | [EDIT] [Theatre] */}
        <div style={{ display: "flex", alignItems: "center", padding: "12px 8px 0" }}>
          <button
            onClick={() => router.back()}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span style={{ ...SKB, fontSize: 9, color: "white", letterSpacing: "-0.18px" }}>← Back</span>
          </button>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
            {/* EDIT text link — owner only */}
            {isOwn && (
              <button
                onClick={() => {
                  setEditTitle(deck.title);
                  setEditDesc(deck.description || "");
                  setEditLayout(deck.grid_layout || "scope");
                  setShowEdit(true);
                }}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ ...SKB, fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
                  EDIT →
                </span>
              </button>
            )}
            {/* Theatre Mode icon — all viewers */}
            <button
              onClick={() => { setTheatreToast(true); setTimeout(() => setTheatreToast(false), 2000); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
              aria-label="Theatre Mode"
            >
              <img src="/theatre-mode-logo-new-lg.png" alt="Theatre" style={{ height: 28, width: "auto", display: "block" }} />
            </button>
          </div>
        </div>

        {/* Deck title */}
        <div style={{ padding: "8px 8px 0" }}>
          <p style={{ ...SKB, fontSize: 20, letterSpacing: "0.02em", color: "white", textTransform: "uppercase", margin: 0 }}>
            {deck.title}
          </p>
        </div>

        {/* + button — only if owner or description exists */}
        {showDescButton && (
          <div style={{ padding: "10px 8px 12px" }}>
            <button
              onClick={() => {
                if (!showDesc) setDescDraft(deck.description || "");
                setShowDesc(v => !v);
                setDescEditing(false);
              }}
              style={{
                width: 32, height: 32,
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 2 L8 14 M2 8 L14 8" stroke="#FFFFFF" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        )}

        {/* Description pull-down */}
        <div style={{
          overflow: "hidden",
          maxHeight: showDesc ? "500px" : "0",
          transition: "max-height 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}>
          <div style={{
            background: "#080808",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            padding: "20px",
          }}>
            {/* Panel header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ ...SKB, fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
                DESCRIPTION
              </span>
              <button
                onClick={() => { setShowDesc(false); setDescEditing(false); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <span style={{ fontSize: 18, color: "rgba(255,255,255,0.5)", lineHeight: 1 }}>×</span>
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.12)", marginBottom: 16 }} />

            {/* Body */}
            {!descEditing ? (
              <>
                {hasDesc ? (
                  <p style={{ ...SKR, fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, margin: "0 0 16px" }}>
                    {deck.description}
                  </p>
                ) : isOwn ? (
                  <p
                    onClick={() => { setDescDraft(""); setDescEditing(true); }}
                    style={{ ...SKR, fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, margin: "0 0 16px", cursor: "pointer" }}
                  >
                    Add a description for this deck
                  </p>
                ) : null}
                {isOwn && hasDesc && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => { setDescDraft(deck.description || ""); setDescEditing(true); }}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      <span style={{ ...SKB, fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
                        EDIT →
                      </span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Inline editor */
              <>
                <textarea
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  autoFocus
                  rows={4}
                  style={{
                    display: "block", width: "100%", background: "transparent",
                    border: "1px solid rgba(255,255,255,0.2)", outline: "none",
                    ...SKR, fontSize: 14, color: "white", lineHeight: 1.5,
                    padding: "8px 10px", marginBottom: 12, boxSizing: "border-box", resize: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={handleSaveDesc}
                    disabled={savingDesc}
                    style={{ flex: 1, padding: "12px 0", background: "#FF0000", border: "none", cursor: savingDesc ? "default" : "pointer" }}
                  >
                    <span style={{ ...SKB, fontSize: 11, color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {savingDesc ? "SAVING…" : "SAVE"}
                    </span>
                  </button>
                  <button
                    onClick={() => setDescEditing(false)}
                    style={{ flex: 1, padding: "12px 0", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}
                  >
                    <span style={{ ...SKB, fontSize: 11, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      CANCEL
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

      </div>{/* end header area */}

      {/* Theatre Mode toast */}
      {theatreToast && (
        <div style={{ position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(0,0,0,0.85)", padding: "8px 16px", pointerEvents: "none" }}>
          <span style={{ ...SKB, fontSize: 9, color: "white", letterSpacing: "0.08em", textTransform: "uppercase" }}>Theatre Mode coming soon</span>
        </div>
      )}

      {/* Grid */}
      {deck.items.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
          <p style={{ ...SKB, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
            {isOwn ? "No frames yet — add some below" : "No frames yet"}
          </p>
        </div>
      ) : (
        <div className={`grid ${getColCount(layoutId)} gap-[1px] px-[2px]`}>
          {deck.items.map((item, index) => (
            <div
              key={item.id}
              className="relative bg-[#111] overflow-hidden"
              style={{ cursor: "pointer", aspectRatio: getAspectRatio(layoutId, index) }}
              onClick={() => handleItemTap(item)}
            >
              {item.media_url ? (
                <img src={item.media_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#1a1a1a]" />
              )}
              {isOwn && (
                <button
                  onClick={e => { e.stopPropagation(); handleRemoveItem(item.id); }}
                  style={{
                    position: "absolute", top: 3, right: 3,
                    background: "rgba(0,0,0,0.65)", border: "none", cursor: "pointer",
                    width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <span style={{ ...SKB, fontSize: 11, color: "white", lineHeight: 1 }}>×</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ADD button — own deck */}
      {isOwn && (
        <div style={{ padding: "20px 4px 0", display: "flex", gap: 12 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.35)", cursor: "pointer", padding: "5px 12px" }}
          >
            <span style={{ ...SKB, fontSize: 8, color: "white" }}>
              {uploading ? "UPLOADING…" : "+ ADD"}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} className="hidden" />
        </div>
      )}

      {/* COLLECT DECK */}
      <div style={{ padding: isOwn ? "12px 4px 0" : "20px 4px 0", display: "flex", alignItems: "center", gap: 10 }}>
        {collectToast && (
          <span style={{ ...SKR, fontSize: 7, color: "rgba(255,255,255,0.5)" }}>Collecting coming soon</span>
        )}
        <button
          onClick={() => { setCollectToast(true); setTimeout(() => setCollectToast(false), 2000); }}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.5)", cursor: "pointer", padding: "5px 12px" }}
        >
          <span style={{ ...SKB, fontSize: 8, color: "white" }}>COLLECT DECK</span>
        </button>
      </div>

      {/* PostModal */}
      {modalPost && (
        <PostModal post={modalPost} onClose={() => setModalPost(null)} />
      )}

      {/* Lightbox for direct-upload items */}
      {lightboxItem && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(0,0,0,0.96)" }}
            onClick={() => setLightboxItem(null)}
          />
          <div
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
          <button
            onClick={() => setLightboxItem(null)}
            style={{ position: "fixed", top: 16, left: 16, zIndex: 132, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
              <path d="M8.5 1.5L3.5 6.5l5 5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ ...SKB, fontSize: 9, color: "white" }}>back</span>
          </button>
        </>
      )}

      {/* Edit deck sheet */}
      {showEdit && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.7)" }}
            onClick={() => setShowEdit(false)}
          />
          <div
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 81,
              maxWidth: 375, margin: "0 auto",
              background: "#080808",
              borderTop: "1px solid rgba(255,255,255,0.12)",
              padding: "20px 20px 36px",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <p style={{ ...SKB, fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 8px" }}>
              EDIT DECK
            </p>

            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Deck name"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.2)",
                outline: "none",
                ...SKB, fontSize: 24, letterSpacing: "0.02em", color: "white",
                textTransform: "uppercase",
                padding: "4px 0", marginBottom: 16, boxSizing: "border-box",
              }}
            />

            <p style={{ ...SKB, fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 6px" }}>
              DESCRIPTION
            </p>
            <input
              type="text"
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              placeholder="Optional"
              style={{
                display: "block", width: "100%", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(255,255,255,0.1)",
                outline: "none",
                ...SKR, fontSize: 14, color: "white",
                padding: "4px 0", marginBottom: 20, boxSizing: "border-box",
              }}
            />

            <p style={{ ...SKB, fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 10px" }}>
              LAYOUT
            </p>
            <div style={{ marginBottom: 20 }}>
              {DECK_LAYOUT_GROUPS.map((group, gi) => (
                <div key={group.label} style={{ marginBottom: gi < DECK_LAYOUT_GROUPS.length - 1 ? 20 : 0 }}>
                  <p style={{ ...SKB, fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 8px" }}>
                    {group.label}
                  </p>
                  {group.options.map((opt, oi) => (
                    <button
                      key={opt.id}
                      onClick={() => setEditLayout(opt.id)}
                      style={{
                        display: "block", width: "100%",
                        padding: "16px 20px",
                        border: editLayout === opt.id ? "1px solid #FFFFFF" : "1px solid rgba(255,255,255,0.12)",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        marginBottom: oi < group.options.length - 1 ? 8 : 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <span style={{ ...SKB, fontSize: 11, letterSpacing: "0.1em", color: "#FFFFFF", textTransform: "uppercase" }}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={handleSaveEdit}
                disabled={!editTitle.trim() || saving}
                style={{ width: "100%", padding: "14px 0", background: "#FF0000", border: "none", cursor: editTitle.trim() && !saving ? "pointer" : "default", opacity: editTitle.trim() ? 1 : 0.5 }}
              >
                <span style={{ ...SKB, fontSize: 11, color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {saving ? "SAVING…" : "SAVE"}
                </span>
              </button>
              <button
                onClick={() => setShowEdit(false)}
                style={{ width: "100%", padding: "14px 0", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}
              >
                <span style={{ ...SKB, fontSize: 11, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  CANCEL
                </span>
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
