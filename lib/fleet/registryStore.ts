import { supabaseAdmin } from '@/lib/supabase/server';
import type { FleetRegistryRecord } from '@/utils/fleetVehicleRegistry';

export async function readFleetRegistry(): Promise<FleetRegistryRecord[]> {
  const { data, error } = await supabaseAdmin.from('fleet_vehicle_registry')
    .select('*').eq('organization_id', 'vip_limousine_korea');
  if (error || !Array.isArray(data)) {
    throw new Error('공용 차량 등록부를 조회할 수 없습니다. DB 마이그레이션과 연결을 확인해 주세요.');
  }
  return data as FleetRegistryRecord[];
}
