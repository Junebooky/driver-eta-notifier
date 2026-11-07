import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { readFleetRegistry } from '@/lib/fleet/registryStore';
import { normalizeFleetPlate, type FleetRegistryRecord } from '@/utils/fleetVehicleRegistry';
import { VIP_REAL_VEHICLES, reconcileRegisteredVehicle, type VipRealVehicle } from '@/utils/vehicleData';

export const dynamic = 'force-dynamic';
const ORG = 'vip_limousine_korea';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function authorized(req: NextRequest) {
  return requireHqAdmin(req);
}

export async function GET(req: NextRequest) {
  const auth = await authorized(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  try {
    return NextResponse.json({ ok: true, records: await readFleetRegistry() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : '차량 등록부를 조회할 수 없습니다.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorized(req);
  if (!auth.ok || !auth.session) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  try {
    const input = await req.json() as Partial<VipRealVehicle>;
    const plate = typeof input.plate === 'string' ? input.plate.trim() : '';
    const model = typeof input.model === 'string' ? input.model.trim() : '';
    const capacity = typeof input.capacity === 'string' ? input.capacity.trim() : '';
    const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl : '';
    const validCategory = ['sprinter','staria','carnival','genesis','s_class'].includes(String(input.category));
    const validFuel = ['디젤','가솔린','하이브리드'].includes(String(input.fuelType));
    const validBrand = ['벤츠','현대','기아','제네시스'].includes(String(input.brand));
    if (!plate || plate.length > 60 || !/\d{3,4}$/.test(plate.replace(/\s/g,'')) ||
        !model || model.length > 160 || !capacity || capacity.length > 60 ||
        !validCategory || !validFuel || !validBrand ||
        (imageUrl && (!/^(\/images\/|https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(imageUrl) || imageUrl.length > 14_000_000))) {
      return NextResponse.json({ ok: false, error: '차량번호·차종·좌석수·차량 사진 입력을 확인해 주세요.' }, { status: 400 });
    }

    const existing = await readFleetRegistry();
    const old = existing.find(row => normalizeFleetPlate(row.plate) === normalizeFleetPlate(plate));
    const canonical = VIP_REAL_VEHICLES.find(v => normalizeFleetPlate(v.plate) === normalizeFleetPlate(plate));
    const vehicleId = old?.vehicle_id || canonical?.uuid || crypto.randomUUID();
    if (!UUID.test(vehicleId)) {
      return NextResponse.json({ ok: false, error: '차량 UUID 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const saved: VipRealVehicle = reconcileRegisteredVehicle({
      id: old?.profile.id || canonical?.id || `vehicle-custom-${vehicleId}`,
      uuid: vehicleId,
      plate: canonical?.plate || plate,
      plateShort: canonical?.plateShort || plate.replace(/\s/g,'').slice(-4),
      model, modelShort: input.modelShort?.slice(0, 160) || model,
      brand: input.brand!, category: input.category!, categoryLabel: input.categoryLabel?.slice(0, 70) || '',
      subType: input.subType?.slice(0, 160) || model, capacity,
      status: input.status === '운행 중' || input.status === '정비 중' ? input.status : '차고지 대기',
      fuelType: input.fuelType!, year: input.year?.slice(0, 10), color: input.color?.slice(0, 100),
      imageUrl: imageUrl || undefined,
      chargingSpecs: input.chargingSpecs,
      adminMemo: input.adminMemo?.slice(0, 5000),
    });
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('fleet_vehicle_registry').upsert({
      vehicle_id: vehicleId, organization_id: ORG, plate: saved.plate, profile: saved,
      archived: false, updated_by: auth.session.userId, updated_at: now,
    }, { onConflict: 'vehicle_id' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, vehicle: saved, archived: false });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : '차량 등록에 실패했습니다.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorized(req);
  if (!auth.ok || !auth.session) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  try {
    const body = await req.json();
    const plate = typeof body.plate === 'string' ? body.plate.trim() : '';
    const records = await readFleetRegistry();
    const existing = records.find(row => normalizeFleetPlate(row.plate) === normalizeFleetPlate(plate));
    const canonical = VIP_REAL_VEHICLES.find(v => normalizeFleetPlate(v.plate) === normalizeFleetPlate(plate));
    if (!plate || (!existing && !canonical)) {
      return NextResponse.json({ ok: false, error: '삭제할 등록 차량을 찾지 못했습니다.' }, { status: 404 });
    }
    const uuid = existing?.vehicle_id || canonical!.uuid;
    const profile = existing?.profile || canonical!;
    const { error } = await supabaseAdmin.from('fleet_vehicle_registry').upsert({
      vehicle_id: uuid, organization_id: ORG, plate: profile.plate, profile,
      archived: true, updated_by: auth.session.userId, updated_at: new Date().toISOString(),
    }, { onConflict: 'vehicle_id' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, vehicleId: uuid });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : '차량 삭제에 실패했습니다.' }, { status: 503 });
  }
}
