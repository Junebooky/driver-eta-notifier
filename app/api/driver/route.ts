import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || 'driver_4';

    const { data, error } = await supabaseAdmin
      .from('cockpit_drivers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ driver: null, fallback: true, message: error.message });
    }

    return NextResponse.json({ driver: data, fallback: false });
  } catch (err: any) {
    console.error('Error fetching driver from Supabase:', err);
    return NextResponse.json({ driver: null, fallback: true, error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id = 'driver_4', vehicleNo, driverName, passengerName, homeLocation, presetOrder } = body;

    const payload: any = {
      id,
      updated_at: new Date().toISOString(),
    };

    if (vehicleNo !== undefined) payload.vehicle_no = vehicleNo;
    if (driverName !== undefined) payload.driver_name = driverName;
    if (passengerName !== undefined) payload.passenger_name = passengerName;
    if (homeLocation !== undefined) payload.home_location = homeLocation;
    if (presetOrder !== undefined) payload.preset_order = presetOrder;

    const { data, error } = await supabaseAdmin
      .from('cockpit_drivers')
      .upsert(payload)
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
