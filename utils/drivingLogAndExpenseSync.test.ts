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

  const mockSchedules = [
    {
      id: 'booking-chanel-001',
      customer_name: '샤넬코리아',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: 'b6aac740-002e-4a5c-ac49-0ac71e765340' },
    },
    {
      id: 'booking-20261109-morning',
      customer_name: '오전 고객사',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: 'b6aac740-002e-4a5c-ac49-0ac71e765340' },
    },
    {
      id: 'booking-20261109-afternoon',
      customer_name: '오후 고객사',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: 'b6aac740-002e-4a5c-ac49-0ac71e765340' },
    },
    {
      id: 'booking-fail',
      customer_name: '오류 테스트 고객사',
      driver_name: '윤태준',
      vehicle_plate: '116허 1514',
      vehicle_no: '116허 1514',
      schedule_meta: { driver_id: 'b6aac740-002e-4a5c-ac49-0ac71e765340' },
    },
    {
      id: 'booking-driver-b-only',
      customer_name: '민성호 전용 고객사',
      driver_name: '민성호',
      vehicle_plate: '142호 7815',
      vehicle_no: '8호차',
      schedule_meta: { driver_id: 'a85444a9-f13e-4b52-9a81-ac09995ab66a' },
    },
  ];

  // Mock Storage Bucket for private receipts
  const mockStorageFiles: Record<string, { buffer: Buffer; contentType: string }> = {
    'vip_limousine_korea/2026/10/receipt_sample_01.jpg': {
      buffer: Buffer.from('mock-jpeg-receipt-bytes-data'),
      contentType: 'image/jpeg',
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

  // Driver A (윤태준), Driver B (민성호), HQ Admin
  const driverAToken = signCockpitSession({
    userId: 'driver-001',
    org: 'vip_limousine_korea',
    role: 'driver',
    driverName: '윤태준',
    driverId: 'b6aac740-002e-4a5c-ac49-0ac71e765340',
    carNumber: '116허 1514',
    vehicleNo: '116허 1514',
  });

  const driverBToken = signCockpitSession({
    userId: 'driver-002',
    org: 'vip_limousine_korea',
    role: 'driver',
    driverName: '민성호',
    driverId: 'a85444a9-f13e-4b52-9a81-ac09995ab66a',
    carNumber: '142호 7815',
    vehicleNo: '8호차',
  });

  const hqAdminToken = signCockpitSession({
    userId: 'hq-admin-01',
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
        id: 'log-roundtrip-01',
        bookingId: 'booking-chanel-001',
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
    const getReq = new NextRequest('http://localhost:3000/api/driving-logs?bookingId=booking-chanel-001', {
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
        id: 'log-same-day-morning',
        bookingId: 'booking-20261109-morning',
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
        id: 'log-same-day-afternoon',
        bookingId: 'booking-20261109-afternoon',
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
    const morningLog = getData.logs.find((l: any) => l.bookingId === 'booking-20261109-morning');
    const afternoonLog = getData.logs.find((l: any) => l.bookingId === 'booking-20261109-afternoon');

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
    const driverBReq = new NextRequest('http://localhost:3000/api/driving-logs?driverId=a85444a9-f13e-4b52-9a81-ac09995ab66a', {
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
        driverId: 'a85444a9-f13e-4b52-9a81-ac09995ab66a',
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
        bookingId: 'booking-driver-b-only',
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
      body: JSON.stringify({ id: 'log-roundtrip-01', status: '승인 완료' }),
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
          id: 'log-fail-simulation',
          bookingId: 'booking-fail',
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
        id: 'log-roundtrip-01',
        bookingId: 'booking-chanel-001',
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

    const updated = mockDrivingLogs.find((l) => l.id === 'log-roundtrip-01');
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
            id: 'exp-with-receipt-01',
            bookingId: 'booking-chanel-001',
            date: '2026-10-24',
            time: '12:30',
            category: 'gas',
            merchant: 'GS칼텍스 삼정주유소',
            amount: 75000,
            paymentMethod: 'company_card',
            receiptStoragePath: 'vip_limousine_korea/2026/10/receipt_sample_01.jpg',
          },
        ],
      }),
    });
    const expPostRes = await postExpenses(expensePostReq);
    assert.strictEqual(expPostRes.status, 200);

    // 7.2: Driver A accesses their own expense receipt -> 200 OK
    const authReceiptReq = new NextRequest('http://localhost:3000/api/expenses/receipt?expenseId=exp-with-receipt-01', {
      method: 'GET',
      headers: { Authorization: `Bearer ${driverAToken}` },
    });
    const authReceiptRes = await getReceipt(authReceiptReq);
    assert.strictEqual(authReceiptRes.status, 200, 'Owner driver must be able to view their receipt');
    assert.strictEqual(authReceiptRes.headers.get('Cache-Control'), 'private, max-age=3600');

    // 7.3: Driver B tries to access Driver A's receipt -> 403 Forbidden
    const unauthReceiptReq = new NextRequest('http://localhost:3000/api/expenses/receipt?expenseId=exp-with-receipt-01', {
      method: 'GET',
      headers: { Authorization: `Bearer ${driverBToken}` },
    });
    const unauthReceiptRes = await getReceipt(unauthReceiptReq);
    assert.strictEqual(unauthReceiptRes.status, 403, 'Driver B must NOT access Driver A receipt (403)');

    // 7.4: Path traversal attempt -> 400 Bad Request
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
        id: 'log-roundtrip-01',
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
        id: 'log-roundtrip-01',
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
});
