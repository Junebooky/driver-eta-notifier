import type { FieldKnowledgeItem } from '@/types/fieldKnowledge';
import {
  FIELD_KNOWLEDGE_STORAGE_KEY, INITIAL_FIELD_KNOWLEDGE_ITEMS,
} from '@/utils/fieldKnowledgeData';
import { normalizeKnowledgeItem } from '@/utils/sharedFieldKnowledge';

export interface LegacyKnowledgeReview {
  candidates: FieldKnowledgeItem[];
  skippedSamples: number;
  invalid: number;
}

function comparable(item: FieldKnowledgeItem) {
  const { updatedAt: _updatedAt, updatedBy: _updatedBy, ...content } = item;
  return content;
}

/**
 * Browser-local items can contain bundled example guidance. Never push those
 * fixtures to the organization DB without an explicit content change.
 * Candidates are only displayed for review; no upload occurs here.
 */
export function reviewLegacyFieldKnowledge(raw: string | null): LegacyKnowledgeReview {
  const result: LegacyKnowledgeReview = { candidates: [], skippedSamples: 0, invalid: 0 };
  if (!raw) return result;
  let items: unknown;
  try { items = JSON.parse(raw); } catch { return { ...result, invalid: 1 }; }
  if (!Array.isArray(items)) return { ...result, invalid: 1 };
  const examples = new Map(INITIAL_FIELD_KNOWLEDGE_ITEMS.map(item => [item.id, item]));
  for (const input of items) {
    const check = normalizeKnowledgeItem(input);
    if (!check.ok) {
      result.invalid++;
      continue;
    }
    const original = examples.get(check.item.id);
    if (original && JSON.stringify(comparable(original)) === JSON.stringify(comparable(input as FieldKnowledgeItem))) {
      result.skippedSamples++;
      continue;
    }
    result.candidates.push(check.item);
  }
  return result;
}

export function getBrowserKnowledgeImportReview(): LegacyKnowledgeReview {
  if (typeof window === 'undefined') return { candidates: [], skippedSamples: 0, invalid: 0 };
  try {
    return reviewLegacyFieldKnowledge(window.localStorage.getItem(FIELD_KNOWLEDGE_STORAGE_KEY));
  } catch {
    return { candidates: [], skippedSamples: 0, invalid: 1 };
  }
}
