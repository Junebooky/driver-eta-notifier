import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import {
  ReceiptScanResult,
  calculateReceiptOcrCost,
  matchSampleReceipt,
  validateReceiptScanResult,
  shouldTriggerFallback,
  checkRateLimit,
} from '@/utils/receiptOcr';

// Global server-side OCR cache to prevent redundant Gemini API calls (Zero Fee Waste)
const globalReceiptOcrCache = new Map<string, ReceiptScanResult>();

// Fallback deterministic recognition for offline/demo environments
function getFallbackReceiptData(image: string): ReceiptScanResult {
  const sample = matchSampleReceipt(image);
  if (sample) return sample;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  return {
    success: true,
    merchant: '일반 가맹점',
    address: null,
    amount: null,
    date: `${y}-${m}-${d}`,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    category: 'other',
    paymentMethod: 'company_card',
    summary: '영수증이 업로드되었습니다. 세부 금액과 거래처를 확인해 주세요.',
    confidence: 0.5,
    modelUsed: 'deterministic-fallback',
  };
}

export async function POST(req: NextRequest) {
  const apiAuth = await verifyServerAuth(req);
  if (!apiAuth.ok) return NextResponse.json({ ok: false, error: apiAuth.error }, { status: apiAuth.statusCode });
  const requestStartTime = Date.now();

  try {
    // Step 0: Security & Rate Limiting Check
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'internal-driver-client';

    const rateLimitPerMin = parseInt(process.env.GEMINI_OCR_RATE_LIMIT_PER_MIN || '20', 10);
    const rateCheck = checkRateLimit(clientIp, rateLimitPerMin, 60_000);
    if (!rateCheck.allowed) {
      console.warn(`[Receipt OCR RateLimit] Client ${clientIp} exceeded rate limit (${rateLimitPerMin}/min).`);
      return NextResponse.json(
        {
          success: false,
          error: `영수증 스캔 요청 횟수 제한(분당 ${rateLimitPerMin}회)을 초과했습니다. 잠시 후 다시 시도해 주세요.`,
        },
        { status: 429 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const rawImage = body.image || body.imagePath || body.imageUrl || '';
    const image = typeof rawImage === 'string' ? rawImage : '';
    const carModel = typeof body.carModel === 'string' ? body.carModel : '';
    const driverName = typeof body.driverName === 'string' ? body.driverName : '';

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { success: false, error: '영수증 이미지 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    // Step 1: Upload Payload Size Guardrail (e.g. Max 10MB)
    const maxImageSizeMb = parseFloat(process.env.MAX_RECEIPT_IMAGE_SIZE_MB || '10');
    const approximateSizeBytes = (image.length * 3) / 4;
    const approximateSizeMb = approximateSizeBytes / (1024 * 1024);
    if (approximateSizeMb > maxImageSizeMb) {
      console.warn(`[Receipt OCR Payload] Image size (${approximateSizeMb.toFixed(2)}MB) exceeds limit (${maxImageSizeMb}MB).`);
      return NextResponse.json(
        {
          success: false,
          error: `영수증 사진 용량이 제한(${maxImageSizeMb}MB)을 초과했습니다. 사진 크기를 줄인 후 다시 업로드해 주세요.`,
        },
        { status: 413 }
      );
    }

    // Step 2: Check known sample paths/presets FIRST (0ms, 0 Gemini API cost)
    const directSample = matchSampleReceipt(image);
    if (directSample) {
      console.log(`[Receipt OCR: Sample Presets] Matched sample identifier: ${image.slice(0, 40)}. Skipping Gemini API.`);
      return NextResponse.json(directSample);
    }

    let mimeType = 'image/jpeg';
    let base64Data = image;

    // User input is image data, never a server filesystem path or a remote URL.
    const match = image.match(/^data:(image\/(?:jpeg|png|webp|heic));base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) return NextResponse.json({ success: false, error: '지원되는 이미지 파일을 업로드해 주세요.' }, { status: 400 });
    mimeType = match[1]; base64Data = match[2];

    // Step 3: Compute SHA-256 hash of normalized base64 content
    const imageHash = crypto.createHash('sha256').update(base64Data).digest('hex');

    // Check if the hash matches any known sample receipt
    const hashSample = matchSampleReceipt(imageHash);
    if (hashSample) {
      console.log(`[Receipt OCR: Sample Hash] Image hash matched sample receipt: ${imageHash.slice(0, 12)}. Skipping Gemini API.`);
      return NextResponse.json(hashSample);
    }

    // Step 4: Check in-memory cache to prevent duplicate Gemini API calls for identical photos
    if (globalReceiptOcrCache.has(imageHash)) {
      const cached = globalReceiptOcrCache.get(imageHash)!;
      console.log(`[Receipt OCR: Cache Hit] Returning cached OCR result for hash ${imageHash.slice(0, 8)}... (0 API cost)`);
      return NextResponse.json({
        ...cached,
        isCached: true,
        modelUsed: `${cached.modelUsed || 'gemini-3.1-flash-lite'} (캐시 재사용 · 비용 0원)`,
      });
    }

    // Step 5: Check Server-Side Gemini API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[Receipt OCR: Fallback] No GEMINI_API_KEY detected. Returning deterministic fallback.');
      return NextResponse.json({ success: false, error: '영수증 자동 판독이 설정되지 않았습니다. 내역을 직접 입력해 주세요.' }, { status: 503 });
    }

    // Server-side configurable models (Defaults to cheaper Gemini 3.1 Flash-Lite)
    const primaryModel = process.env.GEMINI_RECEIPT_MODEL || 'gemini-3.1-flash-lite';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash';
    const minConfidence = parseFloat(process.env.GEMINI_OCR_MIN_CONFIDENCE || '0.60');

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert Korean receipt OCR and VIP limousine driver expense classification AI.
Carefully examine this receipt image and extract structured data for a corporate mobility expense report.

Driver context: "${driverName || '윤태준'}", Vehicle: "${carModel || '116허 1514'}".

CRITICAL EXTRACTION RULES:
1. "merchant": Store/Merchant name (상호명, 가맹점명, 주유소명, 주차장명, 톨게이트명).
   - E.g. "서울 만남의광장 주유소", "한국도로공사", "스타벅스 강남대로점", "코엑스 주차장", "현대모비스 오토큐".
2. "address": Store address if printed on the receipt (가맹점 주소, 소재지). If not visible, return null.
3. "amount": The FINAL TOTAL payment/approved amount (합계금액 / 결제금액 / 승인금액 / 청구금액) in KRW as an integer number (no commas, no currency symbols).
   - NEVER return intermediate subtotal, VAT, unit prices, or discount amounts.
   - If multiple amounts appear, choose the final card approval amount (신용카드 승인금액).
   - If amount cannot be determined with certainty, return null. DO NOT fabricate or hallucinate numbers.
4. "date": Transaction date in "YYYY-MM-DD" format. E.g. "2026-10-24".
5. "time": Transaction time in "HH:mm" (24-hour format). Omit seconds. If not visible, return null.
6. "category": Must be STRICTLY one of the following exact keys:
   - "fuel": Gas station / 주유소, GS칼텍스, SK에너지, S-OIL, HD현대오일뱅크, 알뜰주유소, 휘발유, 경유, 등유, LPG 충전소, 요소수
   - "toll": Highway toll / 통행료, 한국도로공사, 하이패스, 민자고속도로 요금소
   - "parking": Parking / 주차장, 하이파킹, 카카오T주차, 공영주차장, 빌딩 주차요금
   - "meal": Food & Beverage / 식당, 음식점, 카페, 스타벅스, 커피빈, 베이커리, 편의점 식음료, 기사식당
   - "wash": Car wash / 세차장, 자동세차, 셀프세차, 손세차, 디테일링
   - "maintenance": Vehicle maintenance & repair / 정비소, 블루핸즈, 오토큐, 카센터, 타이어, 엔진오일, 와이퍼
   - "accommodation": Hotel / 숙박, 비즈니스호텔, 모텔 (원거리 출장)
   - "transit": Public transit / KTX, SRT, 고속버스, 지하철, 택시
   - "other": Miscellaneous corporate expenses
7. "paymentMethod":
   - "company_card": If credit card / 신용승인 / 카드번호 / 체크카드 / 승인번호 (VIP corporate card is standard)
   - "cash": If cash / 현금 / 현금영수증 / 소득공제용
   - "client_card": If customer card
   - "other": Other
8. "summary": A concise 1-sentence Korean summary of the receipt details (e.g. "서울 만남의광장 주유소에서 경유 72,000원 결제 영수증으로 판독되었습니다.").
9. "confidence": Number between 0.0 and 1.0 indicating OCR recognition confidence.

Return strictly a single valid JSON object with this exact schema (no markdown fences or code blocks):
{
  "merchant": string,
  "address": string | null,
  "amount": number | null,
  "date": string | null,
  "time": string | null,
  "category": "fuel" | "toll" | "parking" | "meal" | "wash" | "maintenance" | "accommodation" | "transit" | "other",
  "paymentMethod": "company_card" | "driver_personal" | "client_card" | "cash" | "other",
  "summary": string,
  "confidence": number
}`;

    const contents = [
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      prompt,
    ];

    // Step 6: Primary Call (Cheaper Flash-Lite Model by Default)
    let selectedModel = primaryModel;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;

    let primaryResponse;
    let primarySuccess = true;

    try {
      primaryResponse = await ai.models.generateContent({
        model: primaryModel,
        contents,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
    } catch (primaryErr) {
      console.warn(`[Receipt OCR] Primary model ${primaryModel} failed:`, primaryErr);
      primarySuccess = false;
    }

    let parsedPrimary: Record<string, unknown> = {};
    if (primarySuccess && primaryResponse) {
      try {
        const rawText = primaryResponse.text?.trim() || '{}';
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        parsedPrimary = JSON.parse(cleaned);
      } catch {
        console.warn('[Receipt OCR] Failed to parse primary model JSON output.');
        primarySuccess = false;
      }
    }

    const { result: validatedResult, rejectionReasons } = validateReceiptScanResult(
      parsedPrimary,
      primaryModel
    );

    // Step 7: Conditional Fallback Decision
    // RULE: Never retry automatically without a clear validation reason!
    const fallbackCheck = shouldTriggerFallback(validatedResult, minConfidence);

    let finalResult = validatedResult;
    let totalInputTokens = primaryResponse?.usageMetadata?.promptTokenCount || 0;
    let totalOutputTokens = primaryResponse?.usageMetadata?.candidatesTokenCount || 0;

    if ((!primarySuccess || fallbackCheck.fallbackNeeded) && fallbackModel !== primaryModel) {
      fallbackUsed = true;
      fallbackReason = fallbackCheck.reason || (rejectionReasons.length ? rejectionReasons.join(',') : 'primary_failed');
      selectedModel = fallbackModel;

      console.log(
        `[Receipt OCR: Fallback Triggered] Validation reason: ${fallbackReason}. Calling stronger fallback model: ${fallbackModel}`
      );

      try {
        const fallbackResponse = await ai.models.generateContent({
          model: fallbackModel,
          contents,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        totalInputTokens += fallbackResponse?.usageMetadata?.promptTokenCount || 0;
        totalOutputTokens += fallbackResponse?.usageMetadata?.candidatesTokenCount || 0;

        const rawText = fallbackResponse.text?.trim() || '{}';
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsedFallback = JSON.parse(cleaned);
        const { result: validatedFallback } = validateReceiptScanResult(parsedFallback, fallbackModel);
        finalResult = validatedFallback;
      } catch (fbErr) {
        console.error(`[Receipt OCR] Fallback model ${fallbackModel} also failed:`, fbErr);
      }
    }

    const totalElapsedMs = Date.now() - requestStartTime;
    const { costUsd, costKrw } = calculateReceiptOcrCost(
      selectedModel,
      totalInputTokens,
      totalOutputTokens
    );

    finalResult.fallbackUsed = fallbackUsed;
    finalResult.fallbackReason = fallbackReason;
    finalResult.modelUsed = selectedModel;
    finalResult.inputTokens = totalInputTokens;
    finalResult.outputTokens = totalOutputTokens;
    finalResult.estimatedCostUsd = costUsd;
    finalResult.estimatedCostKrw = costKrw;
    finalResult.processingTimeMs = totalElapsedMs;

    // Secure Sanitized Logging: Never log personal info, customer name, or card numbers
    console.log(
      `[Receipt OCR Telemetry] model=${selectedModel}${fallbackUsed ? ` (fallback: ${fallbackReason})` : ''} | latency=${totalElapsedMs}ms | tokens=(in:${totalInputTokens}, out:${totalOutputTokens}) | cost=$${costUsd.toFixed(6)} (~${costKrw}원) | status=${finalResult.success ? 'SUCCESS' : 'PARTIAL'}`
    );

    // Save in server-side cache
    globalReceiptOcrCache.set(imageHash, finalResult);

    return NextResponse.json(finalResult);
  } catch (err: unknown) {
    console.error('Receipt Scan API Fatal Error:', err);
    const errMsg = err instanceof Error ? err.message : '영수증 판독 중 오류가 발생했습니다.';
    return NextResponse.json({
      success: false,
      error: errMsg,
      processingTimeMs: Date.now() - requestStartTime,
    }, { status: 502 });
  }
}
