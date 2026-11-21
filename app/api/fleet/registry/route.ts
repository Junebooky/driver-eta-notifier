import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { readFleetRegistry } from '@/lib/fleet/registryStore';
import { normalizeFleetPlate } from '@/utils/fleetVehicleRegistry';
import { VIP_REAL_VEHICLES, type VipRealVehicle } from '@/utils/vehicleData';

export const dynamic = 'force-dynamic';
const ORG = 'vip_limousine_korea';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

/**
 * Thin admin-only CRUD over the EXISTING cockpit.vehicles physical fleet.
 * No second inventory table: all vehicles share a single UUID and plate.
 */
export async function GET(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  try {
    return NextResponse.json({ ok: true, records: await readFleetRegistry() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : '차량 목록을 조회할 수 없습니다.' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireHqAdmin(req);
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

    const rows = await readFleetRegistry();
    const existing = rows.find(row => normalizeFleetPlate(row.plate) === normalizeFleetPlate(plate));
    const canonical = VIP_REAL_VEHICLES.find(v => normalizeFleetPlate(v.plate) === normalizeFleetPlate(plate));
    // A pre-existing physical record is authoritative even if a browser has
    // an outdated copy of its model, number of seats or fuel.
    const verified = existing?.profile;
    const vehicleId = existing?.vehicle_id || canonical?.uuid || crypto.randomUUID();
    if (!UUID.test(vehicleId)) {
      return NextResponse.json({ ok: false, error: '차량 UUID 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const saved: VipRealVehicle = {
      id: verified?.id || canonical?.id || `vehicle-custom-${vehicleId}`,
      uuid: vehicleId,
      plate: verified?.plate || plate,
      plateShort: verified?.plateShort || input.plateShort?.slice(0, 30) || plate.replace(/\s/g,'').slice(-4),
      model: verified?.model || model,
      modelShort: verified?.modelShort || input.modelShort?.slice(0, 160) || model,
      brand: verified?.brand || input.brand!,
      category: verified?.category || input.category!,
      categoryLabel: verified?.categoryLabel || input.categoryLabel?.slice(0, 70) || '',
      subType: verified?.subType || input.subType?.slice(0, 160) || model,
      capacity: verified?.capacity || capacity,
      status: verified?.status || '차고지 대기',
      fuelType: verified?.fuelType || input.fuelType!,
      year: input.year?.slice(0, 10) || verified?.year,
      color: input.color?.slice(0, 100) || verified?.color,
      imageUrl: imageUrl || verified?.imageUrl,
      chargingSpecs: input.chargingSpecs ?? verified?.chargingSpecs,
      adminMemo: input.adminMemo?.slice(0, 5000) ?? verified?.adminMemo,
    };

    const now = new Date().toISOString();
    const data = {
      id: saved.uuid,
      organization_id: ORG,
      plate: saved.plate,
      plate_short: saved.plateShort,
      model: saved.model,
      model_short: saved.modelShort,
      brand: saved.brand,
      category: saved.category,
      category_label: saved.categoryLabel,
      sub_type: saved.subType,
      capacity: saved.capacity,
      fuel_type: saved.fuelType,
      status: verified?.status === '정비 중' ? 'maintenance' : verified?.status === '운행 중' ? 'driving' : 'available',
      archived: false,
      // Only UI extras are JSON; physical catalog identity lives in columns.
      profile: { id: saved.id, year: saved.year, color: saved.color, imageUrl: saved.imageUrl,
        chargingSpecs: saved.chargingSpecs, adminMemo: saved.adminMemo },
      updated_by: auth.session.userId,
      updated_at: now,
    };
    const { error } = await supabaseAdmin.from('vehicles').upsert(data, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, vehicle: saved });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : '차량 등록에 실패했습니다.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok || !auth.session) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  try {
    const body = await req.json();
    const plate = typeof body.plate === 'string' ? body.plate.trim() : '';
    if (!plate) return NextResponse.json({ ok: false, error: '차량번호를 확인해 주세요.' }, { status: 400 });
    const rows = await readFleetRegistry();
    const existing = rows.find(row => normalizeFleetPlate(row.plate) === normalizeFleetPlate(plate));
    if (!existing) return NextResponse.json({ ok: false, error: '등록된 차량을 찾지 못했습니다.' }, { status: 404 });
    const { data, error } = await supabaseAdmin.from('vehicles').update({
      archived: true, updated_by: auth.session.userId, updated_at: new Date().toISOString(),
    }).eq('id', existing.vehicle_id).eq('organization_id', ORG).select('id').single();
    if (error || !data) throw new Error(error?.message || '차량 삭제 확인에 실패했습니다.');
    return NextResponse.json({ ok: true, vehicleId: existing.vehicle_id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : '차량 삭제에 실패했습니다.' }, { status: 503 });
  }
}
