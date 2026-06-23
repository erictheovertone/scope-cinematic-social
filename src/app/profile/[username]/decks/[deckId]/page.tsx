"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  getDeckById, removeFromDeck, updateDeck, addMediaToDeck, uploadImage,
  getUserByPrivyId, getProfile, getProfileByUsername, isProMember,
  type DeckWithItems, type DeckItemWithMedia,
} from "@/lib/userService";
import { getAspectRatio, getColCount } from "@/lib/aspectRatio";
import PostModal from "@/components/PostModal";
import FramesSheet from "@/components/FramesSheet";
import FramesProUpsellSheet from "@/components/FramesProUpsellSheet";
import MembershipSheet from "@/components/MembershipSheet";
import MediaRenderer from "@/components/MediaRenderer";
import FrameLoader from "@/components/FrameLoader";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

const DECK_LAYOUTS = [
  { id: "pana-wide-2col", label: "2X ULTRA-PAN", ratio: 2.75, ratioLabel: "2.75:1", cols: 2, resolution: "4096x1551" },
  { id: "pana-wide",      label: "1X ULTRA-PAN", ratio: 2.75, ratioLabel: "2.75:1", cols: 1, resolution: "4096x1551" },
  { id: "scope-2col",     label: "2X SCOPE",     ratio: 2.39, ratioLabel: "2.39:1", cols: 2, resolution: "4096x1716" },
  { id: "scope",          label: "1X SCOPE",     ratio: 2.39, ratioLabel: "2.39:1", cols: 1, resolution: "4096x1716" },
  { id: "cine-wide-2col", label: "2X CINE WIDE", ratio: 1.85, ratioLabel: "1.85:1", cols: 2, resolution: "4096x2214" },
  { id: "cine-wide",      label: "1X CINE WIDE", ratio: 1.85, ratioLabel: "1.85:1", cols: 1, resolution: "4096x2214" },
  { id: "legacy",         label: "3X LEGACY",    ratio: 4/3,  ratioLabel: "4:3",    cols: 3, resolution: "1024x768"  },
  { id: "collage",        label: "COLLAGE",       ratio: 0,    ratioLabel: "mixed",  cols: 0, resolution: null        },
];

const DECK_COLLAGE_CELLS = [
  { left: 0,   top: 0,  width: 112, height: 112 },
  { left: 0,   top: 57, width: 55,  height: 55  },
  { left: 57,  top: 57, width: 55,  height: 55  },
  { left: 114, top: 0,  width: 113, height: 55  },
  { left: 114, top: 57, width: 113, height: 55  },
  { left: 229, top: 0,  width: 140, height: 112 },
];

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|ogg|m4v)(\?|$)/i.test(url);
}

function getItemMediaUrl(item: DeckItemWithMedia): string {
  return item.media_url || item.post?.media_urls?.[0] || "";
}

function formatDeckDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDate().toString().padStart(2, "0");
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${day} ${months[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThreeDotsIcon() {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width: 3, height: 3, background: "#FFFFFF", borderRadius: "50%" }} />
      ))}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, lineHeight: 1.4, marginBottom: 4 }}>
      <span style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: "-0.2px", color: "#FF0000", textTransform: "uppercase", flexShrink: 0, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: "-0.2px", color: "#FFFFFF", textTransform: "uppercase", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function deckCellDimensions(layout: typeof DECK_LAYOUTS[0]): { width: number; height: number }[] {
  const INNER = 371;
  if (layout.id === "collage") return [];
  if (layout.cols === 2) {
    const w = (INNER - 1) / 2;
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }, { width: w, height: h }];
  }
  if (layout.cols === 1) {
    const w = INNER;
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }];
  }
  if (layout.cols === 3) {
    const w = Math.floor((INNER - 2) / 3);
    const h = Math.round(w / layout.ratio);
    return [{ width: w, height: h }, { width: w, height: h }, { width: w, height: h }];
  }
  return [];
}

function DeckCellOverlay({
  layout, selected, width, height, isFirst,
}: {
  layout: typeof DECK_LAYOUTS[0]; selected: boolean; width: number; height: number; isFirst: boolean;
}) {
  const border = selected ? "1px solid #FF0000" : "1px solid #ffffff";
  const ratioLS = layout.ratioLabel === "4:3" ? "2.17px" : "1.33px";
  return (
    <div style={{ position: "relative", width, height, border, background: "transparent", flexShrink: 0, overflow: "visible" }}>
      {isFirst && (
        <>
          <span style={{ position: "absolute", top: 5, left: 6, background: "#d9d9d9", height: 11, padding: "0 3px", display: "flex", alignItems: "center", fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: "#000000", letterSpacing: "-0.16px", whiteSpace: "nowrap", lineHeight: 1, zIndex: 1 }}>
            {layout.label}
          </span>
          <div style={{ position: "absolute", top: 19, left: 6, display: "flex", alignItems: "center" }}>
            <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#ffffff", letterSpacing: "-0.14px" }}>{"AR     "}</span>
            <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#FF0000", letterSpacing: ratioLS, marginLeft: 4 }}>{layout.ratioLabel}</span>
          </div>
          {layout.resolution && (() => {
            const [lp, rp] = layout.resolution.split("x");
            const ts: React.CSSProperties = { fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "rgba(255,255,255,0.5)", letterSpacing: "22px", whiteSpace: "nowrap", lineHeight: 1 };
            return (
              <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 7, width: 371, display: "flex", alignItems: "center", overflow: "visible" }}>
                <span style={{ ...ts, flex: 1, textAlign: "right" }}>{lp}</span>
                <span style={{ ...ts, letterSpacing: 0 }}>·</span>
                <span style={{ ...ts, flex: 1, paddingLeft: "22px" }}>{rp}</span>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function DeckLayoutSection({
  layout, selected, onSelect,
}: {
  layout: typeof DECK_LAYOUTS[0]; selected: boolean; onSelect: () => void;
}) {
  const cells = deckCellDimensions(layout);
  const border = selected ? "1px solid #FF0000" : "1px solid #ffffff";

  if (layout.id === "collage") {
    return (
      <div onClick={onSelect} style={{ paddingLeft: 2, cursor: "pointer" }}>
        <div style={{ position: "relative", width: 371, height: 112 }}>
          {DECK_COLLAGE_CELLS.map((cell, i) => (
            <div key={i} style={{ position: "absolute", left: cell.left, top: cell.top, width: cell.width, height: cell.height, border, background: "transparent" }}>
              {i === 0 && (
                <>
                  <span style={{ position: "absolute", top: 5, left: 6, background: "#d9d9d9", height: 11, padding: "0 3px", display: "flex", alignItems: "center", fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-8)', color: "#000000", letterSpacing: "-0.16px", whiteSpace: "nowrap", lineHeight: 1 }}>
                    {layout.label}
                  </span>
                  <div style={{ position: "absolute", top: 18, left: 6, display: "flex", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#ffffff", letterSpacing: "-0.14px" }}>{"AR     "}</span>
                    <span style={{ fontFamily: "'Sk-Modernist', sans-serif", fontWeight: 700, fontSize: 'var(--fs-7)', color: "#FF0000", letterSpacing: "1.33px", marginLeft: 4 }}>mixed</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const containerHeight = cells[0]?.height ?? 0;

  return (
    <div onClick={onSelect} style={{ paddingLeft: 2, cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 1, width: 371, height: containerHeight }}>
        {cells.map((cell, i) => (
          <DeckCellOverlay key={i} layout={layout} selected={selected} width={cell.width} height={cell.height} isFirst={i === 0} />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = usePrivy();
  const deckId = params?.deckId as string;
  const username = params?.username as string;

  // Core data
  const [deck, setDeck] = useState<DeckWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [viewerUsername, setViewerUsername] = useState("");
  const [deckOwnerDisplayName, setDeckOwnerDisplayName] = useState("");

  // Panel state — mutually exclusive
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoPanelKey, setInfoPanelKey] = useState(0);

  // Dialogs / sheets
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showFramesSheet, setShowFramesSheet] = useState(false);
  const [showFramesProUpsell, setShowFramesProUpsell] = useState(false);
  const [showMembership, setShowMembership] = useState(false);

  // Edit form
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCamera, setEditCamera] = useState("");
  const [editLens, setEditLens] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLayout, setEditLayout] = useState("");
  const [saving, setSaving] = useState(false);

  // Toasts
  const [theatreToast, setTheatreToast] = useState(false);
  const [removeToast, setRemoveToast] = useState(false);

  // Post viewing
  const [modalPost, setModalPost] = useState<any>(null);
  const [lightboxItem, setLightboxItem] = useState<DeckItemWithMedia | null>(null);

  // Media upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Batch progress (done/total) + any files that failed, so partial failures are
  // surfaced honestly with a retry rather than silently dropped.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [failedUploads, setFailedUploads] = useState<File[]>([]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-deck-menu]")) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!deckId) return;
    const load = async () => {
      try {
        const d = await getDeckById(deckId);
        if (!d) { setLoading(false); return; }
        setDeck(d);
        setEditTitle(d.title);
        setEditDesc(d.description || "");
        setEditCamera(d.camera || "");
        setEditLens(d.lens || "");
        setEditNotes(d.additional_notes || "");
        setEditLayout(d.grid_layout || "scope");

        // deck.user_id stores privy_id
        const own = !!(user?.id && user.id === d.user_id);
        setIsOwner(own);

        // Deck creator display name
        if (d.username) {
          try {
            const cp = await getProfileByUsername(d.username);
            setDeckOwnerDisplayName(cp?.display_name || d.username || "");
          } catch {}
        }

        // Viewer Pro status
        if (user?.id) {
          try {
            const sbUser = await getUserByPrivyId(user.id);
            if (sbUser) {
              const profile = await getProfile(sbUser.id);
              if (profile) {
                setIsPro(isProMember(profile as any));
                setViewerUsername((profile as any).username || "");
              }
            }
          } catch {}
        }
      } catch (e) {
        console.error("DeckDetailPage load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [deckId, user?.id]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openInfo = () => {
    setMenuOpen(false);
    setInfoOpen(true);
    setInfoPanelKey(k => k + 1);
  };

  const closeInfo = () => setInfoOpen(false);

  const openMenu = () => {
    setInfoOpen(false);
    setMenuOpen(true);
  };

  const openEditDialog = () => {
    closeInfo();
    setMenuOpen(false);
    setEditTitle(deck?.title || "");
    setEditDesc(deck?.description || "");
    setEditCamera(deck?.camera || "");
    setEditLens(deck?.lens || "");
    setEditNotes(deck?.additional_notes || "");
    setEditLayout(deck?.grid_layout || "scope");
    setShowEditDialog(true);
  };

  const handleFramesClick = () => {
    setMenuOpen(false);
    if (isPro) {
      setShowFramesSheet(true);
    } else {
      setShowFramesProUpsell(true);
    }
  };

  const handleTheatre = () => {
    setMenuOpen(false);
    setTheatreToast(true);
    setTimeout(() => setTheatreToast(false), 2000);
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!deck) return;
    setDeck(prev => prev
      ? { ...prev, items: prev.items.filter(i => i.id !== itemId), item_count: prev.item_count - 1 }
      : prev);
    setRemoveToast(true);
    setTimeout(() => setRemoveToast(false), 2000);
    try {
      await removeFromDeck(deck.id, itemId);
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
        camera: editCamera.trim() || null,
        lens: editLens.trim() || null,
        additional_notes: editNotes.trim() || null,
        grid_layout: editLayout,
      });
      setDeck(prev => prev ? { ...prev, ...updated } : prev);
    } catch (e) {
      console.error("updateDeck error:", e);
    } finally {
      setSaving(false);
    }
  };

  // Upload a batch file-by-file so one failure doesn't abort the rest; track
  // progress and collect the failures for an honest retry affordance.
  const runUploads = async (files: File[]) => {
    if (!deck || !user || files.length === 0) return;
    setUploading(true);
    setFailedUploads([]);
    setUploadProgress({ done: 0, total: files.length });
    const failed: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const url = await uploadImage(file, "post-media", user.id);
        const item = await addMediaToDeck(deck.id, url);
        const newItem: DeckItemWithMedia = { ...item, media_url: url, post: null };
        setDeck(prev => prev ? { ...prev, items: [...prev.items, newItem], item_count: prev.item_count + 1 } : prev);
      } catch (err) {
        console.error("deck upload failed for", file.name, err);
        failed.push(file);
      }
      setUploadProgress({ done: i + 1, total: files.length });
    }
    setFailedUploads(failed);
    setUploadProgress(null);
    setUploading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    await runUploads(files);
  };

  const retryFailedUploads = () => {
    const files = failedUploads;
    setFailedUploads([]);
    runUploads(files);
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

  // ── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-black w-full app-shell min-h-[100dvh] mx-auto flex items-center justify-center">
        <FrameLoader variant="page" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="bg-black w-full app-shell min-h-[100dvh] mx-auto flex items-center justify-center">
        <p style={{ ...SKB, fontSize: 'var(--fs-10)', color: "white" }}>Deck not found</p>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const layoutId = deck.grid_layout || "scope";
  const stillsCount = deck.items.filter(i => !isVideoUrl(getItemMediaUrl(i))).length;
  const videosCount = deck.items.filter(i => isVideoUrl(getItemMediaUrl(i))).length;

  // Spillout items: rendered absolutely from the right edge when menuOpen.
  // right offsets: Theatre=4, FRAMES=36, EDIT=~90, BACK=~140
  // Each item animates in via spillItem keyframe with staggered delay.

  // Info panel rows
  const infoPanelRowDelay = (idx: number) => 100 + idx * 50;
  let rowIdx = 0;
  const panelRows: { delay: number; node: React.ReactNode; spacer?: number }[] = [];

  panelRows.push({ delay: infoPanelRowDelay(rowIdx++), node: <DataRow label="DECK TITLE" value={deck.title.toUpperCase()} /> });
  panelRows.push({ delay: infoPanelRowDelay(rowIdx++), node: <DataRow label="CREATOR" value={(deckOwnerDisplayName || deck.username || "").toUpperCase()} /> });
  panelRows.push({ delay: infoPanelRowDelay(rowIdx++), node: <DataRow label="COUNT" value={`${stillsCount} TOTAL STILLS, ${videosCount} VIDEOS`} /> });
  panelRows.push({ delay: infoPanelRowDelay(rowIdx++), node: <DataRow label="DATE CREATED" value={formatDeckDate(deck.created_at)} /> });
  panelRows.push({ delay: -1, spacer: 8, node: null });

  if (deck.camera) {
    panelRows.push({ delay: infoPanelRowDelay(rowIdx++), node: <DataRow label="CAMERA" value={deck.camera.toUpperCase()} /> });
  }
  if (deck.lens) {
    panelRows.push({ delay: infoPanelRowDelay(rowIdx++), node: <DataRow label="LENSES" value={deck.lens.toUpperCase()} /> });
  }
  if (deck.camera || deck.lens) {
    panelRows.push({ delay: -1, spacer: 8, node: null });
  }
  if (deck.additional_notes) {
    panelRows.push({ delay: infoPanelRowDelay(rowIdx++), node: <DataRow label="ADDITIONAL NOTES" value={deck.additional_notes.toUpperCase()} /> });
  }

  const descDelay = infoPanelRowDelay(rowIdx++);
  const actionDelay = infoPanelRowDelay(rowIdx++);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-black w-full app-shell min-h-[100dvh] mx-auto" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>

      {/* ── Backdrops ────────────────────────────────────────────────────── */}

      {infoOpen && (
        <div
          onClick={closeInfo}
          style={{ position: "fixed", inset: 0, zIndex: 15 }}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}

      <div
        style={{
          position: "relative", zIndex: 20,
          background: "#000000",
          height: 56,
          padding: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        {/* Left: title + "+" toggle */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", height: "100%", paddingTop: 2, paddingLeft: 6 }}>
          <p
            style={{
              ...SKB, fontSize: 'var(--fs-14)', letterSpacing: "-0.02em", color: "#FFFFFF",
              textTransform: "uppercase", margin: 0,
            }}
          >
            {deck.title}
          </p>
          <button
            onClick={infoOpen ? closeInfo : openInfo}
            aria-label={infoOpen ? "Close info" : "Open info"}
            style={{
              width: 32, height: 32,
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
              transition: "transform 200ms ease",
              transform: infoOpen ? "rotate(45deg)" : "rotate(0deg)",
            }}
          >
            <svg width="17.5" height="17.5" viewBox="0 0 16 16" fill="none">
              <path d="M8 2 L8 14 M2 8 L14 8" stroke="#FFFFFF" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {/* 3-dot menu button — fades out when menu opens */}
        <button
          onClick={openMenu}
          aria-label="Open menu"
          data-deck-menu
          style={{
            position: "absolute", top: 6, right: 5,
            width: 32, height: 22,
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            padding: 0,
            opacity: menuOpen ? 0 : 1,
            transform: menuOpen ? "scale(0.8)" : "scale(1)",
            transition: "opacity 150ms ease, transform 150ms ease",
            pointerEvents: menuOpen ? "none" : "auto",
          }}
        >
          <ThreeDotsIcon />
        </button>

        {/* Spillout items — single flex row, all vertically centered */}
        <div
          data-deck-menu
          style={{
            position: "absolute", top: 6, right: 5,
            height: 22,
            display: "flex", alignItems: "center", gap: 14,
            pointerEvents: menuOpen ? "auto" : "none",
          }}
        >
          {/* BACK — leftmost */}
          <button
            onClick={() => { setMenuOpen(false); router.back(); }}
            style={{
              background: "transparent", border: "none", cursor: "pointer", padding: 0,
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? "translateX(0)" : "translateX(130px)",
              transition: "opacity 180ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
              transitionDelay: menuOpen ? "120ms" : "0ms",
            }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: "-0.02em", color: "#FFFFFF", textTransform: "uppercase" }}>BACK</span>
          </button>

          {/* EDIT — owner only */}
          {isOwner && (
            <button
              onClick={openEditDialog}
              style={{
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? "translateX(0)" : "translateX(90px)",
                transition: "opacity 180ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
                transitionDelay: menuOpen ? "80ms" : "40ms",
              }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: "-0.02em", color: "#FFFFFF", textTransform: "uppercase" }}>EDIT</span>
            </button>
          )}

          {/* FRAMES pill */}
          <button
            onClick={handleFramesClick}
            style={{
              background: "#FFFFFF", border: "none", cursor: "pointer",
              padding: "0 6px", height: 14,
              display: "flex", alignItems: "center",
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? "translateX(0)" : "translateX(55px)",
              transition: "opacity 180ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
              transitionDelay: menuOpen ? "40ms" : "80ms",
            }}
          >
            <span style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: "-0.04em", color: "#000000", textTransform: "uppercase", lineHeight: 1 }}>FRAMES</span>
          </button>

          {/* Theatre icon — rightmost, closest to dots */}
          <button
            onClick={handleTheatre}
            aria-label="Theatre Mode"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              padding: 0, lineHeight: 0,
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? "translateX(0)" : "translateX(20px)",
              transition: "opacity 180ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
              transitionDelay: menuOpen ? "0ms" : "120ms",
            }}
          >
            <img src="/theatre-mode-logo-new-lg.png" alt="Theatre" style={{ width: 20, height: 22, display: "block", objectFit: "contain" }} />
          </button>
        </div>
      </div>

      {/* ── Info pull-down panel ──────────────────────────────────────────── */}

      {infoOpen && (
        <div
          key={infoPanelKey}
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 56,
            left: 0,
            right: 0,
            minHeight: 437,
            zIndex: 16,
            background: "rgba(0,0,0,0.74)",
            boxSizing: "border-box",
            paddingTop: 20,
            paddingLeft: 28,
            paddingRight: 27,
            paddingBottom: 24,
            animation: "panelFadeIn 200ms ease both",
          }}
        >
          {/* Data rows */}
          <div>
            {panelRows.map((row, i) => {
              if (row.spacer !== undefined) {
                return <div key={`sp-${i}`} style={{ height: row.spacer }} />;
              }
              return (
                <div
                  key={i}
                  style={{
                    animation: `rippleRow 160ms cubic-bezier(0.16,1,0.3,1) both`,
                    animationDelay: `${row.delay}ms`,
                  }}
                  className="ripple-row"
                >
                  {row.node}
                </div>
              );
            })}
          </div>

          {/* DECK DESCRIPTION */}
          {deck.description && (
            <div
              style={{
                marginTop: 24,
                animation: `rippleRow 160ms cubic-bezier(0.16,1,0.3,1) both`,
                animationDelay: `${descDelay}ms`,
              }}
              className="ripple-row"
            >
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: "-0.2px", color: "#FF0000", textTransform: "uppercase", margin: "0 0 8px" }}>
                DECK DESCRIPTION
              </p>
              <p style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: "-0.2px", lineHeight: 1.4, color: "#FFFFFF", textTransform: "uppercase", margin: 0 }}>
                {deck.description}
              </p>
            </div>
          )}

          {/* EDIT DECK (bordered) / COLLECT */}
          <div
            style={{
              marginTop: 24,
              display: "flex",
              justifyContent: "flex-end",
              animation: `rippleRow 160ms cubic-bezier(0.16,1,0.3,1) both`,
              animationDelay: `${actionDelay}ms`,
            }}
            className="ripple-row"
          >
            {isOwner ? (
              <button
                onClick={openEditDialog}
                style={{
                  width: 62, height: 22,
                  background: "transparent",
                  border: "1px solid #FFFFFF",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 0,
                }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: "-0.22px", color: "#FFFFFF", textTransform: "uppercase" }}>
                  EDIT DECK
                </span>
              </button>
            ) : (
              <button
                onClick={closeInfo}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-10)', letterSpacing: "-0.2px", color: "#FFFFFF", textTransform: "uppercase" }}>
                  COLLECT
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Theatre toast ─────────────────────────────────────────────────── */}

      {theatreToast && (
        <div style={{ position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(0,0,0,0.85)", padding: "8px 16px", pointerEvents: "none" }}>
          <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white", letterSpacing: "0.08em", textTransform: "uppercase" }}>Theatre Mode coming soon</span>
        </div>
      )}

      {/* ── Normal grid ──────────────────────────────────────────────────── */}

      {deck.items.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
          <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.4)" }}>
            {isOwner ? "No frames yet — tap + to open menu" : "No frames yet"}
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
                <MediaRenderer url={item.media_url} autoplay={true} />
              ) : (
                <div className="w-full h-full bg-[#1a1a1a]" />
              )}
              {/* × icons are only rendered inside EditDeckDialog */}
            </div>
          ))}
        </div>
      )}

      {/* ADD button — own deck */}
      {isOwner && (
        <div style={{ padding: "20px 4px 0" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.35)", cursor: uploading ? "default" : "pointer", padding: "5px 12px", opacity: uploading ? 0.5 : 1 }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "white" }}>
                {uploading ? "UPLOADING…" : "+ ADD"}
              </span>
            </button>

            {/* Batch progress — corner-bracket loader + count, so large batches read as working */}
            {uploading && uploadProgress && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FrameLoader variant="inline" size={29.5} />
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>
                  {uploadProgress.done} / {uploadProgress.total}
                </span>
              </div>
            )}
          </div>

          {/* Partial-failure — name the count, offer a retry of just the failures */}
          {!uploading && failedUploads.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 12 }}>
              <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "#FF0000", letterSpacing: "0.04em" }}>
                {failedUploads.length} FILE{failedUploads.length > 1 ? "S" : ""} FAILED
              </span>
              <button
                onClick={retryFailedUploads}
                style={{ background: "transparent", border: "1px solid #FF0000", cursor: "pointer", padding: "4px 10px" }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-8)', color: "#FF0000" }}>RETRY</span>
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} className="hidden" />
        </div>
      )}

      {/* ── Post modal ───────────────────────────────────────────────────── */}

      {modalPost && (
        <PostModal post={modalPost} onClose={() => setModalPost(null)} />
      )}

      {/* ── Lightbox for direct-upload items ─────────────────────────────── */}

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
            {isVideoUrl(lightboxItem.media_url!) ? (
              <video
                src={lightboxItem.media_url!}
                muted
                playsInline
                autoPlay
                loop
                controls
                style={{ width: "100%", height: "auto", display: "block", pointerEvents: "auto" }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={lightboxItem.media_url!}
                alt=""
                style={{ width: "100%", height: "auto", display: "block", pointerEvents: "auto" }}
                onClick={() => setLightboxItem(null)}
              />
            )}
          </div>
          <button
            onClick={() => setLightboxItem(null)}
            style={{ position: "fixed", top: 16, left: 16, zIndex: 132, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: 0 }}
          >
            <svg width="13.5" height="13.5" viewBox="0 0 13 13" fill="none">
              <path d="M8.5 1.5L3.5 6.5l5 5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "white" }}>back</span>
          </button>
        </>
      )}

      {/* ── Edit Deck Dialog ─────────────────────────────────────────────── */}

      {showEditDialog && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "#000000",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Dialog header */}
          <div style={{ position: "sticky", top: 0, zIndex: 1, background: "#000000", flexShrink: 0 }}>
            <div
              style={{
                maxWidth: '30rem', margin: "0 auto", width: "100%",
                height: 56, padding: "0 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                boxSizing: "border-box",
              }}
            >
              <span style={{ ...SKB, fontSize: 'var(--fs-14)', letterSpacing: "0.02em", color: "#FFFFFF", textTransform: "uppercase" }}>
                EDIT DECK
              </span>
              <button
                onClick={() => setShowEditDialog(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', letterSpacing: "0.1em", color: "#FF0000", textTransform: "uppercase" }}>
                  DONE
                </span>
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ maxWidth: '30rem', margin: "0 auto", width: "100%" }}>

            {/* Settings fields — always visible */}
            <div style={{ padding: "16px 16px 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>

              {/* Deck name */}
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 6px" }}>
                DECK NAME
              </p>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Deck name"
                style={{
                  display: "block", width: "100%", background: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.12)", outline: "none",
                  ...SKB, fontSize: 'var(--fs-14)', color: "white", textTransform: "uppercase",
                  padding: "10px 12px", marginBottom: 16, boxSizing: "border-box",
                }}
              />

              {/* Description */}
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 6px" }}>
                DESCRIPTION
              </p>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Optional"
                rows={3}
                style={{
                  display: "block", width: "100%", background: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.12)", outline: "none",
                  ...SKR, fontSize: 'var(--fs-13)', color: "white", lineHeight: 1.5,
                  padding: "10px 12px", marginBottom: 16, boxSizing: "border-box", resize: "none",
                }}
              />

              {/* Camera */}
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 6px" }}>
                CAMERA
              </p>
              <input
                type="text"
                value={editCamera}
                onChange={e => setEditCamera(e.target.value)}
                placeholder="Sony FX3"
                maxLength={60}
                style={{
                  display: "block", width: "100%", background: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.12)", outline: "none",
                  ...SKR, fontSize: 'var(--fs-13)', color: "white",
                  padding: "10px 12px", marginBottom: 16, boxSizing: "border-box",
                }}
              />

              {/* Lens */}
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 6px" }}>
                LENS
              </p>
              <input
                type="text"
                value={editLens}
                onChange={e => setEditLens(e.target.value)}
                placeholder="Sony 24-70mm f/2.8 GM II"
                maxLength={60}
                style={{
                  display: "block", width: "100%", background: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.12)", outline: "none",
                  ...SKR, fontSize: 'var(--fs-13)', color: "white",
                  padding: "10px 12px", marginBottom: 16, boxSizing: "border-box",
                }}
              />

              {/* Additional notes */}
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 6px" }}>
                ADDITIONAL NOTES
              </p>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Optional"
                rows={3}
                style={{
                  display: "block", width: "100%", background: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.12)", outline: "none",
                  ...SKR, fontSize: 'var(--fs-13)', color: "white", lineHeight: 1.5,
                  padding: "10px 12px", marginBottom: 16, boxSizing: "border-box", resize: "none",
                }}
              />

              {/* Layout */}
              <p style={{ ...SKB, fontSize: 'var(--fs-9)', letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 10px" }}>
                LAYOUT
              </p>
              <div style={{ margin: "0 -16px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                {DECK_LAYOUTS.map(layout => (
                  <DeckLayoutSection
                    key={layout.id}
                    layout={layout}
                    selected={editLayout === layout.id}
                    onSelect={() => setEditLayout(layout.id)}
                  />
                ))}
              </div>

              {/* Save */}
              <button
                onClick={handleSaveEdit}
                disabled={!editTitle.trim() || saving}
                style={{
                  width: "100%", padding: "14px 0", background: "#FF0000",
                  border: "none", cursor: editTitle.trim() && !saving ? "pointer" : "default",
                  opacity: editTitle.trim() ? 1 : 0.5,
                  marginBottom: 20,
                }}
              >
                <span style={{ ...SKB, fontSize: 'var(--fs-11)', color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {saving ? "SAVING…" : "SAVE CHANGES"}
                </span>
              </button>
            </div>

            {/* Post grid with × icons */}
            <div style={{ padding: "4px 2px 0" }}>
              {deck.items.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 160 }}>
                  <p style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.4)" }}>No frames yet</p>
                </div>
              ) : (
                <div className={`grid ${getColCount(layoutId)} gap-[1px]`}>
                  {deck.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="relative bg-[#111] overflow-hidden"
                      style={{ aspectRatio: getAspectRatio(layoutId, index) }}
                    >
                      {item.media_url ? (
                        <MediaRenderer url={item.media_url} autoplay={false} />
                      ) : (
                        <div className="w-full h-full bg-[#1a1a1a]" />
                      )}
                      {/* × close icon — only inside edit dialog */}
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        style={{
                          position: "absolute", top: 8, right: 8,
                          width: 24, height: 24,
                          background: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: 0,
                        }}
                      >
                        <svg width="13.5" height="13.5" viewBox="0 0 12 12" fill="none">
                          <path d="M1 1L11 11M11 1L1 11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Remove toast inside dialog */}
            {removeToast && (
              <div style={{ padding: "12px 16px" }}>
                <span style={{ ...SKB, fontSize: 'var(--fs-9)', color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  REMOVED FROM DECK
                </span>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* ── Frames sheet (Pro users) ──────────────────────────────────────── */}

      {showFramesSheet && deck && (
        <FramesSheet
          isOpen={showFramesSheet}
          onClose={() => setShowFramesSheet(false)}
          deck={deck}
          items={deck.items}
          deckCreatorUsername={deck.username || username}
          currentUserUsername={viewerUsername}
          isOwnDeck={isOwner}
        />
      )}

      {/* ── Frames Pro upsell sheet (free users) ─────────────────────────── */}

      <FramesProUpsellSheet
        isOpen={showFramesProUpsell}
        onClose={() => setShowFramesProUpsell(false)}
        onUpgrade={() => {
          setShowFramesProUpsell(false);
          setShowMembership(true);
        }}
      />

      {/* ── Membership sheet ─────────────────────────────────────────────── */}

      {showMembership && (
        <MembershipSheet
          visible={showMembership}
          onClose={() => setShowMembership(false)}
          onSuccess={() => setShowMembership(false)}
        />
      )}

      {/* ── Keyframe styles ───────────────────────────────────────────────── */}

      <style>{`
        @keyframes panelFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes rippleRow {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spillItem {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ripple-row {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

    </div>
  );
}
