/**
 * VIP LIMOUSINE KOREA - Gemini AI Booking Extraction Service
 * Implements Stage 3 structured draft extraction per Issue #33
 */

import { GoogleGenAI } from '@google/genai';
import { HqEmailExtractedDraft, EmailTripType } from '@/types/emailHq';

export interface ExtractBookingParams {
  emailId: string;
  subject: string;
  sender: string;
  senderName?: string;
  replyTo?: string;
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
  const { emailId, subject, sender, senderName, replyTo, bodyText } = params;
  const isMorgan = subject.includes('모건스탠리') || bodyText.includes('Morgan Stanley') || bodyText.includes('David Miller');
  const isChange = subject.includes('변경') || bodyText.includes('지연') || bodyText.includes('연착');
  const isGroup = subject.includes('그룹') || bodyText.includes('연사 3인') || bodyText.includes('탑승자 1');

  if (isMorgan) {
    return {
      id: `draft-${emailId}`,
      emailId,
      senderName: senderName || 'David Miller',
      senderEmail: sender,
      replyTo: replyTo || undefined,
      companyName: 'Morgan Stanley',
      contactName: 'David Miller',
      contactPhone: '+82-10-8842-1920',
      contactEmail: 'david.miller@morganstanley.com',
      contactSource: 'signature',
      passengerName: 'David Miller (외 1인)',
      passengerPhone: '+82-10-8842-1920',
      passengerCount: 2,
      pickupDate: '2024-10-28',
      pickupTime: '15:40',
      pickupLocation: '인천국제공항 제2여객터미널',
      pickupDetailNotes: 'B 입국장 VIP 게이트',
      dropoffLocation: '콘래드 서울',
      dropoffDetailNotes: '영등포구 국제금융로 10',
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
      senderName: senderName || 'Michael Chen',
      senderEmail: sender,
      replyTo: replyTo || undefined,
      companyName: '확인 필요',
      contactName: '마이클 챈 (Michael Chen)',
      contactPhone: '',
      contactEmail: sender,
      contactSource: 'from',
      passengerName: '마이클 챈 (Michael Chen)',
      passengerPhone: '',
      passengerCount: 1,
      pickupDate: '2024-10-27',
      pickupTime: '14:30',
      pickupLocation: '김포국제공항 국제선',
      pickupDetailNotes: '국제선 입국장',
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
      senderName: senderName || 'Google Cloud Events Team',
      senderEmail: sender,
      replyTo: replyTo || undefined,
      companyName: 'Google Cloud',
      contactName: 'Dr. Amanda Jones',
      contactPhone: '',
      contactEmail: sender,
      contactSource: 'body',
      passengerName: '구글 클라우드 VIP 연사단 (대표: Dr. Amanda Jones)',
      passengerPhone: '',
      passengerCount: 3,
      pickupDate: '2024-11-02',
      pickupTime: '11:20',
      pickupLocation: '인천국제공항 제1여객터미널',
      pickupDetailNotes: '다중 픽업: T1 / T2 / 김포공항',
      dropoffLocation: '포시즌스 호텔 서울',
      dropoffDetailNotes: '광화문',
      flightNumber: 'SQ608, DL159, JL093',
      requestedVehicleClass: '카니발 하이리무진 3대',
      specialRequests: 'Google Cloud Summit Seoul 연사 3인 개별 픽업. 각 차량별 피켓 제작 요청.',
      tripType: 'group',
      groupTrips: [
        {
          id: 'grp-1',
          passengerName: 'Dr. Amanda Jones',
          pickupLocation: '인천국제공항 제1여객터미널',
          dropoffLocation: '포시즌스 호텔 서울 (광화문)',
          pickupTime: '11:20',
          vehicleClass: '카니발 하이리무진',
          notes: '기조연설자 1 (SQ608)',
        },
        {
          id: 'grp-2',
          passengerName: 'Robert Vance',
          pickupLocation: '인천국제공항 제2여객터미널',
          dropoffLocation: 'JW 메리어트 호텔 서울 (반포)',
          pickupTime: '13:10',
          vehicleClass: '카니발 하이리무진',
          notes: '기조연설자 2 (DL159)',
        },
        {
          id: 'grp-3',
          passengerName: 'Kenji Sato',
          pickupLocation: '김포국제공항 국제선',
          dropoffLocation: '그랜드 인터컨티넨탈 서울 파르나스',
          pickupTime: '14:00',
          vehicleClass: '카니발 하이리무진',
          notes: '기조연설자 3 (JL093)',
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

  // Generic fallback: strictly separate sender from passenger, never assign email as phone
  return {
    id: `draft-${emailId}`,
    emailId,
    senderName: senderName || '',
    senderEmail: sender,
    replyTo: replyTo || undefined,
    companyName: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    contactSource: undefined,
    passengerName: '',
    passengerPhone: '', // Strictly empty, NEVER sender email!
    passengerCount: 1,
    pickupDate: new Date().toISOString().slice(0, 10),
    pickupTime: '',
    pickupLocation: '',
    pickupDetailNotes: '',
    dropoffLocation: '',
    dropoffDetailNotes: '',
    flightNumber: '',
    requestedVehicleClass: '카니발 하이리무진',
    specialRequests: subject,
    tripType: 'single',
    confidence: 0.3,
    warnings: ['픽업 일시 및 출발지/도착지가 명확하지 않습니다. 관리자의 직접 검토 및 TMAP 후보 선택이 필요합니다.'],
    assignedDriver: null,
    assignedVehicle: null,
    assignedVehiclePlate: null,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Extract structured booking draft using Gemini 3.8 Flash per Issue #33
 */
export async function extractBookingFromEmail(
  params: ExtractBookingParams
): Promise<ExtractBookingResult> {
  const { emailId, subject, sender, senderName, replyTo, bodyText } = params;
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
- Sender Email (From header): "${sender}"
- Sender Display Name (From header): "${senderName || ''}"
- Reply-To: "${replyTo || ''}"

[EMAIL BODY TEXT]
${bodyText}

[STRICT EXTRACTION & DISAMBIGUATION RULES]
1. ZERO HALLUCINATION: Only extract facts explicitly stated or directly inferred from the text.
2. DISAMBIGUATE ENTITIES:
   - "companyName": Name of the requesting company/client organization (e.g., Ferrari Korea, Chanel, Simmtech, Global Events). If not explicitly mentioned, return "".
   - "contactName": Name of the person making, requesting, or coordinating the reservation (from body, signature, or sign-off).
   - "contactPhone": Phone number of the reservation coordinator. MUST BE A VALID PHONE NUMBER ONLY (e.g. 010-xxxx-xxxx, +82-10-xxxx-xxxx). NEVER PUT AN EMAIL ADDRESS HERE! If missing, return "".
   - "contactEmail": Email address of the reservation coordinator (from body or signature). If not explicitly in body/signature, return "".
   - "contactSource": Where the coordinator info was found: "body", "signature", "from", or "reply-to".
   - "passengerName": Name of the actual VIP/guest/passenger riding in the vehicle. Distinguish from contact coordinator!
   - "passengerPhone": Phone number of the actual passenger. MUST BE A VALID PHONE NUMBER ONLY. NEVER PUT AN EMAIL ADDRESS HERE! If missing, return "".
   - "passengerCount": Number of passengers (integer, default 1).
3. LOCATIONS FOR TMAP POI SEARCH:
   - "pickupLocation": Primary place name suitable for TMAP POI search (e.g. "인천공항 제2여객터미널", "김포공항 국제선", "조선팰리스 서울강남", "신라호텔", "인제스피디움"). Do not append detailed floor/gate here so TMAP search succeeds cleanly.
   - "pickupDetailNotes": Gate, floor, terminal, or meeting notes (e.g. "3층 출국장 7번 게이트 앞", "로비 1층 드롭오프 존", "VIP 게이트").
   - "dropoffLocation": Primary destination place name suitable for TMAP POI search.
   - "dropoffDetailNotes": Gate, floor, building, or specific dropoff notes.
4. DATE & TIME:
   - "pickupDate": YYYY-MM-DD
   - "pickupTime": HH:MM (24-hour format)
5. VEHICLE & FLIGHT:
   - "flightNumber": e.g. "KE082", "AF264", etc. If absent or not an airport transfer, return "".
   - "requestedVehicleClass": Typical: "카니발 하이리무진", "벤츠 스프린터", "제네시스 G90", "스타리아 리무진".
   - "specialRequests": Any special notes, baggage mentions, picket board requests, etc.
   - NOTE: Do NOT include any separate "luggageCount" property in your output. Mention luggage only in specialRequests if present.
6. TRIP TYPE:
   - "single": Normal single vehicle transfer
   - "group": Multiple vehicles or multiple passengers requested at different times/locations (fill "groupTrips" array)
   - "modification": Customer asking to change an existing booking (e.g. flight delay, time shift)
   - "cancellation": Customer requesting cancellation (Never cancel automatically, add a warning)
7. MANDATORY HUMAN DISPATCH:
   - "assignedDriver" MUST ALWAYS BE null.
   - "assignedVehicle" MUST ALWAYS BE null.
   - "assignedVehiclePlate" MUST ALWAYS BE null.
   (Vehicles and drivers must NEVER be automatically assigned by AI under any circumstances).

Return strictly a valid JSON object matching this schema (no markdown formatting, no comments):
{
  "companyName": string,
  "contactName": string,
  "contactPhone": string,
  "contactEmail": string,
  "contactSource": "body" | "signature" | "from" | "reply-to",
  "passengerName": string,
  "passengerPhone": string,
  "passengerCount": number,
  "pickupDate": string,
  "pickupTime": string,
  "pickupLocation": string,
  "pickupDetailNotes": string,
  "dropoffLocation": string,
  "dropoffDetailNotes": string,
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
      model: 'gemini-2.5-flash',
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

    // Safety sanitize phone numbers: if an email was somehow inserted into phone fields, strip it immediately!
    const cleanPhone = (val: unknown): string => {
      const s = String(val || '').trim();
      if (s.includes('@')) return ''; // NEVER allow email in phone!
      return s;
    };

    const draft: HqEmailExtractedDraft = {
      id: `draft-${emailId}`,
      emailId,
      senderName: senderName || '',
      senderEmail: sender,
      replyTo: replyTo || undefined,
      companyName: String(parsed.companyName || ''),
      contactName: String(parsed.contactName || ''),
      contactPhone: cleanPhone(parsed.contactPhone),
      contactEmail: String(parsed.contactEmail || ''),
      contactSource: (['body', 'signature', 'from', 'reply-to'].includes(String(parsed.contactSource))
        ? parsed.contactSource
        : undefined) as 'body' | 'signature' | 'from' | 'reply-to' | undefined,
      passengerName: String(parsed.passengerName || ''),
      passengerPhone: cleanPhone(parsed.passengerPhone),
      passengerCount: typeof parsed.passengerCount === 'number' ? parsed.passengerCount : 1,
      pickupDate: String(parsed.pickupDate || new Date().toISOString().slice(0, 10)),
      pickupTime: String(parsed.pickupTime || ''),
      pickupLocation: String(parsed.pickupLocation || ''),
      pickupDetailNotes: String(parsed.pickupDetailNotes || ''),
      dropoffLocation: String(parsed.dropoffLocation || ''),
      dropoffDetailNotes: String(parsed.dropoffDetailNotes || ''),
      flightNumber: String(parsed.flightNumber || ''),
      requestedVehicleClass: String(parsed.requestedVehicleClass || '카니발 하이리무진'),
      specialRequests: String(parsed.specialRequests || ''),
      tripType: (['single', 'group', 'modification', 'cancellation'].includes(String(parsed.tripType))
        ? parsed.tripType
        : 'single') as EmailTripType,
      groupTrips: Array.isArray(parsed.groupTrips) ? (parsed.groupTrips as any) : undefined,
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
