import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { DbScheduleRow } from '@/types';

// Helper to format date string 'YYYY-MM-DD' into 'M월 D일 (요일)'
function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    if (isNaN(d.getTime())) return dateStr;
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = days[d.getDay()];
    return `${month}월 ${day}일 (${dayOfWeek})`;
  } catch {
    return dateStr;
  }
}

// Convert DbScheduleRow to ScheduleItem
export function mapDbRowToScheduleItem(row: DbScheduleRow): ScheduleItem {
  const isAirportDest =
    (row.destination && (row.destination.includes('공항') || row.destination.toLowerCase().includes('airport'))) ||
    (row.destination_address && (row.destination_address.includes('공항') || row.destination_address.toLowerCase().includes('airport')));

  const hasDepartureNotes = Boolean(row.protocol_notes && /DEPARTURE|출국|샌딩|센딩/i.test(row.protocol_notes));
  const isDeparture = row.flight_type === 'departure' || isAirportDest || hasDepartureNotes;

  // Ensure departure time_display uses 픽업 instead of 착륙
  let resolvedTimeDisplay = row.time_display;
  if (isDeparture && resolvedTimeDisplay && resolvedTimeDisplay.includes('착륙')) {
    resolvedTimeDisplay = resolvedTimeDisplay.replace('착륙', '픽업');
  }

  const version = row.version || 1;
  const lastAckVersion = row.last_ack_version || 0;
  const isAcknowledged = lastAckVersion >= version;

  return {
    id: row.id,
    vehicle_no: row.vehicle_no,
    date: row.date,
    dateLabel: formatDateLabel(row.date),
    pickup_time: row.pickup_time ? row.pickup_time.slice(0, 5) : '09:00',
    dropoff_time: null,
    time_display: resolvedTimeDisplay,
    flightType: isDeparture ? 'departure' : 'arrival',
    origin_name: row.origin,
    origin_address: row.origin_address || '',
    origin_lat: row.origin_lat || 37.5042,
    origin_lng: row.origin_lng || 127.0425,
    origin_preset_id: `preset-${row.origin.replace(/\s+/g, '-').toLowerCase()}`,
    destination_name: row.destination,
    destination_address: row.destination_address || '',
    destination_lat: row.destination_lat || 37.4495,
    destination_lng: row.destination_lng || 126.4512,
    destination_preset_id: `preset-${row.destination.replace(/\s+/g, '-').toLowerCase()}`,
    status: row.status === 'completed' ? 'completed' : 'confirmed',
    passenger: row.passenger_name || '고객 미지정',
    passenger_phone: row.passenger_phone || undefined,
    flight: row.flight_number || undefined,
    notes: row.protocol_notes || undefined,
    // Dispatch Lifecycle & Acknowledgment (Issue #25)
    org_id: row.org_id,
    driver_id: row.driver_id || undefined,
    driver_name: row.driver_name || undefined,
    vehicle_id: row.vehicle_id || undefined,
    dispatch_status: row.dispatch_status || 'published',
    version,
    place_verified: row.place_verified ?? true,
    published_at: row.published_at || undefined,
    published_by: row.published_by || undefined,
    last_ack_version: lastAckVersion,
    last_ack_at: row.last_ack_at || undefined,
    isAcknowledged,
  };
}

// GET: Fetch schedules
// - Driver View: only returns dispatch_status='published' scoped by driver_id or vehicle_no
// - HQ View (?status=all or ?role=hq): returns all dispatches including drafts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleNo = searchParams.get('vehicle_no');
    const driverId = searchParams.get('driver_id');
    const role = searchParams.get('role');
    const statusParam = searchParams.get('status');

    let query = supabaseAdmin.from('schedules').select('*');

    // 1. Authorization & Role boundary:
    // If not explicit HQ manager view, restrict to 'published' dispatches only
    const isHqView = role === 'hq' || statusParam === 'all';
    if (!isHqView) {
      query = query.eq('dispatch_status', 'published');
    } else if (statusParam && statusParam !== 'all') {
      query = query.eq('dispatch_status', statusParam);
    }

    // 2. Identity boundary:
    if (driverId) {
      query = query.eq('driver_id', driverId);
    } else if (vehicleNo && vehicleNo !== 'all') {
      query = query.eq('vehicle_no', vehicleNo);
    }

    const { data, error } = await query
      .order('date', { ascending: true })
      .order('pickup_time', { ascending: true });

    if (error) {
      console.warn(`[Supabase Schedules] Query notice: ${error.message}`);
      // Zero demo fallback: Never return fake schedules on error
      return NextResponse.json({ schedules: [], fallback: false, error: error.message });
    }

    if (!data || data.length === 0) {
      // Zero demo fallback: Return honest empty array
      return NextResponse.json({ schedules: [], fallback: false });
    }

    const schedules: ScheduleItem[] = data.map((row: DbScheduleRow) => mapDbRowToScheduleItem(row));

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
    const body = await req.json();
    const {
      vehicle_no = '4호차',
      driver_id = null,
      driver_name = null,
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
      flight_number,
      protocol_notes,
      dispatch_status = 'published',
      place_verified = false,
      status = 'scheduled',
    } = body;

    if (!date || !time_display || !origin || !destination) {
      return NextResponse.json(
        { error: 'date, time_display, origin, and destination are required' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const payload = {
      vehicle_no,
      driver_id,
      driver_name,
      date,
      pickup_time: pickup_time || '09:00:00',
      time_display,
      origin,
      origin_address: origin_address || null,
      origin_lat: origin_lat || null,
      origin_lng: origin_lng || null,
      destination,
      destination_address: destination_address || null,
      destination_lat: destination_lat || null,
      destination_lng: destination_lng || null,
      passenger_name: passenger_name || null,
      passenger_phone: passenger_phone || null,
      flight_number: flight_number || null,
      protocol_notes: protocol_notes || null,
      dispatch_status,
      version: 1,
      place_verified: Boolean(place_verified),
      published_at: dispatch_status === 'published' ? nowIso : null,
      status,
      updated_at: nowIso,
    };

    const { data, error } = await supabaseAdmin
      .from('schedules')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn('Error inserting schedule into Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ schedule: mapDbRowToScheduleItem(data), fallback: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: Update an existing schedule row
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, time_display, passenger_name, passenger_phone, flight_number, protocol_notes, status, dispatch_status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    // Retrieve current schedule to handle version bumping on material edits
    const { data: currentSchedule } = await supabaseAdmin
      .from('schedules')
      .select('version')
      .eq('id', id)
      .single();

    const currentVersion = currentSchedule?.version || 1;
    const isMaterialChange = time_display !== undefined;
    const nextVersion = isMaterialChange ? currentVersion + 1 : currentVersion;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: nextVersion,
    };

    if (time_display !== undefined) updates.time_display = time_display;
    if (passenger_name !== undefined) updates.passenger_name = passenger_name;
    if (passenger_phone !== undefined) updates.passenger_phone = passenger_phone;
    if (flight_number !== undefined) updates.flight_number = flight_number;
    if (protocol_notes !== undefined) updates.protocol_notes = protocol_notes;
    if (status !== undefined) updates.status = status;
    if (dispatch_status !== undefined) {
      updates.dispatch_status = dispatch_status;
      if (dispatch_status === 'published') {
        updates.published_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabaseAdmin
      .from('schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('Error updating schedule in Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ schedule: mapDbRowToScheduleItem(data), fallback: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('PUT /api/schedules error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove a schedule row
export async function DELETE(req: NextRequest) {
  try {
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
