import { supabaseAdmin } from '@/lib/supabase/server';
import { VIP_REAL_VEHICLES, type VipRealVehicle } from '@/utils/vehicleData';
import type { FleetRegistryRecord } from '@/utils/fleetVehicleRegistry';

/**
 * Read the already-existing cockpit.vehicles table. Its 20 stock UUIDs,
 * catalog fields and custom registrations are the single source of truth.
 */
export async function readFleetRegistry(): Promise<FleetRegistryRecord[]> {
  const { data, error } = await supabaseAdmin.from('vehicles')
    .select('*').eq('organization_id', 'vip_limousine_korea');
  if (error || !Array.isArray(data)) {
    throw new Error('공용 차량 목록을 조회할 수 없습니다. DB 연결과 차량 스키마를 확인해 주세요.');
  }
  return data.map((row: Record<string, any>) => {
    const extras = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile)
      ? row.profile : {};
    const fleetId = String(row.id || '');
    const plate = String(row.plate || '');
    const canonical = VIP_REAL_VEHICLES.find(v => v.uuid === fleetId || v.plate.replace(/\s/g, '') === plate.replace(/\s/g, ''));
    const status: VipRealVehicle['status'] = row.status === 'maintenance' || row.status === '정비 중'
      ? '정비 중'
      : row.status === 'driving' || row.status === '운행 중' ? '운행 중' : '차고지 대기';
    const brand = (['벤츠', '현대', '기아', '제네시스'].includes(row.brand) ? row.brand : '제네시스') as VipRealVehicle['brand'];
    const category = (['sprinter', 'staria', 'carnival', 'genesis', 's_class'].includes(row.category) ? row.category : 'genesis') as VipRealVehicle['category'];
    const fuelType = (['디젤', '가솔린', '하이브리드'].includes(row.fuel_type) ? row.fuel_type : '가솔린') as VipRealVehicle['fuelType'];
    const model = String(row.model || '');
    const profile: VipRealVehicle = {
      id: String(canonical?.id || extras.id || `vehicle-custom-${fleetId}`),
      uuid: fleetId,
      plate,
      plateShort: String(row.plate_short || plate.replace(/\s/g, '').slice(-4)),
      model,
      modelShort: String(row.model_short || model),
      brand,
      category,
      categoryLabel: String(row.category_label || ''),
      subType: String(row.sub_type || model),
      capacity: String(row.capacity || '미확인'),
      status,
      fuelType,
      year: typeof extras.year === 'string' ? extras.year : undefined,
      color: typeof extras.color === 'string' ? extras.color : undefined,
      imageUrl: typeof extras.imageUrl === 'string' ? extras.imageUrl : undefined,
      adminMemo: typeof extras.adminMemo === 'string' ? extras.adminMemo : undefined,
      chargingSpecs: extras.chargingSpecs,
    };
    return {
      vehicle_id: fleetId,
      organization_id: String(row.organization_id || ''),
      plate,
      profile,
      archived: row.archived === true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}
