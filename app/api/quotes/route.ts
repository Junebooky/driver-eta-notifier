import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { calculateQuote } from '@/utils/quoteCalculator';
import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';

export const dynamic = 'force-dynamic';

/**
 * GET: Retrieve explicitly saved quotes from cockpit.customers.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    let query = supabaseAdmin.from('customers').select('id, name, quotes');
    if (customerId) {
      query = query.eq('id', customerId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const allQuotes: HqQuoteItem[] = [];
    (data || []).forEach((row: any) => {
      if (Array.isArray(row.quotes)) {
        row.quotes.forEach((q: HqQuoteItem) => {
          allQuotes.push({
            ...q,
            customerId: row.id,
            customerName: q.customerName || row.name,
          });
        });
      }
    });

    // Sort newest first
    allQuotes.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return NextResponse.json({ ok: true, quotes: allQuotes });
  } catch (err: any) {
    console.error('[Quotes GET API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST: Explicitly SAVE a finalized quote to cockpit.customers.
 * Only called when the manager explicitly clicks [견적서 저장] or [확정 예약으로 전환].
 * Recalculates verified server-side totals to prevent blind reliance on client calculations.
 */
export async function POST(req: Request) {
  try {
    const body: QuoteCalculationInput & { quoteNo?: string } = await req.json();
    if (!body.customerName || !body.vehicleModel) {
      return NextResponse.json({ ok: false, error: '고객사명과 차량 모델은 필수입니다.' }, { status: 400 });
    }

    // 1. Re-calculate verified quote on server side
    const verifiedQuote = await calculateQuote(body);
    if (body.quoteNo) {
      verifiedQuote.quoteNo = body.quoteNo;
    }

    // 2. Identify or create customer
    let targetCustomerId = body.customerId;
    if (!targetCustomerId) {
      const { data: existingCust } = await supabaseAdmin
        .from('customers')
        .select('id, quotes')
        .ilike('name', body.customerName.trim())
        .maybeSingle();

      if (existingCust) {
        targetCustomerId = existingCust.id;
      } else {
        const newId = `cust-${Date.now().toString(36)}`;
        await supabaseAdmin.from('customers').insert({
          id: newId,
          name: body.customerName.trim(),
          contact_person: body.contactPerson || null,
          phone: body.contactPhone || null,
          email: body.contactEmail || null,
          quotes: [verifiedQuote],
        });
        targetCustomerId = newId;
      }
    }

    if (targetCustomerId) {
      verifiedQuote.customerId = targetCustomerId;
      // Fetch current quotes and append/replace quote with same quoteNo
      const { data: custRow, error: fetchErr } = await supabaseAdmin
        .from('customers')
        .select('quotes')
        .eq('id', targetCustomerId)
        .maybeSingle();

      if (fetchErr) {
        return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
      }

      const existingQuotes: HqQuoteItem[] = Array.isArray(custRow?.quotes) ? custRow.quotes : [];
      const updatedQuotes = [verifiedQuote, ...existingQuotes.filter((q) => q.quoteNo !== verifiedQuote.quoteNo)];

      const { error: updateErr } = await supabaseAdmin
        .from('customers')
        .update({ quotes: updatedQuotes, updated_at: new Date().toISOString() })
        .eq('id', targetCustomerId);

      if (updateErr) {
        return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `견적서(${verifiedQuote.quoteNo})가 고객사(${body.customerName}) 정보에 안전하게 저장되었습니다.`,
      quote: verifiedQuote,
    });
  } catch (err: any) {
    console.error('[Quotes POST API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
