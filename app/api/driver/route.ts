import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';

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
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const rawVehicleNo = body.vehicle_no || body.vehicleNo || '';
    const rawDriverName = body.driver_name || body.driverName || '';
    let rawCarNumber = body.car_number || body.carNumber || '';
    const rawPhone = body.phone || '';
    const rawPassengerName = body.passenger_name !== undefined ? body.passenger_name : body.passengerName;
    const rawDefaultNavi = body.default_navi || body.defaultNavi || 'tmap';

    if (!rawVehicleNo && (body.presetOrder || body.homeLocation)) {
      return NextResponse.json({ success: false, error: '설정 저장 대상이 필요합니다.' }, { status: 400 });
    }

    if (!rawVehicleNo) {
      return NextResponse.json({ error: 'vehicle_no is required' }, { status: 400 });
    }

    let normalizedVehicleNo = rawVehicleNo.trim();
    const hochaMatch = normalizedVehicleNo.match(/(\d+호차)/);
    if (hochaMatch) {
      const hocha = hochaMatch[1];
      const remainder = normalizedVehicleNo.replace(hocha, '').trim();
      normalizedVehicleNo = hocha;
      if (!rawCarNumber && remainder) {
        rawCarNumber = remainder;
      }
    }

    if (!rawCarNumber) {
      const { data: existing } = await supabaseAdmin
        .from('drivers')
        .select('car_number')
        .eq('vehicle_no', normalizedVehicleNo)
        .maybeSingle();

      rawCarNumber = existing?.car_number || '';
      if (!rawCarNumber) return NextResponse.json({ error: '정확한 차량번호를 입력해 주세요.' }, { status: 400 });
    }

    const payload: any = {
      vehicle_no: normalizedVehicleNo,
      car_number: rawCarNumber,
    };

    if (rawDriverName) payload.driver_name = rawDriverName;
    if (rawPhone) payload.phone = rawPhone;
    if (rawPassengerName !== undefined) {
      const normalized = typeof rawPassengerName === 'string' ? rawPassengerName.trim() : rawPassengerName;
      payload.passenger_name = normalized && normalized.length > 0 ? normalized : null;
    }
    if (rawDefaultNavi) payload.default_navi = rawDefaultNavi;

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .upsert(payload, { onConflict: 'vehicle_no' })
      .select()
      .single();

    if (error) {
      console.warn('Supabase driver upsert error:', error);
      return NextResponse.json({ error: error.message, fallback: true }, { status: 400 });
    }

    return NextResponse.json({ driver: data, fallback: false });
  } catch (err: any) {
    console.error('Error upserting driver in Supabase:', err);
    return NextResponse.json({ error: err?.message, fallback: true }, { status: 500 });
  }
}
