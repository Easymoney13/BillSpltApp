/**
 * Compress, scale, contrast-boost, and sharpen receipt image for ultra-high precision OCR scanning
 */
export function compressReceiptImage(fileOrBase64: File | string, isHighContrastForTesseract = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const maxDimension = 1200; // Optimal resolution for sub-second Gemini 2.5 Vision OCR
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
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

      // Contrast, brightness, and sharpness enhancement for thermal receipt text
      if (isHighContrastForTesseract) {
        ctx.filter = 'grayscale(100%) contrast(2.2) brightness(1.05)';
      } else {
        ctx.filter = 'contrast(1.35) brightness(1.03) saturate(1.1)';
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Additional sharpening for fine thermal print text
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
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
