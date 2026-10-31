import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth/serverAuth';

export async function GET(req: NextRequest) {
  const auth = await verifyServerAuth(req);
  if (!auth.ok || !auth.session) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  const params = new URL(req.url).searchParams;
  const isAll = params.get('all') === 'true' || params.get('vehicle_no') === 'all';
  if (isAll && auth.session.role !== 'hq_admin') return NextResponse.json({ ok: false, error: '관리자 전용 목록입니다.' }, { status: 403 });
  let query = supabaseAdmin.from('drivers').select('*');
  if (auth.session.role === 'driver') {
    if (!auth.session.driverId) return NextResponse.json({ ok: false, error: '기사 계정 연결이 필요합니다.' }, { status: 403 });
    query = query.eq('id', auth.session.driverId);
  } else if (!isAll) {
    const vehicle = params.get('vehicle_no') || params.get('id');
    if (!vehicle) return NextResponse.json({ ok: false, error: '차량번호가 필요합니다.' }, { status: 400 });
    query = query.eq('vehicle_no', /^\d+$/.test(vehicle) ? `${vehicle}호차` : vehicle);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: '기사 정보 조회에 실패했습니다.' }, { status: 503 });
  if (isAll) return NextResponse.json({ drivers: data || [], fallback: false });
  if (!data?.length) return NextResponse.json({ ok: false, error: '기사 정보를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ driver: data[0], fallback: false });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) return NextResponse.json({ok:false,error:auth.error},{status:auth.statusCode});
    const body = await req.json();
    const requestedId = body.driverId || body.driver_id;
    const driverId = auth.session.role === 'driver' ? auth.session.driverId : requestedId;
    if (!driverId || !/^[0-9a-f-]{36}$/i.test(driverId)) return NextResponse.json({ok:false,error:'기사 UUID가 필요합니다. 차량번호로 기사 계정을 만들거나 바꿀 수 없습니다.'},{status:400});
    if (auth.session.role === 'driver' && requestedId && requestedId !== driverId) return NextResponse.json({ok:false,error:'본인 프로필만 수정할 수 있습니다.'},{status:403});
    const {data:existing,error:readError}=await supabaseAdmin.from('drivers').select('*').eq('id',driverId).maybeSingle();
    if (readError) return NextResponse.json({ok:false,error:'기사 정보를 조회하지 못했습니다.'},{status:503});
    if (!existing) return NextResponse.json({ok:false,error:'기사 정보를 찾을 수 없습니다.'},{status:404});
    // Legacy labels are read-only on this endpoint. Real trip assignments belong to bookings.
    for (const [field,current] of [['vehicle_no',existing.vehicle_no],['car_number',existing.car_number]] as const) {
      const value=body[field] ?? body[field==='vehicle_no'?'vehicleNo':'carNumber'];
      if (value!==undefined && value!==current && value!==`${existing.vehicle_no} ${existing.car_number}`) return NextResponse.json({ok:false,code:'ASSIGN_VEHICLE_THROUGH_BOOKING',error:'차량 변경은 HQ 예약·배차에서 처리해 주세요. 기사 계정 정보는 유지됩니다.'},{status:409});
    }
    const patch: Record<string,unknown>={};
    for (const [column,alias] of [['driver_name','driverName'],['phone','mobile'],['passenger_name','passengerName'],['default_navi','defaultNavi']] as const) {
      const value=body[column]!==undefined ? body[column] : body[alias];
      if (value!==undefined) {
        if (value!==null && (typeof value!=='string'||value.length>200)) return NextResponse.json({ok:false,error:'프로필 입력값을 확인해 주세요.'},{status:400});
        patch[column]=typeof value==='string' ? value.trim() : null;
      }
    }
    if (patch.default_navi!==undefined && !['tmap','kakao','naver'].includes(String(patch.default_navi))) return NextResponse.json({ok:false,error:'내비 앱을 확인해 주세요.'},{status:400});
    if (patch.driver_name===null || patch.driver_name==='') return NextResponse.json({ok:false,error:'성함을 입력해 주세요.'},{status:400});
    const preferences: Record<string,unknown>={};
    if (body.presetOrder!==undefined) {
      if (!Array.isArray(body.presetOrder)||body.presetOrder.length>500||body.presetOrder.some((id:unknown)=>typeof id!=='string'||id.length>100)) return NextResponse.json({ok:false,error:'즐겨찾기 순서를 확인해 주세요.'},{status:400});
      preferences.presetOrder=body.presetOrder;
    }
    if (body.homeLocation!==undefined) {
      const home=body.homeLocation;
      if (home!==null && (typeof home.name!=='string'||home.name.length>100||typeof home.address!=='string'||home.address.length>500||!Number.isFinite(home.lat)||Math.abs(home.lat)>90||!Number.isFinite(home.lng)||Math.abs(home.lng)>180)) return NextResponse.json({ok:false,error:'자택 주소를 확인해 주세요.'},{status:400});
      preferences.homeLocation=home;
    }
    if (!Object.keys(patch).length && !Object.keys(preferences).length) return NextResponse.json({ok:false,error:'저장할 변경사항이 없습니다.'},{status:400});
    const {data,error}=await supabaseAdmin.rpc('update_driver_profile_by_id',{p_driver_id:driverId,p_patch:patch,p_preferences:preferences});
    if (error || !data) return NextResponse.json({ok:false,error:'프로필이 저장되지 않았습니다. DB 연결과 프로필 저장 기능을 확인해 주세요.'},{status:503});
    return NextResponse.json({ok:true,driver:data,fallback:false});
  } catch { return NextResponse.json({ok:false,error:'프로필 저장에 실패했습니다.'},{status:503}); }
}
