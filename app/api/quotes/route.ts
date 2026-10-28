import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { calculateQuote } from '@/utils/quoteCalculator';
import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * GET: Retrieve explicitly saved quotes from cockpit.customers.
 * Strictly restricted to HQ Admin.
 */
export async function GET(req: Request) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

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
 * POST: Explicitly SAVE a finalized quote to cockpit.customers using atomic RPC.
 * Strictly restricted to HQ Admin.
 * Prevents race conditions and lost updates with row-level locks and advisory locks.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body: QuoteCalculationInput & { quoteNo?: string; allowUpdate?: boolean } = await req.json();
    if (!body.customerName?.trim() || !body.vehicleModel?.trim()) {
      return NextResponse.json({ ok: false, error: '고객사명과 차량 모델은 필수입니다.' }, { status: 400 });
    }

    // 1. Re-calculate verified quote on server side
    const verifiedQuote = await calculateQuote(body);
    if (body.quoteNo) {
      verifiedQuote.quoteNo = body.quoteNo;
    }

    // 2. Execute atomic transactional quote save via Supabase RPC
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('save_customer_quote_atomic', {
      p_customer_id: body.customerId || null,
      p_customer_name: body.customerName.trim(),
      p_contact_person: body.contactPerson?.trim() || null,
      p_phone: body.contactPhone?.trim() || null,
      p_email: body.contactEmail?.trim() || null,
      p_quote: verifiedQuote,
      p_allow_update: body.allowUpdate ?? true,
    });

    if (rpcErr) {
      console.error('[Quotes POST API] RPC Error:', rpcErr);
      const isDuplicate = rpcErr.message.includes('DUPLICATE_QUOTE_NO');
      const isConverted = rpcErr.message.includes('QUOTE_ALREADY_CONVERTED');
      return NextResponse.json(
        { ok: false, error: rpcErr.message },
        { status: isDuplicate || isConverted ? 409 : 400 }
      );
    }

    const finalQuote = rpcResult?.quote || verifiedQuote;
    const assignedCustomerId = rpcResult?.customer_id || finalQuote.customerId;

    return NextResponse.json({
      ok: true,
      message: `견적서(${finalQuote.quoteNo})가 고객사(${body.customerName})에 안전하게 원자적으로 저장되었습니다.`,
      customerId: assignedCustomerId,
      quote: finalQuote,
    });
  } catch (err: any) {
    console.error('[Quotes POST API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
