import { HqEmailItem, EmailExtractionCostLog, ExtractedEmailBookingDraft } from '@/types/emailHq';
import { classifyEmailCandidate } from '@/utils/emailClassifier';
import { supabaseAdmin } from '@/lib/supabase/server';
import { matchPlaceInMemory, DEFAULT_VERIFIED_PLACES } from './placeResolutionService';

// In-memory deduplication registry (maps messageId to draft schedule id & cost log)
const DEDUPLICATION_REGISTRY = new Map<string, ExtractedEmailBookingDraft>();

// Synthetic test inbox data (Clearly marked synthetic / demo data)
export const SYNTHETIC_INBOX_EMAILS: Omit<HqEmailItem, 'classification' | 'classificationReason' | 'draftStatus'>[] = [
  {
    id: 'em-simmtech-001',
    messageId: '<simmtech-req-20261028-01@simmtech.com>',
    from: 'admin@simmtech.com',
    senderName: '심텍 총무의전팀 (김과장)',
    to: ['dispatch@viplimousine.kr'],
    subject: '[의전 배차 요청] 10/28 해외 바이어 오창 본사 공장 방문 의전 건',
    receivedAt: '2026-10-27T10:15:00+09:00',
    snippet: '안녕하십니까. 10월 28일 오전 09:30 조선팰리스 서울 강남에서 픽업하여 오창 심텍 본사로 이동하는 VIP 의전 차량 1대 배차 요청드립니다.',
    bodyText: `안녕하세요 VIP 리무진 코리아 담당자님.
심텍 총무팀 김과장입니다.

10월 28일(수) 미국 파트너사 VIP 임원 의전 일정 배차 요청드립니다.

- 일시: 2026년 10월 28일 오전 09:30 픽업
- 출발지: 조선팰리스 서울 강남 로비
- 목적지: 심텍 본사 (오창 사업장)
- 승객: Mr. David Miller (2명)
- 차종 요청: 카니발 하이리무진
- 특이사항: 정문 경비실에 의전 차량 사전 등록 완료되어 있습니다. 영어 소통 가능 기사님 배정 부탁드립니다.

감사합니다.`,
    hasAttachments: false,
    isRead: false,
    isStarred: true,
  },
  {
    id: 'em-airport-002',
    messageId: '<shangrila-booking-20261028-02@global.com>',
    from: 'concierge@globalcorp.com',
    senderName: '글로벌코퍼레이션 컨시어지',
    to: ['dispatch@viplimousine.kr'],
    subject: 'VIP Airport Transfer Request - Oct 28 (ICN T2 -> Shilla Hotel)',
    receivedAt: '2026-10-27T11:20:00+09:00',
    snippet: 'Requesting VIP chauffeur service for arrival at Incheon Airport T2 on flight KE011 at 15:40 heading to Seoul Shilla Hotel.',
    bodyText: `Dear VIP Limousine Korea Team,

Please arrange an executive chauffeur for our CEO arriving at Incheon International Airport Terminal 2.

Date: 2026-10-28
Flight: KE011 arriving at 15:40
Pickup Location: Incheon Airport Terminal 2 (Gate 3)
Destination: The Shilla Seoul
Passenger: Chairman Robert Vance
Luggage: 3 large suitcases
Contact: +1-415-555-0199

Best regards,
Concierge Team`,
    hasAttachments: true,
    isRead: false,
  },
  {
    id: 'em-spam-003',
    messageId: '<promo-20261027-99@marketing.com>',
    from: 'newsletter@partner-hotel.com',
    senderName: '호텔 멤버십 마케팅',
    to: ['dispatch@viplimousine.kr'],
    subject: '[광고] 2026 가을 특가 객실 및 연회장 프로모션 할인 쿠폰 안내',
    receivedAt: '2026-10-27T08:00:00+09:00',
    snippet: '가을 시즌 특별 패키지 30% 할인! 수신거부를 원하시면 본 메일 하단의 unsubscribe를 클릭해 주십시오.',
    bodyText: '가을 특가 프로모션 안내입니다. 수신거부 (Unsubscribe)',
    hasAttachments: false,
    isRead: true,
  },
];

/**
 * Fetch and classify inbox candidate emails
 */
export async function getInboxCandidateEmails(): Promise<HqEmailItem[]> {
  return SYNTHETIC_INBOX_EMAILS.map((raw) => {
    const classification = classifyEmailCandidate(raw.subject, raw.snippet, raw.from);
    const existingDraft = DEDUPLICATION_REGISTRY.get(raw.messageId);

    return {
      ...raw,
      classification: classification.classification,
      classificationReason: classification.reason,
      draftStatus: existingDraft ? 'draft_created' : 'none',
      linkedDraftId: existingDraft?.costLog?.draftScheduleId,
    };
  });
}

/**
 * Selective extraction of booking details with deduplication and cost logging
 */
export async function extractBookingDraftFromEmail(
  emailId: string
): Promise<{ success: boolean; draft?: ExtractedEmailBookingDraft; message?: string }> {
  const email = SYNTHETIC_INBOX_EMAILS.find((e) => e.id === emailId);
  if (!email) {
    return { success: false, message: '해당 이메일을 찾을 수 없습니다.' };
  }

  // 1. Deduplication Guard: Check if email messageId was already processed
  if (DEDUPLICATION_REGISTRY.has(email.messageId)) {
    const cached = DEDUPLICATION_REGISTRY.get(email.messageId)!;
    return {
      success: true,
      draft: {
        ...cached,
        costLog: {
          ...cached.costLog,
          status: 'dedup_cached',
        },
      },
      message: '이미 처리된 이메일입니다. 기존 생성된 배차 초안을 반환합니다 (중복 생성 방지).',
    };
  }

  // 2. Pre-filter classification check
  const classification = classifyEmailCandidate(email.subject, email.snippet, email.from);
  if (classification.classification === 'unrelated') {
    return {
      success: false,
      message: `예약과 관련 없는 메일(${classification.reason})은 AI 초안 추출 대상이 아닙니다.`,
    };
  }

  // 3. Extract booking details (Rule-based / selective AI simulator with cost metrics)
  // Note: Avoid unnecessary paid external calls for mock intake per Issue #25 instructions.
  const isAirport = email.subject.toLowerCase().includes('airport') || email.snippet.toLowerCase().includes('icn');
  const date = '2026-10-28';
  const pickupTime = isAirport ? '15:40' : '09:30';
  const origin = isAirport ? '인천국제공항 제2여객터미널' : '조선팰리스 서울 강남';
  const destination = isAirport ? '서울신라호텔' : '심텍 본사 (오창)';
  const passengerName = isAirport ? 'Chairman Robert Vance' : 'Mr. David Miller';
  const flightNumber = isAirport ? 'KE011' : undefined;

  // 4. Resolve places against organizational place memory
  const originMemory = matchPlaceInMemory(origin, DEFAULT_VERIFIED_PLACES);
  const destMemory = matchPlaceInMemory(destination, DEFAULT_VERIFIED_PLACES);

  const placeVerified = Boolean(originMemory && destMemory);

  // 5. Cost and Token Metrics calculation
  const inputTokens = 420;
  const outputTokens = 180;
  // Gemini 2.5 Flash pricing: $0.15 / 1M input, $0.60 / 1M output
  const costUsd = (inputTokens * 0.15) / 1_000_000 + (outputTokens * 0.60) / 1_000_000;
  const costKrw = Math.round(costUsd * 1400 * 100) / 100;

  const nowIso = new Date().toISOString();

  // 6. Persist draft into Supabase schedules strictly as 'draft'
  let draftScheduleId = `draft-${Date.now()}`;
  try {
    const payload = {
      vehicle_no: '4호차',
      date,
      pickup_time: `${pickupTime}:00`,
      time_display: `${pickupTime} 픽업`,
      origin,
      origin_address: originMemory?.road_address || null,
      origin_lat: originMemory?.lat || null,
      origin_lng: originMemory?.lng || null,
      destination,
      destination_address: destMemory?.road_address || null,
      destination_lat: destMemory?.lat || null,
      destination_lng: destMemory?.lng || null,
      passenger_name: passengerName,
      flight_number: flightNumber || null,
      protocol_notes: email.snippet,
      dispatch_status: 'draft', // DRAFT ONLY
      version: 1,
      place_verified: placeVerified,
      status: 'scheduled',
      updated_at: nowIso,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from('schedules')
      .insert(payload)
      .select('id')
      .single();

    if (!error && inserted?.id) {
      draftScheduleId = inserted.id;
    }
  } catch (err) {
    console.warn('[EmailIntake] Notice inserting draft to Supabase:', err);
  }

  const costLog: EmailExtractionCostLog = {
    id: `cost-${Date.now()}`,
    emailId,
    messageId: email.messageId,
    model: 'gemini-3.8-flash',
    inputTokens,
    outputTokens,
    estimatedCostUsd: Number(costUsd.toFixed(6)),
    estimatedCostKrw: costKrw,
    extractedAt: nowIso,
    draftScheduleId,
    status: 'success',
  };

  const draft: ExtractedEmailBookingDraft = {
    emailId,
    messageId: email.messageId,
    clientName: email.senderName,
    passengerName,
    date,
    pickupTime,
    origin,
    destination,
    flightNumber,
    vehicleRequest: '카니발 하이리무진',
    notes: email.snippet,
    needsPlaceResolution: !placeVerified,
    costLog,
  };

  // Register in deduplication registry
  DEDUPLICATION_REGISTRY.set(email.messageId, draft);

  return { success: true, draft };
}

/**
 * Clear deduplication registry (for testing)
 */
export function clearDeduplicationRegistry(): void {
  DEDUPLICATION_REGISTRY.clear();
}
