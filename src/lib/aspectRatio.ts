/** Single source of truth for layout → aspect ratio + column count. */

/** Returns a CSS ratio string like "2.39 / 1" for a given layout and post index. */
export function getAspectRatio(layoutId: string, index = 0): string {
  switch (layoutId) {
    case '2x-pana':
    case '1x-pana':
    case 'pana-wide':
    case 'pana-wide-2x':
    case 'pana-wide-2col':
      return '2.75 / 1';

    case '2x-scope':
    case '1x-scope':
    case 'scope':
    case 'scope-2x':
    case 'scope-2col':
      return '2.39 / 1';

    case '2x-cine':
    case '1x-cine':
    case 'cine-wide':
    case 'cine-wide-2x':
    case 'cine-wide-2col':
      return '1.85 / 1';

    case '3x-legacy':
    case 'legacy':
      return '4 / 3';

    case '3x-square':
      return '1 / 1';

    case '2x-super-wide':
    case '1x-super-wide':
      return '2.39 / 1';

    case '2x-regular-wide':
      return '16 / 9';

    case 'collage': {
      const aspects = ['2.39 / 1', '1 / 1', '16 / 9', '1 / 1'];
      return aspects[index % aspects.length];
    }

    default:
      return '2.39 / 1';
  }
}

/** Returns the CSS grid column class for a layout. */
export function getColCount(layoutId: string): string {
  switch (layoutId) {
    case '2x-pana':
    case '2x-scope':
    case '2x-cine':
    case 'pana-wide-2x':
    case 'scope-2x':
    case 'cine-wide-2x':
    case 'pana-wide-2col':
    case 'scope-2col':
    case 'cine-wide-2col':
    case '2x-super-wide':
    case '2x-regular-wide':
    case 'collage':
      return 'grid-cols-2';

    case '3x-legacy':
    case '3x-square':
      return 'grid-cols-3';

    case 'legacy':
      return 'grid-cols-2';

    default:
      return 'grid-cols-1';
  }
}

/** Converts a CSS ratio string like "2.39 / 1" to a paddingTop percentage. */
export function ratioPadding(ratioStr: string): number {
  const [w, h] = ratioStr.split('/').map(s => parseFloat(s.trim()));
  return (h / w) * 100;
}

// ── Crop-tool AR picker metadata (additive — does not affect any read above) ──
// The four canonical aspect ratios offered in the crop tool. `id` is the
// canonical layout_id written for the post; getAspectRatio()/getColCount()
// above already understand each id, so this is purely a presentation map.
// `exportW`/`exportH` are the canonical bake dimensions (constant 1080 short
// edge). Display is AR-driven (object-fit), so the exact pixel count never
// changes how a post renders — only the ratio matters.
export interface ArChip {
  /** canonical layout_id written to posts.layout_id */
  id: string;
  /** short brand name, e.g. "PANA WIDE" */
  label: string;
  /** human ratio label, e.g. "2.75:1" */
  ratioLabel: string;
  /** numeric width/height ratio */
  ratio: number;
  /** canonical baked JPEG dimensions for this AR */
  exportW: number;
  exportH: number;
}

/**
 * Exactly four chips, widest → narrowest, as shown in the crop tool AR row.
 * exportW/exportH are the canonical baked-JPEG dimensions.
 */
export const AR_CHIPS: ArChip[] = [
  { id: 'pana-wide', label: 'PANA WIDE', ratioLabel: '2.75:1', ratio: 2.75,  exportW: 4096, exportH: 1551 },
  { id: 'scope',     label: 'SCOPE',     ratioLabel: '2.39:1', ratio: 2.39,  exportW: 4096, exportH: 1716 },
  { id: 'cine-wide', label: 'CINE WIDE', ratioLabel: '1.85:1', ratio: 1.85,  exportW: 4096, exportH: 2214 },
  { id: 'legacy',    label: 'LEGACY',    ratioLabel: '4:3',    ratio: 4 / 3, exportW: 1024, exportH: 768  },
];

/** Maps any layout_id (incl. legacy/2x/2col forms) to its AR chip. */
export function chipForLayout(layoutId: string): ArChip {
  const ratioStr = getAspectRatio(layoutId);
  const [w, h] = ratioStr.split('/').map(s => parseFloat(s.trim()));
  const target = w / h;
  // nearest chip by ratio (handles collage index-0 default too)
  return AR_CHIPS.reduce((best, c) =>
    Math.abs(c.ratio - target) < Math.abs(best.ratio - target) ? c : best, AR_CHIPS[1]);
}
