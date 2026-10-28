import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { HqQuoteItem } from '@/types/quoteHq';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { quoteNo, quote: providedQuote } = body;

    if (!quoteNo) {
      return NextResponse.json({ ok: false, error: 'quoteNo가 필요합니다.' }, { status: 400 });
    }

    // 1. Strict Duplicate Check in cockpit.schedules
    const { data: existingBookings, error: checkErr } = await supabaseAdmin
      .from('schedules')
      .select('id, dispatch_status, created_at')
      .eq('source_quote_no', quoteNo);

    if (checkErr) {
      console.warn('[Convert Quote] Check schedules warning:', checkErr.message);
    }

    if (existingBookings && existingBookings.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `이미 예약으로 전환된 견적서입니다. (기존 예약 ID: ${existingBookings[0].id})`,
          duplicate: true,
          bookingIds: existingBookings.map((b) => b.id),
        },
        { status: 409 }
      );
    }

    // 2. Fetch quote from cockpit.customers or use provided quote
    let targetQuote: HqQuoteItem | null = providedQuote || null;
    let targetCustomerId: string | null = targetQuote?.customerId || null;

    if (!targetQuote) {
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id, quotes');

      for (const cust of customers || []) {
        if (Array.isArray(cust.quotes)) {
          const match = cust.quotes.find((q: any) => q.quoteNo === quoteNo);
          if (match) {
            targetQuote = match;
            targetCustomerId = cust.id;
            break;
          }
        }
      }
    }

    if (!targetQuote) {
      return NextResponse.json({ ok: false, error: `견적서(${quoteNo})를 찾을 수 없습니다.` }, { status: 404 });
    }

    // 3. Create schedule row(s) in cockpit.schedules
    const createdBookingIds: string[] = [];
    const count = Math.max(1, targetQuote.vehicleCount || 1);
    const groupId = count > 1 ? `grp-${Date.now().toString(36)}` : null;
    const nowIso = new Date().toISOString();

    for (let i = 0; i < count; i++) {
      const bookingId = `bk-${Date.now().toString(36)}-${i + 1}`;
      const scheduleRow: Record<string, any> = {
        id: bookingId,
        source_quote_no: targetQuote.quoteNo,
        customer_id: targetCustomerId || targetQuote.customerId || null,
        customer_name: targetQuote.customerName,
        event_name: targetQuote.notes ? `${targetQuote.customerName} - ${targetQuote.notes}` : `${targetQuote.customerName} 의전 예약`,
        vehicle_model: targetQuote.vehicleModel,
        pickup_location: targetQuote.origin,
        dropoff_location: targetQuote.destination,
        start_date: targetQuote.date,
        start_time: targetQuote.serviceStartTime || '09:00',
        end_date: targetQuote.date,
        end_time: targetQuote.serviceEndTime || '19:00',
        dispatch_status: 'draft', // 대기함(미배정)
        operation_status: 'ready',
        group_id: groupId,
        group_name: count > 1 ? `${targetQuote.customerName} 의전 행사` : null,
        group_total_vehicles: count,
        group_vehicle_index: i + 1,
        schedule_meta: {
          driverLanguage: targetQuote.driverLanguage,
          serviceMode: targetQuote.serviceMode,
          serviceHours: targetQuote.serviceHours,
          estimatedGrandTotal: targetQuote.estimatedGrandTotal,
          sourceQuoteNo: targetQuote.quoteNo,
        },
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { error: insertErr } = await supabaseAdmin.from('schedules').insert(scheduleRow);
      if (insertErr) {
        console.error('[Convert Quote] Insert schedule error:', insertErr);
        return NextResponse.json({ ok: false, error: `예약 생성 실패: ${insertErr.message}` }, { status: 500 });
      }
      createdBookingIds.push(bookingId);
    }

    // 4. Update Quote status in customer JSONB
    if (targetCustomerId) {
      const { data: custData } = await supabaseAdmin
        .from('customers')
        .select('quotes')
        .eq('id', targetCustomerId)
        .maybeSingle();

      if (custData && Array.isArray(custData.quotes)) {
        const updatedQuotes = custData.quotes.map((q: any) => {
          if (q.quoteNo === quoteNo) {
            return {
              ...q,
              status: 'converted',
              convertedBookingId: createdBookingIds[0],
              convertedAt: nowIso,
              updatedAt: nowIso,
            };
          }
          return q;
        });

        await supabaseAdmin
          .from('customers')
          .update({ quotes: updatedQuotes, updated_at: nowIso })
          .eq('id', targetCustomerId);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `견적서(${quoteNo})가 ${count}대 예약으로 정상 전환되었습니다. 대표님 배차 대기함에서 차량·기사를 확정해주세요.`,
      quoteNo,
      bookingIds: createdBookingIds,
      groupId,
    });
  } catch (err: any) {
    console.error('[Convert Quote API] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
