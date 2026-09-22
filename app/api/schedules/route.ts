import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { CONFIRMED_FERRARI_SCHEDULES, ScheduleItem } from '@/data/ferrariSchedules';
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
function mapDbRowToScheduleItem(row: DbScheduleRow): ScheduleItem {
  return {
    id: row.id,
    vehicle_no: row.vehicle_no,
    date: row.date,
    dateLabel: formatDateLabel(row.date),
    pickup_time: row.pickup_time ? row.pickup_time.slice(0, 5) : '09:00',
    dropoff_time: null, // STRICT RULE 3: 공식 고시 시간 보존 (TMAP 임의 연산 절대 금지)
    time_display: row.time_display,
    origin_name: row.origin,
    origin_address: row.origin_address || '',
    origin_lat: row.origin_lat || 37.5042,
    origin_lng: row.origin_lng || 127.0425,
    origin_preset_id: `preset-${row.origin.replace(/\s+/g, '-').toLowerCase()}`,
    destination_name: row.destination,
    destination_address: row.destination_address || '',
    destination_lat: row.destination_lat || 38.0051,
    destination_lng: row.destination_lng || 128.2917,
    destination_preset_id: `preset-${row.destination.replace(/\s+/g, '-').toLowerCase()}`,
    status: row.status === 'completed' ? 'completed' : 'confirmed',
    passenger: row.passenger_name || 'VIP 고객님',
    flight: row.flight_number || undefined,
    notes: row.protocol_notes || undefined,
  };
}

// Fallback seed schedules for 1호차 to guarantee vehicle isolation even before DB migration
const VEHICLE_1_FALLBACK: ScheduleItem[] = [
  {
    id: '11111111-0001-4000-a000-000000000001',
    vehicle_no: '1호차',
    date: '2026-09-17',
    dateLabel: '9월 17일 (목)',
    pickup_time: '11:00',
    dropoff_time: null,
    time_display: '11:00 착륙',
    origin_name: '인천공항 T2',
    origin_address: '인천 중구 제2소화물통로 255',
    origin_preset_id: '3c7e416a-2222-4222-a222-222222222222',
    origin_lat: 37.4691,
    origin_lng: 126.4344,
    destination_name: '시그니엘 서울',
    destination_address: '서울 송파구 올림픽로 300 롯데월드타워',
    destination_preset_id: '3c7e416a-4444-4444-a444-444444444444',
    destination_lat: 37.5126,
    destination_lng: 127.1025,
    status: 'confirmed',
    passenger: 'FERRARI GLOBAL VIP (2명)',
    flight: 'KE 012',
    notes: '1호차 전담 VIP 영접 의전 • T2 입국장 피켓 대기',
  },
];

// GET: Fetch schedules isolated by vehicle_no (STRICT RULE 1: Vehicle Isolation, or 'all' for dispatcher view)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleNo = searchParams.get('vehicle_no') || '4호차';

    let query = supabaseAdmin.from('schedules').select('*');
    if (vehicleNo !== 'all') {
      query = query.eq('vehicle_no', vehicleNo);
    }

    const { data, error } = await query
      .order('date', { ascending: true })
      .order('pickup_time', { ascending: true });

    if (error) {
      // Graceful fallback when table is not yet created or migration pending
      console.warn(`[Supabase Schedules: Fallback] Table query failed (${error.message}). Using vehicle-isolated fallback for ${vehicleNo}.`);
      if (vehicleNo === '4호차') {
        return NextResponse.json({ schedules: CONFIRMED_FERRARI_SCHEDULES, fallback: true });
      }
      if (vehicleNo === '1호차') {
        return NextResponse.json({ schedules: VEHICLE_1_FALLBACK, fallback: true });
      }
      if (vehicleNo === 'all') {
        const allFallback = [
          ...CONFIRMED_FERRARI_SCHEDULES.map((s) => ({ ...s, vehicle_no: '4호차' })),
          ...VEHICLE_1_FALLBACK,
        ].sort((a, b) => a.date.localeCompare(b.date) || a.pickup_time.localeCompare(b.pickup_time));
        return NextResponse.json({ schedules: allFallback, fallback: true });
      }
      return NextResponse.json({ schedules: [], fallback: true });
    }

    if (!data || data.length === 0) {
      if (vehicleNo === '4호차') {
        return NextResponse.json({ schedules: CONFIRMED_FERRARI_SCHEDULES, fallback: true });
      }
      if (vehicleNo === '1호차') {
        return NextResponse.json({ schedules: VEHICLE_1_FALLBACK, fallback: true });
      }
      return NextResponse.json({ schedules: [], fallback: false });
    }

    const schedules: ScheduleItem[] = data.map((row: DbScheduleRow) => mapDbRowToScheduleItem(row));

    return NextResponse.json({ schedules, fallback: false });
  } catch (err: any) {
    console.error('Error fetching schedules from Supabase:', err);
    return NextResponse.json({ schedules: CONFIRMED_FERRARI_SCHEDULES, fallback: true, error: err?.message });
  }
}

// POST: Create a new schedule row for a vehicle
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vehicle_no = '4호차',
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
      flight_number,
      protocol_notes,
      status = 'scheduled',
    } = body;

    if (!date || !time_display || !origin || !destination) {
      return NextResponse.json(
        { error: 'date, time_display, origin, and destination are required' },
        { status: 400 }
      );
    }

    const payload = {
      vehicle_no,
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
      flight_number: flight_number || null,
      protocol_notes: protocol_notes || null,
      status,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('schedules')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn('Error inserting schedule into Supabase:', error);
      return NextResponse.json({ error: error.message, fallback: true }, { status: 400 });
    }

    return NextResponse.json({ schedule: mapDbRowToScheduleItem(data), fallback: false });
  } catch (err: any) {
    console.error('POST /api/schedules error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// PUT: Update an existing schedule row (e.g. via EditScheduleModal)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, time_display, passenger_name, flight_number, protocol_notes, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (time_display !== undefined) updates.time_display = time_display;
    if (passenger_name !== undefined) updates.passenger_name = passenger_name;
    if (flight_number !== undefined) updates.flight_number = flight_number;
    if (protocol_notes !== undefined) updates.protocol_notes = protocol_notes;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabaseAdmin
      .from('schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('Error updating schedule in Supabase:', error);
      return NextResponse.json({ error: error.message, fallback: true }, { status: 400 });
    }

    return NextResponse.json({ schedule: mapDbRowToScheduleItem(data), fallback: false });
  } catch (err: any) {
    console.error('PUT /api/schedules error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
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
      return NextResponse.json({ error: error.message, fallback: true }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/schedules error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
