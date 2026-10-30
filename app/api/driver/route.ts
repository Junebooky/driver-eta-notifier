import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';

const DRIVER_DEFAULTS: Record<string, any> = {
  '1호차': {
    vehicle_no: '1호차',
    car_number: '142호 7814',
    driver_name: '배선만',
    phone: '010-8806-9758',
    passenger_name: 'VIP 게스트 A',
    default_navi: 'tmap',
  },
  '2호차': {
    vehicle_no: '2호차',
    car_number: '112하 3456',
    driver_name: '홍승범',
    phone: '010-3333-4444',
    passenger_name: 'VIP 게스트 B',
    default_navi: 'tmap',
  },
  '4호차': {
    vehicle_no: '4호차',
    car_number: '142호 7811',
    driver_name: '윤태준',
    phone: '010-6348-8726',
    passenger_name: 'SOYFAN 외 1명',
    default_navi: 'tmap',
  },
  '8호차': {
    vehicle_no: '8호차',
    car_number: '142호 7815',
    driver_name: '민성호',
    phone: '010-7231-8340',
    passenger_name: 'VIP 게스트 C',
    default_navi: 'tmap',
  },
};

function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.length < 8) return '010-****-****';
  return trimmed.replace(/^(\d{3})-?(\d{3,4})-?(\d{4})$/, '$1-****-$3');
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const isHqAdmin = auth.session.role === 'hq_admin';
    const { searchParams } = new URL(req.url);
    const isAll = searchParams.get('all') === 'true' || searchParams.get('vehicle_no') === 'all';

    if (isAll) {
      const { data, error } = await supabaseAdmin
        .from('drivers')
        .select('*')
        .order('vehicle_no', { ascending: true });

      if (error || !data || data.length === 0) {
        return NextResponse.json({ drivers: Object.values(DRIVER_DEFAULTS), fallback: true });
      }

      const enriched = data
        .filter(
          (d: any) =>
            d.vehicle_no &&
            d.vehicle_no !== '미배정' &&
            d.vehicle_no !== 'unassigned'
        )
        .map((d: any) => {
          const isOwnDriver = !isHqAdmin && (
            d.driver_name === auth.session?.driverName ||
            d.vehicle_no === auth.session?.vehicleNo
          );

          return {
            ...d,
            passenger_name: d.passenger_name ?? null,
            // PII protection: Mask phone numbers of other drivers unless HQ Admin
            phone: isHqAdmin || isOwnDriver ? d.phone : maskPhoneNumber(d.phone),
          };
        });

      return NextResponse.json({ drivers: enriched, fallback: false });
    }

    const rawVehicleNo = searchParams.get('vehicle_no') || searchParams.get('id') || '4호차';

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
      const fallbackDriver = DRIVER_DEFAULTS[targetVehicleNo] || {
        vehicle_no: targetVehicleNo,
        car_number: '',
        driver_name: '',
        phone: '',
        passenger_name: null,
        default_navi: 'tmap',
      };
      return NextResponse.json({ driver: fallbackDriver, fallback: true });
    }

    const isOwnDriver = !isHqAdmin && (
      data.driver_name === auth.session?.driverName ||
      data.vehicle_no === auth.session?.vehicleNo
    );

    const driverWithPassenger = {
      ...data,
      passenger_name: data.passenger_name ?? null,
      phone: isHqAdmin || isOwnDriver ? data.phone : maskPhoneNumber(data.phone),
    };

    return NextResponse.json({ driver: driverWithPassenger, fallback: false });
  } catch (err: any) {
    console.error('Error fetching driver from Supabase:', err);
    return NextResponse.json({ driver: DRIVER_DEFAULTS['4호차'], fallback: true, error: err?.message });
  }
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
      return NextResponse.json({ success: true, message: 'Metadata updated' });
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

      rawCarNumber = existing?.car_number || (DRIVER_DEFAULTS[normalizedVehicleNo]?.car_number || '142호 7811');
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
