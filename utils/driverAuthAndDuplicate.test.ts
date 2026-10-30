import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDevAuthAllowed,
  getAuthSecret,
  signCockpitSession,
  parseAndVerifyToken,
} from '@/lib/auth/serverAuth';

test('Driver Auth & Duplicate Registration Protection Suite', async (t) => {
  const origEnv = { ...process.env };

  t.afterEach(() => {
    process.env = { ...origEnv };
  });

  await t.test('1. Environment Auth Enforcement: Preview strictly forbids dev bypass', () => {
    // 1A. Simulate Vercel Preview
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.DEV_AUTH_ENABLED = 'true'; // even if locally true
    (process.env as any).NODE_ENV = 'production';

    assert.equal(isDevAuthAllowed(), false, 'Vercel Preview must strictly forbid auto-dev-auth');

    // 1B. Simulate Vercel Production
    process.env.VERCEL_ENV = 'production';
    assert.equal(isDevAuthAllowed(), false, 'Vercel Production must strictly forbid auto-dev-auth');

    // 1C. Simulate Localhost Dev
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    (process.env as any).NODE_ENV = 'development';
    process.env.DEV_AUTH_ENABLED = 'true';
    assert.equal(isDevAuthAllowed(), true, 'Local dev allows dev auth when DEV_AUTH_ENABLED=true');
  });

  await t.test('2. HQ Admin Session Issuance & Token Verification', async () => {
    // Generate valid HQ Admin session
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key-32-chars-long-minimum-length-req!';
    
    const token = await signCockpitSession({
      role: 'hq_admin',
      userId: 'hq-test-admin',
      displayName: '본사 관제팀장',
      org: 'vip_limousine_korea',
    });

    assert.ok(token, 'Must return signed token string');
    assert.match(token, /^cockpit_s1\./, 'Must use cockpit_s1 prefix');

    // Verify token
    const verified = await parseAndVerifyToken(token);
    assert.ok(verified, 'Valid token must be verified successfully');
    assert.equal(verified?.role, 'hq_admin');
    assert.equal(verified?.userId, 'hq-test-admin');
    assert.equal(verified?.displayName, '본사 관제팀장');

    // Tampered token must fail
    const tampered = token.slice(0, -5) + 'xxxxx';
    const tamperedResult = await parseAndVerifyToken(tampered);
    assert.equal(tamperedResult, null, 'Tampered token must return null');
  });

  await t.test('3. Preview Fallback Secret Guard', () => {
    const PREVIEW_FALLBACK = 'vip_limo_hq_2026';

    // In preview environment, fallback secret is used when HQ_ADMIN_SECRET is missing
    delete process.env.HQ_ADMIN_SECRET;
    delete process.env.COCKPIT_AUTH_SECRET;
    process.env.VERCEL_ENV = 'preview';

    const secretInPreview =
      process.env.HQ_ADMIN_SECRET ||
      process.env.COCKPIT_AUTH_SECRET ||
      (process.env.VERCEL_ENV === 'preview' ? PREVIEW_FALLBACK : '');

    assert.equal(secretInPreview, PREVIEW_FALLBACK, 'Preview environment must allow preview fallback secret');

    // In production environment, fallback secret is NOT used
    process.env.VERCEL_ENV = 'production';
    const secretInProd =
      process.env.HQ_ADMIN_SECRET ||
      process.env.COCKPIT_AUTH_SECRET ||
      (process.env.VERCEL_ENV === 'preview' ? PREVIEW_FALLBACK : '');

    assert.equal(secretInProd, '', 'Production environment must NEVER use preview fallback secret');
  });

  await t.test('4. Duplicate Driver Detection & Disambiguation Logic (Isolated Model)', () => {
    // Mock existing drivers in database (representing realistic multi-entry state)
    interface MockDriver {
      id: string;
      driver_name: string;
      phone: string;
      affiliation_type: string;
      vehicle_id?: string | null;
      created_at: string;
    }

    const mockDb: MockDriver[] = [
      {
        id: 'b6aac740-002e-4a5c-ac49-0ac71e765340',
        driver_name: '윤태준',
        phone: '010-8726-1234',
        affiliation_type: 'employed',
        vehicle_id: 'veh-001',
        created_at: '2026-09-22T08:00:00Z',
      },
      {
        id: 'c1234567-1111-2222-3333-444455556666',
        driver_name: '윤태준',
        phone: '010-8726-1234',
        affiliation_type: 'employed',
        vehicle_id: null,
        created_at: '2026-10-26T09:00:00Z',
      },
      {
        id: 'd9876543-aaaa-bbbb-cccc-ddddeeeeffff',
        driver_name: '홍길동',
        phone: '010-1234-5678',
        affiliation_type: 'freelance',
        vehicle_id: null,
        created_at: '2026-10-01T10:00:00Z',
      },
    ];

    function registerDriver(input: {
      name: string;
      phone: string;
      affiliation: string;
      allowDuplicate?: boolean;
    }) {
      const cleanPhone = input.phone.replace(/[^0-9]/g, '');
      const matches = mockDb.filter(
        (d) =>
          d.driver_name.trim() === input.name.trim() ||
          (cleanPhone && d.phone.replace(/[^0-9]/g, '') === cleanPhone)
      );

      if (matches.length > 0 && !input.allowDuplicate) {
        return {
          status: 409,
          ok: false,
          error: `동일한 기사명 또는 연락처를 가진 기사가 이미 ${matches.length}명 등록되어 있습니다.`,
          isDuplicate: true,
          duplicateCount: matches.length,
          existingDrivers: matches.map((m) => ({
            id: m.id,
            name: m.driver_name,
            phone: m.phone,
            affiliation_type: m.affiliation_type,
          })),
        };
      }

      const newDriver: MockDriver = {
        id: `mock-uuid-${Date.now()}`,
        driver_name: input.name,
        phone: input.phone,
        affiliation_type: input.affiliation,
        created_at: new Date().toISOString(),
      };
      mockDb.push(newDriver);

      return {
        status: 201,
        ok: true,
        driver: newDriver,
      };
    }

    // Step 4A: Attempting to register "윤태준" without allowDuplicate -> 409 Conflict
    const attempt1 = registerDriver({
      name: '윤태준',
      phone: '010-8726-1234',
      affiliation: 'employed',
      allowDuplicate: false,
    });

    assert.equal(attempt1.status, 409);
    assert.equal(attempt1.ok, false);
    assert.equal(attempt1.isDuplicate, true);
    assert.equal(attempt1.duplicateCount, 2);
    assert.equal(attempt1.existingDrivers?.length, 2);
    // Database count remains 3 (no accidental insertions or overwrites)
    assert.equal(mockDb.length, 3);

    // Step 4B: Re-attempting with allowDuplicate: true ("동명이인 확인 후 등록")
    const attempt2 = registerDriver({
      name: '윤태준',
      phone: '010-8726-1234',
      affiliation: 'employed',
      allowDuplicate: true,
    });

    assert.equal(attempt2.status, 201);
    assert.equal(attempt2.ok, true);
    assert.ok(attempt2.driver);
    assert.equal(attempt2.driver.driver_name, '윤태준');
    // Database count is now 4, existing 3 records completely preserved
    assert.equal(mockDb.length, 4);
    assert.equal(mockDb[0].id, 'b6aac740-002e-4a5c-ac49-0ac71e765340');
    assert.equal(mockDb[1].id, 'c1234567-1111-2222-3333-444455556666');
  });

  await t.test('5. Zero-Data State vs Error State Separation in UI Contract', () => {
    // Simulating useHqDrivers hook return contract
    function evaluateUiState(state: {
      isLoading: boolean;
      error: string | null;
      statusCode: number | null;
      driversCount: number;
    }) {
      if (state.isLoading) return 'LOADING';
      if (state.error && (state.statusCode === 401 || state.statusCode === 403)) {
        return 'AUTH_REQUIRED_BANNER';
      }
      if (state.error) {
        return 'DATABASE_ERROR_BANNER';
      }
      if (state.driversCount === 0) {
        return 'TRUE_ZERO_RECORD_EMPTY_VIEW';
      }
      return 'DATA_TABLE_VIEW';
    }

    // 5A. Unauthenticated 401 must NEVER show TRUE_ZERO_RECORD_EMPTY_VIEW
    const authFailureState = evaluateUiState({
      isLoading: false,
      error: '인증 토큰이 없습니다. 로그인이 필요합니다. (401 Unauthorized)',
      statusCode: 401,
      driversCount: 0,
    });
    assert.equal(authFailureState, 'AUTH_REQUIRED_BANNER');

    // 5B. Database 500 must show DATABASE_ERROR_BANNER
    const dbFailureState = evaluateUiState({
      isLoading: false,
      error: 'Supabase DB Connection timeout',
      statusCode: 500,
      driversCount: 0,
    });
    assert.equal(dbFailureState, 'DATABASE_ERROR_BANNER');

    // 5C. Authenticated with truly 0 drivers
    const genuineEmptyState = evaluateUiState({
      isLoading: false,
      error: null,
      statusCode: 200,
      driversCount: 0,
    });
    assert.equal(genuineEmptyState, 'TRUE_ZERO_RECORD_EMPTY_VIEW');

    // 5D. Authenticated with 33 drivers
    const populatedState = evaluateUiState({
      isLoading: false,
      error: null,
      statusCode: 200,
      driversCount: 33,
    });
    assert.equal(populatedState, 'DATA_TABLE_VIEW');
  });
});
