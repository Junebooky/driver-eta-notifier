import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ExpenseCategoryKey, PaymentMethod } from '@/utils/expense';

export interface ReceiptScanRequestBody {
  image: string; // Base64 data URL or relative path e.g. /images/receipt_sample_fuel.jpg
  carModel?: string;
  driverName?: string;
}

export interface ReceiptScanResult {
  success: boolean;
  merchant: string;
  address: string | null;
  amount: number | null;
  date: string | null;
  time: string | null;
  category: ExpenseCategoryKey;
  paymentMethod: PaymentMethod;
  summary: string;
  confidence: number;
  modelUsed?: string;
  error?: string;
}

// Global server-side OCR cache to prevent redundant Gemini API calls and fee waste
const globalReceiptOcrCache = new Map<string, ReceiptScanResult>();

// Predefined deterministic data for known sample receipts (Zero Gemini API fees)
function getSampleReceiptData(identifier: string): ReceiptScanResult | null {
  const lower = identifier.toLowerCase();

  // Exact 64-character SHA-256 hash matching
  if (/^[a-f0-9]{64}$/.test(lower)) {
    // 1. Hangang Gas Station Sample
    if (
      lower === '06a6e3751da4a1d4e9c7307ef34cc15021b7f879d97a09805b3dfef722c84306' ||
      lower === '10cf194efa1d4c46866676b4595f9ee22ed1d1f96fc36614e4d70a0b7c661ff9'
    ) {
      return {
        success: true,
        merchant: '한강주유소',
        address: '경기도 고양시 덕양구 행주로 57-28',
        amount: 48000,
        date: '2026-10-26',
        time: '12:36',
        category: 'fuel',
        paymentMethod: 'company_card',
        summary: '한강주유소에서 휘발유 48,000원 결제 영수증으로 판독되었습니다. (샘플 데이터 즉시 로드 · API 비용 0원)',
        confidence: 0.99,
        modelUsed: '샘플 프리셋 (비용 0원)',
      };
    }

    // 2. Mannamui Gwangjang Fuel Sample
    if (
      lower === '85626cd9cc748946cfa2c2923735142e0be5960cf432e5717e4d03162c436f43' ||
      lower === '965cbdc71fa6e88d3ac2a290493e935309407eee96ceb141acc3db02d3845471'
    ) {
      return {
        success: true,
        merchant: '서울 만남의광장 주유소',
        address: '서울 서초구 양재대로12길 73-71',
        amount: 72000,
        date: '2026-10-24',
        time: '11:32',
        category: 'fuel',
        paymentMethod: 'company_card',
        summary: '서울 만남의광장 주유소에서 경유 72,000원 결제 영수증으로 인식되었습니다. (샘플 데이터 즉시 로드 · API 비용 0원)',
        confidence: 0.98,
        modelUsed: '샘플 프리셋 (비용 0원)',
      };
    }

    // 3. CU Convenience Store Sample
    if (
      lower === '70d6e1959bfc99a3d071d7c680f1563edc540e758bbbd014a58d1535b9a9bfd6' ||
      lower === 'd4beb96c5a067ba410814f6688fd71c0bd3ceeca7384f5002bbe1e1e40985f90'
    ) {
      return {
        success: true,
        merchant: 'CU 고양강매점',
        address: '경기도 고양시 덕양구 강매로247 (강매동 521-7)',
        amount: 9500,
        date: '2024-10-26',
        time: '19:22',
        category: 'meal',
        paymentMethod: 'company_card',
        summary: 'CU 고양강매점에서 식음료 9,500원 결제 영수증으로 판독되었습니다. (샘플 데이터 즉시 로드 · API 비용 0원)',
        confidence: 0.98,
        modelUsed: '샘플 프리셋 (비용 0원)',
      };
    }

    return null;
  }

  // URL / Filename keyword matching (Only when not a raw base64 or long string)
  if (lower.includes('hangang') || lower.includes('한강')) {
    return {
      success: true,
      merchant: '한강주유소',
      address: '경기도 고양시 덕양구 행주로 57-28',
      amount: 48000,
      date: '2026-10-26',
      time: '12:36',
      category: 'fuel',
      paymentMethod: 'company_card',
      summary: '한강주유소에서 휘발유 48,000원 결제 영수증으로 판독되었습니다. (샘플 데이터 즉시 로드 · API 비용 0원)',
      confidence: 0.99,
      modelUsed: '샘플 프리셋 (비용 0원)',
    };
  }

  if (lower.includes('fuel') || lower.includes('만남의광장')) {
    return {
      success: true,
      merchant: '서울 만남의광장 주유소',
      address: '서울 서초구 양재대로12길 73-71',
      amount: 72000,
      date: '2026-10-24',
      time: '11:32',
      category: 'fuel',
      paymentMethod: 'company_card',
      summary: '서울 만남의광장 주유소에서 경유 72,000원 결제 영수증으로 인식되었습니다. (샘플 데이터 즉시 로드 · API 비용 0원)',
      confidence: 0.98,
      modelUsed: '샘플 프리셋 (비용 0원)',
    };
  }

  if (lower.includes('receipt_sample_cu') || lower.includes('cu.jpg') || lower.includes('고양강매')) {
    return {
      success: true,
      merchant: 'CU 고양강매점',
      address: '경기도 고양시 덕양구 강매로247 (강매동 521-7)',
      amount: 9500,
      date: '2024-10-26',
      time: '19:22',
      category: 'meal',
      paymentMethod: 'company_card',
      summary: 'CU 고양강매점에서 식음료 9,500원 결제 영수증으로 판독되었습니다. (샘플 데이터 즉시 로드 · API 비용 0원)',
      confidence: 0.98,
      modelUsed: '샘플 프리셋 (비용 0원)',
    };
  }

  return null;
}

// Fallback deterministic recognition for common demo receipts
function getFallbackReceiptData(image: string): ReceiptScanResult {
  const sample = getSampleReceiptData(image);
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
    summary: '영수증이 업로드되었습니다. 세부 금액을 확인해 주세요.',
    confidence: 0.5,
    modelUsed: 'deterministic-fallback',
  };
}

export async function POST(req: NextRequest) {
  try {
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

    // Step 1: Check known sample paths or keywords FIRST (0ms, 0 Gemini API cost)
    const directSample = getSampleReceiptData(image);
    if (directSample) {
      console.log(`[Receipt OCR: Sample Presets] Matched sample identifier: ${image.slice(0, 40)}. Skipping Gemini API.`);
      return NextResponse.json(directSample);
    }

    let mimeType = 'image/jpeg';
    let base64Data = image;

    // Case 1: Relative file path in /public (e.g. /images/receipt_sample_fuel.jpg)
    if (image.startsWith('/')) {
      try {
        const filePath = path.join(process.cwd(), 'public', image.replace(/^\//, ''));
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          base64Data = fileBuffer.toString('base64');
          if (image.endsWith('.png')) mimeType = 'image/png';
          else if (image.endsWith('.webp')) mimeType = 'image/webp';
          else mimeType = 'image/jpeg';
        }
      } catch (fileErr) {
        console.warn('Failed to load local file for OCR:', fileErr);
      }
    } else {
      // Case 2: Base64 data URL
      const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    // Step 2: Compute hash of base64 content
    const imageHash = crypto.createHash('sha256').update(base64Data).digest('hex');

    // Check if the hash matches any known sample receipt
    const hashSample = getSampleReceiptData(imageHash);
    if (hashSample) {
      console.log(`[Receipt OCR: Sample Hash] Image hash matched sample receipt: ${imageHash}. Skipping Gemini API.`);
      return NextResponse.json(hashSample);
    }

    // Step 3: Check in-memory cache to prevent duplicate Gemini API calls for identical photos
    if (globalReceiptOcrCache.has(imageHash)) {
      const cached = globalReceiptOcrCache.get(imageHash)!;
      console.log(`[Receipt OCR: Cache Hit] Returning cached OCR result for hash ${imageHash.slice(0, 8)}... (0 API cost)`);
      return NextResponse.json({
        ...cached,
        modelUsed: `${cached.modelUsed || 'gemini-3.8-flash'} (캐시 재사용 · 비용 0원)`,
      });
    }

    // Step 4: Check Gemini API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[Receipt OCR: Fallback] No GEMINI_API_KEY detected. Returning deterministic fallback.');
      const fallbackResult = getFallbackReceiptData(image);
      globalReceiptOcrCache.set(imageHash, fallbackResult);
      return NextResponse.json(fallbackResult);
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert Korean receipt OCR and VIP limousine driver expense classification AI.
Carefully examine this receipt image and extract structured data for a corporate mobility expense report.

Driver context: "${driverName || '윤태준'}", Vehicle: "${carModel || '116허 1514'}".

Extract the following fields with high precision:
1. "merchant": Store/Merchant name (상호명, 가맹점명, 주유소명, 주차장명, 톨게이트명).
   - E.g. "서울 만남의광장 주유소", "한국도로공사", "스타벅스 강남대로점", "코엑스 주차장", "현대모비스 오토큐".
2. "address": Store address if printed on the receipt (가맹점 주소, 소재지). If not visible, null.
3. "amount": The FINAL total payment amount (합계금액 / 결제금액 / 승인금액 / 청구금액) in KRW as an integer number (no commas, no currency symbols). E.g. 72000.
4. "date": Transaction date in "YYYY-MM-DD" format. If only month/day (MM-DD or MM/DD) is visible, use year 2026 or 2024.
5. "time": Transaction time in "HH:mm" (24-hour format). If seconds are present, omit them. If not visible, null.
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

    const modelName = 'gemini-3.8-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text?.trim() || '{}';
    let parsed: Record<string, unknown> = {};
    try {
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn('Failed to parse Gemini receipt OCR response as JSON:', rawText);
    }

    const validCategories: ExpenseCategoryKey[] = [
      'fuel',
      'toll',
      'parking',
      'meal',
      'wash',
      'stay',
      'transit',
      'other',
      'unclassified',
    ];
    const parsedCategory = typeof parsed.category === 'string' ? parsed.category : '';
    const category: ExpenseCategoryKey = (validCategories as string[]).includes(parsedCategory)
      ? (parsedCategory as ExpenseCategoryKey)
      : 'other';

    const validPaymentMethods: PaymentMethod[] = [
      'company_card',
      'driver_personal',
      'client_card',
      'cash',
      'other',
      'unspecified',
    ];
    const parsedPaymentMethod = typeof parsed.paymentMethod === 'string' ? parsed.paymentMethod : '';
    const paymentMethod: PaymentMethod = (validPaymentMethods as string[]).includes(parsedPaymentMethod)
      ? (parsedPaymentMethod as PaymentMethod)
      : 'company_card';

    const merchant =
      typeof parsed.merchant === 'string' && parsed.merchant.trim()
        ? parsed.merchant.trim()
        : '상호 미확인 가맹점';
    const amount = typeof parsed.amount === 'number' ? Math.round(parsed.amount) : null;
    const address = typeof parsed.address === 'string' && parsed.address.trim() ? parsed.address.trim() : null;
    const date = typeof parsed.date === 'string' && parsed.date.trim() ? parsed.date.trim() : null;
    const time = typeof parsed.time === 'string' && parsed.time.trim() ? parsed.time.trim() : null;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;

    let summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : '';
    if (!summary) {
      summary = `${merchant}${amount ? ` · ${amount.toLocaleString()}원` : ''} 영수증이 판독되었습니다.`;
    }

    const scanResult: ReceiptScanResult = {
      success: true,
      merchant,
      address,
      amount,
      date,
      time,
      category,
      paymentMethod,
      summary,
      confidence,
      modelUsed: modelName,
    };

    globalReceiptOcrCache.set(imageHash, scanResult);

    return NextResponse.json(scanResult);
  } catch (err: unknown) {
    console.error('Receipt Scan API Error:', err);
    // Provide deterministic fallback instead of hard 500 error
    const errMsg = err instanceof Error ? err.message : '영수증 판독 중 오류가 발생했습니다.';
    return NextResponse.json({
      ...getFallbackReceiptData(''),
      error: errMsg,
    });
  }
}
