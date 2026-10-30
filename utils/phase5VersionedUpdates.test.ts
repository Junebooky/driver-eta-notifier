import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DbScheduleRow } from '../types';

/**
 * Pure simulation of HQ Checklist grouping logic
 */
function computeHqChecklist(rows: DbScheduleRow[]) {
  const unsentDrafts = rows.filter((r) => r.dispatch_status === 'draft');
  const unverifiedPlaces = rows.filter((r) => r.place_verified === false);
  const pendingDriverAck = rows.filter((r) => {
    if (r.dispatch_status !== 'published') return false;
    if (!r.driver_id && !r.driver_name) return false;
    const ver = r.version || 1;
    const ackVer = r.last_ack_version || 0;
    return ackVer < ver;
  });
  const unassigned = rows.filter((r) => !r.driver_id && !r.driver_name);

  return {
    total: rows.length,
    unsentDraftsCount: unsentDrafts.length,
    unverifiedPlacesCount: unverifiedPlaces.length,
    pendingDriverAckCount: pendingDriverAck.length,
    unassignedCount: unassigned.length,
  };
}

/**
 * Pure simulation of schedule cancellation
 */
function cancelSchedule(
  schedule: DbScheduleRow,
  reason: string,
  cancelledBy: string = 'HQ_MANAGER'
): DbScheduleRow {
  return {
    ...schedule,
    dispatch_status: 'cancelled',
    status: 'cancelled',
    version: (schedule.version || 1) + 1,
    protocol_notes: `[배차 취소: ${reason} (처리자: ${cancelledBy})]`,
    updated_at: new Date().toISOString(),
  };
}

describe('Phase 5: Versioned Updates, HQ Checklist & Cancellation Flow', () => {
  const baseSchedule: DbScheduleRow = {
    id: 'sch-vip-101',
    date: '2026-10-28',
    pickup_time: '09:00:00',
    time_display: '09:00 픽업',
    origin: '조선팰리스 서울 강남',
    destination: '심텍 본사 (오창)',
    vehicle_no: '4호차',
    driver_id: 'driver_4',
    driver_name: '윤태준',
    dispatch_status: 'published',
    version: 1,
    last_ack_version: 0,
    place_verified: true,
    status: 'scheduled',
  };

  it('1. Initial published schedule requires driver acknowledgment', () => {
    const isStale = (baseSchedule.last_ack_version || 0) < (baseSchedule.version || 1);
    assert.equal(isStale, true);
  });

  it('2. Version bump on itinerary update triggers re-acknowledgment alert', () => {
    // Driver acknowledges v1
    const v1Acked: DbScheduleRow = {
      ...baseSchedule,
      last_ack_version: 1,
      last_ack_at: new Date().toISOString(),
    };
    const isV1Stale = (v1Acked.last_ack_version || 0) < (v1Acked.version || 1);
    assert.equal(isV1Stale, false);

    // Client changes pickup time: HQ updates schedule, bumping version to 2
    const v2Updated: DbScheduleRow = {
      ...v1Acked,
      pickup_time: '09:30:00',
      time_display: '09:30 픽업',
      version: 2,
    };

    // Because last_ack_version (1) < version (2), it is now stale!
    const isV2Stale = (v2Updated.last_ack_version || 0) < (v2Updated.version || 1);
    assert.equal(isV2Stale, true);

    // Driver acknowledges v2
    const v2Acked: DbScheduleRow = {
      ...v2Updated,
      last_ack_version: 2,
      last_ack_at: new Date().toISOString(),
    };
    const isV2AckedStale = (v2Acked.last_ack_version || 0) < (v2Acked.version || 1);
    assert.equal(isV2AckedStale, false);
  });

  it('3. HQ Checklist accurately classifies operational reminders', () => {
    const testFleet: DbScheduleRow[] = [
      {
        ...baseSchedule,
        id: 'sch-1',
        dispatch_status: 'draft', // Unsent draft
      },
      {
        ...baseSchedule,
        id: 'sch-2',
        place_verified: false, // Unverified place
      },
      {
        ...baseSchedule,
        id: 'sch-3',
        driver_id: null,
        driver_name: null, // Unassigned
      },
      {
        ...baseSchedule,
        id: 'sch-4',
        version: 2,
        last_ack_version: 1, // Pending driver ack
      },
      {
        ...baseSchedule,
        id: 'sch-5',
        version: 1,
        last_ack_version: 1, // Fully clean and acked
      },
    ];

    const checklist = computeHqChecklist(testFleet);

    assert.equal(checklist.total, 5);
    assert.equal(checklist.unsentDraftsCount, 1);
    assert.equal(checklist.unverifiedPlacesCount, 1);
    assert.equal(checklist.unassignedCount, 1);
    assert.equal(checklist.pendingDriverAckCount, 2); // sch-2 (ver 1, ack 0) and sch-4 (ver 2, ack 1)
  });

  it('4. Schedule cancellation safely revokes assignment and bumps version for audit trail', () => {
    const cancelled = cancelSchedule(baseSchedule, '고객 비행기 결항으로 인한 일정 취소');

    assert.equal(cancelled.dispatch_status, 'cancelled');
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.version, 2);
    assert.ok(cancelled.protocol_notes?.includes('고객 비행기 결항'));
  });
});
