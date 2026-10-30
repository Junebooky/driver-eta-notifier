import { NextRequest, NextResponse } from 'next/server';
import { calculateQuote } from '@/utils/quoteCalculator';
import { QuoteCalculationInput } from '@/types/quoteHq';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * Pure Real-Time Quote Calculation Endpoint.
 * Strictly protected by `requireHqAdmin` (P0 Security Requirement).
 * Computes pricing in-memory using 2026 Official Tariff, customer contracts, and standard presets.
 * ZERO database writes, no side-effects, safe for rapid keystroke typing.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body: QuoteCalculationInput = await req.json();
    if (!body.customerName || (!body.vehicleModel && !body.vehicleProductCode)) {
      return NextResponse.json(
        { ok: false, error: '고객사명과 차량 모델(또는 상품코드)은 필수입니다.' },
        { status: 400 }
      );
    }

    const calculatedQuote = await calculateQuote(body);
    return NextResponse.json({ ok: true, quote: calculatedQuote });
  } catch (err: any) {
    console.error('[Quotes Calculate API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
