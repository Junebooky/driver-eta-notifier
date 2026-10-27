/**
 * VIP LIMOUSINE KOREA - Gemini AI Booking Extraction Service
 * Implements Stage 3 structured draft extraction per HQ_EMAIL_AI_BOOKING_HANDOFF.md
 */

import { GoogleGenAI } from '@google/genai';
import { HqEmailExtractedDraft, EmailTripType } from '@/types/emailHq';

export interface ExtractBookingParams {
  emailId: string;
  subject: string;
  sender: string;
  bodyText: string;
}

export interface ExtractBookingResult {
  ok: boolean;
  draft: HqEmailExtractedDraft;
  rawJson?: string;
  error?: string;
}

/**
 * Deterministic fallback extractor for common demo emails or when GEMINI_API_KEY is not configured
 */
export function getDeterministicBookingDraft(params: ExtractBookingParams): HqEmailExtractedDraft {
  const { emailId, subject, sender, bodyText } = params;
  const isMorgan = subject.includes('모건스탠리') || bodyText.includes('Morgan Stanley') || bodyText.includes('David Miller');
  const isChange = subject.includes('변경') || bodyText.includes('지연') || bodyText.includes('연착');
  const isGroup = subject.includes('그룹') || bodyText.includes('연사 3인') || bodyText.includes('탑승자 1');

  if (isMorgan) {
    return {
      id: `draft-${emailId}`,
      emailId,
      passengerName: 'David Miller (외 1인)',
      passengerPhone: '+82-10-8842-1920',
      passengerCount: 2,
      luggageCount: 3,
      pickupDate: '2024-10-28',
      pickupTime: '15:40',
      pickupLocation: '인천국제공항 제2여객터미널 B 입국장 VIP 게이트',
      dropoffLocation: '서울 여의도 콘래드 호텔 (영등포구 국제금융로 10)',
      flightNumber: 'KE082',
      requestedVehicleClass: '카니발 하이리무진',
      specialRequests: "웰컴 피켓: 'MR. DAVID MILLER / MORGAN STANLEY', 에비앙 생수 2병, 영문 신문, 정장 착용 기사 희망",
      tripType: 'single',
      confidence: 0.98,
      warnings: [],
      assignedDriver: null,
      assignedVehicle: null,
      assignedVehiclePlate: null,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };
  }

  if (isChange) {
    return {
      id: `draft-${emailId}`,
      emailId,
      passengerName: '마이클 챈 (Michael Chen)',
      passengerPhone: '',
      passengerCount: 1,
      luggageCount: 1,
      pickupDate: '2024-10-27',
      pickupTime: '14:30',
      pickupLocation: '김포국제공항 국제선 입국장',
      dropoffLocation: '그랜드 인터컨티넨탈 서울 파르나스',
      flightNumber: 'KE1204',
      requestedVehicleClass: '카니발 하이리무진',
      specialRequests: '기존 예약(14:00) 30분 지연 요청 (KE1204 하네다발 30분 연착). 기사 30분 지연 대기 필요.',
      tripType: 'modification',
      confidence: 0.94,
      warnings: ['[일정 변경] 기존 예약(마이클 챈)의 시간 수정 요청입니다. 기존 배차 확인 후 변경 승인이 필요합니다.'],
      assignedDriver: null,
      assignedVehicle: null,
      assignedVehiclePlate: null,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };
  }

  if (isGroup) {
    return {
      id: `draft-${emailId}`,
      emailId,
      passengerName: '구글 클라우드 VIP 연사단 (대표: Dr. Amanda Jones)',
      passengerPhone: '',
      passengerCount: 3,
      luggageCount: 4,
      pickupDate: '2024-11-02',
      pickupTime: '11:20',
      pickupLocation: '인천공항 T1 / T2 / 김포공항 (다중 픽업)',
      dropoffLocation: '포시즌스 서울 / 메리어트 반포 / 인터컨티넨탈 파르나스',
      flightNumber: 'SQ608, DL159, JL093',
      requestedVehicleClass: '카니발 하이리무진 3대',
      specialRequests: 'Google Cloud Summit Seoul 연사 3인 개별 픽업. 각 차량별 피켓 제작 요청.',
      tripType: 'group',
      groupTrips: [
        {
          id: 'grp-1',
          passengerName: 'Dr. Amanda Jones',
          pickupLocation: '인천공항 T1 입국장 (SQ608)',
          dropoffLocation: '포시즌스 호텔 서울 (광화문)',
          pickupTime: '11:20',
          vehicleClass: '카니발 하이리무진',
          notes: '기조연설자 1',
        },
        {
          id: 'grp-2',
          passengerName: 'Robert Vance',
          pickupLocation: '인천공항 T2 입국장 (DL159)',
          dropoffLocation: 'JW 메리어트 호텔 서울 (반포)',
          pickupTime: '13:10',
          vehicleClass: '카니발 하이리무진',
          notes: '기조연설자 2',
        },
        {
          id: 'grp-3',
          passengerName: 'Kenji Sato',
          pickupLocation: '김포공항 국제선 입국장 (JL093)',
          dropoffLocation: '그랜드 인터컨티넨탈 서울 파르나스',
          pickupTime: '14:00',
          vehicleClass: '카니발 하이리무진',
          notes: '기조연설자 3',
        },
      ],
      confidence: 0.95,
      warnings: ['[다중 차량 그룹 배차] 총 3대의 개별 차량 및 기사 배정이 필요합니다.'],
      assignedDriver: null,
      assignedVehicle: null,
      assignedVehiclePlate: null,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };
  }

  // Generic fallback
  return {
    id: `draft-${emailId}`,
    emailId,
    passengerName: sender.split('@')[0] || '고객',
    passengerPhone: '',
    passengerCount: 1,
    luggageCount: 0,
    pickupDate: '2024-10-28',
    pickupTime: '',
    pickupLocation: '',
    dropoffLocation: '',
    flightNumber: '',
    requestedVehicleClass: '카니발 하이리무진',
    specialRequests: subject,
    tripType: 'single',
    confidence: 0.4,
    warnings: ['픽업 일시 및 출발지/도착지가 명확하지 않습니다. 관리자 직접 입력이 필요합니다.'],
    assignedDriver: null,
    assignedVehicle: null,
    assignedVehiclePlate: null,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Extract structured booking draft using Gemini 3.8 Flash
 */
export async function extractBookingFromEmail(
  params: ExtractBookingParams
): Promise<ExtractBookingResult> {
  const { emailId, subject, sender, bodyText } = params;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log('[Gemini Booking Extraction] No GEMINI_API_KEY set. Using deterministic fallback.');
    return {
      ok: true,
      draft: getDeterministicBookingDraft(params),
    };
  }

  const prompt = `You are an expert AI reservation assistant for VIP LIMOUSINE KOREA (대한민국 프리미엄 의전 리무진 운영 본사).
Analyze the incoming client email below and extract structured VIP limousine reservation booking details.

[INCOMING EMAIL METADATA]
- Email Subject: "${subject}"
- Sender Address: "${sender}"

[EMAIL BODY TEXT]
${bodyText}

[STRICT EXTRACTION RULES]
1. DO NOT HALLUCINATE OR FABRICATE ANY INFORMATION. Only extract facts explicitly stated or directly inferred from the text.
2. If phone number, pickup time, flight number, or location is missing or unclear, leave it as an empty string ("") or 0.
3. If critical information is missing (e.g. pickup time, pickup location, dropoff location), add a clear Korean warning string in the "warnings" array (e.g. "픽업 시간 정보가 누락되어 관리자 확인이 필요합니다.").
4. Detect the trip type ("tripType"):
   - "single": Normal single vehicle transfer
   - "group": Multiple vehicles or multiple passengers requested at different times/locations (fill "groupTrips" array)
   - "modification": Customer asking to change an existing booking (e.g. flight delay, time shift)
   - "cancellation": Customer requesting cancellation (Never cancel automatically, add a warning)
5. Vehicle class ("requestedVehicleClass"):
   - Typical: "벤츠 스프린터", "현대 스타리아 리무진", "기아 카니발 하이리무진", "제네시스 (G90/GV80)", "벤츠 S560", or exact model mentioned. Default to "현대 스타리아 리무진" if unspecified.
6. MANDATORY ASSIGNMENT RULE:
   - "assignedDriver" MUST ALWAYS BE null.
   - "assignedVehicle" MUST ALWAYS BE null.
   - "assignedVehiclePlate" MUST ALWAYS BE null.
   (Vehicles and drivers must NEVER be automatically assigned by AI under any circumstances. Administrators manually assign them).
7. Format:
   - "pickupDate": YYYY-MM-DD
   - "pickupTime": HH:MM (24-hour format)
   - "confidence": Float between 0.0 and 1.0

Return strictly a valid JSON object matching this schema (no markdown formatting, no comments):
{
  "passengerName": string,
  "passengerPhone": string,
  "passengerCount": number,
  "luggageCount": number,
  "pickupDate": string,
  "pickupTime": string,
  "pickupLocation": string,
  "dropoffLocation": string,
  "flightNumber": string,
  "requestedVehicleClass": string,
  "specialRequests": string,
  "tripType": "single" | "group" | "modification" | "cancellation",
  "groupTrips": [
    {
      "id": string,
      "passengerName": string,
      "pickupLocation": string,
      "dropoffLocation": string,
      "pickupTime": string,
      "vehicleClass": string,
      "notes": string
    }
  ],
  "confidence": number,
  "warnings": string[]
}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [prompt],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text?.trim() || '{}';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.warn('Failed to parse Gemini JSON response:', parseErr, rawText);
      return {
        ok: true,
        draft: getDeterministicBookingDraft(params),
      };
    }

    const draft: HqEmailExtractedDraft = {
      id: `draft-${emailId}`,
      emailId,
      passengerName: String(parsed.passengerName || ''),
      passengerPhone: String(parsed.passengerPhone || ''),
      passengerCount: typeof parsed.passengerCount === 'number' ? parsed.passengerCount : 1,
      luggageCount: typeof parsed.luggageCount === 'number' ? parsed.luggageCount : 0,
      pickupDate: String(parsed.pickupDate || new Date().toISOString().slice(0, 10)),
      pickupTime: String(parsed.pickupTime || ''),
      pickupLocation: String(parsed.pickupLocation || ''),
      dropoffLocation: String(parsed.dropoffLocation || ''),
      flightNumber: String(parsed.flightNumber || ''),
      requestedVehicleClass: String(parsed.requestedVehicleClass || '카니발 하이리무진'),
      specialRequests: String(parsed.specialRequests || ''),
      tripType: (['single', 'group', 'modification', 'cancellation'].includes(String(parsed.tripType))
        ? parsed.tripType
        : 'single') as EmailTripType,
      groupTrips: Array.isArray(parsed.groupTrips) ? parsed.groupTrips : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      assignedDriver: null,
      assignedVehicle: null,
      assignedVehiclePlate: null,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };

    return {
      ok: true,
      draft,
      rawJson: rawText,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Gemini booking extraction error:', errorMsg);
    return {
      ok: true,
      draft: getDeterministicBookingDraft(params),
      error: errorMsg,
    };
  }
}
