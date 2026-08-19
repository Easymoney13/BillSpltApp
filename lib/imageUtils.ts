/**
 * Prepare a receipt photo for vision OCR without throwing away the fine print.
 * Phone photos are usually far larger than the API needs, while long receipts
 * need substantially more detail than a 1200px thumbnail can retain.
 */
export function compressReceiptImage(fileOrBase64: File | string, isHighContrastForTesseract = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const maxDimension = 4200;
      const maxPixels = 7_000_000;
      let width = img.width;
      let height = img.height;

      const dimensionScale = Math.min(1, maxDimension / Math.max(width, height));
      const pixelScale = Math.min(1, Math.sqrt(maxPixels / Math.max(1, width * height)));
      const scale = Math.min(dimensionScale, pixelScale);
      if (scale < 1) {
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrBase64 === 'string' ? fileOrBase64 : '');
        return;
      }

      // Fill crisp solid white background behind thermal paper
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Tesseract benefits from aggressive monochrome contrast. Vision models
      // perform better with a lightly enhanced image that still preserves ink,
      // paper, logo, and layout cues.
      if (isHighContrastForTesseract) {
        ctx.filter = 'grayscale(100%) contrast(1.85) brightness(1.04)';
      } else {
        ctx.filter = 'contrast(1.12) brightness(1.02)';
      }

      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.94);
      resolve(compressedDataUrl);
    };
 
    img.onerror = (err) => {
      console.warn('Image compression fallback to raw data:', err);
      if (typeof fileOrBase64 === 'string') {
        resolve(fileOrBase64);
      } else {
        reject(err);
      }
    };
 
    if (typeof fileOrBase64 === 'string') {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBase64);
    }
  });
}

export interface ReceiptImageQuality {
  width: number;
  height: number;
  meanBrightness: number;
  edgeScore: number;
  warnings: string[];
  isUsable: boolean;
}

export interface PreparedReceiptImages {
  images: string[];
  fallbackImages: string[];
  mimeType: 'image/jpeg';
  quality: ReceiptImageQuality;
  tiled: boolean;
}

function createTesseractReceiptImage(source: HTMLCanvasElement, quality = 0.86): string {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) return source.toDataURL('image/jpeg', quality);
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = 'grayscale(100%) contrast(1.9) brightness(1.06)';
  context.drawImage(source, 0, 0);
  return canvas.toDataURL('image/jpeg', quality);
}

function loadReceiptImage(fileOrBase64: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    if (typeof fileOrBase64 === 'string') {
      image.src = fileOrBase64;
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      image.src = typeof event.target?.result === 'string' ? event.target.result : '';
    };
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBase64);
  });
}

function analyzeReceiptCanvas(canvas: HTMLCanvasElement): ReceiptImageQuality {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const warnings: string[] = [];
  if (!context || canvas.width < 1 || canvas.height < 1) {
    return { width: canvas.width, height: canvas.height, meanBrightness: 0, edgeScore: 0, warnings: ['image-unreadable'], isUsable: false };
  }

  const sampleWidth = Math.min(320, canvas.width);
  const sampleHeight = Math.max(1, Math.round(canvas.height * (sampleWidth / canvas.width)));
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = Math.min(640, sampleHeight);
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sampleContext) {
    return { width: canvas.width, height: canvas.height, meanBrightness: 128, edgeScore: 0, warnings: ['quality-check-unavailable'], isUsable: true };
  }
  sampleContext.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const pixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  let brightnessTotal = 0;
  let edgeTotal = 0;
  let previousLuminance = 0;
  const pixelCount = Math.max(1, pixels.length / 4);
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
    brightnessTotal += luminance;
    if (index > 0) edgeTotal += Math.abs(luminance - previousLuminance);
    previousLuminance = luminance;
  }
  const meanBrightness = Math.round((brightnessTotal / pixelCount) * 10) / 10;
  const edgeScore = Math.round((edgeTotal / Math.max(1, pixelCount - 1)) * 10) / 10;
  if (canvas.width < 480) warnings.push('image-too-narrow');
  if (canvas.height < 480) warnings.push('image-too-short');
  if (meanBrightness < 45) warnings.push('image-too-dark');
  if (meanBrightness > 242) warnings.push('image-overexposed');
  if (edgeScore < 3) warnings.push('image-low-detail');
  const isUsable = canvas.width >= 300
    && canvas.height >= 300
    && !(meanBrightness < 18 || (meanBrightness > 250 && edgeScore < 1.5));
  return { width: canvas.width, height: canvas.height, meanBrightness, edgeScore, warnings, isUsable };
}

/**
 * Vision-first preparation. Normal receipts are sent as one bounded JPEG.
 * Very long receipts are split into contiguous ordered sections at the
 * lightest nearby horizontal gap. This preserves readable scale without
 * duplicating rows across overlapping model inputs.
 */
export async function prepareReceiptImages(fileOrBase64: File | string): Promise<PreparedReceiptImages> {
  const image = await loadReceiptImage(fileOrBase64);
  const maxWidth = 1600;
  const maxLongHeight = 11_000;
  const scale = Math.min(1, maxWidth / Math.max(1, image.width), maxLongHeight / Math.max(1, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) throw new Error('Could not prepare receipt image');
  sourceContext.fillStyle = '#FFFFFF';
  sourceContext.fillRect(0, 0, width, height);
  sourceContext.filter = 'contrast(1.12) brightness(1.02)';
  sourceContext.drawImage(image, 0, 0, width, height);

  const quality = analyzeReceiptCanvas(sourceCanvas);
  if (!quality.isUsable) throw new Error('Receipt image is too dark, blank, or too small to read');

  const shouldTile = height > 3200 || height / Math.max(1, width) > 3.2;
  if (!shouldTile) {
    let imageData = sourceCanvas.toDataURL('image/jpeg', 0.88);
    if (imageData.length > 3_500_000) imageData = sourceCanvas.toDataURL('image/jpeg', 0.68);
    if (imageData.length > 4_200_000) throw new Error('Receipt photo is too detailed to upload. Please retake it closer and straighter.');
    return {
      images: [imageData],
      fallbackImages: [createTesseractReceiptImage(sourceCanvas, 0.9)],
      mimeType: 'image/jpeg',
      quality,
      tiled: false,
    };
  }

  const tileHeight = 2000;
  const splitSearchRadius = 180;
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = Math.min(320, width);
  analysisCanvas.height = height;
  const analysisContext = analysisCanvas.getContext('2d');
  if (!analysisContext) throw new Error('Could not analyze long receipt sections');
  analysisContext.drawImage(sourceCanvas, 0, 0, analysisCanvas.width, height);
  const sourcePixels = analysisContext.getImageData(0, 0, analysisCanvas.width, height).data;
  const rowInkScore = (y: number) => {
    let darkPixels = 0;
    const startY = Math.max(0, y - 2);
    const endY = Math.min(height - 1, y + 2);
    for (let sampleY = startY; sampleY <= endY; sampleY += 1) {
      for (let x = 0; x < analysisCanvas.width; x += 1) {
        const offset = (sampleY * analysisCanvas.width + x) * 4;
        const luminance = (sourcePixels[offset] * 0.299)
          + (sourcePixels[offset + 1] * 0.587)
          + (sourcePixels[offset + 2] * 0.114);
        if (luminance < 205) darkPixels += 1;
      }
    }
    return darkPixels;
  };
  const chooseSplitY = (target: number, minimum: number, maximum: number) => {
    const searchStart = Math.max(minimum, target - splitSearchRadius);
    const searchEnd = Math.min(maximum, target + splitSearchRadius);
    let bestY = Math.max(minimum, Math.min(maximum, target));
    let bestScore = Number.POSITIVE_INFINITY;
    for (let y = searchStart; y <= searchEnd; y += 4) {
      const score = rowInkScore(y);
      if (score < bestScore) {
        bestScore = score;
        bestY = y;
      }
    }
    return bestY;
  };
  const tileCanvases: HTMLCanvasElement[] = [];
  let top = 0;
  while (top < height && tileCanvases.length < 6) {
    const remainingSlots = 6 - tileCanvases.length;
    const remainingHeight = height - top;
    const mustFitHeight = Math.ceil(remainingHeight / remainingSlots);
    const targetBottom = Math.min(height, top + Math.max(tileHeight, mustFitHeight));
    const bottom = targetBottom >= height
      ? height
      : chooseSplitY(targetBottom, top + Math.min(900, Math.floor((targetBottom - top) / 2)), Math.min(height - 1, targetBottom + splitSearchRadius));
    const visibleHeight = Math.max(1, bottom - top);
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = width;
    tileCanvas.height = visibleHeight;
    const tileContext = tileCanvas.getContext('2d');
    if (!tileContext) throw new Error('Could not prepare long receipt section');
    tileContext.fillStyle = '#FFFFFF';
    tileContext.fillRect(0, 0, width, visibleHeight);
    tileContext.drawImage(sourceCanvas, 0, top, width, visibleHeight, 0, 0, width, visibleHeight);
    tileCanvases.push(tileCanvas);
    top = bottom;
  }

  let images = tileCanvases.map((canvas) => canvas.toDataURL('image/jpeg', 0.82));
  if (images.reduce((sum, value) => sum + value.length, 0) > 3_500_000) {
    images = tileCanvases.map((canvas) => canvas.toDataURL('image/jpeg', 0.62));
  }
  if (images.reduce((sum, value) => sum + value.length, 0) > 4_200_000) {
    throw new Error('Receipt photo is too detailed to upload. Please retake it closer and straighter.');
  }

  // Preserve the same non-overlapping row-safe sections for Tesseract. The
  // former single 1100px-wide long image made small Hebrew glyphs collapse
  // into one another and was the main source of locally generated gibberish.
  const fallbackImages = tileCanvases.map((canvas) => createTesseractReceiptImage(canvas, 0.86));

  return { images, fallbackImages, mimeType: 'image/jpeg', quality, tiled: true };
}

export function compressAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const targetSize = 160;
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }

      // Draw and crop image to a centered square
      const sourceSize = Math.min(img.width, img.height);
      const sourceX = (img.width - sourceSize) / 2;
      const sourceY = (img.height - sourceSize) / 2;

      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        targetSize,
        targetSize
      );

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(compressedDataUrl);
    };

    img.onerror = reject;

    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
