/**
 * ToolIcon — Scope line-icon set for the finishing tool rail.
 *
 * One thin, sharp, monochrome SVG per tool. Strokes use `currentColor`, so the
 * caller drives colour (white at rest, #FF0000 when the tool is active/touched)
 * by setting `color` on the icon or an ancestor. No fills except where a glyph
 * reads better half-filled (contrast) or corner-filled (fade); those use
 * `currentColor` too. ~24px box, stroke-width 1.6 — matches the Scope chrome.
 *
 * Every ToolKey has an entry so no rail tile renders icon-less; an unknown key
 * falls back to a plain ring.
 */

import type { ToolKey } from '@/lib/editor/config';

/** 'crop', 'whiteBalance', 'curve' aren't slider ToolKeys. */
export type IconKey = ToolKey | 'crop' | 'whiteBalance' | 'curve';

interface ToolIconProps {
  toolKey: IconKey;
  size?: number;
  color?: string;
}

// Partial: tools without a glyph (and any unmapped key) fall back to a ring.
const PATHS: Partial<Record<IconKey, React.ReactNode>> = {
  // GEOMETRY
  crop: (
    <>
      <path d="M6.5 1v15a1.5 1.5 0 0 0 1.5 1.5h15" />
      <path d="M1 6.5h15a1.5 1.5 0 0 1 1.5 1.5v15" />
    </>
  ),

  // CORRECTION
  curve: ( // S-bend curve glyph on an implied diagonal
    <>
      <path d="M3 21C8 21 8 13 12 13s4-8 9-8" />
      <path d="M3 21 21 3" opacity={0.3} />
    </>
  ),
  exposure: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8" />
    </>
  ),
  contrast: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </>
  ),
  fade: (
    <>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M4 4h8L4 12z" fill="currentColor" stroke="none" />
    </>
  ),

  // COLOR
  saturation: <path d="M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12z" />,
  whiteBalance: ( // half-filled disc (cool/warm balance) + small warm rays
    <>
      <circle cx="11" cy="12" r="6" />
      <path d="M11 6a6 6 0 0 0 0 12z" fill="currentColor" stroke="none" />
      <path d="M20 12h2M18.4 6.5l1.2 1.2M18.4 17.5l1.2-1.2" />
    </>
  ),
  temp: <path d="M10 13.5V6a2 2 0 0 1 4 0v7.5a3.5 3.5 0 1 1-4 0z" />,
  tint: (
    <>
      <path d="M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12z" />
      <path d="M5.2 15.5h13.6" />
    </>
  ),
  skinTone: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  splitTone: ( // two-tone circle: diagonally split (shadows vs highlights colour)
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M6 18 18 6" />
    </>
  ),

  // DETAIL
  sharpen: <path d="M12 4l8 16H4z" />,
  clarity: (
    <>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </>
  ),
  blur: <path d="M4 8h16M4 12h12M4 16h8" />,

  // TEXTURE
  vignette: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <ellipse cx="12" cy="12" rx="6" ry="4.5" />
    </>
  ),
  grain: ( // stippled circle
    <>
      <circle cx="12" cy="12" r="8.5" />
      <g fill="currentColor" stroke="none">
        <circle cx="9" cy="9" r="0.9" />
        <circle cx="14" cy="8.5" r="0.9" />
        <circle cx="12" cy="12" r="0.9" />
        <circle cx="8.5" cy="13.5" r="0.9" />
        <circle cx="15" cy="13" r="0.9" />
        <circle cx="11" cy="15.5" r="0.9" />
        <circle cx="14.5" cy="16" r="0.9" />
      </g>
    </>
  ),
  bloom: ( // soft-glow circle (core + faint outer ring)
    <>
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="8.5" opacity={0.45} />
    </>
  ),
  halation: ( // bright core with a haloed edge (the red-orange halo when active)
    <>
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="8.5" />
    </>
  ),

  // LOOKS
  lutIntensity: (
    <>
      <path d="M12 4l8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4M4 16l8 4 8-4" />
    </>
  ),
};

export default function ToolIcon({ toolKey, size = 22, color }: ToolIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={color ? { color } : undefined}
      aria-hidden="true"
    >
      {PATHS[toolKey] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}
