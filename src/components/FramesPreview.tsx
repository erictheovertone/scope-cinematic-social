"use client";

import { type FramesLayoutConfig, FRAMES_CANVAS_WIDTH, FRAMES_CANVAS_HEIGHT } from "@/lib/framesLayouts";

interface SelectedItem {
  media_url: string | null;
}

interface Props {
  selectedItems: SelectedItem[];
  layoutConfig: FramesLayoutConfig;
  previewWidth: number;
}

export default function FramesPreview({ selectedItems, layoutConfig, previewWidth }: Props) {
  const scale = previewWidth / FRAMES_CANVAS_WIDTH;
  const previewHeight = FRAMES_CANVAS_HEIGHT * scale;
  const { cols, rows, maxImages, imageHeight, watermarkBandHeight } = layoutConfig;
  const cellW = previewWidth / cols;
  const cellH = imageHeight * scale;
  const bandH = watermarkBandHeight * scale;

  const slots: (string | null)[] = Array.from({ length: maxImages }, (_, i) =>
    selectedItems[i]?.media_url ?? null
  );

  return (
    <div
      style={{
        width: previewWidth,
        height: previewHeight,
        background: "#000",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Image grid */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          style={{ display: "flex", position: "absolute", top: rowIdx * cellH, left: 0, width: previewWidth }}
        >
          {Array.from({ length: cols }).map((_, colIdx) => {
            const slotIdx = rowIdx * cols + colIdx;
            const url = slots[slotIdx];
            return (
              <div
                key={colIdx}
                style={{
                  width: cellW,
                  height: cellH,
                  background: "#1A1A1A",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  overflow: "hidden",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}
              >
                {url && (
                  <img
                    src={url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Watermark band */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: previewWidth,
          height: bandH,
          background: "#000",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: bandH * 0.08,
        }}
      >
        <img
          src="/scope-logo-new-no-black.png"
          alt="SCOPE"
          style={{ width: previewWidth * 0.26, height: "auto", display: "block" }}
        />
      </div>
    </div>
  );
}
