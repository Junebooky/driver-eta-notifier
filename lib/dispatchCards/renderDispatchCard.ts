import type { DispatchCardPhotoSet } from './dispatchCardAssets';

export type CardOrientation = 'pc' | 'mobile';
export type CardPhotoKind = 'exterior' | 'interiorOne' | 'interiorTwo';
export interface CardPlacement {
  zoom: number; // percent, 80–150
  x: number;    // percent of frame width, -20–20
  y: number;    // percent of frame height, -20–20
}
export type CardPhotoPlacements = Partial<Record<CardPhotoKind, CardPlacement>>;

export interface DispatchCardRenderInput {
  name: string;
  position: string;
  phone: string;
  plate: string;
  model: string;
  photoUrl: string;
  photos: DispatchCardPhotoSet;
  orientation: CardOrientation;
  placements?: CardPhotoPlacements;
}

export const DISPATCH_CARD_DIMENSIONS: Record<CardOrientation, { width: number; height: number }> = {
  pc: { width: 2000, height: 1500 },
  mobile: { width: 1080, height: 1920 },
};

type Rect = { x: number; y: number; w: number; h: number };
const GOLD = '#CFBD9C';
const GOLD_LINE = '#8E7C60';
const WHITE = '#F2F0EC';
const DARK = '#161616';
const FONT = 'Arial, "Noto Sans KR", sans-serif';

async function loadImage(src: string): Promise<HTMLImageElement> {
  // Resolve private profile proxy and same-origin vehicle assets to blobs.
  // Never draw a remote image onto the canvas without a safe CORS response.
  const response = await fetch(src, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    throw new Error('이미지를 불러올 수 없습니다 (' + response.status + '): ' + src);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('이미지 형식이 아닙니다: ' + src);
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('이미지 디코딩에 실패했습니다: ' + src));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function photoFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect,
  placement: CardPlacement | undefined,
  contain = false,
) {
  ctx.save();
  ctx.fillStyle = contain ? '#FFFFFF' : '#252525';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const fit = contain
    ? Math.min(rect.w / img.naturalWidth, rect.h / img.naturalHeight)
    : Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
  const zoom = Math.min(1.5, Math.max(0.8, (placement?.zoom || 100) / 100));
  const dw = img.naturalWidth * fit * zoom;
  const dh = img.naturalHeight * fit * zoom;
  const dx = rect.x + (rect.w - dw) / 2 + (placement?.x || 0) * rect.w / 100;
  const dy = rect.y + (rect.h - dh) / 2 + (placement?.y || 0) * rect.h / 100;

  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  ctx.strokeStyle = GOLD_LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
}

function drawText(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  maxWidth?: number,
  align: CanvasTextAlign = 'left',
  family = FONT,
) {
  ctx.save();
  ctx.font = size + 'px ' + family;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.fillStyle = color;
  if (maxWidth) {
    // Always fit user-provided long Korean/English names to the field,
    // without allowing them to overflow the card's information columns.
    let fittingSize = size;
    while (ctx.measureText(value).width > maxWidth && fittingSize > size * 0.65) {
      fittingSize -= 1;
      ctx.font = fittingSize + 'px ' + family;
    }
    ctx.fillText(value, x, y, maxWidth);
  } else {
    ctx.fillText(value, x, y);
  }
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = GOLD_LINE, width = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function goldBeam(ctx: CanvasRenderingContext2D, top: boolean, width: number, height: number) {
  const h = top ? 17 : 16;
  const y = top ? 0 : height - h;
  const grad = ctx.createLinearGradient(0, y, width, y);
  grad.addColorStop(0, '#563616');
  grad.addColorStop(0.12, '#CDA763');
  grad.addColorStop(0.3, '#FFF0B1');
  grad.addColorStop(0.5, '#9F743A');
  grad.addColorStop(0.68, '#FFEDB3');
  grad.addColorStop(0.88, '#AD7D37');
  grad.addColorStop(1, '#553716');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, width, h);
  const glow = ctx.createLinearGradient(0, y, 0, y + h);
  glow.addColorStop(0, 'rgba(255,252,215,0.6)');
  glow.addColorStop(0.4, 'rgba(255,252,215,0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0.36)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, y, width, h);
}

function goldWaves(ctx: CanvasRenderingContext2D, width: number, height: number, startY: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, startY, width, height - startY - 15);
  ctx.clip();
  for (let i = 0; i < 34; i++) {
    const s = i * 12;
    ctx.beginPath();
    ctx.moveTo(-width * 0.1, height - 15 - i * 3);
    ctx.bezierCurveTo(width * 0.12, height - 260 - s, width * 0.23, height + 145 - s, width * 0.37, height - 40);
    ctx.bezierCurveTo(width * 0.58, height - 340 + s * 0.2, width * 0.67, height - 30 + s * 0.1, width * 1.12, height - 210 - s * 0.2);
    ctx.strokeStyle = 'rgba(174,121,43,' + (0.07 + i * 0.004) + ')';
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBrand(ctx: CanvasRenderingContext2D, orientation: CardOrientation) {
  if (orientation === 'pc') {
    drawText(ctx, 'VIP LIMOUSINE KOREA', 112, 126, 58, GOLD, 1180, 'left', 'Georgia, serif');
    drawText(ctx, 'Premium Chauffeur Service', 112, 196, 37, WHITE);
    line(ctx, 112, 252, 1905, 252);
  } else {
    drawText(ctx, 'VIP LIMOUSINE KOREA', 540, 114, 66, GOLD, 900, 'center', 'Georgia, serif');
    drawText(ctx, 'Premium Chauffeur Service', 540, 180, 37, WHITE, 900, 'center');
    line(ctx, 75, 252, 1005, 252);
  }
}

function drawPortraitInfo(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  input: DispatchCardRenderInput,
) {
  if (input.orientation === 'pc') {
    line(ctx, 1127, 287, 1127, 1155, GOLD_LINE, 1.7);
    photoFrame(ctx, image, { x: 1326, y: 288, w: 430, h: 537 }, undefined, true);
    const rows = [
      ['Driver Name', input.name],
      ['Position', input.position],
      ['Vehicle info', input.plate],
      ['Contact No.', input.phone],
    ] as const;
    rows.forEach(([key, value], index) => {
      const y = 909 + index * 76;
      drawText(ctx, key, 1213, y, 24, GOLD, 178);
      line(ctx, 1415, y - 18, 1415, y + 18);
      drawText(ctx, value, 1492, y, 26, WHITE, 380);
    });
  } else {
    photoFrame(ctx, image, { x: 75, y: 1218, w: 297, h: 370 }, undefined, true);
    const rows = [
      ['Name', input.name],
      ['Position', input.position],
      ['Vehicle No.', input.plate],
      ['Contact No.', input.phone],
    ] as const;
    rows.forEach(([key, value], index) => {
      const y = 1252 + index * 106;
      drawText(ctx, key, 430, y, 27, GOLD, 210);
      line(ctx, 638, y - 20, 638, y + 20);
      drawText(ctx, value, 690, y, 28, WHITE, 310);
    });
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, orientation: CardOrientation, w: number, h: number) {
  if (orientation === 'pc') {
    goldWaves(ctx, w, h, 1166);
    line(ctx, 112, 1220, 1905, 1220);
    drawText(ctx, '저희 VIP 리무진 코리아를 이용해 주셔서 감사합니다.', 1000, 1281, 26, WHITE, 1200, 'center');
    drawText(ctx, 'Thank you for choosing VIP Limousine Korea. We wish you a comfortable journey.', 1000, 1356, 22, '#CFC9C0', 1500, 'center');
  } else {
    goldWaves(ctx, w, h, 1692);
    line(ctx, 75, 1705, 1005, 1705);
    drawText(ctx, '저희 VIP 리무진 코리아를 이용해 주셔서 감사합니다.', 540, 1775, 26, WHITE, 970, 'center');
    drawText(ctx, 'Thank you for choosing VIP Limousine Korea.', 540, 1844, 21, '#CFC9C0', 965, 'center');
  }
}

export async function renderDispatchCard(input: DispatchCardRenderInput): Promise<HTMLCanvasElement> {
  if (!input.name.trim() || !input.position.trim() || !input.phone.trim() || !input.photoUrl) {
    throw new Error('기사 사진, 이름, 직책, 전화번호가 모두 필요합니다.');
  }

  const [exterior, interiorOne, interiorTwo, portrait] = await Promise.all([
    loadImage(input.photos.exterior),
    loadImage(input.photos.interiorOne),
    loadImage(input.photos.interiorTwo),
    loadImage(input.photoUrl),
  ]);
  const { width: w, height: h } = DISPATCH_CARD_DIMENSIONS[input.orientation];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('브라우저에서 이미지 렌더링을 지원하지 않습니다.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, w, h);
  goldBeam(ctx, true, w, h);
  drawBrand(ctx, input.orientation);

  if (input.orientation === 'pc') {
    photoFrame(ctx, exterior, { x: 112, y: 288, w: 928, h: 470 }, input.placements?.exterior);
    photoFrame(ctx, interiorOne, { x: 112, y: 770, w: 455, h: 349 }, input.placements?.interiorOne);
    photoFrame(ctx, interiorTwo, { x: 580, y: 770, w: 460, h: 349 }, input.placements?.interiorTwo);
    drawText(ctx, input.model, 576, 1147, 23, '#D0CBC3', 920, 'center');
  } else {
    photoFrame(ctx, exterior, { x: 75, y: 272, w: 930, h: 486 }, input.placements?.exterior);
    drawText(ctx, input.model, 540, 795, 26, '#D0CBC3', 870, 'center');
    photoFrame(ctx, interiorOne, { x: 75, y: 820, w: 449, h: 364 }, input.placements?.interiorOne);
    photoFrame(ctx, interiorTwo, { x: 539, y: 820, w: 466, h: 364 }, input.placements?.interiorTwo);
  }

  drawPortraitInfo(ctx, portrait, input);
  drawFooter(ctx, input.orientation, w, h);
  goldBeam(ctx, false, w, h);
  return canvas;
}

export async function cardCanvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 저장에 실패했습니다.')), 'image/png');
  });
}
