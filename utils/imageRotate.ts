/**
 * Client-side Image Rotation & Compression Utility
 *
 * Physically rotates image via HTML5 Canvas by specified degrees (e.g. +90°, -90°, 180°).
 * Swaps canvas width and height for 90°/270° rotations so horizontal receipts become cleanly vertical.
 * Compresses and downscales high-res mobile photos to prevent LocalStorage QuotaExceededError.
 */

/**
 * Compress and downscale an image data URL to ensure it never exceeds localStorage quota.
 * Scales down large camera photos (e.g. 4032x3024) to max 1200x1200 while preserving readability for OCR and UI preview.
 * Compresses to JPEG with target quality (default 0.75), reducing size from 5MB+ to ~60-120KB.
 */
export const compressReceiptImage = (
  imageUrl: string,
  maxDimension: number = 1200,
  quality: number = 0.75
): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(imageUrl);
      return;
    }

    // Pass through local static asset paths (e.g. /images/...)
    if (imageUrl.startsWith('/') || !imageUrl.startsWith('data:image/')) {
      resolve(imageUrl);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          resolve(imageUrl);
          return;
        }

        // Calculate aspect-preserving dimensions within maxDimension bounding box
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
          resolve(imageUrl);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch (err) {
        console.warn('Image compression failed, using original:', err);
        resolve(imageUrl);
      }
    };

    img.onerror = () => {
      resolve(imageUrl);
    };

    img.src = imageUrl;
  });
};

export const rotateImageDataUrl = (
  imageUrl: string,
  degrees: number = 90,
  maxDimension: number = 1200,
  quality: number = 0.75
): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(imageUrl);
      return;
    }

    // Pass through local static asset paths
    if (imageUrl.startsWith('/') || !imageUrl.startsWith('data:image/')) {
      resolve(imageUrl);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const origWidth = img.naturalWidth || img.width;
        const origHeight = img.naturalHeight || img.height;

        // Normalize degrees to 0, 90, 180, 270
        const normalized = ((degrees % 360) + 360) % 360;
        const isQuarterTurn = normalized === 90 || normalized === 270;

        let targetWidth = isQuarterTurn ? origHeight : origWidth;
        let targetHeight = isQuarterTurn ? origWidth : origHeight;

        // Downscale if exceeds maxDimension
        if (targetWidth > maxDimension || targetHeight > maxDimension) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
            targetWidth = maxDimension;
          } else {
            targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
            targetHeight = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUrl);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((normalized * Math.PI) / 180);

        const drawWidth = isQuarterTurn ? canvas.height : canvas.width;
        const drawHeight = isQuarterTurn ? canvas.width : canvas.height;
        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

        // Export as JPEG with reasonable quality
        const rotatedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(rotatedDataUrl);
      } catch (err) {
        console.warn('Canvas image rotation failed, falling back to original:', err);
        resolve(imageUrl);
      }
    };

    img.onerror = () => {
      resolve(imageUrl);
    };

    img.src = imageUrl;
  });
};

/**
 * Inspect image orientation and aspect ratio
 */
export const checkImageOrientation = (
  imageUrl: string
): Promise<{ width: number; height: number; isLandscape: boolean; aspectRatio: number }> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ width: 0, height: 0, isLandscape: false, aspectRatio: 1 });
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const isLandscape = width > height;
      const aspectRatio = height > 0 ? width / height : 1;
      resolve({ width, height, isLandscape, aspectRatio });
    };

    img.onerror = () => {
      resolve({ width: 0, height: 0, isLandscape: false, aspectRatio: 1 });
    };

    img.src = imageUrl;
  });
};

/**
 * Automatically rotate 90° clockwise if image is landscape (lying down)
 * so receipts are always standing upright and properly compressed
 */
export const autoEnsureUprightReceipt = async (
  imageUrl: string
): Promise<{ url: string; wasRotated: boolean }> => {
  // 1. First compress the image
  const compressed = await compressReceiptImage(imageUrl, 1200, 0.75);
  // 2. Check orientation on compressed image
  const { isLandscape } = await checkImageOrientation(compressed);
  if (isLandscape) {
    const rotated = await rotateImageDataUrl(compressed, 90, 1200, 0.75);
    return { url: rotated, wasRotated: true };
  }
  return { url: compressed, wasRotated: false };
};
