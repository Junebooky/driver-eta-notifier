import type { FieldKnowledgeItem } from '@/types/fieldKnowledge';
import { isValidFieldKnowledgeImageUrl } from '@/utils/hqKnowledgeImageUrl';

export type SharedKnowledgeItem = FieldKnowledgeItem & { version: number };
export const FIELD_KNOWLEDGE_ORG = 'vip_limousine_korea';

const CATEGORY = new Set(['공항', '호텔', '식당', '쇼핑', '교통', '긴급', '기타']);
const FIELDS = {
  title: 160, subtitle: 240, description: 1500, address: 500, phone: 150,
  website: 2048, freeParkingNotice: 3000, sprinterWaiting: 3000,
  restroomLocation: 3000, pickupLocationNotes: 3000,
  vehicleWaitingNotes: 3000, cautionNotes: 3000, additionalNotes: 5000,
  categoryBadge: 100,
} as const;

export function normalizeKnowledgeItem(value: unknown):
  { ok: true; item: FieldKnowledgeItem } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: '현장 지식 입력 내용을 확인해 주세요.' };
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id)) {
    return { ok: false, error: '유효하지 않은 항목 ID입니다.' };
  }
  if (!CATEGORY.has(String(row.category))) return { ok: false, error: '카테고리를 확인해 주세요.' };
  const clean: Record<string, string> = {};
  for (const [key, limit] of Object.entries(FIELDS)) {
    const v = row[key];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      return { ok: false, error: `${key} 항목은 문자열이어야 합니다.` };
    }
    clean[key] = String(v || '').trim();
    if (clean[key].length > limit) return { ok: false, error: `${key} 입력 길이를 확인해 주세요.` };
  }
  if (!clean.title) return { ok: false, error: '장소명을 입력해 주세요.' };
  const imageUrl = typeof row.imageUrl === 'string' ? row.imageUrl.trim() : '';
  if (!isValidFieldKnowledgeImageUrl(imageUrl)) {
    return { ok: false, error: '대표 이미지 주소는 HTTPS 또는 앱 이미지 경로여야 합니다.' };
  }
  const photos = row.photos === undefined ? [] : row.photos;
  if (!Array.isArray(photos) || photos.length > 25 || photos.some(p =>
    typeof p !== 'string' || !isValidFieldKnowledgeImageUrl(p)
  )) {
    return { ok: false, error: '추가 사진은 25장 이하의 유효한 HTTPS 이미지 주소만 허용합니다.' };
  }
  if (clean.website) {
    try {
      const link = new URL(clean.website);
      if (link.protocol !== 'https:' || !link.hostname || link.username || link.password) throw new Error();
    } catch {
      return { ok: false, error: '홈페이지 주소는 https://로 시작해야 합니다.' };
    }
  }
  const item: FieldKnowledgeItem = {
    id, title: clean.title, subtitle: clean.subtitle,
    category: row.category as FieldKnowledgeItem['category'],
    categoryBadge: clean.categoryBadge || String(row.category),
    description: clean.description, address: clean.address,
    imageUrl, photos: photos.map((p: string) => p.trim()),
    phone: clean.phone, website: clean.website,
    freeParkingNotice: clean.freeParkingNotice,
    sprinterWaiting: clean.sprinterWaiting,
    restroomLocation: clean.restroomLocation,
    pickupLocationNotes: clean.pickupLocationNotes,
    vehicleWaitingNotes: clean.vehicleWaitingNotes,
    cautionNotes: clean.cautionNotes,
    additionalNotes: clean.additionalNotes,
    updatedAt: '',
    updatedBy: '',
  };
  return { ok: true, item };
}

export function mapSharedKnowledgeRow(raw: Record<string, unknown>): SharedKnowledgeItem {
  const content = raw.content && typeof raw.content === 'object' && !Array.isArray(raw.content)
    ? raw.content as FieldKnowledgeItem : {} as FieldKnowledgeItem;
  return {
    ...content,
    id: String(raw.id),
    version: Number(raw.version),
    updatedAt: String(raw.updated_at),
    updatedBy: String(raw.updated_by || ''),
  };
}
