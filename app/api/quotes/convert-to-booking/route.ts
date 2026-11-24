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

    // 1. Authoritative DB Lookup: Fetch saved quote strictly from DB
    let dbQuote: HqQuoteItem | null = null;
    let targetCustomerId: string | null = null;

    const { data: customers, error: dbErr } = await supabaseAdmin
      .from('customers')
      .select('id, quotes');

    if (dbErr) {
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }

    for (const cust of customers || []) {
      if (Array.isArray(cust.quotes)) {
        const match = cust.quotes.find((q: any) => q.quoteNo === quoteNo);
        if (match) {
          dbQuote = match;
          targetCustomerId = cust.id;
          break;
        }
      }
    }

    if (!dbQuote || !targetCustomerId) {
      return NextResponse.json(
        { ok: false, error: `고객사 견적서(${quoteNo})를 DB에서 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    // P0-1 & P0-5: Check status - reject already converted quotes
    if (dbQuote.status === 'converted') {
      return NextResponse.json(
        { ok: false, error: `견적서(${quoteNo})는 이미 예약으로 전환 완료되었습니다.` },
        { status: 409 }
      );
    }

    // P0-1: Block conversion if 2026 tariff status is unapproved (draft)
    if (dbQuote.tariffVersion === 'vlk_2026_initial') {
      const pubStatus = dbQuote.appliedPricingSnapshot?.publicationStatus;
      if (pubStatus !== 'approved') {
        return NextResponse.json(
          {
            ok: false,
            error:
              '2026년도 공식 요율표는 현재 미승인(draft) 상태로 관리자 시뮬레이션 미리보기 전용입니다. 공식 승인(approved) 전에는 실예약 전환이 차단됩니다.',
            isDraftPreview: true,
          },
          { status: 403 }
        );
      }
    }

    // P0-5: Client snapshot tampering check - reject mismatched client snapshot
    if (providedQuote) {
      const priceMismatch =
        (providedQuote.supplyPriceTotal !== undefined && providedQuote.supplyPriceTotal !== dbQuote.supplyPriceTotal) ||
        (providedQuote.estimatedGrandTotal !== undefined && providedQuote.estimatedGrandTotal !== dbQuote.estimatedGrandTotal) ||
        (providedQuote.vehicleProductCode && providedQuote.vehicleProductCode !== dbQuote.vehicleProductCode);

      if (priceMismatch) {
        return NextResponse.json(
          {
            ok: false,
            error: '클라이언트 전달 견적 금액/상품이 DB 저장 원본 견적서와 일치하지 않습니다 (위변조 또는 불일치 방지).',
          },
          { status: 400 }
        );
      }
    }

    // 2. Authoritative verified quote from DB
    const verifiedQuote: HqQuoteItem = { ...dbQuote, customerId: targetCustomerId };

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
