/**
 * VIP LIMOUSINE KOREA - Vehicle Slot Parser & Normalizer
 * Resolves AI-extracted vehicle requests into concrete, editable vehicle slots.
 * Strictly prevents hardcoding dummy vehicles (e.g. Sprinter 319 CDI + G90 LWB).
 */

import type { HqEmailExtractedDraft, VehicleSlotAssignment } from '@/types/emailHq';
import { VIP_REAL_VEHICLES, getVehicleImage } from '@/utils/vehicleData';

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
  const normalized = normalizeVehicleModelName(modelName);
  const registered = VIP_REAL_VEHICLES.find(
    (vehicle) => normalizeVehicleModelName(vehicle.model) === normalized
  );
  // Use the same verified vehicle images as the Fleet Management screen.
  // Never substitute screenshots or a different vehicle's picture.
  return registered ? getVehicleImage(registered) : '/images/vehicle_photo_pending.svg';
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
const COMMENTARY_PAREN_RE = /대체|변경|교체|예정|기준|참고|픽업|센딩|일정|기사|운행|만(?:\b|$)|\d{1,2}\s*[/월]\s*\d{1,2}|\d{1,2}\s*~\s*\d{1,2}/i;

/**
 * Splits a requested-vehicle summary at top-level separators only.
 * Never splits inside parentheses (e.g. "(11/9 스타리아 라운지 대체)") or date slashes (e.g. "11/9").
 */
function splitTopLevelVehicleParts(raw: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let depth = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(' || ch === '（' || ch === '[') {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === ')' || ch === '）' || ch === ']') {
      depth = Math.max(0, depth - 1);
      buf += ch;
      continue;
    }

    if (depth === 0) {
      if (ch === ',' || ch === '+' || ch === '&') {
        if (buf.trim()) parts.push(buf.trim());
        buf = '';
        continue;
      }
      if (ch === '/') {
        const prev = i > 0 ? raw[i - 1] : '';
        const next = i + 1 < raw.length ? raw[i + 1] : '';
        if (!(/\d/.test(prev) && /\d/.test(next))) {
          if (buf.trim()) parts.push(buf.trim());
          buf = '';
          continue;
        }
      }
      if (/[\s]/.test(ch)) {
        const rest = raw.slice(i);
        const wordMatch = rest.match(/^\s+(및|and)(?=\s+|$)/i);
        if (wordMatch) {
          if (buf.trim()) parts.push(buf.trim());
          buf = '';
          i += wordMatch[0].length - 1;
          continue;
        }
      }
    }

    buf += ch;
  }

  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function stripVehicleCommentaryParens(part: string): string {
  return part
    .replace(/\(([^()]*)\)|（([^（）]*)）/g, (full, inner1, inner2) => {
      const inner = String(inner1 ?? inner2 ?? '');
      return COMMENTARY_PAREN_RE.test(inner) ? '' : full;
    })
    .replace(/\b\d{1,2}\/\d{1,2}(?:\s*~\s*(?:\d{1,2}\/)?\d{1,2})?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  const parts = splitTopLevelVehicleParts(raw);
  const resultSlots: VehicleSlotAssignment[] = [];
  let currentIndex = 0;

  for (const part of parts) {
    const cleanedPart = stripVehicleCommentaryParens(part);
    if (!cleanedPart || /^[^\p{L}\p{N}]+$/u.test(cleanedPart)) continue;

    const countMatch = cleanedPart.match(/(\d+)\s*대/);
    const count = countMatch ? Math.max(1, Math.min(20, parseInt(countMatch[1], 10))) : 1;
    const cleanModelText = cleanedPart.replace(/\d+\s*대/, '').trim();
    if (!cleanModelText && !countMatch) continue;
    const normalizedModel = normalizeVehicleModelName(cleanModelText);

    for (let i = 0; i < count; i++) {
      resultSlots.push({
        slotIndex: currentIndex++,
        vehicleModel: count > 1 ? `${normalizedModel} (${i + 1}호차)` : normalizedModel,
        driver: null,
        status: 'unassigned',
      });
    }
  }

  if (resultSlots.length > 0) {
    return resultSlots;
  }

  return [
    {
      slotIndex: 0,
      vehicleModel: '차량 미지정',
      driver: null,
      status: 'unassigned',
    },
  ];
}

/**
 * Resolves vehicle assignment slots for an extracted email draft.
 * When a multi-vehicle Excel workbook is scoped to a single active vehicle schedule tab,
 * returns only that single vehicle's slot so the operator isn't asked to assign other vehicles.
 */
export function resolveVehicleSlotsForDraft(
  draft?: HqEmailExtractedDraft | null
): VehicleSlotAssignment[] {
  const allSlots = parseVehicleSlotsFromRequestedClass(draft?.requestedVehicleClass);
  const schedules = draft?.excelVehicleSchedules;
  if (schedules && schedules.length >= 2 && draft?.activeVehicleScheduleId) {
    const idx = schedules.findIndex((s) => s.id === draft.activeVehicleScheduleId);
    if (idx >= 0) {
      const matched = allSlots[idx] || allSlots[0] || {
        slotIndex: 0,
        vehicleModel: '차량 미지정',
        driver: null,
        status: 'unassigned' as const,
      };
      return [{
        ...matched,
        slotIndex: 0,
        driver: null,
        status: 'unassigned',
      }];
    }
  }
  return allSlots;
}
