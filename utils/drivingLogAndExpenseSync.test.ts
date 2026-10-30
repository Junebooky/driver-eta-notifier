import assert from 'node:assert';
import test from 'node:test';
import { supabaseAdmin } from '@/lib/supabase/server';
import { signCockpitSession } from '@/lib/auth/serverAuth';
import { GET as getDrivingLogs, POST as postDrivingLogs, PUT as putDrivingLogs } from '@/app/api/driving-logs/route';
import { GET as getExpenses, POST as postExpenses, PUT as putExpenses } from '@/app/api/expenses/route';
import { GET as getReceipt, POST as postReceipt } from '@/app/api/expenses/receipt/route';
import { getVerifiedInspectionOdometer } from '@/utils/drivingLog';
import { NextRequest } from 'next/server';

// Ensure test environment auth secret
if (!process.env.COCKPIT_AUTH_SECRET) {
  process.env.COCKPIT_AUTH_SECRET = 'mock-test-auth-secret-driving-log-32chars';
}

interface MockDrivingLogRow {
  id: string;
  booking_id?: string | null;
  driver_id?: string | null;
  driver_name: string;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  organization_id: string;
  customer_name?: string | null;
  customer_id?: string | null;
  driving_date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  start_km: number;
  end_km: number;
  distance_km: number;
  stops?: any[];
  notes?: string | null;
  status: string;
  submitted_at?: string | null;
  review_history?: any[];
  created_at?: string;
  updated_at?: string;
}

interface MockExpenseRow {
  id: string;
  booking_id?: string | null;
  driver_id?: string | null;
  driver_name: string;
  vehicle_id?: string | null;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  organization_id: string;
  expense_date: string;
  expense_time?: string | null;
  category: string;
  merchant: string;
  address?: string | null;
  amount: number;
  payment_method: string;
  receipt_storage_path?: string | null;
  hipass_tx_key?: string | null;
  status: string;
  submitted_at?: string | null;
  audit_history?: any[];
  created_at?: string;
  updated_at?: string;
}

test('Driver & HQ Driving Log / Expense Sync & Security Test Suite', async () => {
  let mockDrivingLogs: MockDrivingLogRow[] = [];
  let mockExpenses: MockExpenseRow[] = [];
  let simulateDbError = false;
  let simulateStorageError = false;

  const DRIVER_A_UUID = 'b6aac740-002e-4a5c-ac49-0ac71e765340';
  const DRIVER_B_UUID = 'a85444a9-f13e-4b52-9a81-ac09995ab66a';
  const HQ_ADMIN_UUID = 'c7bbd951-113f-4c63-bd92-bd10006bc77b';

  const BOOKING_CHANEL_UUID = '11111111-1111-4111-8111-111111111111';
  const BOOKING_MORNING_UUID = '22222222-2222-4222-8222-222222222222';
  const BOOKING_AFTERNOON_UUID = '33333333-3333-4333-8333-333333333333';
  const BOOKING_FAIL_UUID = '44444444-4444-4444-8444-444444444444';
  const BOOKING_DRIVER_B_ONLY_UUID = '55555555-5555-4555-8555-555555555555';
  const BOOKING_SPOOFED_NAME_UUID = '66666666-6666-4666-8666-666666666666';

  const LOG_ROUNDTRIP_UUID = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const LOG_MORNING_UUID = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const LOG_AFTERNOON_UUID = 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const LOG_FAIL_UUID = 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const EXPENSE_RECEIPT_UUID = 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const RECEIPT_STORAGE_PATH = `vip_limousine_korea/expenses/receipts/${DRIVER_A_UUID}/2026/10/receipt_sample_01.jpg`;

  const mockSchedules = [
    {
      id: BOOKING_CHANEL_UUID,
      customer_name: '샤넬코리아',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: DRIVER_A_UUID },
    },
    {
      id: BOOKING_MORNING_UUID,
      customer_name: '오전 고객사',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: DRIVER_A_UUID },
    },
    {
      id: BOOKING_AFTERNOON_UUID,
      customer_name: '오후 고객사',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: DRIVER_A_UUID },
    },
    {
      id: BOOKING_FAIL_UUID,
      customer_name: '오류 테스트 고객사',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: DRIVER_A_UUID },
    },
    {
      id: BOOKING_DRIVER_B_ONLY_UUID,
      customer_name: '민성호 전용 고객사',
      driver_name: '민성호',
      vehicle_plate: '142호 7815',
      vehicle_no: '8호차',
      schedule_meta: { driver_id: DRIVER_B_UUID },
    },
    {
      id: BOOKING_SPOOFED_NAME_UUID,
      customer_name: '이름만 일치하는 타인 예약 (Loose Match Bypass Attack)',
      driver_name: '윤태준', // Same driver name
      vehicle_plate: '116허 1514', // Same vehicle plate
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: DRIVER_B_UUID }, // Assigned to Driver B's UUID!
    },
  ];

  // Mock Storage Bucket for private receipts with driver-level isolation
  const mockStorageFiles: Record<string, { buffer: Buffer; contentType: string }> = {
    [RECEIPT_STORAGE_PATH]: {
      buffer: Buffer.from('mock-jpeg-receipt-bytes-data'),
      contentType: 'image/jpeg',
    },
  };

  // Mock Supabase Auth for JWT verification testing (Item 1)
  const mockJwtUsers: Record<string, any> = {
    'jwt.attacker.escalate': {
      user: {
        id: '99999999-9999-4999-8999-999999999999',
        user_metadata: { cockpit_role: 'hq_admin', org: 'vip_limousine_korea' }, // Attacker manipulated user_metadata!
        app_metadata: { cockpit_role: 'driver', org: 'vip_limousine_korea', driver_id: DRIVER_A_UUID },
      },
    },
    'jwt.untrusted.org': {
      user: {
        id: '88888888-8888-4888-8888-888888888888',
        user_metadata: { org: 'vip_limousine_korea' },
        app_metadata: { org: 'foreign_org' },
      },
    },
  };

  // Mock builder targeting in-memory storage and rows
  const mockFrom = (table: string) => {
    let filterField: string | null = null;
    let filterVal: any = null;
    let filters: Array<{ field: string; val: any }> = [];

    let activeRows: any[] = [];
    if (table === 'driving_logs') {
      activeRows = mockDrivingLogs;
    } else if (table === 'expenses') {
      activeRows = mockExpenses;
    } else if (table === 'schedules') {
      activeRows = mockSchedules;
    }

    const builder: any = {
      select: (_fields: string = '*') => builder,
      order: (_col: string, _opts?: any) => builder,
      eq: (field: string, val: any) => {
        filterField = field;
        filterVal = val;
        filters.push({ field, val });
        return builder;
      },
      single: async () => {
        if (simulateDbError) {
          return { data: null, error: { message: 'Simulated DB internal error' } };
        }
        let matches = activeRows;
        for (const f of filters) {
          matches = matches.filter((r) => (r as any)[f.field] === f.val);
        }
        const found = matches[0];
        return { data: found ? { ...found } : null, error: found ? null : { message: 'Row not found' } };
      },
      maybeSingle: async () => {
        if (simulateDbError) {
          return { data: null, error: { message: 'Simulated DB internal error' } };
        }
        let matches = activeRows;
        for (const f of filters) {
          matches = matches.filter((r) => (r as any)[f.field] === f.val);
        }
        const found = matches[0];
        return { data: found ? { ...found } : null, error: null };
      },
      upsert: (newRows: any | any[], opts?: any) => {
        if (simulateDbError) {
          const errPromise = Promise.resolve({ data: null, error: { message: 'Simulated DB upsert failure' } });
          const errSelectObj = Object.assign(errPromise, {
            single: () => errPromise,
            maybeSingle: () => errPromise,
          });
          return Object.assign(errPromise, { select: () => errSelectObj });
        }
        const rowsArray = Array.isArray(newRows) ? newRows : [newRows];
        for (const row of rowsArray) {
          const onConflict = opts?.onConflict || 'id';
          let idx = -1;
          if (onConflict === 'hipass_tx_key' && row.hipass_tx_key) {
            idx = activeRows.findIndex((r) => r.hipass_tx_key === row.hipass_tx_key);
          } else {
            idx = activeRows.findIndex((r) => r.id === row.id);
          }

          if (idx >= 0) {
            activeRows[idx] = { ...activeRows[idx], ...row, updated_at: new Date().toISOString() };
          } else {
            activeRows.push({ ...row, created_at: new Date().toISOString() });
          }
        }
        const successPromise = Promise.resolve({ data: rowsArray, error: null });
        const successSelectObj = Object.assign(successPromise, {
          single: () => Promise.resolve({ data: rowsArray[0], error: null }),
          maybeSingle: () => Promise.resolve({ data: rowsArray[0], error: null }),
        });
        return Object.assign(successPromise, {
          select: (_fields: string = '*') => successSelectObj,
        });
      },
      update: (updates: any) => ({
        eq: (field: string, val: any) => {
          if (simulateDbError) {
            const errPromise = Promise.resolve({ data: null, error: { message: 'Simulated DB update failure' } });
            return Object.assign(errPromise, {
              select: () => Object.assign(errPromise, {
                single: () => errPromise,
                maybeSingle: () => errPromise,
              }),
            });
          }
          const idx = activeRows.findIndex((r) => (r as any)[field] === val);
          if (idx >= 0) {
            activeRows[idx] = { ...activeRows[idx], ...updates, updated_at: new Date().toISOString() };
            const rowData = activeRows[idx];
            const successPromise = Promise.resolve({ data: rowData, error: null });
            return Object.assign(successPromise, {
              select: () => Object.assign(successPromise, {
                single: () => Promise.resolve({ data: rowData, error: null }),
                maybeSingle: () => Promise.resolve({ data: rowData, error: null }),
              }),
            });
          }
          const notFoundPromise = Promise.resolve({ data: null, error: { message: 'Row not found for update' } });
          return Object.assign(notFoundPromise, {
            select: () => Object.assign(notFoundPromise, {
              single: () => notFoundPromise,
              maybeSingle: () => notFoundPromise,
            }),
          });
        },
      }),
      delete: () => ({
        eq: async (field: string, val: any) => {
          const idx = activeRows.findIndex((r) => (r as any)[field] === val);
          if (idx >= 0) {
            activeRows.splice(idx, 1);
          }
          return { error: null };
        },
      }),
      then: (resolve: any, _reject: any) => {
        if (simulateDbError) {
          return Promise.resolve({ data: null, error: { message: 'Simulated DB query failure' } }).then(resolve);
        }
        let res = activeRows.map((r) => ({ ...r }));
        for (const f of filters) {
          res = res.filter((r) => (r as any)[f.field] === f.val);
        }
        return Promise.resolve({ data: res, error: null }).then(resolve);
      },
    };

    return builder;
  };

  // Mock Supabase storage
  const mockStorage = {
    from: (_bucket: string) => ({
      download: async (path: string) => {
        const file = mockStorageFiles[path];
        if (!file) {
          return { data: null, error: { message: 'File not found' } };
        }
        return {
          data: {
            arrayBuffer: async () => file.buffer.buffer,
            type: file.contentType,
          },
          error: null,
        };
      },
      upload: async (path: string, fileData: any, opts?: any) => {
        if (simulateStorageError) {
          return { data: null, error: { message: 'Physical storage upload failure' } };
        }
        mockStorageFiles[path] = {
          buffer: Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData),
          contentType: opts?.contentType || 'image/jpeg',
        };
        return { data: { path }, error: null };
      },
    }),
  };

  // Monkey-patch supabaseAdmin for mock execution
  supabaseAdmin.from = mockFrom as any;
  (supabaseAdmin as any).storage = mockStorage as any;
  (supabaseAdmin as any).auth = {
    getUser: async (token: string) => {
      const match = mockJwtUsers[token];
      if (match) {
        return { data: match, error: null };
      }
      return { data: { user: null }, error: { message: 'Invalid JWT' } };
    },
  };

  // Driver A (윤태준), Driver B (민성호), HQ Admin
  const driverAToken = signCockpitSession({
    userId: DRIVER_A_UUID,
    org: 'vip_limousine_korea',
    role: 'driver',
    driverName: '윤태준',
    driverId: DRIVER_A_UUID,
    carNumber: '116허 1514',
    vehicleNo: '116허 1514',
  });

  const driverBToken = signCockpitSession({
    userId: DRIVER_B_UUID,
    org: 'vip_limousine_korea',
    role: 'driver',
    driverName: '민성호',
    driverId: DRIVER_B_UUID,
    carNumber: '142호 7815',
    vehicleNo: '8호차',
  });

  const hqAdminToken = signCockpitSession({
    userId: HQ_ADMIN_UUID,
    org: 'vip_limousine_korea',
    role: 'hq_admin',
    driverName: '관리자',
  });

  // --------------------------------------------------------------------------
  // 1. 기사 저장 → HQ 조회 → 재조회 시 데이터 일치
  // --------------------------------------------------------------------------
  await test('1. Driver save -> HQ query -> round-trip data match', async () => {
    const postReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        id: LOG_ROUNDTRIP_UUID,
        bookingId: BOOKING_CHANEL_UUID,
        driverName: '윤태준',
        vehiclePlate: '116허 1514',
        vehicleModel: '스타리아 리무진',
        drivingDate: '2026-11-09',
        clockIn: '08:30',
        clockOut: '19:00',
        startKm: '154,725',
        endKm: '154,861',
        distanceKm: '136 km',
        stops: [
          { placeName: '인천공항 T1', time: '10:00', purpose: 'VIP 픽업' },
          { placeName: '조선팰리스 호텔', time: '11:30', purpose: '투숙 및 하차' },
        ],
        notes: 'VIP 고객 정시 도착 완료',
        isDraft: false,
      }),
    });

    const postRes = await postDrivingLogs(postReq);
    assert.strictEqual(postRes.status, 200, 'Driving log submission should succeed');
    const postData = await postRes.json();
    assert.strictEqual(postData.ok, true);
    assert.strictEqual(postData.log.status, '검토 대기');

    // HQ Admin queries the logs
    const getReq = new NextRequest(`http://localhost:3000/api/driving-logs?bookingId=${BOOKING_CHANEL_UUID}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${hqAdminToken}` },
    });
    const getRes = await getDrivingLogs(getReq);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.ok, true);
    assert.strictEqual(getData.logs.length, 1);
    const hqLog = getData.logs[0];
    assert.strictEqual(hqLog.driverName, '윤태준');
    assert.strictEqual(hqLog.vehiclePlate, '116허 1514');
    assert.strictEqual(hqLog.startKm, '154,725');
    assert.strictEqual(hqLog.endKm, '154,861');
    assert.strictEqual(hqLog.stops.length, 2);
  });

  // --------------------------------------------------------------------------
  // 2. 같은 날 여러 예약의 운행일지 분리
  // --------------------------------------------------------------------------
  await test('2. Multiple bookings on same day for same driver remain completely separated', async () => {
    // Morning booking
    const morningReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        id: LOG_MORNING_UUID,
        bookingId: BOOKING_MORNING_UUID,
        driverName: '윤태준',
        vehiclePlate: '116허 1514',
        drivingDate: '2026-11-09',
        startKm: '154,000',
        endKm: '154,050',
        stops: [{ placeName: '김포공항', time: '09:00', purpose: '오전 이동' }],
        isDraft: false,
      }),
    });
    await postDrivingLogs(morningReq);

    // Afternoon booking
    const afternoonReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        id: LOG_AFTERNOON_UUID,
        bookingId: BOOKING_AFTERNOON_UUID,
        driverName: '윤태준',
        vehiclePlate: '116허 1514',
        drivingDate: '2026-11-09',
        startKm: '154,050',
        endKm: '154,120',
        stops: [{ placeName: '강남 코엑스', time: '14:00', purpose: '오후 행사' }],
        isDraft: false,
      }),
    });
    await postDrivingLogs(afternoonReq);

    // HQ queries all logs for 2026-11-09
    const getReq = new NextRequest('http://localhost:3000/api/driving-logs?date=2026-11-09', {
      method: 'GET',
      headers: { Authorization: `Bearer ${hqAdminToken}` },
    });
    const getRes = await getDrivingLogs(getReq);
    const getData = await getRes.json();
    const morningLog = getData.logs.find((l: any) => l.bookingId === BOOKING_MORNING_UUID);
    const afternoonLog = getData.logs.find((l: any) => l.bookingId === BOOKING_AFTERNOON_UUID);

    assert.ok(morningLog, 'Morning booking driving log must exist');
    assert.ok(afternoonLog, 'Afternoon booking driving log must exist');
    assert.notStrictEqual(morningLog.id, afternoonLog.id, 'Must be separate records');
    assert.strictEqual(morningLog.startKm, '154,000');
    assert.strictEqual(afternoonLog.startKm, '154,050');
  });

  // --------------------------------------------------------------------------
  // 3. Service-role API 우회 차단 (Server-side Authorization Barrier)
  // --------------------------------------------------------------------------
  await test('3. Service-role API bypass prevention: rejects unassigned booking, spoofed driverId, and self-approval', async () => {
    // 3.1: Driver A tries to query Driver B's logs by passing Driver B's driverId -> 403 Forbidden
    const driverBReq = new NextRequest(`http://localhost:3000/api/driving-logs?driverId=${DRIVER_B_UUID}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${driverAToken}` },
    });
    const driverBRes = await getDrivingLogs(driverBReq);
    assert.strictEqual(driverBRes.status, 403, 'Driver querying another driver logs must be rejected with 403');

    // 3.2: Driver A tries to submit a log with Driver B's driverId -> 403 Forbidden
    const spoofReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        driverId: DRIVER_B_UUID,
        drivingDate: '2026-11-09',
        startKm: '100',
        endKm: '200',
        stops: [{ placeName: '강남', time: '10:00' }],
      }),
    });
    const spoofRes = await postDrivingLogs(spoofReq);
    assert.strictEqual(spoofRes.status, 403, 'Driver spoofing another driverId must be rejected with 403');

    // 3.3: Driver A tries to submit a log for a booking assigned ONLY to Driver B -> 403 Forbidden
    const unassignedBookingReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        bookingId: BOOKING_DRIVER_B_ONLY_UUID,
        drivingDate: '2026-11-09',
        startKm: '100',
        endKm: '200',
        stops: [{ placeName: '강남', time: '10:00' }],
      }),
    });
    const unassignedBookingRes = await postDrivingLogs(unassignedBookingReq);
    assert.strictEqual(unassignedBookingRes.status, 403, 'Submitting log for unassigned booking must return 403');

    // 3.4: Driver A tries to directly set status to '승인 완료' -> 403 Forbidden
    const selfApproveReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        status: '승인 완료',
        drivingDate: '2026-11-09',
        startKm: '100',
        endKm: '200',
        stops: [{ placeName: '강남', time: '10:00' }],
      }),
    });
    const selfApproveRes = await postDrivingLogs(selfApproveReq);
    assert.strictEqual(selfApproveRes.status, 403, 'Driver self-approval must be rejected with 403');

    // 3.5: Non-admin driver attempting HQ review status modification via PUT -> 403 Forbidden
    const unauthPutReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({ id: LOG_ROUNDTRIP_UUID, status: '승인 완료' }),
    });
    const unauthPutRes = await putDrivingLogs(unauthPutReq);
    assert.strictEqual(unauthPutRes.status, 403, 'Driver cannot access HQ Admin PUT review API');
  });

  // --------------------------------------------------------------------------
  // 4. DB 저장 실패 시 가짜 제출 완료 방지
  // --------------------------------------------------------------------------
  await test('4. DB failure prevents false "제출 완료" confirmation', async () => {
    simulateDbError = true;
    try {
      const failReq = new NextRequest('http://localhost:3000/api/driving-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverAToken}`,
        },
        body: JSON.stringify({
          id: LOG_FAIL_UUID,
          bookingId: BOOKING_FAIL_UUID,
          driverName: '윤태준',
          vehiclePlate: '116허 1514',
          drivingDate: '2026-11-09',
          startKm: '154,725',
          endKm: '154,861',
          stops: [{ placeName: '강남', time: '10:00' }],
          isDraft: false,
        }),
      });
      const failRes = await postDrivingLogs(failReq);
      assert.strictEqual(failRes.status, 500, 'Server should respond with 500 on DB failure');
      const failData = await failRes.json();
      assert.strictEqual(failData.ok, false);
      assert.ok(failData.error, 'Error message must be returned');
    } finally {
      simulateDbError = false;
    }
  });

  // --------------------------------------------------------------------------
  // 5. 중복 제출로 인한 이중 기록 방지 (Idempotent submission)
  // --------------------------------------------------------------------------
  await test('5. Idempotent submission updates existing row without duplicate records', async () => {
    const originalCount = mockDrivingLogs.length;

    const updateReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        id: LOG_ROUNDTRIP_UUID,
        bookingId: BOOKING_CHANEL_UUID,
        driverName: '윤태준',
        vehiclePlate: '116허 1514',
        drivingDate: '2026-11-09',
        startKm: '154,725',
        endKm: '154,861',
        notes: 'VIP 고객 정시 도착 완료 및 특이사항 없음 (재제출)',
        stops: [{ placeName: '인천공항 T1', time: '10:00' }],
        isDraft: false,
      }),
    });
    const updateRes = await postDrivingLogs(updateReq);
    assert.strictEqual(updateRes.status, 200);

    const postUpdateCount = mockDrivingLogs.length;
    assert.strictEqual(postUpdateCount, originalCount, 'Row count must NOT increase on duplicate ID submission');

    const updated = mockDrivingLogs.find((l) => l.id === LOG_ROUNDTRIP_UUID);
    assert.ok(updated?.notes?.includes('(재제출)'), 'Existing row must be safely updated');
  });

  // --------------------------------------------------------------------------
  // 6. 차량체크 km 연결 오류 방지
  // --------------------------------------------------------------------------
  await test('6. Vehicle inspection odometer is isolated by booking and prevents wrong odometer linkage', () => {
    const storageStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (k: string) => storageStore[k] || null,
      setItem: (k: string, v: string) => { storageStore[k] = v; },
      removeItem: (k: string) => { delete storageStore[k]; },
    };
    (global as any).window = {};
    (global as any).localStorage = mockLocalStorage;

    const todayIso = new Date().toISOString().split('T')[0];

    mockLocalStorage.setItem(
      'cockpit_vehicle_inspection_116허 1514_booking-101',
      JSON.stringify({
        bookingId: 'booking-101',
        savedAt: new Date().toISOString(),
        pickupOdo: '150,000',
        returnOdo: '150,100',
      })
    );

    mockLocalStorage.setItem(
      'cockpit_vehicle_inspection_116허 1514_booking-102',
      JSON.stringify({
        bookingId: 'booking-102',
        savedAt: new Date().toISOString(),
        pickupOdo: '150,100',
        returnOdo: '150,250',
      })
    );

    const odo101 = getVerifiedInspectionOdometer('116허 1514', todayIso, 'booking-101');
    assert.strictEqual(odo101.startKm, '150,000');
    assert.strictEqual(odo101.endKm, '150,100');
    assert.strictEqual(odo101.isVerified, true);

    const odo102 = getVerifiedInspectionOdometer('116허 1514', todayIso, 'booking-102');
    assert.strictEqual(odo102.startKm, '150,100');
    assert.strictEqual(odo102.endKm, '150,250');
    assert.strictEqual(odo102.isVerified, true);

    const odoUnknown = getVerifiedInspectionOdometer('116허 1514', todayIso, 'booking-999-unrelated');
    assert.strictEqual(odoUnknown.startKm, '', 'Must not grab unrelated booking odometer');
    assert.strictEqual(odoUnknown.isVerified, false);
  });

  // --------------------------------------------------------------------------
  // 7. 영수증 Private Storage 소유권 검증 및 Mock 제거 검증
  // --------------------------------------------------------------------------
  await test('7. Receipt storage: verified ownership download, path traversal block, and zero simulated upload error', async () => {
    // 7.1: Driver A submits expense with private receipt path
    const expensePostReq = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            id: EXPENSE_RECEIPT_UUID,
            bookingId: BOOKING_CHANEL_UUID,
            date: '2026-10-24',
            time: '12:30',
            category: 'gas',
            merchant: 'GS칼텍스 삼정주유소',
            amount: 75000,
            paymentMethod: 'company_card',
            receiptStoragePath: RECEIPT_STORAGE_PATH,
          },
        ],
      }),
    });
    const expPostRes = await postExpenses(expensePostReq);
    assert.strictEqual(expPostRes.status, 200);

    // 7.2: Driver A accesses their own expense receipt -> 200 OK
    const authReceiptReq = new NextRequest(`http://localhost:3000/api/expenses/receipt?expenseId=${EXPENSE_RECEIPT_UUID}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${driverAToken}` },
    });
    const authReceiptRes = await getReceipt(authReceiptReq);
    assert.strictEqual(authReceiptRes.status, 200, 'Owner driver must be able to view their receipt');
    assert.strictEqual(authReceiptRes.headers.get('Cache-Control'), 'private, max-age=3600');

    // 7.3: Driver B tries to access Driver A's receipt -> 403 Forbidden
    const unauthReceiptReq = new NextRequest(`http://localhost:3000/api/expenses/receipt?expenseId=${EXPENSE_RECEIPT_UUID}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${driverBToken}` },
    });
    const unauthReceiptRes = await getReceipt(unauthReceiptReq);
    assert.strictEqual(unauthReceiptRes.status, 403, 'Driver B must NOT access Driver A receipt (403)');

    // 7.4: Path traversal attempt with expenseId -> 400 Bad Request
    const traversalReq = new NextRequest('http://localhost:3000/api/expenses/receipt?path=vip_limousine_korea/../etc/passwd', {
      method: 'GET',
      headers: { Authorization: `Bearer ${driverAToken}` },
    });
    const traversalRes = await getReceipt(traversalReq);
    assert.strictEqual(traversalRes.status, 400, 'Path traversal must be rejected with 400');

    // 7.5: Zero simulated upload error: storage failure must return 500
    simulateStorageError = true;
    try {
      const formData = new FormData();
      const mockBlob = new Blob(['mock-data'], { type: 'image/jpeg' });
      formData.append('file', mockBlob, 'receipt.jpg');

      const uploadReq = new NextRequest('http://localhost:3000/api/expenses/receipt', {
        method: 'POST',
        headers: { Authorization: `Bearer ${driverAToken}` },
        body: formData,
      });
      const uploadRes = await postReceipt(uploadReq);
      assert.strictEqual(uploadRes.status, 500, 'Storage upload failure must return 500, never simulated 200');
      const uploadData = await uploadRes.json();
      assert.strictEqual(uploadData.ok, false);
      assert.strictEqual(uploadData.simulated, undefined, 'Must not return simulated: true');
    } finally {
      simulateStorageError = false;
    }
  });

  // --------------------------------------------------------------------------
  // 8. HQ 승인 후 수정 이력 보존
  // --------------------------------------------------------------------------
  await test('8. HQ review & approval audit trail is preserved across status transitions', async () => {
    // 1st Transition: HQ Admin approves driving log
    const approveReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqAdminToken}`,
      },
      body: JSON.stringify({
        id: LOG_ROUNDTRIP_UUID,
        status: '승인 완료',
        reviewNotes: '모든 증빙 확인 및 운행거리 일치',
      }),
    });
    const approveRes = await putDrivingLogs(approveReq);
    assert.strictEqual(approveRes.status, 200);
    const approveData = await approveRes.json();
    assert.strictEqual(approveData.log.status, '승인 완료');
    assert.strictEqual(approveData.log.reviewHistory.length, 1);
    assert.strictEqual(approveData.log.reviewHistory[0].actionType, 'approved');

    // 2nd Transition: HQ Admin requests revision
    const reviseReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hqAdminToken}`,
      },
      body: JSON.stringify({
        id: LOG_ROUNDTRIP_UUID,
        status: '보완 필요',
        reviewNotes: '영수증 1건 추가 제출 요청',
      }),
    });
    const reviseRes = await putDrivingLogs(reviseReq);
    assert.strictEqual(reviseRes.status, 200);
    const reviseData = await reviseRes.json();
    assert.strictEqual(reviseData.log.status, '보완 필요');
    assert.strictEqual(reviseData.log.reviewHistory.length, 2, 'History must append without overwriting previous history');
    assert.strictEqual(reviseData.log.reviewHistory[0].actionType, 'revision_requested');
    assert.strictEqual(reviseData.log.reviewHistory[1].actionType, 'approved');
  });

  // --------------------------------------------------------------------------
  // 9. [Item 1] JWT user_metadata privilege escalation vulnerability defense
  // --------------------------------------------------------------------------
  await test('9. Attacker manipulating user_metadata.cockpit_role: "hq_admin" strictly rejected with 403 on HQ endpoints', async () => {
    // Attacker token has user_metadata: { cockpit_role: 'hq_admin' } but app_metadata: { cockpit_role: 'driver' }
    const attackerPutReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt.attacker.escalate',
      },
      body: JSON.stringify({
        id: LOG_ROUNDTRIP_UUID,
        status: '승인 완료',
      }),
    });
    const attackerPutRes = await putDrivingLogs(attackerPutReq);
    assert.strictEqual(attackerPutRes.status, 403, 'Privilege escalation via user_metadata MUST return 403 Forbidden');

    const attackerExpPutReq = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt.attacker.escalate',
      },
      body: JSON.stringify({
        id: EXPENSE_RECEIPT_UUID,
        status: '승인 완료',
      }),
    });
    const attackerExpPutRes = await putExpenses(attackerExpPutReq);
    assert.strictEqual(attackerExpPutRes.status, 403, 'Privilege escalation on expenses PUT MUST return 403 Forbidden');

    // Attacker attempting cross-organization spoofing via user_metadata
    const evilOrgReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'GET',
      headers: { Authorization: 'Bearer jwt.untrusted.org' },
    });
    const evilOrgRes = await getDrivingLogs(evilOrgReq);
    assert.strictEqual(evilOrgRes.status, 401, 'Untrusted org in app_metadata MUST return 401 Unauthorized');
  });

  // --------------------------------------------------------------------------
  // 10. [Item 2] Receipt storage path-only & cross-driver bypass defense
  // --------------------------------------------------------------------------
  await test('10. Receipt security: path-only request rejected with 400, same-org cross-driver strictly blocked', async () => {
    // 10.1: Path parameter only (without expenseId) -> strictly rejected with 400
    const pathOnlyReq = new NextRequest(`http://localhost:3000/api/expenses/receipt?path=${encodeURIComponent(RECEIPT_STORAGE_PATH)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${driverAToken}` },
    });
    const pathOnlyRes = await getReceipt(pathOnlyReq);
    assert.strictEqual(pathOnlyRes.status, 400, 'Path-only request without expenseId must return 400 Bad Request');
    const pathOnlyData = await pathOnlyRes.json();
    assert.strictEqual(pathOnlyData.ok, false);
    assert.ok(pathOnlyData.error.includes('expenseId'), 'Error must specify that expenseId is strictly required');

    // 10.2: Uploading receipt creates path prefixed with ${org}/${driverId}/...
    const formData = new FormData();
    const mockBlob = new Blob(['mock-receipt-data-bytes'], { type: 'image/jpeg' });
    formData.append('file', mockBlob, 'my_receipt.jpg');

    const uploadReq = new NextRequest('http://localhost:3000/api/expenses/receipt', {
      method: 'POST',
      headers: { Authorization: `Bearer ${driverAToken}` },
      body: formData,
    });
    const uploadRes = await postReceipt(uploadReq);
    assert.strictEqual(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.ok(uploadData.storagePath.startsWith(`vip_limousine_korea/expenses/receipts/${DRIVER_A_UUID}/`),
      `Uploaded storagePath (${uploadData.storagePath}) MUST start with org/expenses/receipts/driverId prefix`);
  });

  // --------------------------------------------------------------------------
  // 11. [Item 3] Loose driver_name matching bypass prevention
  // --------------------------------------------------------------------------
  await test('11. Loose name matching bypass prevention: matching driver_name with foreign driver_id UUID strictly rejected', async () => {
    // Driver A attempts to submit a driving log for a schedule with matching name "윤태준" but foreign driver_id (Driver B's UUID)
    const spoofSchedLogReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        bookingId: BOOKING_SPOOFED_NAME_UUID,
        drivingDate: '2026-11-09',
        startKm: '100',
        endKm: '200',
        stops: [{ placeName: '강남', time: '10:00' }],
      }),
    });
    const spoofSchedLogRes = await postDrivingLogs(spoofSchedLogReq);
    assert.strictEqual(spoofSchedLogRes.status, 403, 'Schedule with matching driver_name but different driver_id UUID MUST return 403');

    // Driver A attempts to submit an expense for the same loosely matched schedule
    const spoofSchedExpReq = new NextRequest('http://localhost:3000/api/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            bookingId: BOOKING_SPOOFED_NAME_UUID,
            date: '2026-11-09',
            category: 'gas',
            merchant: '주유소',
            amount: 50000,
          },
        ],
      }),
    });
    const spoofSchedExpRes = await postExpenses(spoofSchedExpReq);
    assert.strictEqual(spoofSchedExpRes.status, 403, 'Expense with matching driver_name but different driver_id UUID MUST return 403');
  });

  // --------------------------------------------------------------------------
  // 12. [Item 4] Honest DB failure: GET APIs return 500 (never disguised { ok: true, logs: [] })
  // --------------------------------------------------------------------------
  await test('12. Honest DB failure: GET /api/driving-logs and GET /api/expenses return 500 on DB error (zero fake success)', async () => {
    simulateDbError = true;
    try {
      const getLogsReq = new NextRequest('http://localhost:3000/api/driving-logs', {
        method: 'GET',
        headers: { Authorization: `Bearer ${hqAdminToken}` },
      });
      const getLogsRes = await getDrivingLogs(getLogsReq);
      assert.strictEqual(getLogsRes.status, 500, 'GET /api/driving-logs must return 500 on DB query failure');
      const logsData = await getLogsRes.json();
      assert.strictEqual(logsData.ok, false);
      assert.ok(logsData.error, 'Error message must be present');

      const getExpensesReq = new NextRequest('http://localhost:3000/api/expenses', {
        method: 'GET',
        headers: { Authorization: `Bearer ${hqAdminToken}` },
      });
      const getExpensesRes = await getExpenses(getExpensesReq);
      assert.strictEqual(getExpensesRes.status, 500, 'GET /api/expenses must return 500 on DB query failure');
      const expensesData = await getExpensesRes.json();
      assert.strictEqual(expensesData.ok, false);
      assert.ok(expensesData.error, 'Error message must be present');
    } finally {
      simulateDbError = false;
    }
  });

  // --------------------------------------------------------------------------
  // 13. [Item 5] Real PostgreSQL RFC 4122 UUID v4 enforcement across all tables
  // --------------------------------------------------------------------------
  await test('13. Real PostgreSQL RFC 4122 UUID v4 formatting across all records and responses', async () => {
    const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Check driving log row
    const drivingLog = mockDrivingLogs.find((l) => l.id === LOG_ROUNDTRIP_UUID);
    assert.ok(drivingLog, 'Driving log must be present');
    assert.match(drivingLog.id, UUID_V4_REGEX, 'Driving log ID must be a valid UUID v4');
    assert.match(drivingLog.driver_id!, UUID_V4_REGEX, 'driver_id must be a valid UUID v4');
    assert.match(drivingLog.booking_id!, UUID_V4_REGEX, 'booking_id must be a valid UUID v4');

    // Check expense row
    const expense = mockExpenses.find((e) => e.id === EXPENSE_RECEIPT_UUID);
    assert.ok(expense, 'Expense must be present');
    assert.match(expense.id, UUID_V4_REGEX, 'Expense ID must be a valid UUID v4');
    assert.match(expense.driver_id!, UUID_V4_REGEX, 'Expense driver_id must be a valid UUID v4');
    assert.match(expense.booking_id!, UUID_V4_REGEX, 'Expense booking_id must be a valid UUID v4');

    // Auto-generate UUID when temporary non-UUID is passed
    const autoUuidReq = new NextRequest('http://localhost:3000/api/driving-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAToken}`,
      },
      body: JSON.stringify({
        id: 'driver-sub-temp-12345', // Frontend temporary ID
        drivingDate: '2026-11-09',
        startKm: '100',
        endKm: '200',
        stops: [{ placeName: '강남', time: '10:00' }],
      }),
    });
    const autoUuidRes = await postDrivingLogs(autoUuidReq);
    assert.strictEqual(autoUuidRes.status, 200);
    const autoUuidData = await autoUuidRes.json();
    assert.match(autoUuidData.log.id, UUID_V4_REGEX, 'Server MUST assign an RFC 4122 UUID v4 when temporary ID is passed');
  });
});
