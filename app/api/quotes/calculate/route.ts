import { NextResponse } from 'next/server';
import { calculateQuote } from '@/utils/quoteCalculator';
import { QuoteCalculationInput } from '@/types/quoteHq';

export const dynamic = 'force-dynamic';

/**
 * Pure Real-Time Quote Calculation Endpoint.
 * Computes pricing in-memory using customer contracts and standard presets.
 * ZERO database writes, no side-effects, safe for rapid keystroke typing.
 */
export async function POST(req: Request) {
  try {
    const body: QuoteCalculationInput = await req.json();
    if (!body.customerName || !body.vehicleModel) {
      return NextResponse.json({ ok: false, error: '고객사명과 차량 모델은 필수입니다.' }, { status: 400 });
    }

    const calculatedQuote = await calculateQuote(body);
    return NextResponse.json({ ok: true, quote: calculatedQuote });
  } catch (err: any) {
    console.error('[Quotes Calculate API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

