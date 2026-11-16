import type { CardPlacement } from './renderDispatchCard';

/** One portrait crop per chauffeur, reused by PC and mobile cards for all vehicles. */
export const DEFAULT_DISPATCH_PORTRAIT_PLACEMENT: Readonly<CardPlacement> = {
  zoom: 118,
  x: 0,
  y: 0,
};

export const PORTRAIT_CROP_LIMITS = {
  zoom: { min: 100, max: 240 },
  x: { min: -50, max: 50 },
  y: { min: -50, max: 50 },
} as const;

export function parsePortraitPlacement(value: unknown): CardPlacement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  for (const key of ['zoom', 'x', 'y'] as const) {
    const n = candidate[key];
    const limit = PORTRAIT_CROP_LIMITS[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < limit.min || n > limit.max) {
      return null;
    }
  }
  return { zoom: candidate.zoom as number, x: candidate.x as number, y: candidate.y as number };
}

export function normalizePortraitPlacement(value: unknown): CardPlacement {
  return parsePortraitPlacement(value) || { ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT };
}

interface CropFrame { x: number; y: number; w: number; h: number }

/**
 * Face-biased cover crop. Position is clamped at the image boundaries so
 * even extreme slider values cannot expose white/empty strips in either frame.
 */
export function calculatePortraitCrop(
  imageWidth: number,
  imageHeight: number,
  frame: CropFrame,
  requested: CardPlacement,
): CropFrame {
  if (![imageWidth, imageHeight, frame.x, frame.y, frame.w, frame.h].every(
    n => Number.isFinite(n),
  ) || imageWidth <= 0 || imageHeight <= 0 || frame.w <= 0 || frame.h <= 0) {
    throw new Error('올바른 기사 사진 크기와 프레임이 필요합니다.');
  }

  const placement = normalizePortraitPlacement(requested);
  const fit = Math.max(frame.w / imageWidth, frame.h / imageHeight);
  const w = imageWidth * fit * placement.zoom / 100;
  const h = imageHeight * fit * placement.zoom / 100;
  const desiredX = frame.x + (frame.w - w) / 2 + placement.x * frame.w / 100;
  const desiredY = frame.y + (frame.h - h) * 0.35 + placement.y * frame.h / 100;
  const x = Math.max(frame.x + frame.w - w, Math.min(frame.x, desiredX));
  const y = Math.max(frame.y + frame.h - h, Math.min(frame.y, desiredY));
  return { x, y, w, h };
}
