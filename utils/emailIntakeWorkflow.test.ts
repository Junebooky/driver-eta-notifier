import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEmailCandidate } from '../utils/emailClassifier';
import {
  extractBookingDraftFromEmail,
  clearDeduplicationRegistry,
  SYNTHETIC_INBOX_EMAILS,
} from '../services/emailIntakeService';

describe('Phase 4: Selective Email Intake, Deduplication, and Cost Logging', () => {
  beforeEach(() => {
    clearDeduplicationRegistry();
  });

  it('1. Heuristic classifier shortlists booking candidates with high precision', () => {
    const bookingSubject = '[의전 배차 요청] 10/28 해외 바이어 오창 본사 공장 방문 의전 건';
    const bookingSnippet = '10월 28일 오전 09:30 조선팰리스 서울 강남에서 픽업하여 오창 심텍 본사로 이동';
    const result = classifyEmailCandidate(bookingSubject, bookingSnippet, 'client@simmtech.com');

    assert.equal(result.classification, 'booking_candidate');
    assert.ok(result.score > 0);
    assert.ok(result.matchedPositive.length >= 2);
  });

  it('2. Heuristic classifier rejects spam and newsletters as unrelated (zero AI cost)', () => {
    const spamSubject = '[광고] 2026 가을 특가 객실 및 연회장 프로모션 할인 쿠폰 안내';
    const spamSnippet = '가을 시즌 특별 패키지 30% 할인! 수신거부 unsubscribe';
    const result = classifyEmailCandidate(spamSubject, spamSnippet, 'promo@partner.com');

    assert.equal(result.classification, 'unrelated');
    assert.ok(result.matchedNegative.length >= 1);
  });

  it('3. Attempting to extract unrelated spam is rejected without invoking AI', async () => {
    const spamEmail = SYNTHETIC_INBOX_EMAILS.find((e) => e.id === 'em-spam-003');
    assert.ok(spamEmail);

    const extraction = await extractBookingDraftFromEmail(spamEmail!.id);
    assert.equal(extraction.success, false);
    assert.ok(extraction.message?.includes('AI 초안 추출 대상이 아닙니다'));
  });

  it('4. Booking email extraction writes strictly to draft and records token/cost logs', async () => {
    const bookingEmail = SYNTHETIC_INBOX_EMAILS.find((e) => e.id === 'em-simmtech-001');
    assert.ok(bookingEmail);

    const result = await extractBookingDraftFromEmail(bookingEmail!.id);
    assert.equal(result.success, true);
    assert.ok(result.draft);

    const draft = result.draft!;
    assert.equal(draft.emailId, 'em-simmtech-001');
    assert.equal(draft.date, '2026-10-28');
    assert.equal(draft.origin, '조선팰리스 서울 강남');
    assert.equal(draft.destination, '심텍 본사 (오창)');
    assert.equal(draft.passengerName, 'Mr. David Miller');

    // Cost Log verification
    assert.ok(draft.costLog);
    assert.equal(draft.costLog.model, 'gemini-2.5-flash');
    assert.equal(draft.costLog.status, 'success');
    assert.ok(draft.costLog.inputTokens > 0);
    assert.ok(draft.costLog.estimatedCostUsd > 0);
    assert.ok(draft.costLog.estimatedCostKrw > 0);
  });

  it('5. Deduplication Guard: retrying the same email returns cached draft without re-running extraction', async () => {
    const bookingEmail = SYNTHETIC_INBOX_EMAILS[0];

    // First extraction
    const firstResult = await extractBookingDraftFromEmail(bookingEmail.id);
    assert.equal(firstResult.success, true);
    assert.equal(firstResult.draft?.costLog.status, 'success');

    // Second extraction (duplicate retry)
    const secondResult = await extractBookingDraftFromEmail(bookingEmail.id);
    assert.equal(secondResult.success, true);
    assert.equal(secondResult.draft?.costLog.status, 'dedup_cached');
    assert.ok(secondResult.message?.includes('기존 생성된 배차 초안을 반환합니다'));
    assert.equal(secondResult.draft?.messageId, firstResult.draft?.messageId);
  });
});
