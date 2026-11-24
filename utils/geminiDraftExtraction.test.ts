import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DbScheduleRow } from '../types';
import { matchPlaceInMemory, DEFAULT_VERIFIED_PLACES } from '../services/placeResolutionService';

/**
 * Pure simulation of the transformed Phase 3 schedule extractor row mapping
 */
function mapExtractedScheduleToDraft(raw: {
  date: string;
  pickup_time: string;
  origin_name: string;
  destination_name: string;
  passenger_name?: string | null;
  flight_no?: string | null;
  notes?: string | null;
  vehicle_no?: string;
  driver_name?: string;
}): Partial<DbScheduleRow> {
  const originMemory = matchPlaceInMemory(raw.origin_name, DEFAULT_VERIFIED_PLACES);
  const destMemory = matchPlaceInMemory(raw.destination_name, DEFAULT_VERIFIED_PLACES);

  const originLat = originMemory?.lat ?? null;
  const originLng = originMemory?.lng ?? null;
  const destinationLat = destMemory?.lat ?? null;
  const destinationLng = destMemory?.lng ?? null;

  const placeVerified = Boolean(
    originLat != null && originLng != null && destinationLat != null && destinationLng != null
  );

  return {
    vehicle_no: raw.vehicle_no || '4호차',
    driver_name: raw.driver_name || null,
    date: raw.date,
    pickup_time: raw.pickup_time.length === 5 ? `${raw.pickup_time}:00` : raw.pickup_time,
    time_display: `${raw.pickup_time} 픽업`,
    origin: raw.origin_name,
    origin_address: originMemory?.road_address || null,
    origin_lat: originLat,
    origin_lng: originLng,
    destination: raw.destination_name,
    destination_address: destMemory?.road_address || null,
    destination_lat: destinationLat,
    destination_lng: destinationLng,
    passenger_name: raw.passenger_name || null, // Zero fabricated identity
    flight_number: raw.flight_no || null,
    protocol_notes: raw.notes || null,
    dispatch_status: 'draft', // DRAFT ONLY
    version: 1,
    place_verified: placeVerified,
    status: 'scheduled',
  };
}

describe('Phase 3: Gemini Schedule & PDF Extraction (Draft Only Invariant)', () => {
  it('1. Extracted schedules are strictly marked as draft (never live published)', () => {
    const draft = mapExtractedScheduleToDraft({
      date: '2026-10-28',
      pickup_time: '10:00',
      origin_name: '조선팰리스 서울 강남',
      destination_name: '인천국제공항 제2여객터미널',
      passenger_name: 'Mr. David Smith',
      flight_no: 'KE011',
    });

    assert.equal(draft.dispatch_status, 'draft');
    assert.equal(draft.version, 1);
  });

  it('2. Known memory places are verified with exact coordinates', () => {
    const draft = mapExtractedScheduleToDraft({
      date: '2026-10-28',
      pickup_time: '14:00',
      origin_name: '조선팰리스',
      destination_name: '심텍 본사',
    });

    assert.equal(draft.origin_lat, 37.5042);
    assert.equal(draft.origin_lng, 127.0425);
    assert.equal(draft.destination_lat, 36.7118);
    assert.equal(draft.destination_lng, 127.4243);
    assert.equal(draft.place_verified, true);
  });

  it('3. Unknown places NEVER receive invented default coordinates (preserves null)', () => {
    const draft = mapExtractedScheduleToDraft({
      date: '2026-10-28',
      pickup_time: '16:00',
      origin_name: '조선팰리스',
      destination_name: '강원도 미확인 세미나 하우스',
    });

    assert.equal(draft.destination_lat, null);
    assert.equal(draft.destination_lng, null);
    assert.equal(draft.destination_address, null);
    assert.equal(draft.place_verified, false);
  });

  it('4. Missing passenger names remain null (zero fabricated VIP 고객님 defaults)', () => {
    const draft = mapExtractedScheduleToDraft({
      date: '2026-10-28',
      pickup_time: '08:00',
      origin_name: '서울신라호텔',
      destination_name: '인천공항 T2',
      passenger_name: undefined, // Absent in source schedule
    });

    assert.equal(draft.passenger_name, null);
    assert.notEqual(draft.passenger_name, 'VIP 고객님');
  });
});
