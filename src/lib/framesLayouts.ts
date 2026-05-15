export type FramesLayoutConfig = {
  cols: number;
  rows: number;
  maxImages: number;
  imageAspectRatio: string;
  imageHeight: number;
  watermarkBandHeight: number;
};

export const FRAMES_CANVAS_WIDTH = 1080;
export const FRAMES_CANVAS_HEIGHT = 1920;

export function getFramesLayout(deckLayoutId: string): FramesLayoutConfig {
  switch (deckLayoutId) {
    case 'pana-wide':
    case 'pana-wide-2col':
      return {
        cols: 1, rows: 4, maxImages: 4,
        imageAspectRatio: '2.75 / 1',
        imageHeight: 393,
        watermarkBandHeight: 1920 - (393 * 4),
      };
    case 'scope':
    case 'scope-2col':
      return {
        cols: 1, rows: 4, maxImages: 4,
        imageAspectRatio: '2.39 / 1',
        imageHeight: 452,
        watermarkBandHeight: 1920 - (452 * 4),
      };
    case 'cine-wide':
    case 'cine-wide-2col':
      return {
        cols: 1, rows: 3, maxImages: 3,
        imageAspectRatio: '1.85 / 1',
        imageHeight: 584,
        watermarkBandHeight: 1920 - (584 * 3),
      };
    case 'legacy':
      return {
        cols: 2, rows: 4, maxImages: 8,
        imageAspectRatio: '4 / 3',
        imageHeight: 405,
        watermarkBandHeight: 1920 - (405 * 4),
      };
    case 'collage':
      return {
        cols: 2, rows: 3, maxImages: 6,
        imageAspectRatio: '1 / 1',
        imageHeight: 540,
        watermarkBandHeight: 1920 - (540 * 3),
      };
    default:
      return {
        cols: 1, rows: 4, maxImages: 4,
        imageAspectRatio: '2.39 / 1',
        imageHeight: 452,
        watermarkBandHeight: 1920 - (452 * 4),
      };
  }
}
