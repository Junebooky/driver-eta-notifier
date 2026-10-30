import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';
import { mapDbDriverToHqSummary, HqDriverSummary } from '@/types/driverHq';

export async function GET(req: NextRequest) {
  try {
    // 1. Strictly require HQ Admin authorization (Prevent driver accounts from accessing full driver roster)
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    // 2. Fetch real drivers from Supabase `cockpit.drivers`
    const { data: dbDrivers, error: driversError } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .order('driver_name', { ascending: true });

    if (driversError) {
      console.error('[HQ Drivers API] Error fetching drivers:', driversError);
      return NextResponse.json({ ok: false, error: driversError.message }, { status: 500 });
    }

    // 3. Fetch real schedules to calculate recent trips and schedules
    const { data: dbSchedules, error: schedulesError } = await supabaseAdmin
      .from('schedules')
      .select('id, vehicle_no, date, pickup_time, end_time, origin, destination, passenger_name, flight_number, passenger_note, status')
      .order('date', { ascending: false });

    if (schedulesError) {
      console.warn('[HQ Drivers API] Notice fetching schedules:', schedulesError);
    }

    const allSchedules = dbSchedules || [];

    // 4. Map to unified HqDriverSummary using common mapper
    const mappedDrivers: HqDriverSummary[] = (dbDrivers || []).map((d) =>
      mapDbDriverToHqSummary(d, allSchedules)
    );

    // 5. Calculate real KPI counts
    const total = mappedDrivers.length;
    const employed = mappedDrivers.filter((d) => d.affiliationType === 'employed').length;
    const freelance = mappedDrivers.filter((d) => d.affiliationType === 'freelance').length;
    const englishCount = mappedDrivers.filter((d) => d.englishAvailable).length;

    return NextResponse.json({
      ok: true,
      drivers: mappedDrivers,
      counts: {
        total,
        employed,
        freelance,
        englishCount,
      },
    });
  } catch (err: any) {
    console.error('[HQ Drivers API] Unexpected error in GET:', err);
    return NextResponse.json({ ok: false, error: err.message || '서버 오류' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Require HQ Admin authorization
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const {
      name,
      phone,
      affiliationType = 'employed',
      englishAvailable = false,
      residence = '미입력',
      memo = '',
      vehicleNo,
      carNumber,
      vehicleModel,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ ok: false, error: '기사명은 필수입니다.' }, { status: 400 });
    }

    const cleanName = name.trim();
    const cleanPhone = phone ? String(phone).trim() : '';

    // Duplicate driver detection: Prevent unintentional multiple records for the same driver
    const orFilter = cleanPhone
      ? `driver_name.eq.${cleanName},phone.eq.${cleanPhone}`
      : `driver_name.eq.${cleanName}`;

    const { data: existingMatches, error: matchError } = await supabaseAdmin
      .from('drivers')
      .select('id, driver_name, phone, vehicle_no, car_number, vehicle_model, created_at')
      .or(orFilter);

    if (!matchError && existingMatches && existingMatches.length > 0) {
      if (!body.allowDuplicate) {
        return NextResponse.json(
          {
            ok: false,
            isDuplicate: true,
            error: `동일한 성함 또는 연락처로 등록된 기사가 이미 ${existingMatches.length}건 존재합니다. 기존 계정을 확인해주세요.`,
            duplicateCount: existingMatches.length,
            existingDrivers: existingMatches.map((d) => ({
              id: d.id,
              name: d.driver_name,
              phone: d.phone,
              vehicleNo: d.vehicle_no,
              carNumber: d.car_number,
              vehicleModel: d.vehicle_model,
              createdAt: d.created_at,
            })),
          },
          { status: 409 }
        );
      }
    }

    // Handle vehicle_no uniqueness constraint safely:
    // If vehicleNo is supplied, use it; otherwise generate a clean surrogate identifier
    const assignedVehicleNo = vehicleNo && String(vehicleNo).trim()
      ? String(vehicleNo).trim()
      : `DRV-${Date.now().toString().slice(-6)}`;

    const assignedCarNumber = carNumber && String(carNumber).trim()
      ? String(carNumber).trim()
      : '차량 미등록';

    const driverMeta = {
      affiliation: affiliationType === 'freelance' ? 'freelance' : 'employed',
      residence: residence || '미입력',
      memo: memo || '',
      createdVia: 'hq_admin_ui',
    };

    const insertPayload = {
      driver_name: cleanName,
      phone: cleanPhone || null,
      vehicle_no: assignedVehicleNo,
      car_number: assignedCarNumber,
      vehicle_model: vehicleModel || null,
      english_available: Boolean(englishAvailable),
      driver_meta: driverMeta,
      default_navi: 'tmap',
      vehicle_status: 'available',
    };

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      console.error('[HQ Drivers API] Insert error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const newDriverSummary = mapDbDriverToHqSummary(data, []);
    return NextResponse.json({ ok: true, driver: newDriverSummary });
  } catch (err: any) {
    console.error('[HQ Drivers API] Unexpected error in POST:', err);
    return NextResponse.json({ ok: false, error: err.message || '서버 오류' }, { status: 500 });
  }
}

