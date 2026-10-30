import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIP_REAL_VEHICLES,
  mapVehicleToUiCategory,
  formatChargingPortSummary,
  stripManufacturerName,
} from './vehicleData';
import {
  isDateTimeIntervalOverlapping,
  parseKstDateTimeToMs,
  checkFleetAvailability,
} from './availabilityEngine';
import {
  checkServerDispatchConflicts,
  DispatchUpsertInput,
} from '@/lib/dispatch/scheduleServerStore';
import { getKstTodayDateStr } from './dispatchConflictDetector';
import { DbScheduleRow } from '@/types';
import { HqScheduleMeta } from '@/lib/dispatch/scheduleServerStore';

test('Fleet Availability & Dispatch Conflict Engine Suite (Issue #10)', async (t) => {
  // -------------------------------------------------------------------------
  // Criterion 1: Canonical 20 Vehicles & 4 UI Categories
  // -------------------------------------------------------------------------
  await t.test('1. Canonical 20 Vehicles & 4 UI Categories Mapping', () => {
    assert.equal(VIP_REAL_VEHICLES.length, 20, 'Total canonical fleet must be exactly 20 vehicles');

    const counts: Record<string, number> = { sedan: 0, suv: 0, van: 0, sprinter: 0 };
    for (const v of VIP_REAL_VEHICLES) {
      const uiCat = mapVehicleToUiCategory(v);
      counts[uiCat] = (counts[uiCat] || 0) + 1;
    }

    assert.equal(counts.sedan, 4, 'Must have exactly 4 sedans (G90L 2269, G90 8839, G90 리무진 4280, S560 3343)');
    assert.equal(counts.suv, 1, 'Must have exactly 1 SUV (GV80 5947)');
    assert.equal(counts.van, 6, 'Must have exactly 6 vans (Staria 4 + Carnival 2)');
    assert.equal(counts.sprinter, 9, 'Must have exactly 9 sprinters (319 3대 + 519 6대)');
    assert.equal(counts.sedan + counts.suv + counts.van + counts.sprinter, 20, 'Sum of UI categories must equal 20');

    // Check specific known vehicles
    const gv80 = VIP_REAL_VEHICLES.find((v) => v.plateShort === '5947');
    assert.ok(gv80);
    assert.equal(mapVehicleToUiCategory(gv80), 'suv');

    const g90l = VIP_REAL_VEHICLES.find((v) => v.plateShort === '2269');
    assert.ok(g90l);
    assert.equal(mapVehicleToUiCategory(g90l), 'sedan');

    const carnival7681 = VIP_REAL_VEHICLES.find((v) => v.plateShort === '7681');
    assert.ok(carnival7681);
    assert.equal(mapVehicleToUiCategory(carnival7681), 'van');

    const sprinter9982 = VIP_REAL_VEHICLES.find((v) => v.plateShort === '9982');
    assert.ok(sprinter9982);
    assert.equal(mapVehicleToUiCategory(sprinter9982), 'sprinter');
  });

  // -------------------------------------------------------------------------
  // Criterion 2: Carnival Charging Specification & Unverified Status
  // -------------------------------------------------------------------------
  await t.test('2. Carnival Charging Specification & Front/Rear Separation', () => {
    const carnival7681 = VIP_REAL_VEHICLES.find((v) => v.plateShort === '7681');
    assert.ok(carnival7681?.chargingSpecs, 'Carnival 7681 must have charging specs');

    // Front: 3 USB ports confirmed
    assert.equal(carnival7681.chargingSpecs.front.status, 'confirmed');
    assert.equal(carnival7681.chargingSpecs.front.usbA, 3);
    const frontSummary = formatChargingPortSummary(carnival7681.chargingSpecs.front);
    assert.ok(frontSummary.includes('USB'), 'Front summary must indicate USB ports');

    // Rear: 12V + 220V inverter confirmed
    assert.equal(carnival7681.chargingSpecs.rear.status, 'confirmed');
    assert.equal(carnival7681.chargingSpecs.rear.cigar12v, 1);
    assert.equal(carnival7681.chargingSpecs.rear.ac220v, true);
    const rearSummary = formatChargingPortSummary(carnival7681.chargingSpecs.rear);
    assert.ok(rearSummary.includes('12V'), 'Rear summary must indicate 12V cigar port');
    assert.ok(rearSummary.includes('220V'), 'Rear summary must indicate 220V inverter');

    // Unverified vehicle (e.g. Sprinter 9982 or unverified)
    const sprinter9982 = VIP_REAL_VEHICLES.find((v) => v.plateShort === '9982');
    const unverifiedSummary = formatChargingPortSummary(sprinter9982?.chargingSpecs?.front);
    assert.equal(unverifiedSummary, '미확인 (관리자 확인 필요)', 'Unverified vehicle must never guess port counts');
  });

  // -------------------------------------------------------------------------
  // Criterion 3: Same-Day Interval Overlap & 60-Minute Turnaround Buffer
  // -------------------------------------------------------------------------
  await t.test('3. Same-Day Interval Overlap & 60-Min Turnaround Buffer', () => {
    // Stage 0 Reproduction Case:
    // Existing Booking: 10:00 ~ 20:00 (10 hours)
    // Candidate 1: 17:00 ~ 19:00 (Internal Overlap - previously missed by 180min window!)
    const overlapsInternal = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-05', startTime: '10:00', endDate: '2026-11-05', endTime: '20:00' },
      { startDate: '2026-11-05', startTime: '17:00', endDate: '2026-11-05', endTime: '19:00' },
      60
    );
    assert.equal(overlapsInternal, true, 'Internal 17:00~19:00 must be caught as conflict against 10:00~20:00');

    // Candidate 2: 20:00 ~ 22:00 (Starts immediately when previous ends -> Violates 60m buffer)
    const overlapsBuffer = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-05', startTime: '10:00', endDate: '2026-11-05', endTime: '20:00' },
      { startDate: '2026-11-05', startTime: '20:00', endDate: '2026-11-05', endTime: '22:00' },
      60
    );
    assert.equal(overlapsBuffer, true, 'Booking at 20:00 must be blocked by 60m turnaround buffer (needed until 21:00)');

    // Candidate 3: 20:50 ~ 22:00 (Still within 60m buffer)
    const overlapsBuffer50m = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-05', startTime: '10:00', endDate: '2026-11-05', endTime: '20:00' },
      { startDate: '2026-11-05', startTime: '20:50', endDate: '2026-11-05', endTime: '22:00' },
      60
    );
    assert.equal(overlapsBuffer50m, true, 'Booking at 20:50 must be blocked by 60m buffer');

    // Candidate 4: 21:00 ~ 23:00 (Exactly 60m turnaround satisfied)
    const overlapsClean = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-05', startTime: '10:00', endDate: '2026-11-05', endTime: '20:00' },
      { startDate: '2026-11-05', startTime: '21:00', endDate: '2026-11-05', endTime: '23:00' },
      60
    );
    assert.equal(overlapsClean, false, 'Booking at 21:00 satisfies 60m turnaround buffer and must be allowed');
  });

  // -------------------------------------------------------------------------
  // Criterion 4: Multi-Day & Cross-Midnight Interval Overlap
  // -------------------------------------------------------------------------
  await t.test('4. Multi-Day & Cross-Midnight Interval Overlap', () => {
    // Stage 0 Reproduction Case:
    // Existing Booking: 2026-11-02 22:00 ~ 2026-11-03 03:00 (Spans midnight)
    // Candidate 1: 2026-11-03 01:00 ~ 02:30 (Different start date, but overlaps in real time!)
    const overlapsCrossMidnight = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-02', startTime: '22:00', endDate: '2026-11-03', endTime: '03:00' },
      { startDate: '2026-11-03', startTime: '01:00', endDate: '2026-11-03', endTime: '02:30' },
      60
    );
    assert.equal(overlapsCrossMidnight, true, 'Cross-midnight overlap must be caught across date boundary');

    // Candidate 2: 2026-11-03 03:30 ~ 05:00 (30m after end, violates 60m buffer until 04:00)
    const overlapsMidnightBuffer = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-02', startTime: '22:00', endDate: '2026-11-03', endTime: '03:00' },
      { startDate: '2026-11-03', startTime: '03:30', endDate: '2026-11-03', endTime: '05:00' },
      60
    );
    assert.equal(overlapsMidnightBuffer, true, 'Cross-midnight turnaround buffer must be enforced');

    // Candidate 3: 2026-11-03 04:00 ~ 07:00 (Satisfies 60m turnaround after 03:00)
    const cleanAfterMidnight = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-02', startTime: '22:00', endDate: '2026-11-03', endTime: '03:00' },
      { startDate: '2026-11-03', startTime: '04:00', endDate: '2026-11-03', endTime: '07:00' },
      60
    );
    assert.equal(cleanAfterMidnight, false, 'Turnaround satisfied at 04:00 must be allowed');
  });

  // -------------------------------------------------------------------------
  // Criterion 5: Missing End Time Conservative Handling
  // -------------------------------------------------------------------------
  await t.test('5. Conservative Handling of Missing / Unconfirmed End Times', () => {
    // When end time is empty or unconfirmed on existing booking, interval check assumes conservative coverage
    const overlapsUnconfirmed = isDateTimeIntervalOverlapping(
      { startDate: '2026-11-05', startTime: '10:00', endDate: '2026-11-05', endTime: '' },
      { startDate: '2026-11-05', startTime: '15:00', endDate: '2026-11-05', endTime: '18:00' },
      60
    );
    assert.equal(overlapsUnconfirmed, true, 'Unconfirmed end time on same date must conservatively overlap midday bookings');
  });

  // -------------------------------------------------------------------------
  // Criterion 6: Same Driver Double Booking across Different Vehicles
  // -------------------------------------------------------------------------
  await t.test('6. Same Driver Double Booking across Different Vehicles Blocked', async () => {
    const existingFixture: Array<DbScheduleRow & { _meta: HqScheduleMeta }> = [
      {
        id: 'sched-driver-1',
        date: '2026-11-10',
        pickup_time: '13:00',
        end_date: '2026-11-10',
        end_time: '17:00',
        time_display: '13:00 ~ 17:00',
        vehicle_no: '125호 9982',
        driver_name: '이영호',
        passenger_name: 'VIP 손님 A',
        origin: '조선팰리스 호텔',
        destination: '인천공항 T1',
        status: 'scheduled',
        dispatch_status: 'published',
        _meta: {
          version: 1,
          placeVerified: true,
          dispatchStatus: 'published',
          driverName: '이영호',
          vehiclePlate: '125호 9982',
          customerName: 'VIP 손님 A',
          lastAckVersion: 0,
        },
      },
    ];

    const candidates: DispatchUpsertInput[] = [
      {
        date: '2026-11-10',
        pickupTime: '14:00',
        endDate: '2026-11-10',
        endTime: '18:00',
        vehicleNo: '101호 7681', // Different vehicle!
        driverName: '이영호',     // Same driver!
        origin: '조선팰리스 호텔',
        destination: '인천공항 T1',
        dispatchStatus: 'published',
      },
    ];

    const conflicts = await checkServerDispatchConflicts(candidates, existingFixture);

    assert.equal(conflicts.length, 1, 'Must detect 1 conflict on driver across different vehicles');
    assert.equal(conflicts[0].type, 'driver');
    assert.equal(conflicts[0].target, '이영호');
    assert.ok(conflicts[0].message.includes('이영호'));
  });

  // -------------------------------------------------------------------------
  // Criterion 7: Intra-Batch Double Booking Detection
  // -------------------------------------------------------------------------
  await t.test('7. Intra-Batch Double Booking Detection in Atomic Submissions', async () => {
    // Submit batch with 2 items for the same vehicle overlapping in time
    const candidates: DispatchUpsertInput[] = [
      {
        date: '2026-11-12',
        pickupTime: '10:00',
        endDate: '2026-11-12',
        endTime: '14:00',
        vehicleNo: '125호 9982',
        driverName: '김철수',
        origin: '김포공항',
        destination: '신라호텔',
        dispatchStatus: 'published',
      },
      {
        date: '2026-11-12',
        pickupTime: '12:00', // Overlaps with 10:00~14:00
        endDate: '2026-11-12',
        endTime: '16:00',
        vehicleNo: '125호 9982',
        driverName: '박기사',
        origin: '신라호텔',
        destination: '인천공항',
        dispatchStatus: 'published',
      },
    ];

    const conflicts = await checkServerDispatchConflicts(candidates, []);

    assert.equal(conflicts.length, 1, 'Intra-batch overlapping dispatches must be detected');
    assert.equal(conflicts[0].type, 'vehicle');
    assert.ok(conflicts[0].message.includes('중복 선택되었습니다'));
  });

  // -------------------------------------------------------------------------
  // Criterion 8: Vehicle Conflict Guard Enforces 60-Minute Turnaround Buffer
  // -------------------------------------------------------------------------
  await t.test('8. Vehicle Conflict Guard Enforces 60-Minute Turnaround Buffer', async () => {
    const existingFixture: Array<DbScheduleRow & { _meta: HqScheduleMeta }> = [
      {
        id: 'sched-veh-1',
        date: '2026-11-15',
        pickup_time: '09:00',
        end_date: '2026-11-15',
        end_time: '12:00',
        time_display: '09:00 ~ 12:00',
        vehicle_no: '125호 9982',
        driver_name: '최진우',
        passenger_name: 'VIP 손님 B',
        origin: '김포공항',
        destination: '신라호텔',
        status: 'scheduled',
        dispatch_status: 'published',
        _meta: {
          version: 1,
          placeVerified: true,
          dispatchStatus: 'published',
          driverName: '최진우',
          vehiclePlate: '125호 9982',
          customerName: 'VIP 손님 B',
          lastAckVersion: 0,
        },
      },
    ];

    // Candidate at 12:30 (Violates 60m buffer, requires >= 13:00)
    const conflictCandidate: DispatchUpsertInput[] = [
      {
        date: '2026-11-15',
        pickupTime: '12:30',
        endDate: '2026-11-15',
        endTime: '15:00',
        vehicleNo: '125호 9982',
        origin: '신라호텔',
        destination: '인천공항',
        dispatchStatus: 'published',
      },
    ];
    const conflicts = await checkServerDispatchConflicts(conflictCandidate, existingFixture);
    assert.equal(conflicts.length, 1, 'Booking at 12:30 must be blocked by 60m buffer');
    assert.equal(conflicts[0].type, 'vehicle');

    // Candidate at 13:00 (Turnaround satisfied)
    const cleanCandidate: DispatchUpsertInput[] = [
      {
        date: '2026-11-15',
        pickupTime: '13:00',
        endDate: '2026-11-15',
        endTime: '15:00',
        vehicleNo: '125호 9982',
        origin: '신라호텔',
        destination: '인천공항',
        dispatchStatus: 'published',
      },
    ];
    const noConflicts = await checkServerDispatchConflicts(cleanCandidate, existingFixture);
    assert.equal(noConflicts.length, 0, 'Booking at 13:00 satisfies turnaround and must not conflict');
  });

  // -------------------------------------------------------------------------
  // Criterion 9: Availability Engine Fail-Closed on Invalid Dates
  // -------------------------------------------------------------------------
  await t.test('9. Availability Engine Fail-Closed & Validation', async () => {
    await assert.rejects(
      async () => {
        await checkFleetAvailability({
          startDate: '',
          startTime: '09:00',
          endTime: '18:00',
        });
      },
      /시작 일자와 시간은 필수 입력값입니다/,
      'Availability engine must throw on empty startDate'
    );
  });

  // -------------------------------------------------------------------------
  // Criterion 10: Operational Status Independent of Interval Availability
  // -------------------------------------------------------------------------
  await t.test('10. Operational Status Independent of Interval Availability', async () => {
    // Schedule today 09:00 ~ 12:00 on Sprinter 9982
    const fixtureToday = [
      {
        id: 'sched-today-1',
        date: '2026-11-20',
        pickup_time: '09:00',
        end_date: '2026-11-20',
        end_time: '12:00',
        vehicle_no: '125호 9982',
        driver_name: '정동원',
        dispatch_status: 'published',
        operation_status: 'in_transit',
      },
    ];

    // Query availability for tomorrow (2026-11-21) 09:00 ~ 18:00
    const availTomorrow = await checkFleetAvailability(
      {
        startDate: '2026-11-21',
        startTime: '09:00',
        endDate: '2026-11-21',
        endTime: '18:00',
      },
      { injectedSchedules: fixtureToday }
    );

    const item9982 = availTomorrow.vehicles.find((v) => v.plate.includes('9982'));
    assert.ok(item9982, 'Vehicle 9982 must be present in availability results');
    // For tomorrow's interval, it is completely free and available
    assert.equal(item9982.isAvailable, true, 'Vehicle in service today must be available tomorrow');
    assert.equal(item9982.requestedIntervalStatus, 'available');
  });

  // -------------------------------------------------------------------------
  // Criterion 11: Regression Guard (Dynamic Dates & Strip Manufacturer)
  // -------------------------------------------------------------------------
  await t.test('11. Regression Guard: Dynamic Dates & Utility Helpers', () => {
    const today = getKstTodayDateStr();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'Today must be valid YYYY-MM-DD');

    // Strip manufacturer prefix
    assert.equal(stripManufacturerName('벤츠 스프린터 319 CDI'), '스프린터 319 CDI');
    assert.equal(stripManufacturerName('현대 스타리아 리무진'), '스타리아 리무진');
    assert.equal(stripManufacturerName('기아 카니발 하이리무진'), '카니발 하이리무진');
    assert.equal(stripManufacturerName('제네시스 G90L'), 'G90L');
    assert.equal(stripManufacturerName('메르세데스-벤츠 S 560'), 'S 560');
  });
});
