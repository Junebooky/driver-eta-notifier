import type { CardOrientation } from './renderDispatchCard';

/**
 * VIP Limousine Korea's supplied 2172 × 724 WebP artwork (3:1).
 * Keep it outside the vehicle-photo manifest: every chauffeur/card uses it.
 */
export const GOLD_WAVE_IMAGE = '/images/dispatch_cards/backgrounds/gold_wave.webp';
export const GOLD_WAVE_OPACITY = 0.13;

export interface WaveRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The footer mirrors the header horizontally, not vertically. */
  flipX: boolean;
}

/** Dedicated placements preserve the PC/mobile layout and gold frame. */
export const GOLD_WAVE_REGIONS: Record<CardOrientation, {
  top: WaveRegion;
  bottom: WaveRegion;
}> = {
  pc: {
    top: { x: 0, y: 17, w: 2000, h: 270, flipX: false },
    bottom: { x: 0, y: 1166, w: 2000, h: 318, flipX: true },
  },
  mobile: {
    top: { x: 0, y: 17, w: 1080, h: 255, flipX: false },
    bottom: { x: 0, y: 1660, w: 1080, h: 244, flipX: true },
  },
};

export interface WaveDrawRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Cover the destination region without distorting the original 3:1 artwork.
 * Extra edges are clipped by the renderer. Center crop keeps the brightest
 * central gold curve visible while preserving text/image positions.
 */
export function calculateGoldWaveCoverRect(
  imageWidth: number,
  imageHeight: number,
  area: WaveRegion,
): WaveDrawRect {
  if (![imageWidth, imageHeight, area.x, area.y, area.w, area.h].every(Number.isFinite)
    || imageWidth <= 0 || imageHeight <= 0 || area.w <= 0 || area.h <= 0) {
    throw new Error('골드 웨이브 이미지 또는 출력 영역의 크기가 올바르지 않습니다.');
  }
  const scale = Math.max(area.w / imageWidth, area.h / imageHeight);
  const w = imageWidth * scale;
  const h = imageHeight * scale;
  return {
    x: area.x + (area.w - w) / 2,
    y: area.y + (area.h - h) / 2,
    w,
    h,
  };
}
