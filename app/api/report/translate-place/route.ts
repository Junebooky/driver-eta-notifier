import { NextRequest, NextResponse } from 'next/server';
import {
  lookupApprovedAlias,
  normalizePlaceName,
  isPrivateAddress,
  decodeHtmlEntities,
  shortenEnglishPlaceName,
} from '@/utils/locationTranslation';
import { PlaceTranslationRecord } from '@/types/reportTranslation';

// Server-side in-memory cache for translated locations
const serverTranslationCache = new Map<string, PlaceTranslationRecord>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, shortName, id, address } = body || {};

    const rawName = shortName || name;
    if (!rawName || typeof rawName !== 'string') {
      return NextResponse.json(
        { error: 'Place name is required' },
        { status: 400 }
      );
    }

    // Input validation: Limit length to 150 characters to prevent abuse
    const displayName = rawName.slice(0, 150).trim();
    const now = new Date().toISOString();

    // -------------------------------------------------------------
    // Priority 1: Company-Approved English Aliases
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // Priority 2: Server-Side Translation Cache
    // -------------------------------------------------------------
    const normalizedKey = id || normalizePlaceName(displayName);
    const cached = serverTranslationCache.get(normalizedKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        translation_source: 'cache',
        last_verified_at: now,
      });
    }

    // -------------------------------------------------------------
    // Priority 3: Google Cloud Translation API (Basic REST API v2)
    // -------------------------------------------------------------
    const apiKey = process.env.GOOGLE_TRANSLATION_API_KEY;
    if (!apiKey) {
      console.warn('[Google Translate API] Missing GOOGLE_TRANSLATION_API_KEY. Preserving original name.');
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

    // Call Google Cloud Translation REST API v2 with 5-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const googleEndpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
      apiKey
    )}`;

    let googleResponse;
    try {
      googleResponse = await fetch(googleEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: [displayName],
          source: 'ko',
          target: 'en',
          format: 'text',
        }),
        signal: controller.signal,
      });
    } catch {
      console.warn('[Google Translate API] Network or timeout error during translation');
      return NextResponse.json({
        place_id: id,
        name_ko: displayName,
        name_en_short: displayName,
        translation_source: 'fallback',
        last_verified_at: now,
        is_uncertain: true,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!googleResponse.ok) {
      console.warn(
        `[Google Translate API] API returned non-OK status: ${googleResponse.status}`
      );
      return NextResponse.json({
        place_id: id,
        name_ko: displayName,
        name_en_short: displayName,
        translation_source: 'fallback',
        last_verified_at: now,
        is_uncertain: true,
      });
    }

    const data = await googleResponse.json();
    const rawTranslated = data?.data?.translations?.[0]?.translatedText || '';

    if (!rawTranslated) {
      return NextResponse.json({
        place_id: id,
        name_ko: displayName,
        name_en_short: displayName,
        translation_source: 'fallback',
        last_verified_at: now,
        is_uncertain: true,
      });
    }

    // Decode HTML entities and apply conservative shortening
    const decoded = decodeHtmlEntities(rawTranslated);
    const shortEnglishName = shortenEnglishPlaceName(decoded) || displayName;

    const record: PlaceTranslationRecord = {
      place_id: id,
      name_ko: displayName,
      name_en_short: shortEnglishName,
      translation_source: 'google',
      last_verified_at: now,
      is_uncertain: false,
    };

    // Cache if not a private residential address (Task 5 privacy guardrail)
    if (!isPrivateAddress(displayName) && !isPrivateAddress(address)) {
      serverTranslationCache.set(normalizedKey, record);
    }

    return NextResponse.json(record);
  } catch {
    console.error('[Google Translate API] Uncaught translation error');
    // Task 3: Priority 4 - Original place name if translation fails
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
