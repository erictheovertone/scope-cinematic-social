"use client";

import { useState, useCallback } from "react";
import { type Deck, type DeckItemWithMedia } from "@/lib/userService";
import { getFramesLayout } from "@/lib/framesLayouts";
import { generateFramesExport } from "@/lib/framesExport";
import FramesPreview from "@/components/FramesPreview";

const SKB: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 700 };
const SKR: React.CSSProperties = { fontFamily: "'SK-Modernist', sans-serif", fontWeight: 400 };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck;
  items: DeckItemWithMedia[];
  deckCreatorUsername: string;
  currentUserUsername: string;
  isOwnDeck: boolean;
}

export default function FramesSheet({
  isOpen, onClose, deck, items, deckCreatorUsername, currentUserUsername, isOwnDeck,
}: Props) {
  const layoutConfig = getFramesLayout(deck.grid_layout || "scope");
  const { maxImages } = layoutConfig;

  // selectedOrder: array of item ids in tap order
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
  const [flashCount, setFlashCount] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  const selectedItems = selectedOrder
    .map(id => items.find(item => item.id === id))
    .filter((item): item is DeckItemWithMedia => !!item);

  const toggleItem = useCallback((itemId: string) => {
    setSelectedOrder(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      }
      if (prev.length >= maxImages) {
        setFlashCount(true);
        setTimeout(() => setFlashCount(false), 600);
        return prev;
      }
      return [...prev, itemId];
    });
  }, [maxImages]);

  const handleExport = async () => {
    if (selectedItems.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportDone(false);
    try {
      const blob = await generateFramesExport({
        selectedItems,
        layoutConfig,
        deckOwnerUsername: deckCreatorUsername,
        currentUserUsername,
        isOwnDeck,
      });

      const file = new File([blob], `scope-frames-${deck.title.toLowerCase().replace(/\s+/g, '-')}.jpg`, { type: 'image/jpeg' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${deck.title} · FRAMES` });
          setExportDone(true);
          setTimeout(() => { setExportDone(false); setExporting(false); onClose(); }, 1500);
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') {
            // User dismissed the share sheet — not an error, keep sheet open with selection intact
            setExporting(false);
            return;
          }
          throw shareErr;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        setExportDone(true);
        setTimeout(() => { setExportDone(false); setExporting(false); onClose(); }, 1500);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Frames export error:', e);
        setExportError('EXPORT FAILED — TRY AGAIN');
      }
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  const count = selectedOrder.length;
  const countLabel = String(count).padStart(2, '0') + ' / ' + String(maxImages).padStart(2, '0') + ' SELECTED';
  const PREVIEW_WIDTH = 320;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.75)" }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 91,
          maxWidth: 375, margin: "0 auto",
          background: "#080808",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          maxHeight: "92vh",
          overflowY: "auto",
          paddingBottom: 36,
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 2, background: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "16px 20px 0", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <p style={{ ...SKB, fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "0 0 4px" }}>
                FRAMES
              </p>
              <p style={{ ...SKR, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, margin: 0 }}>
                Select up to {maxImages} images from this deck
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, marginLeft: 8 }}
            >
              <span style={{ fontSize: 18, color: "rgba(255,255,255,0.5)", lineHeight: 1, display: "block" }}>×</span>
            </button>
          </div>

          {/* Selection counter */}
          <div style={{ marginTop: 12 }}>
            <span style={{
              ...SKB, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
              color: count > 0 ? "#FF0000" : "rgba(255,255,255,0.5)",
              transition: flashCount ? "color 0.1s ease" : undefined,
            }}>
              {countLabel}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" }} />

        {/* Image picker grid */}
        <div style={{ padding: "0 4px" }}>
          {items.length === 0 ? (
            <p style={{ ...SKR, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "24px 0" }}>
              No images in this deck
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {items.map(item => {
                const selIdx = selectedOrder.indexOf(item.id);
                const isSelected = selIdx !== -1;
                const url = item.media_url;
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    style={{
                      position: "relative",
                      aspectRatio: "1 / 1",
                      background: "#1A1A1A",
                      overflow: "hidden",
                      cursor: "pointer",
                      outline: isSelected ? "2px solid #FF0000" : "none",
                      outlineOffset: -2,
                    }}
                  >
                    {url && (
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute", top: 4, left: 4,
                          background: "#FFFFFF",
                          minWidth: 18, height: 18,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: "0 3px",
                          boxSizing: "border-box",
                        }}
                      >
                        <span style={{ ...SKB, fontSize: 8, color: "#FF0000", letterSpacing: "0.04em", lineHeight: 1 }}>
                          {String(selIdx + 1).padStart(2, '0')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "16px 0" }} />

        {/* Live preview */}
        <div style={{ display: "flex", justifyContent: "center", padding: "0 20px" }}>
          <FramesPreview
            selectedItems={selectedItems}
            layoutConfig={layoutConfig}
            previewWidth={PREVIEW_WIDTH}
          />
        </div>

        {/* Watermark credit line below preview */}
        <div style={{ padding: "8px 20px 0", textAlign: "center" }}>
          <p style={{ ...SKB, fontSize: 8, letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", margin: 0 }}>
            {isOwnDeck
              ? `@${currentUserUsername} · SCOPE`
              : `CURATED BY @${currentUserUsername} · WORK BY @${deckCreatorUsername}`
            }
          </p>
        </div>

        {/* Error */}
        {exportError && (
          <p style={{ ...SKB, fontSize: 9, color: "#FF0000", textAlign: "center", margin: "12px 0 0", letterSpacing: "0.06em" }}>
            {exportError}
          </p>
        )}

        {/* Export loading overlay */}
        {exporting && (
          <div
            style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 12, zIndex: 10,
            }}
          >
            {exportDone ? (
              <p style={{ ...SKB, fontSize: 10, letterSpacing: "0.15em", color: "white", textTransform: "uppercase" }}>
                EXPORTED ✓
              </p>
            ) : (
              <>
                <div style={{ width: 11, height: 11, background: "#FF0000", borderRadius: "50%", animation: "framesExportPulse 0.9s ease-in-out infinite alternate" }} />
                <p style={{ ...SKB, fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", margin: 0 }}>
                  RENDERING FRAMES...
                </p>
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={handleExport}
            disabled={count === 0 || exporting}
            style={{
              width: "100%", padding: "14px 0",
              background: "#FF0000",
              border: "none",
              cursor: count > 0 && !exporting ? "pointer" : "default",
              opacity: count > 0 ? 1 : 0.5,
            }}
          >
            <span style={{ ...SKB, fontSize: 11, color: "white", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              EXPORT FRAMES
            </span>
          </button>
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "14px 0",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              cursor: "pointer",
            }}
          >
            <span style={{ ...SKB, fontSize: 11, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              CANCEL
            </span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes framesExportPulse {
          from { opacity: 0.4; transform: scale(0.85); }
          to   { opacity: 1;   transform: scale(1.1); }
        }
      `}</style>
    </>
  );
}
