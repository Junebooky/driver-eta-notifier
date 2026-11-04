import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVehicleCurrentStatus, combineFleetAvailability } from './fleetVehicleStatus';
import { checkFleetAvailability } from './availabilityEngine';
import { parseKstDateTimeToMs } from './dispatchConflictDetector';
import { VIP_REAL_VEHICLES } from './vehicleData';

const now = parseKstDateTimeToMs('2026-11-05', '10:00');
const trip = { date: '2026-11-05', pickup_time: '09:00', end_date: '2026-11-05', end_time: '11:00', operation_status: 'ready' };
const query = { startDate: '2026-11-06', startTime: '09:00', endDate: '2026-11-06', endTime: '12:00' };

test('vehicle live status follows assignment time, completion and midnight independently of a future query', () => {
  assert.equal(resolveVehicleCurrentStatus([], undefined, now), 'available');
  assert.equal(resolveVehicleCurrentStatus([{ ...trip, pickup_time: '10:01' }], undefined, now), 'available');
  assert.equal(resolveVehicleCurrentStatus([trip], undefined, now), 'in_service');
  assert.equal(resolveVehicleCurrentStatus([trip], undefined, parseKstDateTimeToMs(trip.end_date, trip.end_time)), 'available');
  assert.equal(resolveVehicleCurrentStatus([{ ...trip, operation_status: 'completed' }], undefined, now), 'available');
  assert.equal(resolveVehicleCurrentStatus([{ ...trip, status: 'cancelled' }], undefined, now), 'available');
  assert.equal(resolveVehicleCurrentStatus([{ ...trip, end_time: null }], undefined, now), 'in_service');
  assert.equal(resolveVehicleCurrentStatus([{ date: '2026-11-04', pickup_time: '23:00', end_date: '2026-11-05', end_time: '11:00' }], undefined, now), 'in_service');
});

test('actual early start/overrun, maintenance and later completion supersede clock/manual waiting', () => {
  for (const operation_status of ['arrived_pickup', 'boarded', 'in_transit']) {
    assert.equal(resolveVehicleCurrentStatus([{ ...trip, operation_status, pickup_time: '12:00', end_time: '13:00' }], undefined, now), 'in_service');
    assert.equal(resolveVehicleCurrentStatus([{ ...trip, operation_status, end_time: '09:30' }], undefined, now), 'in_service');
  }
  assert.equal(resolveVehicleCurrentStatus([trip], { status: '대기 중', updated_at: new Date(now).toISOString() }, now), 'in_service');
  assert.equal(resolveVehicleCurrentStatus([trip], { status: '정비 중', updated_at: new Date(now).toISOString() }, now), 'maintenance');
  const manual = { status: '운행 중', updated_at: new Date(now - 60_000).toISOString() };
  assert.equal(resolveVehicleCurrentStatus([], manual, now), 'in_service');
  assert.equal(resolveVehicleCurrentStatus([{ ...trip, operation_status: 'completed', updated_at: new Date(now).toISOString() }], manual, now), 'available');
  assert.equal(resolveVehicleCurrentStatus([], { status: '확인 필요', updated_at: new Date(now).toISOString() }, now), 'unknown');
});

test('shared server result sorts bookable waiting cars first, retains live status when editing and releases completion', async () => {
  const driving = VIP_REAL_VEHICLES[0], waiting = VIP_REAL_VEHICLES[1];
  const schedules = [{ ...trip, id: 'live-trip', vehicle_id: driving.uuid, dispatch_status: 'published', org_id: 'vip_limousine_korea' }];
  const options = { injectedDrivers: [], injectedSchedules: schedules, injectedOperations: [], nowMs: now };
  const tomorrow = await checkFleetAvailability(query, options);
  assert.equal(tomorrow.vehicles[0].uuid, waiting.uuid);
  assert.equal(tomorrow.vehicles.find(row => row.uuid === driving.uuid)?.currentStatus, 'in_service');
  assert.equal(tomorrow.vehicles.find(row => row.uuid === driving.uuid)?.isAvailable, true);
  const editing = await checkFleetAvailability({ ...query, startDate: trip.date, endDate: trip.date, excludeScheduleId: 'live-trip' }, options);
  assert.equal(editing.vehicles.find(row => row.uuid === driving.uuid)?.currentStatus, 'in_service');
  assert.equal(editing.vehicles.find(row => row.uuid === driving.uuid)?.isAvailable, true);
  const conflict = await checkFleetAvailability({ ...query, startDate: trip.date, endDate: trip.date }, options);
  assert.equal(conflict.vehicles.find(row => row.uuid === driving.uuid)?.isAvailable, false);
  schedules[0].operation_status = 'completed';
  const done = await checkFleetAvailability({ ...query, startDate: trip.date, endDate: trip.date }, options);
  assert.equal(done.vehicles.find(row => row.uuid === driving.uuid)?.currentStatus, 'available');
  assert.equal(done.vehicles.find(row => row.uuid === driving.uuid)?.isAvailable, true);
  schedules[0].operation_status = 'ready'; schedules[0].dispatch_status = 'unassigned';
  const unassigned = await checkFleetAvailability(query, options);
  assert.equal(unassigned.inServiceCount, 0, 'assignment requests must not put a car into service');
});

test('multi-day vehicle choices require availability on every day while preserving free overnight gaps', async () => {
  const car = VIP_REAL_VEHICLES[0];
  const options = { injectedDrivers: [], injectedOperations: [], nowMs: now,
    injectedSchedules: [{ ...trip, id: 'between-days', date: '2026-11-07', end_date: '2026-11-07', vehicle_id: car.uuid, dispatch_status: 'published' }] };
  const first = await checkFleetAvailability(query, options);
  const last = await checkFleetAvailability({ ...query, startDate: '2026-11-08', endDate: '2026-11-08' }, options);
  assert.equal(combineFleetAvailability([first, last]).vehicles.find(row => row.uuid === car.uuid)?.isAvailable, true);
  const blocked = await checkFleetAvailability({ ...query, startDate: '2026-11-07', endDate: '2026-11-07' }, options);
  assert.equal(combineFleetAvailability([first, blocked]).vehicles.find(row => row.uuid === car.uuid)?.isAvailable, false);
  assert.equal(combineFleetAvailability([first, { ...last, vehicles: [] }]).vehicles.find(row => row.uuid === car.uuid)?.isAvailable, false);
});
