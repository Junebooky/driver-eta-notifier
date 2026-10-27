import { EmailCandidateClassification } from '@/types/emailHq';

export interface ClassificationResult {
  classification: EmailCandidateClassification;
  score: number;
  matchedPositive: string[];
  matchedNegative: string[];
  reason: string;
}

// Configurable Positive Keywords (Korean & English)
export const BOOKING_POSITIVE_KEYWORDS = [
  '예약',
  '배차',
  '의전',
  '기사',
  '차량',
  '픽업',
  '샌딩',
  '공항',
  '리무진',
  '카니발',
  '인천공항',
  '김포공항',
  '호텔',
  '출장',
  '일정',
  '탑승',
  '항공편',
  '피켓',
  '수하물',
  '인원',
  '견적',
  'chauffeur',
  'airport transfer',
  'pickup',
  'dropoff',
  'reservation',
  'booking',
  'limousine',
  'flight',
  'itinerary',
  'passenger',
  'arrival',
  'departure',
  'terminal',
  'schedule change',
  'quote',
];

// Obvious Negative Keywords & Patterns (Spam, Newsletters, System Notifications)
export const UNRELATED_NEGATIVE_KEYWORDS = [
  '[광고]',
  '(광고)',
  '뉴스레터',
  'newsletter',
  '수신거부',
  'unsubscribe',
  '회원가입',
  '인증번호',
  '청구서',
  '명세서',
  '영수증',
  '카드결제',
  '자동결제',
  '발신전용',
  'no-reply',
  'noreply',
  'do-not-reply',
  'security alert',
  'promotion',
  '할인쿠폰',
  '이벤트 안내',
  '패스키가 생성',
  '비밀번호 생성',
  '로그인 알림',
  '새로운 환경에서 로그인',
];

/**
 * Classify incoming email header and preview before Gemini invocation
 * Prevents calling expensive Gemini APIs on spam, newsletters, or payment receipts.
 */
export function classifyEmailCandidate(
  subject: string,
  preview: string = '',
  fromAddress: string = ''
): ClassificationResult {
  const normalizedSubject = subject.toLowerCase();
  const normalizedPreview = preview.toLowerCase();
  const combinedText = `${normalizedSubject} ${normalizedPreview}`;

  const matchedPositive: string[] = [];
  const matchedNegative: string[] = [];

  // Check Negative patterns first
  for (const neg of UNRELATED_NEGATIVE_KEYWORDS) {
    if (combinedText.includes(neg.toLowerCase())) {
      matchedNegative.push(neg);
    }
  }

  // Check Positive keywords
  for (const pos of BOOKING_POSITIVE_KEYWORDS) {
    if (combinedText.includes(pos.toLowerCase())) {
      matchedPositive.push(pos);
    }
  }

  // Sender heuristics
  const isNoReply = fromAddress.includes('no-reply') || fromAddress.includes('noreply');
  const hasStrongSubjectKeyword = ['예약', '픽업', '의전', '배차', 'airport transfer', 'chauffeur', 'booking'].some(
    (kw) => normalizedSubject.includes(kw)
  );

  let score = matchedPositive.length * 2 - matchedNegative.length * 3;
  if (hasStrongSubjectKeyword) score += 5;

  let classification: EmailCandidateClassification;
  let reason: string;

  if (matchedNegative.length >= 2 && !hasStrongSubjectKeyword) {
    classification = 'unrelated';
    reason = `광고/자동발신 키워드 감지 (${matchedNegative.join(', ')})`;
  } else if (hasStrongSubjectKeyword || matchedPositive.length >= 2) {
    classification = 'booking_candidate';
    reason = `예약 관련 키워드 감지 (${matchedPositive.slice(0, 3).join(', ')})`;
  } else if (matchedPositive.length === 1 && matchedNegative.length === 0) {
    classification = 'uncertain';
    reason = `예약 가능성 확인 필요 (${matchedPositive[0]})`;
  } else if (matchedNegative.length > 0) {
    classification = 'unrelated';
    reason = `일반 알림 또는 비관련 메일 (${matchedNegative[0]})`;
  } else {
    classification = isNoReply ? 'unrelated' : 'uncertain';
    reason = isNoReply ? '자동 발신 메일' : '키워드 미일치 (수동 분석 권장)';
  }

  return {
    classification,
    score,
    matchedPositive,
    matchedNegative,
    reason,
  };
}
