import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEmailInboxCache,
  setEmailInboxCache,
  getCachedEmailDetail,
  getAllCachedEmailDetails,
  setCachedEmailDetail,
  clearEmailInboxCache,
  EMAIL_CACHE_TTL_MS,
} from './emailHqStorage';
import { HqEmailSummary, HqEmailDetail } from '@/types/emailHq';

describe('HQ Email Inbox & Detail Client Cache Suite', () => {
  beforeEach(() => {
    clearEmailInboxCache();
  });

  const mockEmailSummary: HqEmailSummary = {
    id: 'em-test-101',
    uid: 101,
    provider: 'naver',
    from: { name: 'VIP Client', address: 'client@example.com' },
    to: ['dispatch@viplimousine.kr'],
    subject: '[예약 문의] 11/05 인천공항 픽업 의전 건',
    receivedAt: '10:30',
    dateIso: '2026-11-05T01:30:00Z',
    isUnread: true,
    flags: ['\\Seen'],
    preview: '11월 5일 오전 9시 30분 인천공항 제2터미널 픽업 의전 요청드립니다.',
    hasAttachments: false,
    candidateClassification: 'booking_candidate',
    aiStatus: 'not_analyzed',
  };

  const mockImapState = {
    isConfigured: true,
    syncStatus: 'connected' as const,
    totalCount: 1,
    unreadCount: 1,
    accountEmail: 'vip@viplimousine.kr',
    lastSync: '오전 10:30',
  };

  const mockEmailDetail: HqEmailDetail = {
    ...mockEmailSummary,
    bodyText: '상세 일정: 11월 5일 오전 09:30 인천공항 T2 -> 파크하얏트 서울',
    to: ['dispatch@viplimousine.kr'],
  };

  it('1. Returns null when inbox cache is uninitialized', () => {
    const cache = getEmailInboxCache();
    assert.equal(cache, null);
  });

  it('2. Saves and immediately restores warm inbox cache with isStale: false', () => {
    setEmailInboxCache([mockEmailSummary], mockImapState);

    const cache = getEmailInboxCache();
    assert.ok(cache);
    assert.equal(cache.isStale, false);
    assert.equal(cache.data.emails.length, 1);
    assert.equal(cache.data.emails[0].id, 'em-test-101');
    assert.equal(cache.data.imapState.syncStatus, 'connected');
    assert.equal(cache.data.imapState.totalCount, 1);
  });

  it('3. Flags cache as stale when elapsed time exceeds TTL', () => {
    setEmailInboxCache([mockEmailSummary], mockImapState);

    // Query with 0ms TTL to simulate expired cache
    const cache = getEmailInboxCache(0);
    assert.ok(cache);
    assert.equal(cache.isStale, true);
    // Data remains available for instant render / stale-while-revalidate
    assert.equal(cache.data.emails.length, 1);
  });

  it('4. Caches and retrieves individual email details without re-fetch', () => {
    assert.equal(getCachedEmailDetail('em-test-101'), null);

    setCachedEmailDetail(mockEmailDetail);
    const retrieved = getCachedEmailDetail('em-test-101');
    assert.ok(retrieved);
    assert.equal(retrieved.id, 'em-test-101');
    assert.equal(retrieved.bodyText, '상세 일정: 11월 5일 오전 09:30 인천공항 T2 -> 파크하얏트 서울');

    const all = getAllCachedEmailDetails();
    assert.ok(all['em-test-101']);
  });

  it('5. Clears all inbox and detail cache cleanly', () => {
    setEmailInboxCache([mockEmailSummary], mockImapState);
    setCachedEmailDetail(mockEmailDetail);

    clearEmailInboxCache();
    assert.equal(getEmailInboxCache(), null);
    assert.equal(getCachedEmailDetail('em-test-101'), null);
    assert.deepEqual(getAllCachedEmailDetails(), {});
  });
});
