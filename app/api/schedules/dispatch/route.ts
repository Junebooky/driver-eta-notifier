import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { mapDbRowToScheduleItem } from '@/app/api/schedules/route';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      scheduleId,
      vehicleNo = '4호차',
      driverId,
      driverName,
      date,
      pickupTime = '09:00',
      timeDisplay,
      origin,
      originAddress = '',
      originLat,
      originLng,
      destination,
      destinationAddress = '',
      destinationLat,
      destinationLng,
      passengerName = '고객 미지정',
      passengerPhone,
      flightNumber,
      notes,
      dispatchStatus = 'published', // 'draft' | 'published'
      placeVerified = false,
      publishedBy = '관리자',
    } = body;

    if (!date || !origin || !destination) {
      return NextResponse.json(
        { error: '날짜, 출발지, 목적지는 필수 항목입니다.' },
        { status: 400 }
      );
    }

    // Unresolved Place Publish Guard:
    // When publishing to driver mobile, places MUST be verified with coordinates
    // or explicit confirmation to prevent sending drivers to guessed/erroneous locations.
    const isPublishing = dispatchStatus === 'published';
    const hasValidCoordinates =
      typeof originLat === 'number' &&
      typeof originLng === 'number' &&
      typeof destinationLat === 'number' &&
      typeof destinationLng === 'number';

    const isUnverified = placeVerified === false || !hasValidCoordinates;
    if (isPublishing && isUnverified && !body.allowUnverified) {
      return NextResponse.json(
        {
          error: '미확인 장소가 포함되어 있어 배차를 발송할 수 없습니다. 주소 및 핀을 확정해주세요.',
          code: 'UNRESOLVED_PLACE_GUARD',
          unverifiedFields: {
            origin: !originAddress || originLat == null,
            destination: !destinationAddress || destinationLat == null,
            placeVerified: Boolean(placeVerified),
          },
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const formattedPickupTime = pickupTime.length === 5 ? `${pickupTime}:00` : pickupTime;
    const resolvedTimeDisplay = timeDisplay || `픽업 ${pickupTime.slice(0, 5)}`;

    // Prepare dispatch record
    const recordPayload: Record<string, unknown> = {
      vehicle_no: vehicleNo,
      driver_id: driverId || null,
      driver_name: driverName || null,
      date,
      pickup_time: formattedPickupTime,
      time_display: resolvedTimeDisplay,
      origin,
      origin_address: originAddress || null,
      origin_lat: typeof originLat === 'number' ? originLat : null,
      origin_lng: typeof originLng === 'number' ? originLng : null,
      destination,
      destination_address: destinationAddress || null,
      destination_lat: typeof destinationLat === 'number' ? destinationLat : null,
      destination_lng: typeof destinationLng === 'number' ? destinationLng : null,
      passenger_name: passengerName,
      passenger_phone: passengerPhone || null,
      flight_number: flightNumber || null,
      protocol_notes: notes || null,
      dispatch_status: dispatchStatus,
      place_verified: Boolean(placeVerified),
      updated_at: nowIso,
    };

    if (dispatchStatus === 'published') {
      recordPayload.published_at = nowIso;
      recordPayload.published_by = publishedBy;
    }

    let resultData;

    if (scheduleId) {
      // Update existing record and increment version if modifying a published job
      const { data: existing } = await supabaseAdmin
        .from('schedules')
        .select('version, dispatch_status')
        .eq('id', scheduleId)
        .single();

      const nextVersion = existing ? (existing.version || 1) + 1 : 1;
      recordPayload.version = nextVersion;

      const { data, error } = await supabaseAdmin
        .from('schedules')
        .update(recordPayload)
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.warn('[Dispatch] Notice updating dispatch in Supabase:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      resultData = data;
    } else {
      // Insert new dispatch
      recordPayload.version = 1;
      recordPayload.last_ack_version = 0;

      const { data, error } = await supabaseAdmin
        .from('schedules')
        .insert(recordPayload)
        .select()
        .single();

      if (error) {
        console.warn('[Dispatch] Notice creating dispatch in Supabase:', error.message);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      resultData = data;
    }

    const scheduleItem = resultData ? mapDbRowToScheduleItem(resultData) : null;

    return NextResponse.json({
      ok: true,
      schedule: scheduleItem,
      dispatchStatus,
      publishedAt: dispatchStatus === 'published' ? nowIso : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules/dispatch error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
