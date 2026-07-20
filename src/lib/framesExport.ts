import { FRAMES_CANVAS_WIDTH, FRAMES_CANVAS_HEIGHT, type FramesLayoutConfig } from './framesLayouts';

export interface ExportableItem {
  media_url: string | null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => reject(new Error(`Image load timeout: ${url}`)), 10000);
    img.onload = () => { clearTimeout(timeout); resolve(img); };
    img.onerror = () => { clearTimeout(timeout); reject(new Error(`Image load failed: ${url}`)); };
    img.src = url;
  });
}

function drawCroppedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  destX: number, destY: number,
  destW: number, destH: number,
) {
  const srcAspect = img.naturalWidth / img.naturalHeight;
  const destAspect = destW / destH;

  let srcX = 0, srcY = 0, srcW = img.naturalWidth, srcH = img.naturalHeight;

  if (srcAspect > destAspect) {
    // Image is wider than dest — crop sides
    srcW = img.naturalHeight * destAspect;
    srcX = (img.naturalWidth - srcW) / 2;
  } else {
    // Image is taller than dest — crop top/bottom
    srcH = img.naturalWidth / destAspect;
    srcY = (img.naturalHeight - srcH) / 2;
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
}

async function drawWatermarkBand(
  ctx: CanvasRenderingContext2D,
  bandY: number,
  bandHeight: number,
  opts: { isOwnDeck: boolean; deckOwnerUsername: string; currentUserUsername: string },
) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, bandY, FRAMES_CANVAS_WIDTH, bandHeight);

  try {
    console.log('[frames-export] watermark: loading logo');
    const logo = await loadImage('/scope-logo-new-no-black.png');
    console.log('[frames-export] watermark: logo loaded', logo.naturalWidth, 'x', logo.naturalHeight);
    const logoTargetWidth = 280;
    const logoAspect = logo.naturalWidth / logo.naturalHeight;
    const logoTargetHeight = logoTargetWidth / logoAspect;
    const logoX = (FRAMES_CANVAS_WIDTH - logoTargetWidth) / 2;
    const logoY = bandY + bandHeight * 0.3 - logoTargetHeight / 2;
    ctx.drawImage(logo, logoX, logoY, logoTargetWidth, logoTargetHeight);
  } catch (logoErr: any) {
    console.warn('[frames-export] watermark: logo load failed, falling back to text:', logoErr?.message);
    ctx.fillStyle = 'rgba(229,225,219,0.6)';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCOPE', FRAMES_CANVAS_WIDTH / 2, bandY + bandHeight * 0.3);
  }

  const creditsText = opts.isOwnDeck
    ? `@${opts.currentUserUsername.toUpperCase()} · SCOPE`
    : `CURATED BY @${opts.currentUserUsername.toUpperCase()} · WORK BY @${opts.deckOwnerUsername.toUpperCase()}`;

  ctx.fillStyle = 'rgba(229,225,219,0.5)';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(creditsText, FRAMES_CANVAS_WIDTH / 2, bandY + bandHeight * 0.7);
}

export async function generateFramesExport(params: {
  selectedItems: ExportableItem[];
  layoutConfig: FramesLayoutConfig;
  deckOwnerUsername: string;
  currentUserUsername: string;
  isOwnDeck: boolean;
}): Promise<Blob> {
  console.log('[frames-export] A. Function entered, items:', params.selectedItems.length);

  const canvas = document.createElement('canvas');
  canvas.width = FRAMES_CANVAS_WIDTH;
  canvas.height = FRAMES_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[frames-export] B. Canvas context unavailable');
    throw new Error('Canvas context unavailable');
  }
  console.log('[frames-export] B. Canvas created', FRAMES_CANVAS_WIDTH, 'x', FRAMES_CANVAS_HEIGHT);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, FRAMES_CANVAS_WIDTH, FRAMES_CANVAS_HEIGHT);
  console.log('[frames-export] C. Background filled');

  const { cols, imageHeight } = params.layoutConfig;
  const cellWidth = FRAMES_CANVAS_WIDTH / cols;
  console.log('[frames-export] D. Loading', params.selectedItems.length, 'images, cols:', cols, 'cellW:', cellWidth, 'cellH:', imageHeight);

  const imagePromises = params.selectedItems.map((item, i) => {
    if (!item.media_url) {
      console.log('[frames-export] D.' + i + ' No media_url, skipping');
      return Promise.resolve(null);
    }
    console.log('[frames-export] D.' + i + ' Loading:', item.media_url);
    return loadImage(item.media_url)
      .then(img => { console.log('[frames-export] D.' + i + ' Loaded:', img.naturalWidth, 'x', img.naturalHeight); return img; })
      .catch(err => { console.warn('[frames-export] D.' + i + ' Load failed:', err?.message); return null; });
  });
  const images = await Promise.all(imagePromises);
  console.log('[frames-export] E. All images settled, loaded:', images.filter(Boolean).length, '/', images.length);

  images.forEach((img, idx) => {
    if (!img) return;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * cellWidth;
    const y = row * imageHeight;
    drawCroppedImage(ctx, img, x, y, cellWidth, imageHeight);
  });
  console.log('[frames-export] F. Images drawn to canvas');

  const bandY = FRAMES_CANVAS_HEIGHT - params.layoutConfig.watermarkBandHeight;
  console.log('[frames-export] G. Drawing watermark band at y:', bandY, 'height:', params.layoutConfig.watermarkBandHeight);
  await drawWatermarkBand(ctx, bandY, params.layoutConfig.watermarkBandHeight, {
    isOwnDeck: params.isOwnDeck,
    deckOwnerUsername: params.deckOwnerUsername,
    currentUserUsername: params.currentUserUsername,
  });
  console.log('[frames-export] H. Watermark drawn');

  console.log('[frames-export] I. Converting canvas to blob');
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        console.error('[frames-export] J. toBlob returned null');
        reject(new Error('Canvas toBlob returned null'));
        return;
      }
      console.log('[frames-export] J. Blob ready, size:', blob.size);
      resolve(blob);
    }, 'image/jpeg', 0.92);
  });
}
