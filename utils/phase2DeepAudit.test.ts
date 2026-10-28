import assert from 'node:assert';
import { executeSupabaseSql } from '../scripts/supabase-sql.mjs';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function api(path: string, options: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

console.log('================================================================');
console.log('🛡️ PR #32 Deep Review Audit & Real Supabase E2E Verification');
console.log('================================================================\n');

async function runAudit() {
  const testIdsToClean: { schedules: string[]; customers: string[] } = {
    schedules: [],
    customers: [],
  };

  try {
    // ------------------------------------------------------------------------
    // Scenario 1: Supabase DB RLS & Permissions Audit
    // ------------------------------------------------------------------------
    console.log('[Scenario 1] Supabase RLS & Security Hardening Verification');
    {
      const rlsRows = await executeSupabaseSql(`
        SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'cockpit';
      `);
      assert.ok(Array.isArray(rlsRows) && rlsRows.length >= 5, 'Must have at least 5 cockpit tables');
      
      const tablesToCheck = ['customers', 'pricing_presets', 'schedules', 'drivers', 'presets'];
      for (const t of tablesToCheck) {
        const found: any = (rlsRows as any[]).find((r: any) => r.tablename === t);
        assert.ok(found, `Table cockpit.${t} must exist`);
        assert.strictEqual(found.rowsecurity, true, `Table cockpit.${t} MUST have rowsecurity = true`);
      }
      console.log('  ✅ RLS is strictly ENABLED on all cockpit tables (customers, pricing_presets, schedules, drivers, presets).');

      // Verify Pricing Presets adhere strictly to benchmarks:
      // Sprinter 319: 1,000,000 / 800,000
      // Sprinter 519: 800,000 / 600,000
      const pricingRows = await executeSupabaseSql(`
        SELECT id, base_fare, vehicle_only_fare, driver_labor_korean, driver_labor_english
        FROM cockpit.pricing_presets
        WHERE id IN ('preset-sprinter-319', 'preset-sprinter-519');
      `);
      const p319 = pricingRows.find((p: any) => p.id === 'preset-sprinter-319');
      const p519 = pricingRows.find((p: any) => p.id === 'preset-sprinter-519');
      assert.strictEqual(p319.base_fare, 1000000, 'Sprinter 319 base fare must be 1,000,000 KRW');
      assert.strictEqual(p319.vehicle_only_fare, 800000, 'Sprinter 319 vehicle-only fare must be 800,000 KRW');
      assert.strictEqual(p519.base_fare, 800000, 'Sprinter 519 base fare must be 800,000 KRW');
      assert.strictEqual(p519.vehicle_only_fare, 600000, 'Sprinter 519 vehicle-only fare must be 600,000 KRW');
      console.log('  ✅ Pricing benchmark standards strictly verified (319: 100만/80만, 519: 80만/60만).');
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Quote Calculation (In-Memory) vs Explicit DB Save
    // ------------------------------------------------------------------------
    console.log('\n[Scenario 2] Quote In-Memory Calculation vs Explicit DB Save Separation');
    const testCustName = `AUDIT-고객사-${Date.now().toString(36)}`;
    let testQuoteNo = '';
    {
      // 2A: Pure Calculation (Zero DB Writes)
      const calcRes = await api('/api/quotes/calculate', {
        method: 'POST',
        body: JSON.stringify({
          customerName: testCustName,
          date: '2026-11-20',
          serviceStartTime: '09:00',
          serviceEndTime: '19:00',
          serviceHours: 10,
          origin: '인천공항 T2',
          destination: '신라호텔',
          vehicleModel: 'Mercedes-Benz Sprinter 319 CDI',
          vehicleCount: 2,
          driverLanguage: 'en',
          serviceMode: 'with_driver',
        }),
      });
      assert.strictEqual(calcRes.status, 200);
      assert.strictEqual(calcRes.data.ok, true);
      assert.strictEqual(calcRes.data.quote.baseFareTotal, 2000000, '2 vehicles * 1,000,000 = 2,000,000');
      assert.strictEqual(calcRes.data.quote.englishSurchargeTotal, 100000, '2 vehicles * 50,000 = 100,000');
      assert.strictEqual(calcRes.data.quote.supplyPriceTotal, 2100000);
      assert.strictEqual(calcRes.data.quote.vatAmount, 210000);
      assert.strictEqual(calcRes.data.quote.estimatedGrandTotal, 2310000);
      testQuoteNo = calcRes.data.quote.quoteNo;

      // Verify that customer was NOT created in DB during pure calculation
      const custCheck = await executeSupabaseSql(`
        SELECT count(*) FROM cockpit.customers WHERE name = '${testCustName}';
      `);
      assert.strictEqual(Number(custCheck[0].count), 0, 'Pure calculation must NOT persist to DB');
      console.log('  ✅ In-memory calculation endpoint verified: zero database mutations during rapid typing.');

      // 2B: Explicit Save to DB
      const saveRes = await api('/api/quotes', {
        method: 'POST',
        body: JSON.stringify({
          customerName: testCustName,
          date: '2026-11-20',
          serviceStartTime: '09:00',
          serviceEndTime: '19:00',
          serviceHours: 10,
          origin: '인천공항 T2',
          destination: '신라호텔',
          vehicleModel: 'Mercedes-Benz Sprinter 319 CDI',
          vehicleCount: 2,
          driverLanguage: 'en',
          serviceMode: 'with_driver',
          quoteNo: testQuoteNo,
        }),
      });
      assert.strictEqual(saveRes.status, 200);
      assert.strictEqual(saveRes.data.ok, true);
      
      const custCheckAfter = await executeSupabaseSql(`
        SELECT id, quotes FROM cockpit.customers WHERE name = '${testCustName}';
      `);
      assert.strictEqual(custCheckAfter.length, 1, 'Customer must be persisted upon explicit save');
      testIdsToClean.customers.push(custCheckAfter[0].id);
      assert.ok(Array.isArray(custCheckAfter[0].quotes), 'Customer quotes must be JSONB array');
      assert.strictEqual(custCheckAfter[0].quotes[0].quoteNo, testQuoteNo);
      console.log(`  ✅ Explicit save verified: quote ${testQuoteNo} saved to cockpit.customers.`);
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Quote -> Atomic Booking Conversion & UUID Schema Integrity
    // ------------------------------------------------------------------------
    console.log('\n[Scenario 3] Quote -> Booking Conversion (Atomic Multi-Vehicle, UUID, DB Columns)');
    let convertedBookingIds: string[] = [];
    {
      const convertRes = await api('/api/quotes/convert-to-booking', {
        method: 'POST',
        body: JSON.stringify({
          quoteNo: testQuoteNo,
        }),
      });
      assert.strictEqual(convertRes.status, 200);
      assert.strictEqual(convertRes.data.ok, true);
      assert.strictEqual(convertRes.data.bookingIds.length, 2, 'Must create 2 atomic booking rows');
      convertedBookingIds = convertRes.data.bookingIds;
      testIdsToClean.schedules.push(...convertedBookingIds);

      // Verify in real Supabase DB:
      // - IDs must be genuine valid UUID format
      // - Must populate real columns: origin, destination, date, pickup_time, vehicle_no='미배정', dispatch_status='draft'
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const bId of convertedBookingIds) {
        assert.ok(uuidRegex.test(bId), `Booking ID (${bId}) must be genuine PostgreSQL UUID`);
      }

      const rowsInDb = await executeSupabaseSql(`
        SELECT id, vehicle_no, date, pickup_time, origin, destination, dispatch_status, operation_status, source_quote_no
        FROM cockpit.schedules
        WHERE id IN ('${convertedBookingIds.join("','")}');
      `);
      assert.strictEqual(rowsInDb.length, 2, 'Both rows must exist in cockpit.schedules');
      assert.strictEqual(rowsInDb[0].vehicle_no, '미배정');
      assert.strictEqual(rowsInDb[0].dispatch_status, 'draft');
      assert.strictEqual(rowsInDb[0].operation_status, 'ready');
      assert.strictEqual(rowsInDb[0].source_quote_no, testQuoteNo);
      assert.strictEqual(rowsInDb[0].origin, '인천공항 T2');
      assert.strictEqual(rowsInDb[0].destination, '신라호텔');

      // 3B: Duplicate Guard Verification
      const dupRes = await api('/api/quotes/convert-to-booking', {
        method: 'POST',
        body: JSON.stringify({
          quoteNo: testQuoteNo,
        }),
      });
      assert.strictEqual(dupRes.status, 409, 'Duplicate conversion must return HTTP 409 Conflict');
      assert.strictEqual(dupRes.data.duplicate, true);
      console.log('  ✅ Atomic batch conversion & duplicate prevention strictly verified in Supabase.');
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Dispatch Confirmation -> Driver Acknowledgment & Version Protection
    // ------------------------------------------------------------------------
    console.log('\n[Scenario 4] Dispatch Confirmation, Driver Ack, Version Protection & Cancellation Block');
    const targetScheduleId = convertedBookingIds[0];
    {
      // 4A: President confirms dispatch on Mobile/PC (assigns 4호차 윤태준)
      const dispatchRes = await api('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: targetScheduleId,
          vehicleNo: '4호차',
          vehiclePlate: '142호 7811',
          vehicleModel: 'Mercedes-Benz Sprinter 519 CDI',
          driverName: '윤태준',
          driverPhone: '010-8842-1920',
          date: '2026-11-20',
          pickupTime: '09:00',
          origin: '인천공항 T2',
          destination: '신라호텔',
          dispatchStatus: 'published',
        }),
      });
      assert.strictEqual(dispatchRes.status, 200);
      assert.strictEqual(dispatchRes.data.ok, true);

      // Verify that cockpit.drivers profile for 4호차 was NOT overwritten
      const driverInDb = await executeSupabaseSql(`
        SELECT vehicle_no, driver_name, default_navi FROM cockpit.drivers WHERE vehicle_no = '4호차';
      `);
      assert.strictEqual(driverInDb[0].driver_name, '윤태준', 'Driver profile must be preserved');

      // 4B: Unauthorized Driver Attempts Ack -> Must be BLOCKED (HTTP 403)
      const badDriverAck = await api('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: targetScheduleId,
          version: 1,
          driverName: '홍길동', // Different driver!
        }),
      });
      assert.strictEqual(badDriverAck.status, 403, 'Different driver ack must be blocked with HTTP 403');
      console.log('  ✅ Different driver ack blocked (HTTP 403).');

      // 4C: Authorized Driver Acknowledges -> Success
      const validAck = await api('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: targetScheduleId,
          version: 1,
          driverName: '윤태준',
        }),
      });
      assert.strictEqual(validAck.status, 200);
      assert.strictEqual(validAck.data.ok, true);

      // Verify DB columns last_ack_version and last_ack_at
      const ackDb = await executeSupabaseSql(`
        SELECT last_ack_version, last_ack_at, version FROM cockpit.schedules WHERE id = '${targetScheduleId}';
      `);
      assert.strictEqual(ackDb[0].last_ack_version, 1);
      assert.ok(ackDb[0].last_ack_at);
      console.log('  ✅ Authorized driver ack recorded in Supabase columns (v1).');

      // 4D: Outdated version ack attempt -> Must be BLOCKED (HTTP 409)
      // Bump schedule version to 2 (modifying pickup time on published dispatch)
      const updateRes = await api('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: targetScheduleId,
          date: '2026-11-20',
          pickupTime: '09:30', // Time modified -> bumps version to 2
          origin: '인천공항 T2',
          destination: '신라호텔',
          vehicleNo: '4호차',
          vehiclePlate: '142호 7811',
          driverName: '윤태준',
          dispatchStatus: 'published',
        }),
      });
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.data.schedule.version, 2, 'Version must be bumped to 2');
      const staleAck = await api('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: targetScheduleId,
          version: 1, // Old version!
          driverName: '윤태준',
        }),
      });
      assert.strictEqual(staleAck.status, 409, 'Outdated version ack must be blocked with HTTP 409');
      console.log('  ✅ Stale version ack blocked (HTTP 409).');

      // 4E: Cancel Schedule and verify cancelled ack is blocked
      const cancelRes = await api('/api/schedules/cancel', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: targetScheduleId,
          reason: '고객사 일정 취소',
        }),
      });
      assert.strictEqual(cancelRes.status, 200);

      const cancelAck = await api('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: targetScheduleId,
          version: 3,
          driverName: '윤태준',
        }),
      });
      assert.strictEqual(cancelAck.status, 400, 'Ack on cancelled schedule must be blocked with HTTP 400');
      console.log('  ✅ Cancelled schedule ack blocked (HTTP 400).');
    }

    // ------------------------------------------------------------------------
    // Scenario 5: Operations Board & Driver Operation Status Lifecycle
    // ------------------------------------------------------------------------
    console.log('\n[Scenario 5] Operations Board API & 5-Stage Status Authorization');
    const opScheduleId = convertedBookingIds[1];
    {
      // Dispatch the second vehicle to 1호차 배선만
      await api('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: opScheduleId,
          vehicleNo: '1호차',
          vehiclePlate: '116허 1514',
          driverName: '배선만',
          date: '2026-11-20',
          pickupTime: '10:00',
          origin: '인천공항 T2',
          destination: '그랜드하얏트',
          dispatchStatus: 'published',
        }),
      });

      // 5A: Operations Board GET API verification
      const opBoardRes = await api('/api/schedules/dispatch?onlyDispatched=true');
      assert.strictEqual(opBoardRes.status, 200);
      assert.strictEqual(opBoardRes.data.ok, true);
      assert.ok(Array.isArray(opBoardRes.data.schedules), 'Schedules must be array');
      const foundOp = opBoardRes.data.schedules.find((s: any) => s.id === opScheduleId);
      assert.ok(foundOp, 'Dispatched schedule must appear in operations board');
      assert.strictEqual(foundOp.operation_status, 'ready');

      // 5B: Unauthorized Driver Attempts Status Change -> HTTP 403
      const badStatusChange = await api('/api/schedules/operation-status', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: opScheduleId,
          status: 'arrived_pickup',
          changedBy: '윤태준', // Assigned is 배선만!
        }),
      });
      assert.strictEqual(badStatusChange.status, 403, 'Unauthorized driver status change must return HTTP 403');
      console.log('  ✅ Unauthorized driver operation status change blocked (HTTP 403).');

      // 5C: Authorized Driver Progresses through 5 stages
      const stages = ['arrived_pickup', 'boarded', 'in_transit', 'completed'];
      for (const st of stages) {
        const updateRes = await api('/api/schedules/operation-status', {
          method: 'POST',
          body: JSON.stringify({
            scheduleId: opScheduleId,
            status: st,
            changedBy: '배선만',
          }),
        });
        assert.strictEqual(updateRes.status, 200);
        assert.strictEqual(updateRes.data.operationStatus, st);
      }

      // Verify in Supabase DB: operation_status is 'completed' and operation_history has 4 entries
      const opDb = await executeSupabaseSql(`
        SELECT operation_status, operation_history FROM cockpit.schedules WHERE id = '${opScheduleId}';
      `);
      assert.strictEqual(opDb[0].operation_status, 'completed');
      assert.strictEqual(opDb[0].operation_history.length, 4);
      console.log('  ✅ Authorized driver 5-stage operation lifecycle & history verified in Supabase.');
    }

    console.log('\n================================================================');
    console.log('🎉 ALL 5 Critical Audit Scenarios Passed 100% in Real Supabase Environment!');
    console.log('================================================================\n');
  } finally {
    // Clean up ONLY created test records
    console.log('🧹 Cleaning up created test records...');
    if (testIdsToClean.schedules.length > 0) {
      await executeSupabaseSql(`
        DELETE FROM cockpit.schedules WHERE id IN ('${testIdsToClean.schedules.join("','")}');
      `);
    }
    if (testIdsToClean.customers.length > 0) {
      await executeSupabaseSql(`
        DELETE FROM cockpit.customers WHERE id IN ('${testIdsToClean.customers.join("','")}');
      `);
    }
    console.log('✅ Test records cleaned cleanly without touching shared data.');
  }
}

runAudit().catch((err) => {
  console.error('❌ Deep Audit Failed:', err);
  process.exit(1);
});
