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
    const logo = await loadImage('/scope-logo-new-no-black.png');
    const logoTargetWidth = 280;
    const logoAspect = logo.naturalWidth / logo.naturalHeight;
    const logoTargetHeight = logoTargetWidth / logoAspect;
    const logoX = (FRAMES_CANVAS_WIDTH - logoTargetWidth) / 2;
    const logoY = bandY + bandHeight * 0.3 - logoTargetHeight / 2;
    ctx.drawImage(logo, logoX, logoY, logoTargetWidth, logoTargetHeight);
  } catch {
    // Logo load failed — fall back to text
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCOPE', FRAMES_CANVAS_WIDTH / 2, bandY + bandHeight * 0.3);
  }

  const creditsText = opts.isOwnDeck
    ? `@${opts.currentUserUsername.toUpperCase()} · SCOPE`
    : `CURATED BY @${opts.currentUserUsername.toUpperCase()} · WORK BY @${opts.deckOwnerUsername.toUpperCase()}`;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
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
  const canvas = document.createElement('canvas');
  canvas.width = FRAMES_CANVAS_WIDTH;
  canvas.height = FRAMES_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, FRAMES_CANVAS_WIDTH, FRAMES_CANVAS_HEIGHT);

  const { cols, imageHeight } = params.layoutConfig;
  const cellWidth = FRAMES_CANVAS_WIDTH / cols;

  const imagePromises = params.selectedItems.map(item =>
    item.media_url ? loadImage(item.media_url).catch(() => null) : Promise.resolve(null)
  );
  const images = await Promise.all(imagePromises);

  images.forEach((img, idx) => {
    if (!img) return;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = col * cellWidth;
    const y = row * imageHeight;
    drawCroppedImage(ctx, img, x, y, cellWidth, imageHeight);
  });

  const bandY = FRAMES_CANVAS_HEIGHT - params.layoutConfig.watermarkBandHeight;
  await drawWatermarkBand(ctx, bandY, params.layoutConfig.watermarkBandHeight, {
    isOwnDeck: params.isOwnDeck,
    deckOwnerUsername: params.deckOwnerUsername,
    currentUserUsername: params.currentUserUsername,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/jpeg', 0.92);
  });
}
