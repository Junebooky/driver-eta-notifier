import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { HqQuoteItem } from '@/types/quoteHq';
import { calculateQuote } from '@/utils/quoteCalculator';
import { normalizeDateToIso, normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { encodeScheduleMeta, UNASSIGNED_VEHICLE_SENTINEL } from '@/lib/dispatch/scheduleServerStore';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { quoteNo, quote: providedQuote } = body;

    if (!quoteNo) {
      return NextResponse.json({ ok: false, error: 'quoteNo가 필요합니다.' }, { status: 400 });
    }

    // 1. Strict Duplicate Check in cockpit.schedules by source_quote_no
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

    // 2. Fetch or load target quote
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

    // 3. Server-side Quote Verification (Never blindly trust client pricing numbers)
    const verifiedQuote = await calculateQuote({
      customerId: targetCustomerId || undefined,
      customerName: targetQuote.customerName,
      contactPerson: targetQuote.contactPerson,
      contactPhone: targetQuote.contactPhone,
      date: targetQuote.date,
      serviceStartTime: targetQuote.serviceStartTime,
      serviceEndTime: targetQuote.serviceEndTime,
      serviceHours: targetQuote.serviceHours,
      origin: targetQuote.origin,
      destination: targetQuote.destination,
      vehicleModel: targetQuote.vehicleModel,
      vehicleCount: targetQuote.vehicleCount,
      driverLanguage: targetQuote.driverLanguage,
      serviceMode: targetQuote.serviceMode,
      notes: targetQuote.notes,
    });
    verifiedQuote.quoteNo = targetQuote.quoteNo;

    // 4. Prepare Atomic Batch Insertion for all vehicles
    const count = Math.max(1, verifiedQuote.vehicleCount || 1);
    const groupId = count > 1 ? `grp-${Date.now().toString(36)}` : null;
    const nowIso = new Date().toISOString();
    const isoDate = normalizeDateToIso(verifiedQuote.date) || nowIso.slice(0, 10);
    const startTimeHHmm = normalizeTimeHHmm(verifiedQuote.serviceStartTime) || '09:00';
    const endTimeHHmm = normalizeTimeHHmm(verifiedQuote.serviceEndTime) || '19:00';

    const recordsToInsert: Record<string, any>[] = [];

    for (let i = 0; i < count; i++) {
      const scheduleMeta = {
        driverLanguage: verifiedQuote.driverLanguage,
        serviceMode: verifiedQuote.serviceMode,
        serviceHours: verifiedQuote.serviceHours,
        baseFareTotal: verifiedQuote.baseFareTotal,
        overtimeFareTotal: verifiedQuote.overtimeFareTotal,
        englishSurchargeTotal: verifiedQuote.englishSurchargeTotal,
        supplyPriceTotal: verifiedQuote.supplyPriceTotal,
        vatAmount: verifiedQuote.vatAmount,
        estimatedGrandTotal: verifiedQuote.estimatedGrandTotal,
        sourceQuoteNo: verifiedQuote.quoteNo,
        bookingNo: `BK-${isoDate.replace(/-/g, '').slice(2)}-${String(i + 1).padStart(2, '0')}`,
        customerName: verifiedQuote.customerName,
        customerId: targetCustomerId || null,
        dispatchStatus: 'draft',
        version: 1,
        lastAckVersion: 0,
      };

      const row: Record<string, any> = {
        // ID: omitted so PostgreSQL generates genuine UUID via default gen_random_uuid()
        vehicle_no: UNASSIGNED_VEHICLE_SENTINEL, // '미배정'
        date: isoDate,
        pickup_time: `${startTimeHHmm}:00`,
        time_display: `픽업 ${startTimeHHmm}`,
        origin: verifiedQuote.origin.trim(),
        destination: verifiedQuote.destination.trim(),
        passenger_name: verifiedQuote.contactPerson || verifiedQuote.customerName,
        passenger_count: 1,
        status: 'draft',
        dispatch_status: 'draft', // 본사 대표님 배차 대기함
        operation_status: 'ready',
        end_date: isoDate,
        end_time: `${endTimeHHmm}:00`,
        driver_name: null,
        driver_phone: null,
        vehicle_plate: null,
        vehicle_model: verifiedQuote.vehicleModel,
        customer_id: targetCustomerId || null,
        customer_name: verifiedQuote.customerName,
        event_name: verifiedQuote.notes ? `${verifiedQuote.customerName} - ${verifiedQuote.notes}` : `${verifiedQuote.customerName} 의전 예약`,
        group_id: groupId,
        group_name: count > 1 ? `${verifiedQuote.customerName} 의전 행사` : null,
        group_total_vehicles: count,
        group_vehicle_index: i + 1,
        version: 1,
        last_ack_version: 0,
        source_quote_no: verifiedQuote.quoteNo,
        schedule_meta: scheduleMeta,
        passenger_note: encodeScheduleMeta(scheduleMeta as any),
        created_at: nowIso,
        updated_at: nowIso,
      };

      recordsToInsert.push(row);
    }

    // 5. Atomic Batch Insert (All-or-nothing rollback on any failure)
    const { data: insertedRows, error: insertErr } = await supabaseAdmin
      .from('schedules')
      .insert(recordsToInsert)
      .select('id, vehicle_no, date, pickup_time');

    if (insertErr || !insertedRows) {
      console.error('[Convert Quote API] Atomic batch insertion error:', insertErr);
      return NextResponse.json(
        { ok: false, error: `예약 저장 실패: ${insertErr?.message || '알 수 없는 DB 오류'}` },
        { status: 500 }
      );
    }

    const createdBookingIds = insertedRows.map((r: any) => r.id);

    // 6. Update Quote status to 'converted' in cockpit.customers
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
