import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import {
  getOfficialPriceCards,
  getOfficialPriceRules,
  STANDARD_VEHICLE_SKU_MAPPINGS,
  OFFICIAL_TARIFF_VERSION,
} from '@/lib/pricing/officialPricingService';

export const dynamic = 'force-dynamic';

/**
 * HQ Admin Endpoint to fetch the 2026 Company Official Tariff
 * Strictly protected by `requireHqAdmin` (P0 Security)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const version = searchParams.get('version') || OFFICIAL_TARIFF_VERSION;

    const [cards, rules] = await Promise.all([
      getOfficialPriceCards(version),
      getOfficialPriceRules(version),
    ]);

    return NextResponse.json({
      ok: true,
      tariffVersion: version,
      publicationStatus: 'draft',
      cards,
      rules,
      skuMappings: STANDARD_VEHICLE_SKU_MAPPINGS,
      notice: '회사 공식 2026 VIP 의전 요금표 (초안 상태, 승인 전 내부 검토 전용)',
    });
  } catch (err: any) {
    console.error('[OfficialPricing API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message || '서버 오류' }, { status: 500 });
  }
}
