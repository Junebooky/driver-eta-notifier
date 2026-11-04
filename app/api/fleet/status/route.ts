import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { readFleetOperations, FleetOperation } from '@/lib/fleet/operationsStore';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import { cleanVehicleIdentity } from '@/utils/dispatchConflictDetector';

export const dynamic = 'force-dynamic';

function responseMaps(rows: FleetOperation[]) {
  const statuses: Record<string, FleetOperation['status']> = {};
  const memos: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const row of rows) {
    const vehicle = VIP_REAL_VEHICLES.find(v => v.uuid === row.vehicle_id);
    if (!vehicle) continue;
    for (const key of [vehicle.id, row.vehicle_id, cleanVehicleIdentity(row.plate)]) {
      statuses[key] = row.status; memos[key] = row.memo; colors[key] = row.color;
    }
  }
  return { statuses, memos, colors };
}

export async function GET(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  try {
    return NextResponse.json({ ok: true, ...responseMaps(await readFleetOperations()) });
  } catch {
    return NextResponse.json({ ok: false, error: '차량 상태 조회에 실패했습니다. 저장된 상태를 확인할 수 없습니다.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok || !auth.session) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  try {
    const body = await req.json();
    const vehicle = VIP_REAL_VEHICLES.find(v => v.uuid === body.vehicleId || v.id === body.vehicleId);
    if (!vehicle?.uuid || (body.plate && cleanVehicleIdentity(body.plate) !== cleanVehicleIdentity(vehicle.plate))) {
      return NextResponse.json({ ok: false, error: '차량 ID와 전체 번호판을 확인해 주세요.' }, { status: 400 });
    }
    if (!['확인 필요', '대기 중', '운행 중', '정비 중'].includes(body.status)
      || typeof body.memo !== 'string' || body.memo.length > 5000
      || (body.color !== undefined && (typeof body.color !== 'string' || body.color.length > 100))) {
      return NextResponse.json({ ok: false, error: '차량 상태·메모·색상 입력값을 확인해 주세요.' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('fleet_vehicle_operations').upsert({
      vehicle_id: vehicle.uuid, organization_id: auth.session.org, plate: vehicle.plate,
      status: body.status, memo: body.memo, color: body.color || '',
      updated_by: auth.session.userId, updated_at: new Date().toISOString(),
    }, { onConflict: 'vehicle_id' }).select('*').single();
    if (error || !data) throw new Error('save failed');
    return NextResponse.json({ ok: true, ...responseMaps([data]) });
  } catch {
    return NextResponse.json({ ok: false, error: '차량 상태가 저장되지 않았습니다. DB 연결 및 마이그레이션을 확인해 주세요.' }, { status: 503 });
  }
}
