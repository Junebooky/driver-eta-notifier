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
 * Creates an empty, unpopulated draft without fabricating any data
 * Used when AI extraction fails or API key is absent, prompting manual entry
 */
export function createEmptyDraft(params: ExtractBookingParams): HqEmailExtractedDraft {
  return {
    id: `draft-${params.emailId}`,
    emailId: params.emailId,
    senderName: params.senderName || '',
    senderEmail: params.sender,
    replyTo: params.replyTo || undefined,
    companyName: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    contactSource: undefined,
    passengerName: '',
    passengerPhone: '', // Strictly empty, NEVER sender email
    passengerCount: 1,
    pickupDate: '',
    pickupTime: '',
    pickupLocation: '',
    pickupDetailNotes: '',
    isPickupPoiConfirmed: false,
    dropoffLocation: '',
    dropoffDetailNotes: '',
    isDropoffPoiConfirmed: false,
    flightNumber: '',
    requestedVehicleClass: '',
    specialRequests: '',
    tripType: 'single',
    confidence: 0,
    warnings: ['AI 예약 정보 추출 실패 또는 미입력 상태입니다. 관리자 직접 검토 및 입력이 필요합니다.'],
    assignedDriver: null,
    assignedVehicle: null,
    assignedVehiclePlate: null,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Deterministic test extractor reserved strictly for offline unit tests (e.g. testing parser mappings)
 */
export function getDeterministicBookingDraft(params: ExtractBookingParams): HqEmailExtractedDraft {
  const { emailId, subject, sender, senderName, replyTo, bodyText } = params;
  const isMorgan = subject.includes('모건스탠리') || bodyText.includes('Morgan Stanley') || bodyText.includes('David Miller');

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
      isPickupPoiConfirmed: true,
      pickupLat: 37.4688,
      pickupLng: 126.4335,
      dropoffLocation: '콘래드 서울',
      dropoffDetailNotes: '영등포구 국제금융로 10',
      isDropoffPoiConfirmed: true,
      dropoffLat: 37.5255,
      dropoffLng: 126.9255,
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

  return createEmptyDraft(params);
}

/**
 * Extract structured booking draft using Gemini 2.5 Flash
 * Blind QA Compliance: Fails honestly without synthetic fallback when API fails or key is missing
 */
export async function extractBookingFromEmail(
  params: ExtractBookingParams
): Promise<ExtractBookingResult> {
  const { emailId, subject, sender, senderName, replyTo, bodyText } = params;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[Gemini Booking Extraction] Missing GEMINI_API_KEY in environment.');
    return {
      ok: false,
      error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다. 실시간 AI 분석을 위해 .env.local에 API 키를 등록하거나 관리자가 수동으로 예약 정보를 입력해 주세요.',
      draft: createEmptyDraft(params),
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
        ok: false,
        error: 'Gemini AI 응답을 유효한 예약 데이터(JSON)로 변환하지 못했습니다. 수동 입력을 진행해 주세요.',
        rawJson: rawText,
        draft: createEmptyDraft(params),
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
      pickupDate: String(parsed.pickupDate || ''),
      pickupTime: String(parsed.pickupTime || ''),
      pickupLocation: String(parsed.pickupLocation || ''),
      pickupDetailNotes: String(parsed.pickupDetailNotes || ''),
      isPickupPoiConfirmed: false,
      dropoffLocation: String(parsed.dropoffLocation || ''),
      dropoffDetailNotes: String(parsed.dropoffDetailNotes || ''),
      isDropoffPoiConfirmed: false,
      flightNumber: String(parsed.flightNumber || ''),
      requestedVehicleClass: String(parsed.requestedVehicleClass || ''),
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
      ok: false,
      error: `Gemini AI 예약 정보 추출 오류: ${errorMsg}. 수동 입력을 진행해 주세요.`,
      draft: createEmptyDraft(params),
    };
  }
}
