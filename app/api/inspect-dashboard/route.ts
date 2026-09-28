import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { resolveFuelTypeFromModel, resolveFuelTypeFromTachometer } from '@/utils/fuelCalculation';

interface InspectRequestBody {
  image: string; // Base64 data URL or pure base64
  carModel?: string;
  vehicleNo?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: InspectRequestBody = await req.json();
    const { image, carModel = '', vehicleNo = '' } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Image data is required' },
        { status: 400 }
      );
    }

    // Default fallback resolution from car model name
    const modelResolution = resolveFuelTypeFromModel(carModel || vehicleNo);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[Dashboard OCR: Fallback] No GEMINI_API_KEY detected. Returning deterministic model fallback.');
      return NextResponse.json({
        success: true,
        totalKm: null,
        dte: null,
        tachometerRedlineRpm: null,
        fuelType: modelResolution.fuelType,
        reasoning: `${modelResolution.reason} (AI 비전 미설정 상태, 차종 규칙 적용)`,
        modelUsed: 'deterministic-fallback',
      });
    }

    // Parse image MIME type and base64
    let mimeType = 'image/jpeg';
    let base64Data = image;
    const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert automotive instrument cluster (dashboard / 계기판) OCR and vehicle inspection AI for VIP mobility drivers.

Examine this dashboard photo with extreme precision and extract the following:
1. "totalKm": The vehicle's cumulative total odometer reading (총 주행거리 / ODO) in kilometers (integer number only). If obscured or not found, null.
2. "dte": Distance to empty / range (주행가능거리 / 주행 가능 거리 / DTE / 속도계나 연료게이지 근처 남은 거리) in kilometers (integer number only). If obscured or not found, null.
3. "tachometerRedlineRpm": The starting RPM of the tachometer redline (엔진 회전수 타코미터 계기판의 붉은색 레드존 시작 RPM).
   - Typically for Diesel engines, redline starts around 4,500 ~ 5,000 RPM.
   - For Gasoline engines, redline starts around 6,000 ~ 7,000 RPM.
   - If not visible or digital power-meter (EV), null.
4. "fuelType":
   - "diesel": if tachometer redline is <= 5,200 RPM, or tachometer max scale is ~6,000 RPM, or "DIESEL" indicator is visible.
   - "gasoline": if tachometer redline is >= 5,800 RPM, or tachometer max scale is 7,000~8,000 RPM, or "GASOLINE" indicator is visible.
   - null: if tachometer is not visible.
5. "reasoning": A concise 1-sentence Korean summary of your findings (e.g. "총 주행거리 15,048 km, DTE 180 km, 타코미터 레드존 4,500 RPM으로 경유 차량 확인").

Vehicle context provided by driver: "${carModel || vehicleNo || '미지정'}".

Return strictly a JSON object with this exact schema, without markdown code fences or backticks:
{
  "totalKm": number | null,
  "dte": number | null,
  "tachometerRedlineRpm": number | null,
  "fuelType": "gasoline" | "diesel" | null,
  "reasoning": string
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
    let parsed: any = {};
    try {
      // Clean possible fences if any
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn('Failed to parse Gemini response as JSON:', rawText);
    }

    // Determine final fuel type with fallback pipeline:
    // 1. Tachometer RPM
    const tachoFuel = resolveFuelTypeFromTachometer(parsed.tachometerRedlineRpm);
    // 2. Direct AI prediction
    const aiFuel = parsed.fuelType === 'gasoline' || parsed.fuelType === 'diesel' ? parsed.fuelType : null;
    // 3. Model rule
    const finalFuelType = aiFuel || tachoFuel || modelResolution.fuelType || 'gasoline';

    let finalReasoning = parsed.reasoning || '';
    if (!finalReasoning) {
      if (tachoFuel) {
        finalReasoning = `타코미터 레드존 ${parsed.tachometerRedlineRpm} RPM 감지: ${tachoFuel === 'diesel' ? '경유' : '휘발유'} 차량으로 판독되었습니다.`;
      } else {
        finalReasoning = modelResolution.reason;
      }
    }

    return NextResponse.json({
      success: true,
      totalKm: typeof parsed.totalKm === 'number' ? Math.round(parsed.totalKm) : null,
      dte: typeof parsed.dte === 'number' ? Math.round(parsed.dte) : null,
      tachometerRedlineRpm: typeof parsed.tachometerRedlineRpm === 'number' ? Math.round(parsed.tachometerRedlineRpm) : null,
      fuelType: finalFuelType,
      reasoning: finalReasoning,
      modelUsed: modelName,
    });
  } catch (err: any) {
    console.error('Inspect Dashboard API Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Inspection failed',
        totalKm: null,
        dte: null,
        tachometerRedlineRpm: null,
        fuelType: 'gasoline',
        reasoning: '계기판 판독 중 일시적 오류 발생 (보수적 안전마진 휘발유 기본 적용)',
      },
      { status: 200 }
    );
  }
}
