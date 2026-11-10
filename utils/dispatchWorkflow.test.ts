import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DbScheduleRow, DbDispatchAcknowledgmentRow } from '../types';

/**
 * Pure helper simulating API dispatch filtering logic (from app/api/schedules/route.ts)
 */
function filterSchedulesForDriver(
  schedules: DbScheduleRow[],
  query: { driver_id?: string; vehicle_no?: string; role?: string; status?: string }
): DbScheduleRow[] {
  const isHqView = query.role === 'hq' || query.status === 'all';

  return schedules.filter((row) => {
    // 1. Role / Dispatch status guard:
    // Drivers only ever see published dispatches.
    if (!isHqView) {
      if (row.dispatch_status !== 'published') return false;
    } else if (query.status && query.status !== 'all') {
      if (row.dispatch_status !== query.status) return false;
    }

    // 2. Identity boundary:
    if (query.driver_id) {
      return row.driver_id === query.driver_id;
    }
    if (query.vehicle_no && query.vehicle_no !== 'all') {
      return row.vehicle_no === query.vehicle_no;
    }

    return true;
  });
}

/**
 * Pure helper simulating driver acknowledgment logic (from app/api/schedules/ack/route.ts)
 */
function acknowledgeDispatch(
  schedule: DbScheduleRow,
  ack: { version: number; driver_id: string; driver_name: string; device_summary?: string }
): { updatedSchedule: DbScheduleRow; ackEntry: DbDispatchAcknowledgmentRow } {
  const nowIso = new Date().toISOString();

  const ackEntry: DbDispatchAcknowledgmentRow = {
    id: 'ack-uuid-1',
    schedule_id: schedule.id,
    version: ack.version,
    driver_id: ack.driver_id,
    driver_name: ack.driver_name,
    device_summary: ack.device_summary || 'Mobile Browser',
    acknowledged_at: nowIso,
  };

  const updatedSchedule: DbScheduleRow = {
    ...schedule,
    last_ack_version: ack.version,
    last_ack_at: nowIso,
  };

  return { updatedSchedule, ackEntry };
}

/**
 * Pure helper simulating version bump on dispatch edit
 */
function updateDispatchItinerary(
  schedule: DbScheduleRow,
  updates: Partial<DbScheduleRow>
): DbScheduleRow {
  return {
    ...schedule,
    ...updates,
    version: (schedule.version || 1) + 1,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Pure helper checking if acknowledgment is stale (requires re-ack)
 */
function isAcknowledgmentStale(schedule: { version?: number; last_ack_version?: number }): boolean {
  const ver = schedule.version || 1;
  const ackVer = schedule.last_ack_version || 0;
  return ver > 1 && ackVer < ver;
}

describe('Phase 1: Secure HQ Manual Dispatch & Driver Mobile Acknowledgment', () => {
  const mockDatabaseRows: DbScheduleRow[] = [
    {
      id: 'sch-1',
      date: '2026-10-28',
      pickup_time: '09:00:00',
      time_display: '09:00',
      origin: '조선팰리스 서울 강남',
      destination: '인천국제공항 T2',
      vehicle_no: '4호차',
      driver_id: 'driver_4',
      driver_name: '윤태준',
      dispatch_status: 'published',
      version: 1,
      last_ack_version: 0,
      place_verified: true,
      status: 'scheduled',
    },
    {
      id: 'sch-2',
      date: '2026-10-28',
      pickup_time: '14:00:00',
      time_display: '14:00',
      origin: '신라호텔 서울',
      destination: '심텍 본사 (미확정)',
      vehicle_no: '4호차',
      driver_id: 'driver_4',
      driver_name: '윤태준',
      dispatch_status: 'draft', // Draft only: must NEVER be visible to driver
      version: 1,
      last_ack_version: 0,
      place_verified: false,
      status: 'scheduled',
    },
    {
      id: 'sch-3',
      date: '2026-10-28',
      pickup_time: '11:00:00',
      time_display: '11:00',
      origin: '그랜드 인터컨티넨탈 서울 파르나스',
      destination: '김포국제공항 국제선',
      vehicle_no: '1호차',
      driver_id: 'driver_1',
      driver_name: '김철수',
      dispatch_status: 'published',
      version: 1,
      last_ack_version: 1,
      place_verified: true,
      status: 'scheduled',
    },
  ];

  it('1. Unpublished drafts are strictly hidden from driver queries', () => {
    const driver4Feed = filterSchedulesForDriver(mockDatabaseRows, {
      driver_id: 'driver_4',
    });

    assert.equal(driver4Feed.length, 1);
    assert.equal(driver4Feed[0].id, 'sch-1');
    // sch-2 is draft, so it must NOT be included
    assert.ok(driver4Feed.every((s) => s.dispatch_status === 'published'));
  });

  it('2. HQ role can view all statuses including unpublished drafts', () => {
    const hqFeed = filterSchedulesForDriver(mockDatabaseRows, {
      role: 'hq',
      status: 'all',
    });

    assert.equal(hqFeed.length, 3);
    const draftItem = hqFeed.find((s) => s.id === 'sch-2');
    assert.ok(draftItem);
    assert.equal(draftItem?.dispatch_status, 'draft');
  });

  it('3. Driver isolation prevents cross-driver schedule exposure', () => {
    const driver1Feed = filterSchedulesForDriver(mockDatabaseRows, {
      driver_id: 'driver_1',
    });

    assert.equal(driver1Feed.length, 1);
    assert.equal(driver1Feed[0].id, 'sch-3');
    assert.equal(driver1Feed[0].vehicle_no, '1호차');
  });

  it('4. Zero fallback leak: empty query returns honest empty list, NEVER fake Ferrari schedules', () => {
    const unknownDriverFeed = filterSchedulesForDriver(mockDatabaseRows, {
      driver_id: 'non_existent_driver',
    });

    assert.equal(unknownDriverFeed.length, 0);
  });

  it('5. Driver acknowledgment records audit entry and updates schedule last_ack_version', () => {
    const targetSchedule = mockDatabaseRows[0];
    assert.equal(targetSchedule.last_ack_version, 0);

    const { updatedSchedule, ackEntry } = acknowledgeDispatch(targetSchedule, {
      version: 1,
      driver_id: 'driver_4',
      driver_name: '윤태준',
      device_summary: 'iPhone 16 Pro (Mobile Safari)',
    });

    assert.equal(ackEntry.schedule_id, 'sch-1');
    assert.equal(ackEntry.version, 1);
    assert.equal(ackEntry.driver_id, 'driver_4');
    assert.ok(ackEntry.acknowledged_at);

    assert.equal(updatedSchedule.last_ack_version, 1);
    assert.ok(updatedSchedule.last_ack_at);
    assert.equal(isAcknowledgmentStale(updatedSchedule), false);
  });

  it('6. Itinerary update bumps version and invalidates driver acknowledgment (stale ack triggers re-ack)', () => {
    // Acknowledged v1
    const { updatedSchedule: v1Acked } = acknowledgeDispatch(mockDatabaseRows[0], {
      version: 1,
      driver_id: 'driver_4',
      driver_name: '윤태준',
    });
    assert.equal(isAcknowledgmentStale(v1Acked), false);

    // HQ updates itinerary to v2 (pickup_time changed)
    const v2Schedule = updateDispatchItinerary(v1Acked, {
      pickup_time: '09:30:00',
      time_display: '09:30',
    });

    assert.equal(v2Schedule.version, 2);
    assert.equal(v2Schedule.last_ack_version, 1);
    // Because version 2 > last_ack_version 1, acknowledgment is STALE!
    assert.equal(isAcknowledgmentStale(v2Schedule), true);

    // Driver acknowledges v2
    const { updatedSchedule: v2Acked } = acknowledgeDispatch(v2Schedule, {
      version: 2,
      driver_id: 'driver_4',
      driver_name: '윤태준',
    });

    assert.equal(v2Acked.last_ack_version, 2);
    assert.equal(isAcknowledgmentStale(v2Acked), false);
  });
});
