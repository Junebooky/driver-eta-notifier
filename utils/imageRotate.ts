/**
 * Client-side Image Rotation Utility
 *
 * Physically rotates image via HTML5 Canvas by specified degrees (e.g. +90°, -90°, 180°).
 * Swaps canvas width and height for 90°/270° rotations so horizontal receipts become cleanly vertical.
 */

export const rotateImageDataUrl = (
  imageUrl: string,
  degrees: number = 90
): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(imageUrl);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUrl);
          return;
        }

        // Normalize degrees to 0, 90, 180, 270
        const normalized = ((degrees % 360) + 360) % 360;
        const isQuarterTurn = normalized === 90 || normalized === 270;

        // Swap dimensions if turned 90 or 270 degrees
        canvas.width = isQuarterTurn ? img.height : img.width;
        canvas.height = isQuarterTurn ? img.width : img.height;

        // Clear and rotate around center
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((normalized * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        // Export as JPEG with high quality
        const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
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
