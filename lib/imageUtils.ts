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
