import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const DRIVER_DEFAULTS: Record<string, any> = {
  '4호차': {
    vehicle_no: '4호차',
    car_number: '142호 7811',
    driver_name: '윤태준',
    phone: '010-6348-8726',
    default_navi: 'tmap',
  },
  '8호차': {
    vehicle_no: '8호차',
    car_number: '142호 7815',
    driver_name: '민성호',
    phone: '010-7231-8340',
    default_navi: 'tmap',
  },
  '7호차': {
    vehicle_no: '7호차',
    car_number: '142호 7814',
    driver_name: '배선만',
    phone: '010-8806-9758',
    default_navi: 'tmap',
  },
  '1호차': {
    vehicle_no: '1호차',
    car_number: '110하 1035',
    driver_name: '김의전',
    phone: '010-1111-2222',
    default_navi: 'tmap',
  },
  '2호차': {
    vehicle_no: '2호차',
    car_number: '112하 3456',
    driver_name: '박의전',
    phone: '010-3333-4444',
    default_navi: 'tmap',
  },
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawVehicleNo = searchParams.get('vehicle_no') || searchParams.get('id') || '4호차';

    // Accurately extract hocha (e.g. '8호차 142호 7815' -> '8호차', '8' -> '8호차')
    let targetVehicleNo = '4호차';
    const hochaMatch = rawVehicleNo.match(/(\d+)호차/);
    if (hochaMatch) {
      targetVehicleNo = `${hochaMatch[1]}호차`;
    } else {
      const digitMatch = rawVehicleNo.match(/^(\d+)$/);
      if (digitMatch) {
        targetVehicleNo = `${digitMatch[1]}호차`;
      } else {
        targetVehicleNo = rawVehicleNo.trim() || '4호차';
      }
    }

    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .eq('vehicle_no', targetVehicleNo)
      .maybeSingle();

    if (error || !data) {
      const fallbackDriver = DRIVER_DEFAULTS[targetVehicleNo] || DRIVER_DEFAULTS['4호차'];
      return NextResponse.json({ driver: fallbackDriver, fallback: true });
    }

    return NextResponse.json({ driver: data, fallback: false });
  } catch (err: any) {
    console.error('Error fetching driver from Supabase:', err);
    return NextResponse.json({ driver: DRIVER_DEFAULTS['4호차'], fallback: true, error: err?.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawVehicleNo = body.vehicle_no || body.vehicleNo || '';
    const rawDriverName = body.driver_name || body.driverName || '';
    let rawCarNumber = body.car_number || body.carNumber || '';
    const rawPhone = body.phone || '';
    const rawDefaultNavi = body.default_navi || body.defaultNavi || 'tmap';

    // If client only sent metadata without vehicle identifier, handle gracefully
    if (!rawVehicleNo && (body.presetOrder || body.homeLocation)) {
      return NextResponse.json({ success: true, message: 'Metadata updated' });
    }

    if (!rawVehicleNo) {
      return NextResponse.json({ error: 'vehicle_no is required' }, { status: 400 });
    }

    // Normalize vehicle_no: e.g. "4호차 142호 7811" -> "4호차"
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

    // Ensure car_number is never null to satisfy NOT NULL constraint
    if (!rawCarNumber) {
      const { data: existing } = await supabaseAdmin
        .from('drivers')
        .select('car_number')
        .eq('vehicle_no', normalizedVehicleNo)
        .maybeSingle();

      rawCarNumber = existing?.car_number || (DRIVER_DEFAULTS[normalizedVehicleNo]?.car_number || '142호 7811');
    }

    const payload: any = {
      vehicle_no: normalizedVehicleNo,
      car_number: rawCarNumber,
    };

    if (rawDriverName) payload.driver_name = rawDriverName;
    if (rawPhone) payload.phone = rawPhone;
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
