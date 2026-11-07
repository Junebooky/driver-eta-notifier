/**
 * Automated Test Suite for Issue #35:
 * Fresh ETA Action Pipeline, Cache Bypass, Mobile UX & Navigation/HQ Synchronization
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureActionSnapshot,
  fetchFreshEtaRoute,
  buildFreshReportText,
  syncNavigationRouteToDrivingLog,
  executeFreshEtaAction,
  formatKstTimeHHMM,
  calculateDynamicEtaFormatted,
  OUTBOX_STORAGE_KEY,
  flushNavigationOutboxQueue,
  NavigationOutboxItem,
} from './freshEtaActionPipeline';
import { LocationPreset, DriverProfile } from '@/types';
import {
  DRIVING_LOG_STORAGE_PREFIX,
  DRIVING_LOG_INDEX_KEY,
  DrivingLogData,
} from './drivingLog';
import {
  getHqDrivingLogs,
  saveHqDrivingLogs,
  submitDriverLogToHq,
  fetchHqDrivingLogsFromDb,
  HQ_DRIVING_LOGS_STORAGE_KEY,
} from './drivingLogHqStorage';
import { mapDbRowToDrivingLog } from '@/app/api/driving-logs/route';

// In-memory mock localStorage for node environment
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
(global as any).localStorage = mockStorage;
(global as any).window = {};

const mockDriverProfile: DriverProfile = {
  driverId: 'd0000000-0000-4000-a000-000000000001',
  driverName: '윤태준',
  vehicleNo: '4호차',
  carNumber: '142호 7811',
  plateNumber: '142호 7811',
  phone: '010-8842-1920',
  defaultNavi: 'tmap',
  targetChatRoom: 'VIP 4호차 단톡방',
};

const mockOrigin: LocationPreset = {
  id: 'josun_palace',
  name: '조선팰리스 서울 강남',
  shortName: '조선팰리스',
  lat: 37.5042,
  lng: 127.0425,
  category: 'HOTEL',
};

const mockDestination: LocationPreset = {
  id: 'icn_t1',
  name: '인천국제공항 제1여객터미널',
  shortName: '인천공항 T1',
  address: '인천 중구 공항로 272',
  lat: 37.4495,
  lng: 126.4512,
  category: 'AIRPORT',
};

test('1. Fresh ETA on Action Button Click (Cache Bypass vs Preview)', async () => {
  // Scenario: Preview was fetched at 10:00 (duration: 45 min -> ETA 10:45)
  // At 10:05, driver clicks "내비 안내 시작" or "카카오톡 공유"
  const previewTime = new Date('2026-10-30T01:00:00.000Z'); // 10:00 KST
  const actionClickTime = new Date('2026-10-30T01:05:00.000Z'); // 10:05 KST

  assert.equal(formatKstTimeHHMM(previewTime), '10:00');
  assert.equal(formatKstTimeHHMM(actionClickTime), '10:05');

  // Preview ETA: 10:00 + 45 min = 10:45
  const previewEta = calculateDynamicEtaFormatted(45, previewTime);
  assert.equal(previewEta, '10:45');

  // Action Click Snapshot: Clicked at 10:05
  const snapshot = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    reportMode: 'DEPARTURE',
    language: 'ko',
    driverProfile: mockDriverProfile,
    clickedAt: actionClickTime,
  });

  assert.equal(snapshot.departureTimeFormatted, '10:05');

  // Mock server responding with fresh traffic (duration now 42 min due to traffic update)
  const originalFetch = (global as any).fetch;
  (global as any).fetch = async (url: string) => {
    assert.match(url, /bypassCache=true/);
    assert.match(url, /purpose=action/);
    return {
      ok: true,
      json: async () => ({
        distanceKm: 55.4,
        durationMinutes: 42, // fresh duration!
        etaFormatted: '10:47',
        isCached: false,
        isFresh: true,
        source: 'tmap_fresh',
        computedAt: actionClickTime.toISOString(),
      }),
    };
  };

  try {
    const freshRoute = await fetchFreshEtaRoute(snapshot);
    assert.equal(freshRoute.isFresh, true);
    assert.equal(freshRoute.source, 'tmap_fresh');
    assert.equal(freshRoute.durationMinutes, 42);
    // Calculated dynamically from 10:05 + 42m = 10:47 (NOT stale preview 10:45!)
    assert.equal(freshRoute.etaFormatted, '10:47');

    const freshText = buildFreshReportText({
      snapshot,
      etaFormatted: freshRoute.etaFormatted,
      durationMinutes: freshRoute.durationMinutes,
      distanceKm: freshRoute.distanceKm,
    });

    // Report text MUST contain 10:05 departure and 10:47 fresh ETA
    assert.match(freshText, /출발 예정: 조선팰리스 \(10:05\)/);
    assert.match(freshText, /예상 도착\(ETA\): 10:47/);
    assert.doesNotMatch(freshText, /10:45/);
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('2. Language (KR/EN) and Mode (Departure/Arrived) Consistency Across All Buttons', async () => {
  const clickTime = new Date('2026-10-30T01:05:00.000Z'); // 10:05 KST

  // Case A: Korean Departure
  const krDepSnapshot = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    reportMode: 'DEPARTURE',
    language: 'ko',
    driverProfile: mockDriverProfile,
    clickedAt: clickTime,
  });
  const krDepText = buildFreshReportText({
    snapshot: krDepSnapshot,
    etaFormatted: '10:47',
    durationMinutes: 42,
  });
  assert.match(krDepText, /\[142호 7811 윤태준\]/);
  assert.match(krDepText, /• 출발 예정: 조선팰리스 \(10:05\)/);
  assert.match(krDepText, /• 예상 도착\(ETA\): 10:47/);

  // Case B: Korean Arrived
  const krArrSnapshot = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    reportMode: 'ARRIVED',
    language: 'ko',
    driverProfile: mockDriverProfile,
    clickedAt: clickTime,
  });
  const krArrText = buildFreshReportText({
    snapshot: krArrSnapshot,
    etaFormatted: '10:47',
  });
  assert.match(krArrText, /• 도착지: 인천공항 T1/);
  assert.match(krArrText, /• 상태: 도착 완료/);

  // Case C: English Departure
  const enDepSnapshot = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    reportMode: 'DEPARTURE',
    language: 'en',
    driverProfile: mockDriverProfile,
    clickedAt: clickTime,
  });
  const enDepText = buildFreshReportText({
    snapshot: enDepSnapshot,
    etaFormatted: '10:47',
  });
  assert.match(enDepText, /• Vehicle No.: 142호 7811/);
  assert.match(enDepText, /• Route: Josun Palace → Incheon Airport T1/);
  assert.match(enDepText, /• ETA: 10:47 AM/);

  // Case D: English Arrived
  const enArrSnapshot = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    reportMode: 'ARRIVED',
    language: 'en',
    driverProfile: mockDriverProfile,
    clickedAt: clickTime,
  });
  const enArrText = buildFreshReportText({
    snapshot: enArrSnapshot,
    etaFormatted: '10:47',
  });
  assert.match(enArrText, /• Vehicle No.: 142호 7811/);
  assert.match(enArrText, /• Destination: Incheon Airport T1/);
  assert.match(enArrText, /• Status: Arrived/);
});

test('3. Navigation: "추가하기" creates driving log draft; "내비만 실행" does NOT', async () => {
  mockStorage.clear();
  const clickTime = new Date('2026-10-30T01:10:00.000Z'); // 10:10 KST
  const bookingId = 'b1111111-1111-4111-a111-111111111111';

  const originalFetch = (global as any).fetch;
  let dbCallCount = 0;
  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/api/route')) {
      return {
        ok: true,
        json: async () => ({
          distanceKm: 55,
          durationMinutes: 40,
          etaFormatted: '10:50',
          isCached: false,
          source: 'tmap_fresh',
        }),
      };
    }
    if (url.includes('/api/driving-logs')) {
      dbCallCount++;
      return {
        ok: true,
        json: async () => ({ ok: true }),
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    // 1. "추가하기" (navi_with_log)
    const resultLog = await executeFreshEtaAction({
      actionType: 'navi_with_log',
      origin: mockOrigin,
      destination: mockDestination,
      driverProfile: mockDriverProfile,
      bookingId,
      clickedAt: clickTime,
    });

    assert.equal(resultLog.success, true);
    assert.equal(resultLog.logSyncResult?.success, true);
    assert.equal(resultLog.logSyncResult?.isDuplicate, false);
    assert.equal(resultLog.logSyncResult?.stop?.place, '인천공항 T1');
    assert.equal(resultLog.logSyncResult?.stop?.time, ''); // Arrival time NOT fabricated
    assert.equal(resultLog.logSyncResult?.stop?.departureTime, '10:10');
    assert.equal(resultLog.logSyncResult?.stop?.predictedEta, '10:50');
    assert.equal(resultLog.logSyncResult?.stop?.predictedDurationMinutes, 40);

    // Verify written to local draft
    const rawIndex = mockStorage.getItem(DRIVING_LOG_INDEX_KEY);
    assert.ok(rawIndex, 'Index should be saved');

    // 2. "내비만 실행" (navi_only)
    const resultOnly = await executeFreshEtaAction({
      actionType: 'navi_only',
      origin: mockOrigin,
      destination: mockDestination,
      driverProfile: mockDriverProfile,
      bookingId: 'b2222222-2222-4222-a222-222222222222',
      clickedAt: new Date(),
    });

    assert.equal(resultOnly.success, true);
    assert.equal(resultOnly.logSyncResult, undefined, 'navi_only must NOT generate a logSyncResult');
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('4. Resilience: DB/Network failure NEVER blocks navigation execution', async () => {
  mockStorage.clear();
  const clickTime = new Date('2026-10-30T01:15:00.000Z'); // 10:15 KST

  const originalFetch = (global as any).fetch;
  // Simulate complete DB breakdown (500 error / network drop)
  (global as any).fetch = async (url: string) => {
    if (url.includes('/api/route')) {
      return {
        ok: true,
        json: async () => ({ distanceKm: 50, durationMinutes: 45, etaFormatted: '11:00', isCached: false }),
      };
    }
    if (url.includes('/api/driving-logs')) {
      throw new Error('Connection refused / 500 DB error');
    }
    return { ok: false, status: 500 };
  };

  try {
    const result = await executeFreshEtaAction({
      actionType: 'navi_with_log',
      origin: mockOrigin,
      destination: mockDestination,
      driverProfile: mockDriverProfile,
      bookingId: 'b3333333-3333-4333-a333-333333333333',
      clickedAt: clickTime,
    });

    // Navigation must report success regardless of DB failure!
    assert.equal(result.success, true, 'Action must succeed even if DB sync fails');
    // Local draft stop was preserved
    assert.equal(result.logSyncResult?.success, true);
    assert.equal(result.logSyncResult?.stop?.place, '인천공항 T1');

    // Outbox entry queued for background retry
    const rawOutbox = mockStorage.getItem(OUTBOX_STORAGE_KEY);
    assert.ok(rawOutbox, 'Outbox must queue offline/failed records');
    const outboxList = JSON.parse(rawOutbox);
    assert.ok(outboxList.length >= 1, 'Should have at least 1 outbox entry');
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('5. Idempotent action handling: Double clicks do NOT produce duplicate draft stops', async () => {
  mockStorage.clear();
  const clickTime = new Date('2026-10-30T01:20:00.000Z'); // 10:20 KST
  const bookingId = 'b4444444-4444-4444-a444-444444444444';

  const originalFetch = (global as any).fetch;
  (global as any).fetch = async (url: string) => {
    if (url.includes('/api/route')) {
      return { ok: true, json: async () => ({ distanceKm: 50, durationMinutes: 40, etaFormatted: '11:00' }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    // Click 1
    const res1 = await executeFreshEtaAction({
      actionType: 'navi_with_log',
      origin: mockOrigin,
      destination: mockDestination,
      driverProfile: mockDriverProfile,
      bookingId,
      clickedAt: clickTime,
    });
    assert.equal(res1.logSyncResult?.isDuplicate, false);

    // Click 2 (Double click 5 seconds later in the same minute for same destination)
    const clickTime2 = new Date('2026-10-30T01:20:05.000Z');
    const res2 = await executeFreshEtaAction({
      actionType: 'navi_with_log',
      origin: mockOrigin,
      destination: mockDestination,
      driverProfile: mockDriverProfile,
      bookingId,
      clickedAt: clickTime2,
    });

    assert.equal(res2.logSyncResult?.isDuplicate, true, 'Second click must be recognized as duplicate');

    // Verify localStorage stops count is exactly 1 (not 2)
    const rawIndex = mockStorage.getItem(DRIVING_LOG_INDEX_KEY);
    const indexList = JSON.parse(rawIndex!);
    const reportData = JSON.parse(mockStorage.getItem(`${DRIVING_LOG_STORAGE_PREFIX}${indexList[0].reportId}`)!);
    assert.equal(reportData.stops.length, 1, 'Stops array must NOT duplicate the route');
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('6. Same-Day Multiple Bookings Isolation by Driver UUID + Booking UUID', async () => {
  mockStorage.clear();
  const booking1 = 'b5555555-5555-4555-a555-555555555555';
  const booking2 = 'b6666666-6666-4666-a666-666666666666';

  const dest2: LocationPreset = {
    id: 'signiel_seoul',
    name: '시그니엘 서울',
    shortName: '시그니엘',
    address: '서울 송파구 올림픽로 300',
    lat: 37.5125,
    lng: 127.1025,
    category: 'HOTEL',
  };

  const originalFetch = (global as any).fetch;
  (global as any).fetch = async () => ({
    ok: true,
    json: async () => ({ distanceKm: 30, durationMinutes: 35, etaFormatted: '11:35' }),
  });

  try {
    // Action on Booking 1
    await executeFreshEtaAction({
      actionType: 'navi_with_log',
      origin: mockOrigin,
      destination: mockDestination,
      driverProfile: mockDriverProfile,
      bookingId: booking1,
      clickedAt: new Date('2026-10-30T01:00:00.000Z'),
    });

    // Action on Booking 2
    await executeFreshEtaAction({
      actionType: 'navi_with_log',
      origin: mockOrigin,
      destination: dest2,
      driverProfile: mockDriverProfile,
      bookingId: booking2,
      clickedAt: new Date('2026-10-30T03:00:00.000Z'),
    });

    const rawIndex = mockStorage.getItem(DRIVING_LOG_INDEX_KEY);
    const indexList = JSON.parse(rawIndex!);

    // Two distinct booking drafts must exist in the index
    assert.ok(indexList.length >= 2, 'Two separate booking drafts must exist');
    const b1Entry = indexList.find((i: any) => i.bookingId === booking1);
    const b2Entry = indexList.find((i: any) => i.bookingId === booking2);
    assert.ok(b1Entry, 'Booking 1 draft exists');
    assert.ok(b2Entry, 'Booking 2 draft exists');
    assert.notEqual(b1Entry.reportId, b2Entry.reportId, 'Report IDs must be distinct');
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('7. HQ In-Progress Draft vs Submitted Log Distinction', async () => {
  // DB row mapping: In-progress draft
  const draftRow = {
    id: 'd7777777-7777-4777-a777-777777777777',
    driver_name: '윤태준',
    driver_id: mockDriverProfile.driverId,
    customer_name: 'VIP 고객',
    vehicle_plate: '142호 7811',
    status: 'draft',
    submitted_at: null,
    driving_date: '2026-10-30',
    stops: [
      {
        id: 'stop-1',
        time: '',
        place: '인천공항 T1',
        departureTime: '10:05',
        predictedEta: '10:48',
        predictedDurationMinutes: 43,
        calculationSource: 'tmap_fresh',
      },
    ],
  };

  const mappedDraft = mapDbRowToDrivingLog(draftRow, 1);
  assert.equal(mappedDraft.status, 'draft');
  assert.equal(mappedDraft.isDriverSubmitted, false);
  assert.equal(mappedDraft.stops[0].time, '');
  assert.equal((mappedDraft.stops[0] as any).departureTime, '10:05');
  assert.equal((mappedDraft.stops[0] as any).predictedEta, '10:48');

  // DB row mapping: Submitted log
  const submittedRow = {
    ...draftRow,
    status: '검토 대기',
    submitted_at: '2026-10-30T12:00:00.000Z',
    start_km: 154000,
    end_km: 154100,
  };

  const mappedSubmitted = mapDbRowToDrivingLog(submittedRow, 2);
  assert.equal(mappedSubmitted.status, '검토 대기');
  assert.equal(mappedSubmitted.isDriverSubmitted, true);
});

test('8. Zero fabricated ETA: No 45-min fallback, No fake 7:30 PM, Honest failure states', async () => {
  const clickTime = new Date('2026-10-30T01:30:00.000Z'); // 10:30 KST
  const snapshot = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    reportMode: 'DEPARTURE',
    language: 'en',
    driverProfile: undefined, // Empty profile test
    clickedAt: clickTime,
  });

  const originalFetch = (global as any).fetch;
  // Route API returns 0 duration / error
  (global as any).fetch = async () => ({
    ok: true,
    json: async () => ({ durationMinutes: 0, distanceKm: 0, isFresh: false }),
  });

  try {
    const route = await fetchFreshEtaRoute(snapshot);
    // Must be 0 and --:--, NEVER fallback to 45!
    assert.equal(route.durationMinutes, 0);
    assert.equal(route.etaFormatted, '--:--');
    assert.equal(route.isFresh, false);
    assert.equal(route.isUnavailable, true);

    // English report must NOT fabricate '7:30 PM'
    const enText = buildFreshReportText({
      snapshot,
      etaFormatted: route.etaFormatted,
      durationMinutes: route.durationMinutes,
      distanceKm: route.distanceKm,
    });
    assert.doesNotMatch(enText, /7:30 PM/);
    assert.match(enText, /Pending Confirmation/);
    assert.match(enText, /Vehicle Pending/);

    // Korean report with empty profile
    const krSnapshot = captureActionSnapshot({
      origin: mockOrigin,
      destination: mockDestination,
      reportMode: 'DEPARTURE',
      language: 'ko',
      driverProfile: undefined,
      clickedAt: clickTime,
    });
    const krText = buildFreshReportText({
      snapshot: krSnapshot,
      etaFormatted: route.etaFormatted,
      durationMinutes: route.durationMinutes,
      distanceKm: route.distanceKm,
    });
    assert.match(krText, /담당 기사/);
    assert.match(krText, /차량 미지정/);
    assert.match(krText, /도착 미정/);
    assert.doesNotMatch(krText, /142호 7811/);
    assert.doesNotMatch(krText, /윤태준/);
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('9. Outbox Queue Consumption Worker Flushes on Reconnect', async () => {
  mockStorage.clear();
  const rawOutboxItem: NavigationOutboxItem = {
    id: 'action_drv1_book1_fingerprint_100',
    bookingId: 'book-100',
    driverId: mockDriverProfile.driverId,
    payload: {
      bookingId: 'book-100',
      driverId: mockDriverProfile.driverId,
      driverName: '테스트기사',
      vehiclePlate: '116허 1514',
      customerName: '테스트고객',
      drivingDate: '2026-10-30',
      stops: [{ id: 'stop-1', time: '', place: '인천공항 T1' }],
      status: 'draft',
    },
    createdAt: new Date().toISOString(),
    status: 'server_sync_pending',
    retryCount: 1,
  };

  mockStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([rawOutboxItem]));

  const originalFetch = (global as any).fetch;
  let syncedCalls = 0;
  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/api/driving-logs')) {
      syncedCalls++;
      return {
        ok: true,
        json: async () => ({ ok: true, log: { id: 'log-synced-100' } }),
      };
    }
    return { ok: false };
  };

  try {
    const result = await flushNavigationOutboxQueue();
    assert.equal(result.total, 1);
    assert.equal(result.synced, 1);
    assert.equal(result.failed, 0);
    assert.equal(syncedCalls, 1);

    // Queue must now be empty
    const remainingRaw = mockStorage.getItem(OUTBOX_STORAGE_KEY);
    const remaining = JSON.parse(remainingRaw || '[]');
    assert.equal(remaining.length, 0, 'Outbox queue should be completely purged after successful flush');
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('10. HQ Screen 0-Record State Honesty (No Fake Mock Fallback when DB has 0 logs)', async () => {
  mockStorage.clear();

  const originalFetch = (global as any).fetch;
  // DB query returns 0 logs
  (global as any).fetch = async (url: string) => {
    if (url.includes('/api/driving-logs')) {
      return {
        ok: true,
        json: async () => ({ ok: true, logs: [] }),
      };
    }
    return { ok: false };
  };

  try {
    const dbRes = await fetchHqDrivingLogsFromDb();
    assert.equal(dbRes.ok, true);
    assert.equal(dbRes.logs.length, 0);

    // getHqDrivingLogs MUST return 0 logs, NEVER fall back to 18 mock logs!
    const hqLogs = getHqDrivingLogs();
    assert.equal(hqLogs.length, 0, 'HQ driving logs must honestly reflect 0 logs from server');
  } finally {
    (global as any).fetch = originalFetch;
  }
});

test('11. Driver & Booking Isolation in Idempotency Keys', () => {
  const clickTime = new Date('2026-10-30T01:40:00.000Z');

  const snap1 = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    bookingId: 'booking-AAA',
    driverProfile: { ...mockDriverProfile, driverId: 'driver-1' },
    clickedAt: clickTime,
  });

  const snap2 = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    bookingId: 'booking-BBB',
    driverProfile: { ...mockDriverProfile, driverId: 'driver-1' },
    clickedAt: clickTime,
  });

  const snap3 = captureActionSnapshot({
    origin: mockOrigin,
    destination: mockDestination,
    bookingId: 'booking-AAA',
    driverProfile: { ...mockDriverProfile, driverId: 'driver-2' },
    clickedAt: clickTime,
  });

  // Different bookings must NOT share idempotency keys
  assert.notEqual(snap1.idempotencyKey, snap2.idempotencyKey);
  // Different drivers must NOT share idempotency keys
  assert.notEqual(snap1.idempotencyKey, snap3.idempotencyKey);
});
