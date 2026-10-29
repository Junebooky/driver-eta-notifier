import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';
import { mapDbDriverToHqSummary } from '@/types/driverHq';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Driver ID is required' }, { status: 400 });
    }

    const { data: dbDriver, error: driverError } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (driverError || !dbDriver) {
      return NextResponse.json({ ok: false, error: '기사 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: dbSchedules } = await supabaseAdmin
      .from('schedules')
      .select('id, vehicle_no, date, pickup_time, end_time, origin, destination, passenger_name, flight_number, passenger_note, status')
      .eq('vehicle_no', dbDriver.vehicle_no)
      .order('date', { ascending: false });

    const driverSummary = mapDbDriverToHqSummary(dbDriver, dbSchedules || []);
    return NextResponse.json({ ok: true, driver: driverSummary });
  } catch (err: any) {
    console.error('[HQ Drivers API] Error in GET [id]:', err);
    return NextResponse.json({ ok: false, error: err.message || '서버 오류' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Driver ID is required' }, { status: 400 });
    }

    const body = await req.json();

    // 1. Fetch current driver to safely merge `driver_meta`
    const { data: existingDriver, error: fetchErr } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existingDriver) {
      return NextResponse.json({ ok: false, error: '기사 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const existingMeta = typeof existingDriver.driver_meta === 'object' && existingDriver.driver_meta !== null
      ? existingDriver.driver_meta
      : {};

    const updatedMeta = { ...existingMeta };

    if (body.memo !== undefined) updatedMeta.memo = String(body.memo || '');
    if (body.residence !== undefined) updatedMeta.residence = String(body.residence || '');
    if (body.affiliationType !== undefined) {
      updatedMeta.affiliation = body.affiliationType === 'freelance' ? 'freelance' : 'employed';
    }
    if (body.careerYears !== undefined) updatedMeta.career_years = Number(body.careerYears);

    const updatePayload: any = {
      driver_meta: updatedMeta,
    };

    if (body.name !== undefined && body.name.trim()) {
      updatePayload.driver_name = body.name.trim();
    }
    if (body.phone !== undefined) {
      updatePayload.phone = body.phone ? String(body.phone).trim() : null;
    }
    if (body.englishAvailable !== undefined) {
      updatePayload.english_available = Boolean(body.englishAvailable);
    }
    if (body.vehicleModel !== undefined) {
      updatePayload.vehicle_model = body.vehicleModel || null;
    }

    const { data: updatedDriver, error: updateErr } = await supabaseAdmin
      .from('drivers')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[HQ Drivers API] Update error:', updateErr);
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 });
    }

    // Fetch schedules to return complete updated summary
    const { data: dbSchedules } = await supabaseAdmin
      .from('schedules')
      .select('id, vehicle_no, date, pickup_time, end_time, origin, destination, passenger_name, flight_number, passenger_note, status')
      .eq('vehicle_no', updatedDriver.vehicle_no)
      .order('date', { ascending: false });

    const driverSummary = mapDbDriverToHqSummary(updatedDriver, dbSchedules || []);
    return NextResponse.json({ ok: true, driver: driverSummary });
  } catch (err: any) {
    console.error('[HQ Drivers API] Error in PATCH [id]:', err);
    return NextResponse.json({ ok: false, error: err.message || '서버 오류' }, { status: 500 });
  }
}
