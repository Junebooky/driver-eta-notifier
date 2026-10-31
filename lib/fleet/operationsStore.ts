import { supabaseAdmin } from '@/lib/supabase/server';

export interface FleetOperation {
  vehicle_id: string;
  organization_id: string;
  plate: string;
  status: '확인 필요' | '대기 중' | '운행 중' | '정비 중';
  memo: string;
  color: string;
  updated_at: string;
}

export async function readFleetOperations(): Promise<FleetOperation[]> {
  const { data, error } = await supabaseAdmin.from('fleet_vehicle_operations')
    .select('*').eq('organization_id', 'vip_limousine_korea');
  if (error || !Array.isArray(data)) throw new Error('차량 상태를 조회할 수 없습니다. DB 연결과 차량 상태 마이그레이션을 확인해 주세요.');
  return data;
}
