import { normalizeKoreanMobileNumber } from '@/utils/koreanInternationalPhone';

/** Customer-facing chauffeur roles. These are service roles, not internal corporate ranks. */
export const CHAUFFEUR_POSITION_OPTIONS = [
  { value: 'chauffeur', label: '의전기사', english: 'Chauffeur' },
  { value: 'senior_chauffeur', label: '선임 의전기사', english: 'Senior Chauffeur' },
] as const;

export type ChauffeurPositionCode = (typeof CHAUFFEUR_POSITION_OPTIONS)[number]['value'];

export interface DispatchCardProfile {
  koreanName: string;
  englishName: string;
  positionCode: ChauffeurPositionCode | '';
  phone: string;
}

export function getEnglishPosition(code: string): string {
  return CHAUFFEUR_POSITION_OPTIONS.find(option => option.value === code)?.english || '';
}

export function validateDispatchCardProfile(value: unknown): DispatchCardProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.koreanName !== 'string' || typeof data.englishName !== 'string' ||
      typeof data.phone !== 'string' || typeof data.positionCode !== 'string') return null;
  const koreanName = data.koreanName.trim();
  const englishName = data.englishName.trim().replace(/\s+/g, ' ');
  const phone = data.phone.trim();
  const normalizedPhone = normalizeKoreanMobileNumber(phone);
  if (!koreanName || koreanName.length > 60 || !englishName || englishName.length > 80 ||
      !/^[A-Za-zÀ-ž .'-]+$/.test(englishName) ||
      !phone || phone.length > 55 || !getEnglishPosition(data.positionCode) ||
      (phone.startsWith('+82') && !normalizedPhone)) return null;
  return { koreanName, englishName, phone: normalizedPhone || phone,
    positionCode: data.positionCode as ChauffeurPositionCode };
}

export function formatBilingualChauffeurName(koreanName: string, englishName: string): string {
  return englishName.trim() ? koreanName.trim() + ' · ' + englishName.trim() : koreanName.trim();
}
