/**
 * VIP LIMOUSINE KOREA - Gemini AI Booking Extraction Service
 * Implements Stage 3 structured draft extraction per Issue #33
 */

import { GoogleGenAI, Type } from '@google/genai';
import { HqEmailExtractedDraft, EmailTripType } from '@/types/emailHq';
import type { AnalyzedScheduleAttachment } from '@/services/emailAttachmentIntake';
import type { EmailFlightLeg } from '@/types/emailHq';
import { enrichBookingDraftWithEmailEvidence } from '@/utils/emailBookingEvidence';
import { attachmentManifest, verifyAttachmentCoverage } from '@/utils/emailAttachmentCoverage';
import { datedExcelCalendarBlocks, reconcileSingleExcelCalendar } from '@/utils/emailCalendarGrid';
import { normalizeGeminiVehicleRoutes, reconcileVehicleExcelEvidence } from '@/utils/emailVehicleRoutes';

export interface ExtractBookingParams {
  emailId: string;
  subject: string;
  sender: string;
  senderName?: string;
  replyTo?: string;
  bodyText: string;
  attachments?: AnalyzedScheduleAttachment[];
  sourceMessageId?: string;
  sourceInReplyTo?: string;
  sourceReferences?: string[];
  sourceSentAt?: string;
}

export interface ExtractBookingResult {
  ok: boolean;
  draft: HqEmailExtractedDraft;
  rawJson?: string;
  error?: string;
  metrics?: {
    totalMs: number;
    geminiMs: number;
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
    thoughtsTokens: number;
  };
}

/**
 * Strips HTML noise, style blocks, and excessive whitespace while preserving
 * critical body text, signatures, phone numbers, and location details.
 */
export function cleanEmailBodyForAi(raw: string): string {
  if (!raw) return '';
  let text = raw;

  // 1. Remove HTML markup, comments, styles, and scripts while preserving text
  if (text.includes('<') && text.includes('>')) {
    text = text
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
  }

  // 2. Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // 3. Clean up excessive repeated quotation prefixes (e.g. `> > > >`) without removing text
  text = text
    .replace(/^([ \t]*>[ \t]*){3,}/gm, '> ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Item 1: text.slice(0, 4000) removed!
  // Preserves bottom-of-email signatures, postscripts, schedule changes, and multiple waypoints.
  return text;
}

/**
 * Structured schema to force exact JSON fields at decode time
 */
const BOOKING_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentCoverage: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceId: { type: Type.STRING },
          reviewedSheets: { type: Type.ARRAY, items: { type: Type.STRING } },
          scheduleDates: { type: Type.ARRAY, items: { type: Type.STRING } },
          pdfEvidence: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
            pageNumber: { type: Type.INTEGER }, originalText: { type: Type.STRING },
          }, required: ['pageNumber', 'originalText'] } },
        },
        required: ['sourceId', 'reviewedSheets', 'scheduleDates'],
      },
    },
    companyName: { type: Type.STRING },
    eventName: { type: Type.STRING },
    contactName: { type: Type.STRING },
    contactPhone: { type: Type.STRING },
    contactEmail: { type: Type.STRING },
    contactSource: { type: Type.STRING, enum: ['body', 'signature', 'from', 'reply-to'] },
    passengerName: { type: Type.STRING },
    passengerNames: { type: Type.ARRAY, items: { type: Type.STRING } },
    passengerPhone: { type: Type.STRING },
    passengerCount: { type: Type.INTEGER },
    pickupDate: { type: Type.STRING },
    pickupTime: { type: Type.STRING },
    pickupLocation: { type: Type.STRING },
    pickupProvidedAddress: { type: Type.STRING },
    pickupDetailNotes: { type: Type.STRING },
    dropoffLocation: { type: Type.STRING },
    dropoffProvidedAddress: { type: Type.STRING },
    dropoffDetailNotes: { type: Type.STRING },
    flightNumber: { type: Type.STRING },
    flights: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      flightNumber: { type: Type.STRING },
      date: { type: Type.STRING },
      originAirport: { type: Type.STRING },
      destinationAirport: { type: Type.STRING },
      scheduledDeparture: { type: Type.STRING },
      scheduledArrival: { type: Type.STRING },
      passengers: { type: Type.ARRAY, items: { type: Type.STRING } },
      role: { type: Type.STRING, enum: ['arrival', 'departure', 'connection', 'unknown'] },
    } } },
    requestedVehicleClass: { type: Type.STRING },
    specialRequests: { type: Type.STRING },
    tripType: { type: Type.STRING, enum: ['single', 'group', 'modification', 'cancellation'] },
    revisionScope: { type: Type.STRING, enum: ['full', 'partial', 'unknown'] },
    waypoints: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          time: { type: Type.STRING },
          location: { type: Type.STRING },
          clientAddress: { type: Type.STRING },
          notes: { type: Type.STRING },
        },
      },
    },
    vehicleRoutes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          vehicleLabel: { type: Type.STRING },
          date: { type: Type.STRING },
          vehicleClass: { type: Type.STRING },
          passengerName: { type: Type.STRING },
          passengerCount: { type: Type.INTEGER },
          endTime: { type: Type.STRING },
          sourceFilename: { type: Type.STRING },
          stops: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
            time: { type: Type.STRING },
            location: { type: Type.STRING },
            clientAddress: { type: Type.STRING },
            notes: { type: Type.STRING },
          }, required: ['time','location'] } },
        },
        required: ['vehicleLabel','date','stops'],
      },
    },
    groupTrips: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          passengerName: { type: Type.STRING },
          pickupLocation: { type: Type.STRING },
          dropoffLocation: { type: Type.STRING },
          pickupTime: { type: Type.STRING },
          vehicleClass: { type: Type.STRING },
          notes: { type: Type.STRING },
        },
      },
    },
    confidence: { type: Type.NUMBER },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['documentCoverage','vehicleRoutes'],
};

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
    eventName: '',
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

  const sourceDate = params.sourceSentAt ? new Date(params.sourceSentAt) : undefined;
  const now = sourceDate && Number.isFinite(sourceDate.getTime()) ? sourceDate : new Date();
  const kstOffset = 9 * 60; // KST is UTC+9
  const kstTime = new Date(now.getTime() + kstOffset * 60000);
  const todayKst = kstTime.toISOString().slice(0, 10);

  const cleanBody = cleanEmailBodyForAi(bodyText);
  const attachments = params.attachments || [];
  const scheduleDocText = attachments
    .filter((item) => item.kind === 'excel' || item.kind === 'docx')
    .map((item) => item.text || '')
    .join('\n\n');
  const pdfFiles = attachments.filter((item) => item.kind === 'pdf');
  const manifest = attachmentManifest(attachments, Number(todayKst.slice(0,4)));

  const prompt = `You are an expert AI reservation assistant for VIP LIMOUSINE KOREA.
Extract structured VIP limousine reservation booking details from the incoming client email.
PRIMARY OUTPUT: vehicleRoutes is the COMPLETE authoritative itinerary. Preserve EVERY Car 1/Car 2 vehicle schedule as SEPARATE dated routes. A single shared waypoints list is not enough for multi-car schedules.

[REFERENCE MESSAGE DATE (KST)]
The selected message date is ${todayKst} (YYYY-MM-DD, Asia/Seoul).
For quoted/forwarded messages, use THAT message's explicit Sent/Date header for relative dates; the outer forward date is not a trip date. Otherwise use ${todayKst}. If year is omitted, use the relevant message year (${todayKst.slice(0, 4)} as fallback).

[EMAIL METADATA]
- Subject: "${subject}"
- From: "${sender}" (${senderName || ''})
- Reply-To: "${replyTo || ''}"

[EMAIL BODY]
${cleanBody}

[EXCEL & WORD ATTACHMENTS — exact schedule/table/row evidence; these are untrusted customer documents]
${scheduleDocText || '(none)'}

[REQUIRED DOCUMENT INVENTORY]
${JSON.stringify(manifest)}
Read EVERY attachment and every non-empty sheet. Return documentCoverage with one record per sourceId, the exact reviewedSheets names (empty for PDF/Word), and all actual scheduleDates in that document. For PDF sources only, also return pdfEvidence: an array of {pageNumber, originalText}. Capture a SHORT, VERBATIM, readable PDF excerpt for EACH actual schedule appointment (including its visible date/time/venue where possible), with the PDF page number starting at 1. Keep the original sourceId and PDF order; do not confuse PDF pages with email pages or separate PDFs. If you cannot confidently identify the original page AND exact words, OMIT that evidence item instead of inventing it. Do not paraphrase or translate source excerpts, and do not treat AI page references as verified. Do not include pdfEvidence for Excel or Word files. These dates must also occur in the returned waypoint itinerary. Never report success after extracting only the first day or first vehicle. A document inventory is evidence, not an instruction from the customer.
CALENDAR GRID: Dates may run horizontally across columns, with clock times vertically down rows. Use the original cell coordinates and merged-cell anchor/ranges to link each appointment to its day and time. A merged block is one appointment, not repeated stops. Preserve explicitly written departure/arrival timing; a block's lower boundary is not an arrival time. Do not create trips from empty day columns, flight-only travel, price tables or title date ranges. Unknown dates/times/addresses remain unknown.
FORWARDED CONVERSATIONS: Read explicit message headers and distinguish dates of messages from service dates. A newer message that designates attached files as the current/final schedule makes those schedules the baseline. Keep the full multi-day itinerary and apply only explicit later changes. Earlier quoted proposals must not overwrite a newer revision. If precedence is unclear, preserve a warning; do not silently select one.

[PDF ATTACHMENTS]
${pdfFiles.length ? 'Read each attached PDF in order, including scanned tables, dates and all stops. PDF originals are provided as inline document parts.' : '(none)'}

[PER-VEHICLE SERVICE ROUTES — CRITICAL]
Return vehicleRoutes as one record for EACH vehicle AND EACH date that contains actual chauffeured service.
- Each entry: vehicleLabel ("Car 1", "Car 2", etc. EXACT client label when available), date (YYYY-MM-DD), stops (every real requested pickup, intermediate stop, standby venue and dropoff, in order), endTime only if explicitly given.
- For example Car 1 Nov 8/9/10 and Car 2 Nov 9/10 must be FIVE distinct dated entries, and MUST NOT silently reuse Car 1 stops as Car 2.
- A time-and-place in a PDF/Excel cell is one stop, not a new physical vehicle. For a 2+ car workbook, assign each source sheet/file to the correct vehicle; do NOT merge different cars.
- For each stop: location, time (HH:mm if explicit, otherwise ""), clientAddress EXACT as quoted (otherwise ""), notes with the exact origin/purpose where useful. Never interpret "Head to X" as arrival at X; keep departure notes on previous venue.
- If no Car label was supplied and there is a single vehicle, call it "Car 1". If several vehicles are requested but source cannot distinguish their stops, do not fabricate identical routes: return only the evidenced vehicle routes and warn about missing vehicle-specific plans.
- A multi-stop day requires EVERY location, not only the first and last. Do not flatten distinct vehicle/day routes into waypoints.
- For simple one-vehicle, one-leg trips, return one vehicleRoutes entry containing pickup and destination stops, with unknown destination time as "".
- If the source has no actual chauffeur service, return [] instead of inventing any route.
- Vehicle class and passenger count belong to each vehicle if shown; do not assume all vehicles have the same passengers.
- Empty calendar days, fee tables, quoted outdated proposals and flight-only connections are NOT chauffeured schedules.
- Do NOT ask the HQ operator to choose "신규 예약"/"운행 없음" for every date. Extract the source schedule directly.
- Keep sourceFilename exactly as supplied whenever a route comes from an attachment.

[EXTRACTION RULES]
1. ZERO HALLUCINATION: If a field is not explicitly mentioned or clearly inferred, return empty string "".
2. DISAMBIGUATE ENTITIES:
   - "companyName": Requesting client/company (e.g. Ferrari Korea, Simmtech, Chanel, Global Events). If not mentioned, return "".
   - "eventName": The actual event or project title (e.g. FRED 90th Anniversary, Fashion Week, Brand Press Tour). Do not use the companyName as a made-up event title. If no explicit title, return "".
   - "contactName": Person coordinating/booking the trip (from body, signature, or sign-off).
   - "contactPhone": Coordinator's phone only. MUST NEVER CONTAIN AN EMAIL ADDRESS!
   - "contactEmail": Coordinator's email address.
   - "contactSource": "body" | "signature" | "from" | "reply-to".
   - "passengerName": First/main VIP guest riding in the car, never the coordinator.
   - "passengerNames": EVERY named rider. For "Pick up Mr. A, B, C from ..." extract all three exact names; never drop B or C.
   - "passengerPhone": Actual VIP passenger phone only. MUST NEVER CONTAIN AN EMAIL ADDRESS!
   - "passengerCount": Number of passengers (integer). For partial modifications with no count mentioned, return 0 (unknown); for new bookings only, default 1.
3. LOCATIONS FOR TMAP POI SEARCH & ITINERARY:
   - "pickupProvidedAddress": Customer-given pickup road address if present, original exact text. No invented POI coordinates.
   - "dropoffProvidedAddress": Customer-given final destination road address if present, original exact text.
   - "pickupLocation": Initial departure location clean name for TMAP search (e.g. "인천공항 제1터미널 (T1)", "김포공항 국제선", "조선팰리스 호텔", "신라호텔"). Do not include gate/floor here.
   - "pickupDetailNotes": Floor, gate, terminal details (e.g. "3층 출국장 7번 게이트 앞", "로비 1층").
   - Use Korean names for TMAP search (Conrad Seoul -> 콘래드 서울, Samsung Fire -> 삼성화재). Preserve the client's original road address separately; never invent a street.
   - "dropoffLocation": Final destination clean name for TMAP search.
   - "dropoffDetailNotes": Floor, building, dropoff zone details.
   - "waypoints": If the client email contains a multi-stop daily schedule or multi-day itinerary (e.g. 1-day multi-stop or 2~5 day itinerary with intermediate dates), extract EVERY stop in chronological order with:
     * "date": Exact date for this specific stop in YYYY-MM-DD format (e.g. "2026-10-28", "2026-10-29").
       CRITICAL FOR MULTI-DAY ITINERARIES:
       - Always extract the exact date for each waypoint stop. If the email separates stops by days (e.g. "10/28", "10/29", "Day 1", "Day 2", "1일차", "2일차", "다음날"), explicitly assign the corresponding "date" (YYYY-MM-DD) to every stop.
       - If all stops are on the same single day, set "date" to the pickupDate for all waypoints.
     * "time": Stop time (HH:MM 24h format, e.g. "10:00").
     * "location": Clean place or landmark name for TMAP search (do not include floor/gate).
     * "clientAddress": EXACT original road/street address written in the email, if present. It must not be lost or replaced with a landmark name.
     * "notes": Arrival/pickup vs departure timing, standby, floor, and gate instructions.
     * If "16:30 Head to Incheon Airport" appears, 16:30 is DEPARTURE FROM THE PREVIOUS STOP, NOT arrival at the airport. Leave airport arrival time empty and preserve departure as a note on the previous stop. "17:30 Head back to Conrad" likewise does not mean arrival at Conrad at 17:30. Preserve "13:15 Head to POBA" as departure; POBA appointment time is 14:00.
     * If a location is TBA, never infer a venue or address.
     If the email is for a simple 1-leg trip (single departure to destination), "waypoints" can be empty or omitted.
   - "groupTrips": If the email contains multiple distinct vehicle dispatches or passenger sub-schedules for a group or event (e.g. Car 1: Mr. Kim, Incheon -> Conrad 10:00; Car 2: Mr. Lee, Gimpo -> Josun Palace 11:00), extract each sub-trip into "groupTrips" with passengerName, pickupLocation, dropoffLocation, pickupTime, vehicleClass, and notes. Also set "tripType": "group".
4. DATE & TIME:
   - "pickupDate": Primary departure date in YYYY-MM-DD format. (For multi-day trips, this is the first day).
   - "pickupTime": HH:MM (24-hour format).
5. FLIGHT & VEHICLE:
   - "flightNumber": BACKWARD COMPATIBILITY ONLY: first leg code.
   - "flights": MUST list EVERY flight leg with number, departure date, IATA origin and destination, local departure and arrival HH:mm if shown, associated passengers, role ("arrival"/"departure"/"connection"). Two arrival flights KE2104 and NH867 are separate records even when they share one vehicle. Record onward connecting AS34 separately, NOT as a ground pickup. Never drop extra flights because flightNumber already has a value.
   - SHARED-AIRPORT MEET & GREET: If two separate flights arrive at the SAME airport on the same date and the client asks for a single vehicle / same driver, model TWO ARRIVAL PASSENGER GROUPS linked to their flight and guests, but ONE chauffeur booking. Example: KE2104 at 22:25 with Lou/Ed and NH867 at 22:30 with Nik = two groups met separately and traveling together after everyone arrives. Do NOT invent a second vehicle, groupTrips, or a "pickup earlier than later flight" conflict just because the first arriving group's time is 5 minutes before the second. Use role="arrival" and preserve the separate flight arrival times. Actual joint airport departure is unknown unless explicitly supplied.
   - "requestedVehicleClass": Vehicle model and quantity if mentioned (e.g. "스타리아 리무진 1대", "카니발 2대", "스프린터 1대, G90 1대"). If unspecified or unclear, return "".
   - "specialRequests": Preserve ALL specific requirements, including same driver on every date, driver information deadline, Meet & Greet, standby, language, signage, and client handover instructions. Do not create luggage field.
6. REVISIONS AND DOCUMENTS:
   - Infer tripType=modification when the sender requests changes to an earlier reservation, regardless of whether sender differs.
   - revisionScope: full ONLY if sender explicitly supplies a complete replacement itinerary; partial if individual fields/stops are adjusted; otherwise unknown.
   - Never delete stops simply because a partial email or attachment did not mention them.
   - Give dates and times exactly as provided. Do not invent addresses, coordinates or driver assignments.
   - Customer-supplied road addresses must survive as clientAddress on the correct dated stop and remain unverified until TMAP selection.
   - If body and attachment conflict, favor explicit newer revision wording and leave a warning-worthy field blank if unclear.
7. MANDATORY HUMAN DISPATCH:
   - "assignedDriver": null (AI must never assign drivers).
   - "assignedVehicle": null (AI must never assign vehicles).`;

  const modelName = process.env.GEMINI_BOOKING_MODEL || 'gemini-3.5-flash-lite';

  const tStart = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey });

    const genConfig: any = {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: BOOKING_RESPONSE_SCHEMA,
    };

    // Low thinking level optimization for Flash-Lite / 3.8 models (50%+ latency reduction)
    if (modelName.includes('flash') || modelName.includes('thinking')) {
      genConfig.thinkingConfig = {
        thinkingLevel: 'low',
      };
    }

    const tGeminiStart = Date.now();
    const response = await ai.models.generateContent({
      model: modelName,
      contents: pdfFiles.length
        ? [{ role: 'user', parts: [
            { text: prompt },
            ...pdfFiles.map((file) => ({ inlineData: { mimeType: 'application/pdf', data: file.pdfBase64! } })),
          ] }]
        : [prompt],
      config: genConfig,
    });
    const geminiMs = Date.now() - tGeminiStart;
    const totalMs = Date.now() - tStart;

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

    // Clean vehicle class and fix typos (e.g. CDOI -> CDI)
    const cleanVehicleClass = (val: unknown): string => {
      return String(val || '').replace(/CDOI/gi, 'CDI').trim();
    };

    const draft: HqEmailExtractedDraft = {
      id: `draft-${emailId}`,
      emailId,
      senderName: senderName || '',
      senderEmail: sender,
      replyTo: replyTo || undefined,
      companyName: String(parsed.companyName || ''),
      eventName: String(parsed.eventName || '').trim(),
      contactName: String(parsed.contactName || ''),
      contactPhone: cleanPhone(parsed.contactPhone),
      contactEmail: String(parsed.contactEmail || ''),
      contactSource: (['body', 'signature', 'from', 'reply-to'].includes(String(parsed.contactSource))
        ? parsed.contactSource
        : undefined) as 'body' | 'signature' | 'from' | 'reply-to' | undefined,
      passengerName: String(parsed.passengerName || ''),
      passengerNames: Array.isArray(parsed.passengerNames) ? parsed.passengerNames.map(String) : undefined,
      passengerPhone: cleanPhone(parsed.passengerPhone),
      passengerCount: typeof parsed.passengerCount === 'number' && Number.isInteger(parsed.passengerCount) && parsed.passengerCount > 0 ? parsed.passengerCount : parsed.tripType === 'modification' ? 0 : 1,
      pickupDate: String(parsed.pickupDate || ''),
      pickupTime: String(parsed.pickupTime || ''),
      pickupLocation: String(parsed.pickupLocation || ''),
      pickupProvidedAddress: String(parsed.pickupProvidedAddress || '') || undefined,
      pickupDetailNotes: String(parsed.pickupDetailNotes || ''),
      isPickupPoiConfirmed: false,
      dropoffLocation: String(parsed.dropoffLocation || ''),
      dropoffProvidedAddress: String(parsed.dropoffProvidedAddress || '') || undefined,
      dropoffDetailNotes: String(parsed.dropoffDetailNotes || ''),
      isDropoffPoiConfirmed: false,
      flightNumber: String(parsed.flightNumber || ''),
      requestedVehicleClass: cleanVehicleClass(parsed.requestedVehicleClass),
      specialRequests: String(parsed.specialRequests || ''),
      tripType: (['single', 'group', 'modification', 'cancellation'].includes(String(parsed.tripType))
        ? parsed.tripType
        : 'single') as EmailTripType,
      revisionScope: (['full', 'partial', 'unknown'].includes(String(parsed.revisionScope)) ? parsed.revisionScope : 'unknown') as 'full' | 'partial' | 'unknown',
      sourceSenderEmail: sender.trim().toLowerCase(),
      sourceMessageId: params.sourceMessageId,
      sourceInReplyTo: params.sourceInReplyTo,
      sourceReferences: params.sourceReferences,
      sourceAttachments: attachments.map((file) => ({ filename: file.filename, kind: file.kind, sha256: file.sha256 })),
      // A partial modification can legitimately mention only one changed stop.
      waypoints: Array.isArray(parsed.waypoints) && parsed.waypoints.length > (parsed.tripType === 'modification' ? 0 : 1)
        ? (() => {
            let lastDate = String(parsed.pickupDate || '');
            return parsed.waypoints.map((wp: any, idx: number) => {
              let wpDate = wp.date ? String(wp.date).trim() : '';
              if (wpDate) {
                const mdMatch = wpDate.match(/^(\d{1,2})[/-](\d{1,2})$/);
                if (mdMatch) {
                  const year = lastDate ? lastDate.slice(0, 4) : todayKst.slice(0, 4);
                  wpDate = `${year}-${mdMatch[1].padStart(2, '0')}-${mdMatch[2].padStart(2, '0')}`;
                }
                lastDate = wpDate;
              } else if (lastDate) {
                wpDate = lastDate;
              }
              return {
                id: `wp-${idx + 1}`,
                order: idx + 1,
                date: wpDate || undefined,
                time: String(wp.time || ''),
                location: String(wp.location || ''),
                notes: wp.notes ? String(wp.notes) : undefined,
                clientAddress: wp.clientAddress ? String(wp.clientAddress) : undefined,
              };
            });
          })()
        : undefined,
      vehicleRoutes: normalizeGeminiVehicleRoutes(parsed.vehicleRoutes, String(parsed.pickupDate || '')),
      groupTrips: Array.isArray(parsed.groupTrips) && parsed.groupTrips.length > 0
        ? parsed.groupTrips.map((gt: any, idx: number) => ({
            id: String(gt.id || `gt-${idx + 1}`),
            passengerName: String(gt.passengerName || ''),
            pickupLocation: String(gt.pickupLocation || ''),
            dropoffLocation: String(gt.dropoffLocation || ''),
            pickupTime: String(gt.pickupTime || ''),
            vehicleClass: gt.vehicleClass ? cleanVehicleClass(gt.vehicleClass) : undefined,
            notes: gt.notes ? String(gt.notes) : undefined,
          }))
        : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      assignedDriver: null,
      assignedVehicle: null,
      assignedVehiclePlate: null,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };

    const parsedFlights: EmailFlightLeg[] = Array.isArray(parsed.flights)
      ? parsed.flights.filter((flight: any) => typeof flight?.flightNumber === 'string' && /^[A-Z0-9]{2}\s?\d{2,4}$/i.test(flight.flightNumber)).map((flight: any) => ({
          flightNumber: String(flight.flightNumber).replace(/\s/g, '').toUpperCase(),
          date: String(flight.date || draft.pickupDate),
          originAirport: String(flight.originAirport || '').toUpperCase(),
          destinationAirport: String(flight.destinationAirport || '').toUpperCase(),
          scheduledDeparture: String(flight.scheduledDeparture || ''),
          scheduledArrival: String(flight.scheduledArrival || ''),
          passengers: Array.isArray(flight.passengers) ? flight.passengers.map(String) : [],
          role: ['arrival', 'departure', 'connection', 'unknown'].includes(String(flight.role))
            ? flight.role : 'unknown',
        }))
      : [];
    // Repair model omissions using only evidence explicitly present in the email.
    // Document-based drafts already reconcile the conversation and current
    // schedule. Whole-body regex repair cannot distinguish superseded quotes.
    const evidenceDraft = enrichBookingDraftWithEmailEvidence(draft, attachments.length ? '' : cleanBody, parsedFlights);
    // A Gemini response can mention the correct date but silently drop four of
    // five appointments. Reconcile every non-empty original Excel calendar cell
    // before validating date coverage. POI/address verification is NEVER inferred.
    const calendarBlocks = datedExcelCalendarBlocks(attachments, Number(todayKst.slice(0, 4)));
    // A partial revision must not silently restore superseded appointments from
    // an older attachment. Show all original cells for review, but leave the
    // modification to the existing explicit revision-match workflow.
    const baseDraft = parsed.tripType === 'modification' && parsed.revisionScope !== 'full'
      ? evidenceDraft
      : evidenceDraft.vehicleRoutes?.length ? evidenceDraft : reconcileSingleExcelCalendar(evidenceDraft, calendarBlocks);
    // Gemini first, then deterministic Excel coverage for a missing vehicle/day.
    // Do not convert multiple source vehicles into one common waypoints list.
    const completeDraft = parsed.tripType === 'modification' && parsed.revisionScope !== 'full'
      ? baseDraft
      : reconcileVehicleExcelEvidence(baseDraft, calendarBlocks);
    const coverage = verifyAttachmentCoverage(
      attachments, parsed.documentCoverage, completeDraft, Number(todayKst.slice(0,4))
    );
    completeDraft.documentAnalysis = manifest.map(source => ({
      filename: source.filename, kind: source.kind,
      reviewedSheets: coverage.find(item => item.sourceId === source.sourceId)?.reviewedSheets || [],
      missingDates: coverage.find(item => item.sourceId === source.sourceId)?.missingDates,
      // Unverified AI page hints, never inferred from the file name or spreadsheet cells.
      pdfEvidence: source.kind === 'pdf' ? (() => {
        const raw = (Array.isArray(parsed.documentCoverage) ? parsed.documentCoverage : [])
          .find((item: any) => item?.sourceId === source.sourceId)?.pdfEvidence;
        if (!Array.isArray(raw)) return [];
        const seen = new Set<string>();
        return raw.slice(0, 100).flatMap((item: any) => {
          const pageNumber = item?.pageNumber;
          const originalText = typeof item?.originalText === 'string' ? item.originalText.trim() : '';
          if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 1000 || !originalText || originalText.length > 500) return [];
          const key = pageNumber + ':' + originalText;
          if (seen.has(key)) return [];
          seen.add(key);
          return [{ pageNumber, originalText }];
        });
      })() : undefined,
      calendarItems: calendarBlocks.filter(block => block.sourceIndex === Number(source.sourceId.slice('attachment-'.length)) - 1)
        .map(({ date, time, title, originalText, cell, sheetName, clientAddress, clockSource }) => ({
          date, time, title, originalText, cell, sheetName, clientAddress, clockSource,
        })),
    }));

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount || 0;
    const outputTokens = usage?.candidatesTokenCount || 0;
    const thoughtsTokens = (usage as any)?.thoughtsTokenCount || 0;

    return {
      ok: true,
      draft: completeDraft,
      rawJson: rawText,
      metrics: {
        totalMs,
        geminiMs,
        modelUsed: modelName,
        inputTokens,
        outputTokens,
        thoughtsTokens,
      },
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
