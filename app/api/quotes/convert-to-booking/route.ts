import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { HqQuoteItem } from '@/types/quoteHq';
import { calculateQuote } from '@/utils/quoteCalculator';
import { normalizeDateToIso, normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const { quoteNo, quote: providedQuote } = body;

    if (!quoteNo) {
      return NextResponse.json({ ok: false, error: 'quoteNo가 필요합니다.' }, { status: 400 });
    }

    // 1. Fetch or load target quote from DB if not fully provided
    let targetQuote: HqQuoteItem | null = providedQuote || null;
    let targetCustomerId: string | null = targetQuote?.customerId || null;

    if (!targetQuote || !targetCustomerId) {
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

    if (!targetQuote || !targetCustomerId) {
      return NextResponse.json(
        { ok: false, error: `고객사 견적서(${quoteNo})를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    // 2. Server-side Quote Verification (Never blindly trust client pricing numbers)
    const verifiedQuote = await calculateQuote({
      customerId: targetCustomerId,
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
    verifiedQuote.customerId = targetCustomerId;

    // 3. Prepare Vehicle Schedules Array for Atomic RPC Conversion
    const count = Math.max(1, verifiedQuote.vehicleCount || 1);
    const groupId = count > 1 ? `grp-${Date.now().toString(36)}` : null;
    const nowIso = new Date().toISOString();
    const isoDate = normalizeDateToIso(verifiedQuote.date) || nowIso.slice(0, 10);
    const startTimeHHmm = normalizeTimeHHmm(verifiedQuote.serviceStartTime) || '09:00';
    const endTimeHHmm = normalizeTimeHHmm(verifiedQuote.serviceEndTime) || '19:00';

    const schedulesToInsert: Record<string, any>[] = [];

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
        customerId: targetCustomerId,
        dispatchStatus: 'unassigned', // P1: unassigned (미배정)
        version: 1,
        lastAckVersion: 0,
      };

      schedulesToInsert.push({
        date: isoDate,
        pickup_time: `${startTimeHHmm}:00`,
        time_display: `픽업 ${startTimeHHmm}`,
        origin: verifiedQuote.origin.trim(),
        destination: verifiedQuote.destination.trim(),
        passenger_name: verifiedQuote.contactPerson || verifiedQuote.customerName,
        passenger_count: 1,
        vehicle_model: verifiedQuote.vehicleModel,
        customer_name: verifiedQuote.customerName,
        customer_id: targetCustomerId,
        event_name: verifiedQuote.notes ? `${verifiedQuote.customerName} - ${verifiedQuote.notes}` : `${verifiedQuote.customerName} 의전 예약`,
        group_id: groupId,
        group_name: count > 1 ? `${verifiedQuote.customerName} 의전 행사` : null,
        group_total_vehicles: count,
        group_vehicle_index: i + 1,
        end_date: isoDate,
        end_time: `${endTimeHHmm}:00`,
        schedule_meta: scheduleMeta,
      });
    }

    // 4. Call Atomic RPC: cockpit.convert_quote_to_bookings_atomic
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('convert_quote_to_bookings_atomic', {
      p_customer_id: targetCustomerId,
      p_quote_no: quoteNo,
      p_verified_quote: verifiedQuote,
      p_schedules: schedulesToInsert,
    });

    if (rpcErr) {
      console.error('[Convert Quote API] RPC Error:', rpcErr);
      const isDuplicate = rpcErr.message.includes('QUOTE_ALREADY_CONVERTED') || rpcErr.code === '23505';
      return NextResponse.json(
        {
          ok: false,
          error: rpcErr.message,
          duplicate: isDuplicate,
        },
        { status: isDuplicate ? 409 : 400 }
      );
    }

    const bookingIds = rpcResult?.booking_ids || [];

    return NextResponse.json({
      ok: true,
      message: `견적서(${quoteNo})가 ${count}대 미배정(unassigned) 예약으로 원자적 전환되었습니다. 대표님 배차 대기함에서 차량·기사를 확정해주세요.`,
      quoteNo,
      bookingIds,
      groupId,
      dispatchStatus: 'unassigned',
    });
  } catch (err: any) {
    console.error('[Convert Quote API] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
