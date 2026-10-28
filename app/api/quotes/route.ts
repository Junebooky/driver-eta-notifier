import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { calculateQuote } from '@/utils/quoteCalculator';
import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';

export const dynamic = 'force-dynamic';

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

export async function POST(req: Request) {
  try {
    const body: QuoteCalculationInput = await req.json();
    if (!body.customerName || !body.vehicleModel) {
      return NextResponse.json({ ok: false, error: '고객사명과 차량 모델은 필수입니다.' }, { status: 400 });
    }

    // 1. Calculate Quote
    const calculatedQuote = await calculateQuote(body);

    // 2. Persist to customer's quotes jsonb if customer exists or find/create customer
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
        // Create customer record
        const newId = `cust-${Date.now().toString(36)}`;
        await supabaseAdmin.from('customers').insert({
          id: newId,
          name: body.customerName.trim(),
          contact_person: body.contactPerson || null,
          phone: body.contactPhone || null,
          email: body.contactEmail || null,
          quotes: [calculatedQuote],
        });
        targetCustomerId = newId;
      }
    }

    if (targetCustomerId) {
      calculatedQuote.customerId = targetCustomerId;
      // Fetch current quotes and append
      const { data: custRow } = await supabaseAdmin
        .from('customers')
        .select('quotes')
        .eq('id', targetCustomerId)
        .maybeSingle();

      const existingQuotes: HqQuoteItem[] = Array.isArray(custRow?.quotes) ? custRow.quotes : [];
      const updatedQuotes = [calculatedQuote, ...existingQuotes.filter((q) => q.quoteNo !== calculatedQuote.quoteNo)];

      await supabaseAdmin
        .from('customers')
        .update({ quotes: updatedQuotes, updated_at: new Date().toISOString() })
        .eq('id', targetCustomerId);
    }

    return NextResponse.json({ ok: true, quote: calculatedQuote });
  } catch (err: any) {
    console.error('[Quotes POST API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
