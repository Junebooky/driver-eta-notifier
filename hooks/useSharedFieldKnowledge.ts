'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SharedKnowledgeItem } from '@/utils/sharedFieldKnowledge';

export interface SharedKnowledgeSnapshot {
  items: SharedKnowledgeItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Shared server read path for HQ and authenticated driver clients.
 * Poll while mounted and revalidate when the app regains focus.
 * No browser-local/demo fallback when the server is unavailable.
 */
export function useSharedFieldKnowledge(enabled = true): SharedKnowledgeSnapshot {
  const [items, setItems] = useState<SharedKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = ++requestSequence.current;
    setLoading(true);
    try {
      const response = await fetch('/api/field-knowledge', { cache: 'no-store' });
      const json = await response.json().catch(() => ({})) as {
        ok?: boolean; error?: string; items?: SharedKnowledgeItem[];
      };
      if (!response.ok || !json.ok || !Array.isArray(json.items)) {
        throw new Error(json.error || '공용 현장 지식 동기화에 실패했습니다.');
      }
      if (active.current && current === requestSequence.current) {
        setItems(json.items);
        setError(null);
      }
    } catch (err) {
      if (active.current && current === requestSequence.current) {
        setError(err instanceof Error ? err.message : '공용 현장 지식을 불러오지 못했습니다.');
      }
    } finally {
      if (active.current && current === requestSequence.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    active.current = true;
    if (!enabled) {
      ++requestSequence.current;
      setLoading(false);
      return () => { active.current = false; ++requestSequence.current; };
    }
    void refresh();
    const check = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const intervalId = window.setInterval(check, 30000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      active.current = false;
      ++requestSequence.current;
      clearInterval(intervalId);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, refresh]);

  return { items, loading, error, refresh };
}

export async function mutateSharedFieldKnowledge(
  method: 'POST' | 'PUT' | 'DELETE',
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; item?: SharedKnowledgeItem; imported?: number; skipped?: number; status?: number }> {
  try {
    const response = await fetch('/api/field-knowledge', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ...body, ok: response.ok && body.ok === true, status: response.status,
      error: response.ok && body.ok === true ? undefined : (body.error || '공용 현장 지식 저장에 실패했습니다.'),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '네트워크 연결을 확인해 주세요.' };
  }
}
