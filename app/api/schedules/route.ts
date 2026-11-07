import { dispatchRequestContext } from '@/lib/dispatch/requestContext';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  hydrateRawScheduleRow,
  mapHydratedRowToScheduleItem,
  queryServerSchedules,
  upsertServerDispatchSchedule,
  checkServerDispatchConflicts,
  DispatchUpsertInput,
} from '@/lib/dispatch/scheduleServerStore';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { DbScheduleRow } from '@/types';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';

// Export preserved for backwards compatibility across callers and tests
export function mapDbRowToScheduleItem(row: DbScheduleRow | Record<string, any>): ScheduleItem {
  return mapHydratedRowToScheduleItem(row);
}

// GET: Fetch schedules
// - Driver View: strictly returns dispatch_status='published' (plus 'cancelled' when include_cancelled=1) scoped to that driver/vehicle
// - HQ View (?role=hq or ?status=all): returns all reservations/dispatches including 'unassigned' and 'draft'
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ schedules: [], fallback: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const roleParam = searchParams.get('role');
    const statusParam = searchParams.get('status');
    const includeCancelledForDriver = searchParams.get('include_cancelled') === '1';

    const isDriver = auth.session.role === 'driver';
    const effectiveRole = isDriver ? 'driver' : (roleParam || 'hq');
    const effectiveDriverName = isDriver ? auth.session.driverName : searchParams.get('driver_name');
    const effectiveVehicleNo = isDriver ? auth.session.vehicleNo : searchParams.get('vehicle_no');
    const effectiveDriverId = isDriver ? auth.session.driverId : searchParams.get('driver_id');
    const effectivePlate = isDriver ? auth.session.carNumber : searchParams.get('plate');

    const { schedules, error } = await queryServerSchedules({
      vehicleNo: effectiveVehicleNo,
      driverId: effectiveDriverId,
      driverName: effectiveDriverName,
      plate: effectivePlate,
      date,
      role: effectiveRole,
      statusParam: isDriver ? 'published' : statusParam,
      includeCancelledForDriver,
    });

    if (error) {
      return NextResponse.json({ schedules: [], fallback: false, error }, { status: 503 });
    }

    return NextResponse.json({ schedules, fallback: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error fetching schedules from Supabase:', message);
    return NextResponse.json({ schedules: [], fallback: false, error: message }, { status: 500 });
  }
}

// POST: Create a schedule row
export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const {
      vehicle_no,
      driver_id,
      driver_name,
      date,
      pickup_time,
      time_display,
      origin,
      origin_address,
      origin_lat,
      origin_lng,
      destination,
      destination_address,
      destination_lat,
      destination_lng,
      passenger_name,
      passenger_phone,
      passenger_count,
      flight_number,
      protocol_notes,
      dispatch_status = 'published',
      place_verified,
      allow_unverified = true,
      end_date,
      endDate,
      end_time,
      endTime,
    } = body;

    const candInput: DispatchUpsertInput = {
      vehicleId: body.vehicle_id || body.vehicleId,
      serviceMode: body.service_mode || body.serviceMode,
      vehicleNo: vehicle_no,
      vehiclePlate: body.vehicle_plate || body.vehiclePlate,
      driverId: driver_id,
      driverName: driver_name,
      date,
      endDate: end_date || endDate || date,
      pickupTime: pickup_time || time_display,
      endTime: end_time || endTime,
      timeDisplay: time_display,
      origin,
      originAddress: origin_address,
      originLat: origin_lat,
      originLng: origin_lng,
      destination,
      destinationAddress: destination_address,
      destinationLat: destination_lat,
      destinationLng: destination_lng,
      passengerName: passenger_name,
      passengerPhone: passenger_phone,
      passengerCount: passenger_count,
      flightNumber: flight_number,
      notes: protocol_notes,
      dispatchStatus: dispatch_status,
      placeVerified: place_verified,
      allowUnverified: allow_unverified,
    };

    const context=dispatchRequestContext(req,auth.session!,body);
    if(!context)return NextResponse.json({ok:false,error:'저장 요청 번호가 필요합니다.'},{status:400});
    const result = await upsertServerDispatchSchedule(candInput,context.requestId,context.fingerprint);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode || 400 });
    }

    return NextResponse.json({ schedule: result.schedule, fallback: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: Update an existing schedule row
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const {
      id,
      date,
      pickup_time,
      time_display,
      origin,
      destination,
      passenger_name,
      passenger_phone,
      flight_number,
      protocol_notes,
      status,
      dispatch_status,
      driver_id,
      driver_name,
      vehicle_no,
      vehicle_plate,
      vehicle_model,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    const { data: existingRaw, error: fetchErr } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existingRaw) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const hydrated = hydrateRawScheduleRow(existingRaw);

    if (status === 'completed' && !date && !pickup_time && !origin && !destination && !dispatch_status) {
      const { data: completedRow, error: compErr } = await supabaseAdmin
        .from('schedules')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (compErr) {
        return NextResponse.json({ error: compErr.message }, { status: 400 });
      }
      return NextResponse.json({ schedule: mapHydratedRowToScheduleItem(completedRow), fallback: false });
    }

    const effectiveDispatchStatus = dispatch_status || hydrated.dispatch_status || 'published';
    const effectiveDate = date || hydrated.date;
    const effectiveEndDate = body.end_date || body.endDate || hydrated.end_date || effectiveDate;
    const effectivePickupTime = pickup_time || time_display || hydrated.pickup_time;
    const effectiveEndTime = body.end_time || body.endTime || hydrated.end_time;

    const candInput: DispatchUpsertInput = {
      scheduleId: id,
      vehicleId: body.vehicle_id ?? hydrated.vehicle_id ?? undefined,
      serviceMode: body.service_mode ?? hydrated._meta.serviceMode,
      vehicleNo: vehicle_no ?? hydrated.vehicle_no,
      vehiclePlate: vehicle_plate ?? hydrated._meta.vehiclePlate ?? undefined,
      vehicleModel: vehicle_model ?? hydrated._meta.vehicleModel ?? undefined,
      driverId: driver_id !== undefined ? driver_id : hydrated.driver_id ?? undefined,
      driverName: driver_name !== undefined ? driver_name : hydrated.driver_name ?? undefined,
      date: effectiveDate,
      endDate: effectiveEndDate,
      pickupTime: effectivePickupTime,
      endTime: effectiveEndTime,
      timeDisplay: time_display || hydrated.time_display,
      origin: origin || hydrated.origin,
      originAddress: body.origin_address ?? hydrated.origin_address,
      originLat: body.origin_lat ?? hydrated.origin_lat,
      originLng: body.origin_lng ?? hydrated.origin_lng,
      destinationAddress: body.destination_address ?? hydrated.destination_address,
      destinationLat: body.destination_lat ?? hydrated.destination_lat,
      destinationLng: body.destination_lng ?? hydrated.destination_lng,
      passengerCount: body.passenger_count ?? hydrated.passenger_count,
      destination: destination || hydrated.destination,
      passengerName: passenger_name !== undefined ? passenger_name : hydrated.passenger_name ?? undefined,
      passengerPhone: passenger_phone !== undefined ? passenger_phone : hydrated.passenger_phone ?? undefined,
      flightNumber: flight_number !== undefined ? flight_number : hydrated.flight_number ?? undefined,
      notes: protocol_notes !== undefined ? protocol_notes : hydrated.protocol_notes ?? undefined,
      dispatchStatus: effectiveDispatchStatus,
      allowUnverified: true,
    };

    const context=dispatchRequestContext(req,auth.session!,body);
    if(!context)return NextResponse.json({ok:false,error:'저장 요청 번호가 필요합니다.'},{status:400});
    const result = await upsertServerDispatchSchedule(candInput,context.requestId,context.fingerprint);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode || 400 });
    }

    return NextResponse.json({ schedule: result.schedule, fallback: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('PUT /api/schedules error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove a schedule row
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('schedules')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('Error deleting schedule from Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('DELETE /api/schedules error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
