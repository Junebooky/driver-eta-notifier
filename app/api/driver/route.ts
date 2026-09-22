import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const DRIVER_DEFAULTS: Record<string, any> = {
  '4호차': {
    vehicle_no: '4호차',
    car_number: '142호 7811',
    driver_name: '윤태준',
    phone: '010-1234-5678',
    default_navi: 'tmap',
  },
  '1호차': {
    vehicle_no: '1호차',
    car_number: '111호 1111',
    driver_name: '김의전',
    phone: '010-9876-5432',
    default_navi: 'tmap',
  },
  '2호차': {
    vehicle_no: '2호차',
    car_number: '222호 2222',
    driver_name: '박의전',
    phone: '010-5555-5555',
    default_navi: 'tmap',
  },
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleNo = searchParams.get('vehicle_no') || searchParams.get('id') || '4호차';

    // Normalize vehicle query (e.g. 'driver_4' -> '4호차')
    const normalizedVehicle = vehicleNo.includes('1')
      ? '1호차'
      : vehicleNo.includes('2')
      ? '2호차'
      : '4호차';

    let query = supabaseAdmin.from('drivers').select('*');
    if (searchParams.get('vehicle_no')) {
      query = query.eq('vehicle_no', searchParams.get('vehicle_no')!);
    } else {
      query = query.eq('vehicle_no', normalizedVehicle);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      const fallbackDriver = DRIVER_DEFAULTS[normalizedVehicle] || DRIVER_DEFAULTS['4호차'];
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
    const { vehicle_no, car_number, driver_name, phone, default_navi } = body;

    if (!vehicle_no) {
      return NextResponse.json({ error: 'vehicle_no is required' }, { status: 400 });
    }

    const payload: any = {
      vehicle_no,
    };

    if (car_number !== undefined) payload.car_number = car_number;
    if (driver_name !== undefined) payload.driver_name = driver_name;
    if (phone !== undefined) payload.phone = phone;
    if (default_navi !== undefined) payload.default_navi = default_navi;

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
