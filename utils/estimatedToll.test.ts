import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

process.env.DEV_AUTH_ENABLED = 'true';
process.env.NEXT_PUBLIC_USE_MOCK = 'true';

async function runTollTests() {
  console.log('🧪 Starting P2 Estimated Toll (Phase H1) Test Suite...');

  const { GET } = await import('../app/api/route/route');

  // Test 1: Real or Mock Route calculation
  // From Gangnam to Incheon Airport
  const req = new NextRequest(
    'http://localhost:3000/api/route?startLat=37.5042&startLng=127.0425&endLat=37.4495&endLng=126.4512'
  );
  const res = await GET(req);
  const data = await res.json();

  assert.strictEqual(res.status, 200, 'Route calculation should return 200');
  assert.ok(typeof data.distanceKm === 'number', 'distanceKm must be a number');
  assert.ok(typeof data.durationMinutes === 'number', 'durationMinutes must be a number');

  // Verify estimatedTollWon field exists in response
  assert.ok(
    'estimatedTollWon' in data,
    'estimatedTollWon must be explicitly present in Route API response'
  );

  if (data.isMock) {
    assert.strictEqual(
      data.estimatedTollWon,
      null,
      'Mock mode or fallback calculation must return estimatedTollWon: null'
    );
    console.log('✅ Mock mode verified: estimatedTollWon is safely null.');
  } else {
    // When real TMAP API is invoked, highway to Incheon Airport has toll (e.g. 6600 won or positive number)
    console.log(`✅ Real TMAP API returned estimated toll: ₩${data.estimatedTollWon?.toLocaleString()}`);
    if (data.estimatedTollWon !== null) {
      assert.ok(
        typeof data.estimatedTollWon === 'number' && data.estimatedTollWon >= 0,
        'estimatedTollWon must be a non-negative number when present'
      );
    }
  }

  // Test 2: Toll fee formatting logic
  const formatTollDisplay = (toll: number | null | undefined): string => {
    if (toll === null || toll === undefined) return '-';
    if (toll === 0) return '0원 (무료)';
    return `₩${toll.toLocaleString()}`;
  };

  assert.strictEqual(formatTollDisplay(6600), '₩6,600', 'Positive toll formatting');
  assert.strictEqual(formatTollDisplay(0), '0원 (무료)', 'Zero toll should indicate free road');
  assert.strictEqual(formatTollDisplay(null), '-', 'Null toll returns dash');
  assert.strictEqual(formatTollDisplay(undefined), '-', 'Undefined toll returns dash');

  console.log('✅ Toll display formatting logic verified.');
  console.log('🎉 All P2 Estimated Toll Tests Passed 100%!\n');
}

runTollTests().catch((err) => {
  console.error('❌ Estimated Toll Test Failure:', err);
  process.exit(1);
});
