import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { readFleetRegistry } from '@/lib/fleet/registryStore';
import { mergeFleetRegistry } from '@/utils/fleetVehicleRegistry';
import { buildDispatchCardCoverage } from '@/lib/dispatchCards/dispatchCardCoverage';

export const dynamic = 'force-dynamic';

/** Complete but non-mutating all-drivers x image-ready fleet matrix. */
export async function GET(request:NextRequest) {
  const auth=await requireHqAdmin(request);
  if(!auth.ok || !auth.session)
    return NextResponse.json({ok:false,error:auth.error},{status:auth.statusCode});
  try {
    const org=auth.session.org || 'vip_limousine_korea';
    const [fleet,driverResponse,portraitResponse,cardResponse]=await Promise.all([
      readFleetRegistry(),
      supabaseAdmin.from('drivers').select('id,driver_name,phone,driver_meta').order('driver_name'),
      supabaseAdmin.from('driver_profile_assets').select('driver_id').eq('organization_id',org).eq('status','active'),
      supabaseAdmin.from('driver_vehicle_info_assets').select('driver_id,vehicle_id,variant').eq('organization_id',org).eq('status','active'),
    ]);
    if(driverResponse.error || portraitResponse.error || cardResponse.error)
      throw new Error('기사·프로필·배차카드 현황을 불러올 수 없습니다.');
    const coverage=buildDispatchCardCoverage(
      driverResponse.data || [],
      mergeFleetRegistry(fleet),
      portraitResponse.data || [],
      cardResponse.data || [],
    );
    return NextResponse.json({ok:true,coverage},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:'배차카드 매핑 조회 실패'},{status:503});
  }
}
