import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  lookupApprovedAlias,
  normalizePlaceName,
  isPrivateAddress,
} from '@/utils/locationTranslation';
import { PlaceTranslationRecord } from '@/types/reportTranslation';

// Server-side in-memory cache for translated locations
const serverTranslationCache = new Map<string, PlaceTranslationRecord>();

const GEMINI_SYSTEM_INSTRUCTION = `You are a specialized bilingual mobility assistant for VIP LIMOUSINE KOREA.
Your task is to translate Korean place and location names into SHORT, clean, internationally recognized English names for VIP driver dispatch and departure/arrival reports.

CRITICAL RULES:
1. Generate a SHORT, natural English location name (e.g. 'Incheon Airport T1', 'Incheon Airport T2', 'Gimpo Airport', 'Josun Palace', 'Marriott Hotel', 'Seoul Station', 'Pangyo Office').
2. Prefer recognized, standard English names.
3. Avoid unnecessarily long official names (e.g. AVOID: 'Incheon International Airport (Terminal 1)', USE: 'Incheon Airport T1').
4. Preserve important location identifiers: terminal numbers (T1, T2), hotel branches (e.g. Gangnam, Dongdaemun), building numbers/identifiers (e.g. Tower 1, Agit, 1784).
5. Never invent or hallucinate an official business name.
6. Return structured JSON ONLY. Do not output markdown fences or conversational text.
Schema:
{
  "name_en_short": string,
  "confidence": "high" | "medium" | "low",
  "is_uncertain": boolean
}
7. If the name is ambiguous or you are not sure, set "is_uncertain": true and provide the best sensible short name.
8. If the name is an address or untranslatable, keep the recognized city/district names in English (e.g. 'Yeoksam-dong', 'Pangyo-dong').`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, shortName, id, address } = body || {};

    const displayName = shortName || name;
    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json(
        { error: 'Place name is required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 1. Check Approved Aliases
    const approved = lookupApprovedAlias({ name, shortName, id, address });
    if (approved) {
      return NextResponse.json({
        place_id: id,
        name_ko: displayName,
        name_en_short: approved,
        translation_source: 'approved',
        last_verified_at: now,
        is_uncertain: false,
      });
    }

    // 2. Check Server Cache
    const normalizedKey = id || normalizePlaceName(displayName);
    const cached = serverTranslationCache.get(normalizedKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        translation_source: 'cache',
        last_verified_at: now,
      });
    }

    // 3. Check Gemini API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[TranslatePlace API] No GEMINI_API_KEY found. Using fallback preservation.');
      const fallbackRecord: PlaceTranslationRecord = {
        place_id: id,
        name_ko: displayName,
        name_en_short: displayName,
        translation_source: 'fallback',
        last_verified_at: now,
        is_uncertain: true,
      };
      return NextResponse.json(fallbackRecord);
    }

    // 4. Call Gemini
    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

    const userPrompt = `Translate this place name for a VIP driver report:
Name: "${name || ''}"
Short Name: "${shortName || ''}"
Address: "${address || ''}"
Place ID: "${id || ''}"`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: [userPrompt],
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
    } catch (modelErr) {
      // Fallback model if primary model fails
      console.warn(`[TranslatePlace API] Model ${modelName} failed, retrying with gemini-2.5-flash:`, modelErr);
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [userPrompt],
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
    }

    const rawText = response.text?.trim() || '{}';
    let parsed: { name_en_short?: string; confidence?: string; is_uncertain?: boolean } = {};
    try {
      const cleanJson = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.warn('[TranslatePlace API] JSON parse error, raw:', rawText, parseErr);
    }

    const englishName = (parsed.name_en_short || '').trim() || displayName;
    const isUncertain = Boolean(parsed.is_uncertain) || parsed.confidence === 'low';

    const record: PlaceTranslationRecord = {
      place_id: id,
      name_ko: displayName,
      name_en_short: englishName,
      translation_source: 'gemini',
      last_verified_at: now,
      is_uncertain: isUncertain,
    };

    // Cache unless it's a private residential address
    if (!isPrivateAddress(displayName) && !isPrivateAddress(address)) {
      serverTranslationCache.set(normalizedKey, record);
    }

    return NextResponse.json(record);
  } catch (error: unknown) {
    console.error('[TranslatePlace API] Uncaught error:', error);
    // Task 4: "If translation fails, preserve the original place name and keep the report usable."
    return NextResponse.json(
      {
        name_ko: 'Unknown',
        name_en_short: 'Unknown',
        translation_source: 'fallback',
        last_verified_at: new Date().toISOString(),
        is_uncertain: true,
      },
      { status: 200 }
    );
  }
}
