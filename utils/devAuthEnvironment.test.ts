import assert from 'assert';
import {
  isDevAuthAllowed,
  getAuthSecret,
  signCockpitSession,
  parseAndVerifyToken,
  driverCanAccessSchedule,
  DEV_ACCOUNTS,
} from '../lib/auth/serverAuth';

async function runDevAuthEnvironmentTests() {
  console.log('🧪 Starting Dev Auth Environment Isolation & Multi-Account Switcher Tests...\n');

  const origEnv = { ...process.env };

  try {
    // -------------------------------------------------------------
    // Test 1: Local Dev Auth Detection
    // -------------------------------------------------------------
    console.log('👉 [Test 1] Testing isDevAuthAllowed() environment isolation...');
    
    // 1A. Normal local dev with DEV_AUTH_ENABLED=true
    process.env.DEV_AUTH_ENABLED = 'true';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    (process.env as any).NODE_ENV = 'development';
    assert.strictEqual(isDevAuthAllowed(), true, 'Local dev with DEV_AUTH_ENABLED=true must allow dev auth');

    // 1B. Vercel Preview
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    assert.strictEqual(isDevAuthAllowed(), false, 'Vercel Preview must strictly forbid dev auth');

    // 1C. Vercel Production
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    assert.strictEqual(isDevAuthAllowed(), false, 'Vercel Production must strictly forbid dev auth');

    // 1D. Production NODE_ENV
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    (process.env as any).NODE_ENV = 'production';
    assert.strictEqual(isDevAuthAllowed(), false, 'NODE_ENV=production must strictly forbid dev auth');

    // 1E. DEV_AUTH_ENABLED=false on localhost
    (process.env as any).NODE_ENV = 'development';
    process.env.DEV_AUTH_ENABLED = 'false';
    assert.strictEqual(isDevAuthAllowed(), false, 'DEV_AUTH_ENABLED=false must forbid dev auth');

    console.log('   ✅ Environment isolation correctly prevents dev auth in Preview, Production, or when disabled.\n');

    // -------------------------------------------------------------
    // Test 2: Missing Secret Hardening (No hardcoded fallback in prod)
    // -------------------------------------------------------------
    console.log('👉 [Test 2] Testing missing secret safe failure in external environments...');
    process.env.DEV_AUTH_ENABLED = 'false';
    (process.env as any).NODE_ENV = 'production';
    delete process.env.COCKPIT_AUTH_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.strictEqual(getAuthSecret(), null, 'Production without secret must return null secret');

    let threwError = false;
    try {
      signCockpitSession({
        userId: 'test',
        org: 'vip_limousine_korea',
        role: 'hq_admin',
      });
    } catch {
      threwError = true;
    }
    assert.strictEqual(threwError, true, 'signCockpitSession must throw error when secret is absent in prod');

    const invalidTokenResult = await parseAndVerifyToken('cockpit_s1.invalid.payload');
    assert.strictEqual(invalidTokenResult, null, 'parseAndVerifyToken must return null when secret is absent');

    console.log('   ✅ Production fails safely without fallback secrets when key is not configured.\n');

    // -------------------------------------------------------------
    // Test 3: Local Dev Profiles & Cryptographic Issuance
    // -------------------------------------------------------------
    console.log('👉 [Test 3] Testing Dev Account profiles (Admin, Driver A, Driver B)...');
    process.env.DEV_AUTH_ENABLED = 'true';
    (process.env as any).NODE_ENV = 'development';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;

    // 3A. Issue Admin Token
    const adminToken = signCockpitSession(DEV_ACCOUNTS.admin, 3600);
    assert.ok(adminToken.startsWith('cockpit_s1.'), 'Admin token must start with cockpit_s1 prefix');
    const adminSession = await parseAndVerifyToken(adminToken);
    assert.ok(adminSession, 'Admin token must parse and verify');
    assert.strictEqual(adminSession?.role, 'hq_admin');
    assert.strictEqual(adminSession?.driverName, '본사 관리자');

    // 3B. Issue Driver A Token (윤기사 · 7호차)
    const driverAToken = signCockpitSession(DEV_ACCOUNTS.driver_a, 3600);
    const driverASession = await parseAndVerifyToken(driverAToken);
    assert.ok(driverASession, 'Driver A token must parse and verify');
    assert.strictEqual(driverASession?.role, 'driver');
    assert.strictEqual(driverASession?.driverName, '윤기사');
    assert.strictEqual(driverASession?.vehicleNo, '7호차');

    // 3C. Issue Driver B Token (박기사 · 8호차)
    const driverBToken = signCockpitSession(DEV_ACCOUNTS.driver_b, 3600);
    const driverBSession = await parseAndVerifyToken(driverBToken);
    assert.ok(driverBSession, 'Driver B token must parse and verify');
    assert.strictEqual(driverBSession?.role, 'driver');
    assert.strictEqual(driverBSession?.driverName, '박기사');
    assert.strictEqual(driverBSession?.vehicleNo, '8호차');

    console.log('   ✅ Local dev tokens for Admin, Driver A, and Driver B signed and verified cryptographically.\n');

    // -------------------------------------------------------------
    // Test 4: Driver Schedule Isolation (Driver B cannot touch Driver A)
    // -------------------------------------------------------------
    console.log('👉 [Test 4] Testing schedule access control and cross-driver isolation...');

    const scheduleA = {
      id: 'sch_yoon_001',
      driver_id: 'drv_yoon_01',
      driver_name: '윤기사',
      vehicle_no: '7호차',
      car_number: '서울31가7777',
      dispatch_status: 'confirmed',
    };

    const scheduleB = {
      id: 'sch_park_002',
      driver_id: 'drv_park_02',
      driver_name: '박기사',
      vehicle_no: '8호차',
      car_number: '서울32나8888',
      dispatch_status: 'confirmed',
    };

    const unassignedSchedule = {
      id: 'sch_unassigned_003',
      driver_id: null,
      driver_name: '',
      vehicle_no: '미배정',
      dispatch_status: 'unassigned',
    };

    // Loose matching bypass test: matching name but different/missing driver_id
    const spoofedNameSchedule = {
      id: 'sch_spoofed_004',
      driver_id: 'drv_other_99',
      driver_name: '윤기사', // Same name, but foreign driver_id
      vehicle_no: '7호차',
      car_number: '서울31가7777',
      dispatch_status: 'confirmed',
    };

    // HQ Admin can access all
    assert.strictEqual(driverCanAccessSchedule(adminSession!, scheduleA), true, 'Admin must access schedule A');
    assert.strictEqual(driverCanAccessSchedule(adminSession!, scheduleB), true, 'Admin must access schedule B');
    assert.strictEqual(driverCanAccessSchedule(adminSession!, unassignedSchedule), true, 'Admin must access unassigned schedules');

    // Driver A access check
    assert.strictEqual(driverCanAccessSchedule(driverASession!, scheduleA), true, 'Driver A must access Driver A schedule');
    assert.strictEqual(driverCanAccessSchedule(driverASession!, scheduleB), false, 'Driver A CANNOT access Driver B schedule');
    assert.strictEqual(driverCanAccessSchedule(driverASession!, unassignedSchedule), false, 'Driver A CANNOT access unassigned schedule');
    assert.strictEqual(driverCanAccessSchedule(driverASession!, spoofedNameSchedule), false, 'Driver A CANNOT access schedule with matching name but mismatched driver_id');

    // Driver B access check
    assert.strictEqual(driverCanAccessSchedule(driverBSession!, scheduleB), true, 'Driver B must access Driver B schedule');
    assert.strictEqual(driverCanAccessSchedule(driverBSession!, scheduleA), false, 'Driver B CANNOT access Driver A schedule');
    assert.strictEqual(driverCanAccessSchedule(driverBSession!, unassignedSchedule), false, 'Driver B CANNOT access unassigned schedule');

    console.log('   ✅ Strict driver schedule isolation verified. Driver B is blocked from Driver A dispatches.\n');

    // -------------------------------------------------------------
    // Test 5: Token Tampering & Expiry
    // -------------------------------------------------------------
    console.log('👉 [Test 5] Testing token tampering detection & expiration...');
    const tamperedToken = adminToken.slice(0, -6) + 'xxxxxx';
    const tamperedResult = await parseAndVerifyToken(tamperedToken);
    assert.strictEqual(tamperedResult, null, 'Tampered token signature must be rejected');

    const expiredToken = signCockpitSession(DEV_ACCOUNTS.admin, -10); // Expired 10 seconds ago
    const expiredResult = await parseAndVerifyToken(expiredToken);
    assert.strictEqual(expiredResult, null, 'Expired session token must be rejected');

    console.log('   ✅ Tampered and expired tokens are rejected safely.\n');

    console.log('🎉 ALL 5 DEV AUTH & ENVIRONMENT ISOLATION TESTS PASSED 100%!');
  } finally {
    process.env = origEnv;
  }
}

runDevAuthEnvironmentTests().catch((err) => {
  console.error('❌ Dev Auth Environment test failed:', err);
  process.exit(1);
});
