/** Single source of truth for layout → aspect ratio + column count. */

/** Returns a CSS ratio string like "2.39 / 1" for a given layout and post index. */
export function getAspectRatio(layoutId: string, index = 0): string {
  switch (layoutId) {
    case '2x-pana':
    case '1x-pana':
    case 'pana-wide':
    case 'pana-wide-2x':
      return '2.75 / 1';

    case '2x-scope':
    case '1x-scope':
    case 'scope':
    case 'scope-2x':
      return '2.39 / 1';

    case '2x-cine':
    case '1x-cine':
    case 'cine-wide':
    case 'cine-wide-2x':
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
    case '2x-super-wide':
    case '2x-regular-wide':
    case 'collage':
      return 'grid-cols-2';

    case '3x-legacy':
    case '3x-square':
    case 'legacy':
      return 'grid-cols-3';

    default:
      return 'grid-cols-1';
  }
}

/** Converts a CSS ratio string like "2.39 / 1" to a paddingTop percentage. */
export function ratioPadding(ratioStr: string): number {
  const [w, h] = ratioStr.split('/').map(s => parseFloat(s.trim()));
  return (h / w) * 100;
}
