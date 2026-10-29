/**
 * VIP LIMOUSINE KOREA - Vehicle Slot Parser & Normalizer
 * Resolves AI-extracted vehicle requests into concrete, editable vehicle slots.
 * Strictly prevents hardcoding dummy vehicles (e.g. Sprinter 319 CDI + G90 LWB).
 */

import type { VehicleSlotAssignment } from '@/types/emailHq';

export const STANDARD_FLEET_MODELS = [
  '스타리아 리무진',
  '카니발 하이리무진',
  '스프린터 319 CDI',
  '스프린터 519 CDI',
  'G90 LWB',
  '차량 미지정',
] as const;

export type StandardFleetModel = typeof STANDARD_FLEET_MODELS[number];

/**
 * Normalizes vehicle names and fixes known typos (e.g. CDOI -> CDI).
 */
export function normalizeVehicleModelName(raw: string): string {
  if (!raw) return '차량 미지정';
  let s = raw.trim();

  // Fix typo CDOI -> CDI
  s = s.replace(/CDOI/gi, 'CDI');

  // Staria Limousine
  if (/스타리아/i.test(s)) {
    return '스타리아 리무진';
  }

  // Carnival Hi-Limousine
  if (/카니발/i.test(s)) {
    return '카니발 하이리무진';
  }

  // Sprinter 519 CDI
  if (/519/i.test(s) && /스프린터|sprinter/i.test(s)) {
    return '스프린터 519 CDI';
  }

  // Sprinter 319 CDI
  if (/319/i.test(s) && /스프린터|sprinter/i.test(s)) {
    return '스프린터 319 CDI';
  }

  // Generic Sprinter -> Default to Sprinter 319 CDI unless specified
  if (/스프린터|sprinter/i.test(s)) {
    return '스프린터 319 CDI';
  }

  // Genesis G90 LWB
  if (/G90/i.test(s) || /제네시스/i.test(s)) {
    return 'G90 LWB';
  }

  // Unspecified / Unknown
  if (/미정|미지정|미입력|불명|협의/i.test(s) || s === '') {
    return '차량 미지정';
  }

  return s;
}

/**
 * Returns matching car illustration or photo asset path based on vehicle model name.
 */
export function getVehicleImageForModel(modelName: string): string {
  const norm = normalizeVehicleModelName(modelName);
  if (norm.includes('스프린터')) {
    return '/images/car_sprinter.png';
  }
  if (norm.includes('G90') || norm.includes('제네시스')) {
    return '/images/car_g90.png';
  }
  if (norm.includes('카니발') || norm.includes('스타리아')) {
    return '/images/car_phone_carnival.png';
  }
  return '/images/car_phone_carnival.png';
}

/**
 * Parses requested vehicle text from AI or draft and generates exact vehicle slots.
 *
 * Rules:
 * 1. AI 추출 결과.requestedVehicleClass 또는 예약 초안의 차량 요청값을 그대로 연동
 * 2. 기본 더미 차량(319 CDI, G90 LWB) 자동 세팅 금지
 * 3. 요청 차량이 1대면 1개 카드만 생성
 * 4. 요청 차량이 여러 대면 그 수량/유형대로 생성
 * 5. 차량 정보가 불명확하면 "차량 미지정" 상태로 두고 관리자가 선택
 * 6. "319 CDOI" 같은 오탈자는 "319 CDI"로 정규화
 *
 * Examples:
 * - "스타리아 리무진 1대" -> [ { slotIndex: 0, vehicleModel: "스타리아 리무진", driver: null, status: "unassigned" } ]
 * - "카니발 2대" -> 2 slots: slot 0 & slot 1 "카니발 하이리무진"
 * - "스프린터 1대, G90 1대" -> 2 slots: "스프린터 319 CDI", "G90 LWB"
 * - "차종 미정" / "" -> 1 slot: "차량 미지정"
 */
export function parseVehicleSlotsFromRequestedClass(
  requestedVehicleClass?: string | null
): VehicleSlotAssignment[] {
  const raw = String(requestedVehicleClass || '').trim();

  // If empty or explicitly unspecified, create exactly 1 "차량 미지정" slot
  if (!raw || /미정|미지정|미입력|협의/i.test(raw)) {
    return [
      {
        slotIndex: 0,
        vehicleModel: '차량 미지정',
        driver: null,
        status: 'unassigned',
      },
    ];
  }

  // 1. Check for multi-type delimited strings (e.g. "스프린터 1대, G90 1대" or "스프린터 / G90")
  const delimiters = /[,/+/&]|\b및\b|\band\b/i;
  if (delimiters.test(raw)) {
    const parts = raw
      .split(delimiters)
      .map((p) => p.trim())
      .filter(Boolean);

    const resultSlots: VehicleSlotAssignment[] = [];
    let currentIndex = 0;

    for (const part of parts) {
      // Check count in this part, e.g. "스프린터 2대"
      const countMatch = part.match(/(\d+)\s*대/);
      const count = countMatch ? Math.max(1, parseInt(countMatch[1], 10)) : 1;
      const model = normalizeVehicleModelName(part.replace(/\d+\s*대/, '').trim());

      for (let i = 0; i < count; i++) {
        resultSlots.push({
          slotIndex: currentIndex++,
          vehicleModel: count > 1 ? `${model} (${i + 1}호차)` : model,
          driver: null,
          status: 'unassigned',
        });
      }
    }

    if (resultSlots.length > 0) {
      return resultSlots;
    }
  }

  // 2. Check for single vehicle type with multiple count (e.g. "카니발 2대", "스타리아 리무진 3대")
  const countMatch = raw.match(/(\d+)\s*대/);
  const count = countMatch ? Math.max(1, parseInt(countMatch[1], 10)) : 1;
  const cleanModelText = raw.replace(/\d+\s*대/, '').trim();
  const normalizedModel = normalizeVehicleModelName(cleanModelText);

  const slots: VehicleSlotAssignment[] = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      slotIndex: i,
      vehicleModel: count > 1 ? `${normalizedModel} (${i + 1}호차)` : normalizedModel,
      driver: null,
      status: 'unassigned',
    });
  }

  return slots;
}
