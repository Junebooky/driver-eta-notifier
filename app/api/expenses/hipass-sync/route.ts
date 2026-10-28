import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hydrateRawScheduleRow } from '@/lib/dispatch/scheduleServerStore';
import { ReconciledHipassItem } from '@/utils/hipassReconciler';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export interface ServerSyncedHipassToll {
  hipassTxKey: string;
  scheduleId: string;
  bookingNo: string;
  customerName: string;
  customerId?: string;
  driverName: string;
  vehiclePlate: string;
  vehicleModel: string;
  rawDate: string;
  time: string;
  entrance: string;
  exit: string;
  amount: number;
  cardNo?: string;
  approvalNo?: string;
  syncedAt: string;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { data, error } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .order('date', { ascending: false })
      .limit(300);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const tolls: ServerSyncedHipassToll[] = [];
    for (const raw of data || []) {
      const dLog =
        raw.driving_log && typeof raw.driving_log === 'object' && !Array.isArray(raw.driving_log)
          ? (raw.driving_log as Record<string, any>)
          : {};
      if (!Array.isArray(dLog.hipass_tolls) || dLog.hipass_tolls.length === 0) continue;

      const hydrated = hydrateRawScheduleRow(raw);
      for (const item of dLog.hipass_tolls) {
        if (!item || !item.hipassTxKey) continue;
        tolls.push({
          hipassTxKey: String(item.hipassTxKey),
          scheduleId: hydrated.id,
          bookingNo: hydrated._meta.bookingNo || `#${hydrated.id.slice(0, 6)}`,
          customerName: hydrated._meta.customerName || hydrated.passenger_name || 'VIP 고객',
          customerId: hydrated._meta.customerId,
          driverName: hydrated.driver_name || hydrated._meta.driverName || '미배정',
          vehiclePlate: item.vehiclePlate || hydrated._meta.vehiclePlate || hydrated.vehicle_no || '',
          vehicleModel: hydrated._meta.vehicleModel || '차량',
          rawDate: String(item.rawDate || hydrated.date),
          time: String(item.time || '00:00'),
          entrance: String(item.entrance || '입구미상'),
          exit: String(item.exit || '출구미상'),
          amount: Number(item.amount) || 0,
          cardNo: item.cardNo,
          approvalNo: item.approvalNo,
          syncedAt: String(item.syncedAt || hydrated.updated_at || new Date().toISOString()),
        });
      }
    }

    return NextResponse.json({ ok: true, tolls });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/expenses/hipass-sync error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const rawItems: ReconciledHipassItem[] = Array.isArray(body?.items) ? body.items : [];
    const syncedBy = typeof body?.syncedBy === 'string' && body.syncedBy.trim() ? body.syncedBy.trim() : '본사 정산팀';

    if (rawItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: '연동할 하이패스 통행료 내역이 없습니다.' },
        { status: 400 }
      );
    }

    const groupedBySchedule = new Map<string, ReconciledHipassItem[]>();
    let vehicleOnlyCount = 0;

    for (const item of rawItems) {
      if (!item || !item.hipassTxKey || !(Number(item.amount) > 0)) continue;
      if (item.matchedScheduleId) {
        const list = groupedBySchedule.get(item.matchedScheduleId) || [];
        list.push(item);
        groupedBySchedule.set(item.matchedScheduleId, list);
      } else {
        vehicleOnlyCount++;
      }
    }

    const nowIso = new Date().toISOString();
    let syncedScheduleCount = 0;
    let addedToSchedulesCount = 0;
    let skippedScheduleDuplicates = 0;
    let totalSyncedTollAmount = 0;

    for (const [scheduleId, scheduleItems] of groupedBySchedule.entries()) {
      const { data: rawRow, error: fetchErr } = await supabaseAdmin
        .from('schedules')
        .select('id, driving_log')
        .eq('id', scheduleId)
        .maybeSingle();

      if (fetchErr || !rawRow) {
        continue;
      }

      const prevDrivingLog =
        rawRow.driving_log && typeof rawRow.driving_log === 'object' && !Array.isArray(rawRow.driving_log)
          ? (rawRow.driving_log as Record<string, any>)
          : {};

      const existingTolls: Array<Record<string, any>> = Array.isArray(prevDrivingLog.hipass_tolls)
        ? [...prevDrivingLog.hipass_tolls]
        : [];
      const existingKeys = new Set(existingTolls.map((t) => String(t.hipassTxKey)));

      let scheduleAdded = 0;
      for (const item of scheduleItems) {
        if (existingKeys.has(item.hipassTxKey)) {
          skippedScheduleDuplicates++;
          continue;
        }
        existingKeys.add(item.hipassTxKey);
        existingTolls.push({
          hipassTxKey: item.hipassTxKey,
          rawDate: item.rawDate,
          time: item.time,
          vehiclePlate: item.resolvedPlate || item.vehiclePlateRaw,
          entrance: item.entrance,
          exit: item.exit,
          amount: Number(item.amount) || 0,
          cardNo: item.cardNo,
          approvalNo: item.approvalNo,
          syncedAt: nowIso,
          syncedBy,
        });
        scheduleAdded++;
        addedToSchedulesCount++;
        totalSyncedTollAmount += Number(item.amount) || 0;
      }

      if (scheduleAdded > 0) {
        const tollTotalAmount = existingTolls.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const nextDrivingLog = {
          ...prevDrivingLog,
          hipass_tolls: existingTolls,
          toll_total_amount: tollTotalAmount,
          toll_count: existingTolls.length,
          toll_synced_at: nowIso,
          toll_synced_by: syncedBy,
        };

        const { error: updateErr } = await supabaseAdmin
          .from('schedules')
          .update({
            driving_log: nextDrivingLog,
            updated_at: nowIso,
          })
          .eq('id', scheduleId);

        if (!updateErr) {
          syncedScheduleCount++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      syncedScheduleCount,
      addedToSchedulesCount,
      skippedScheduleDuplicates,
      vehicleOnlyCount,
      totalSyncedTollAmount,
      syncedAt: nowIso,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/expenses/hipass-sync error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

