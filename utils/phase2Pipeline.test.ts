import assert from 'node:assert';
import { isDateTimeOverlapping } from './availabilityEngine';
import { calculateQuote, generateQuoteNumber } from './quoteCalculator';
import { addNavigationRouteToDrivingLog } from './drivingLogNaviSync';
import { DRIVING_LOG_INDEX_KEY, DRIVING_LOG_STORAGE_PREFIX } from './drivingLog';

console.log('================================================================');
console.log('🚀 Phase 2 Pipeline Test Suite: Availability, Quotes, Operations, Navi-Log');
console.log('================================================================\n');

async function runTests() {
  // Test 1: Overnight and Cross-Day Overlap Logic
  console.log('[Test 1] Availability Engine - Date & Time Window Overlap Logic');
  {
    // Case 1A: Same day overlap (09:00~19:00 vs 14:00~16:00) -> Overlap
    const overlap1 = isDateTimeOverlapping(
      { date: '2026-10-28', minutes: 9 * 60 },
      { date: '2026-10-28', minutes: 19 * 60 },
      { date: '2026-10-28', minutes: 14 * 60 },
      { date: '2026-10-28', minutes: 16 * 60 },
      0
    );
    assert.strictEqual(overlap1, true, 'Same day time window must overlap');

    // Case 1B: Same day non-overlap (09:00~12:00 vs 15:00~18:00 without buffer) -> No overlap
    const overlap2 = isDateTimeOverlapping(
      { date: '2026-10-28', minutes: 9 * 60 },
      { date: '2026-10-28', minutes: 12 * 60 },
      { date: '2026-10-28', minutes: 15 * 60 },
      { date: '2026-10-28', minutes: 18 * 60 },
      0
    );
    assert.strictEqual(overlap2, false, 'Non-overlapping time windows must be false');

    // Case 1C: Overnight operation crossing midnight (22:00 ~ next day 04:00 vs next day 02:00 ~ 08:00) -> Overlap
    const overlap3 = isDateTimeOverlapping(
      { date: '2026-10-28', minutes: 22 * 60 },
      { date: '2026-10-29', minutes: 4 * 60 },
      { date: '2026-10-29', minutes: 2 * 60 },
      { date: '2026-10-29', minutes: 8 * 60 },
      0
    );
    assert.strictEqual(overlap3, true, 'Overnight operation crossing midnight must detect overlap');

    console.log('  ✅ Overlap detector correctly handles standard, non-overlapping, and overnight trips.');
  }

  // Test 2: Pricing Quote Engine
  console.log('\n[Test 2] Pricing Quote Engine - Standard Pricing & English Chauffeur Premium');
  {
    // Quote 1: Sprinter 519 CDI, 1 vehicle, 10 hours, English driver
    const quote1 = await calculateQuote({
      customerName: '샤넬 코리아',
      date: '2026-11-05',
      serviceStartTime: '09:00',
      serviceEndTime: '19:00',
      serviceHours: 10,
      origin: '인천공항 T2',
      destination: '신라호텔',
      vehicleModel: 'Mercedes-Benz Sprinter 519 CDI',
      vehicleCount: 1,
      driverLanguage: 'en',
      serviceMode: 'with_driver',
    });

    // Base fare: 800,000원. English surcharge: 50,000원 (200k - 150k).
    // Supply: 850,000원. VAT: 85,000원. Total: 935,000원.
    assert.strictEqual(quote1.baseFareTotal, 800000, 'Sprinter 519 10h base fare must be 800,000 KRW');
    assert.strictEqual(quote1.englishSurchargeTotal, 50000, 'English chauffeur premium must be 50,000 KRW');
    assert.strictEqual(quote1.supplyPriceTotal, 850000, 'Supply price must be 850,000 KRW');
    assert.strictEqual(quote1.vatAmount, 85000, 'VAT must be 85,000 KRW (10%)');
    assert.strictEqual(quote1.estimatedGrandTotal, 935000, 'Grand total must be 935,000 KRW');
    assert.ok(quote1.quoteNo.startsWith('QT-'), 'Quote number must start with QT-');

    console.log(`  ✅ Quote calculated: ${quote1.quoteNo} -> Grand Total: ${quote1.estimatedGrandTotal.toLocaleString()}원 (VAT included)`);

    // Quote 2: Unconfirmed Overtime Zero-Fabrication Rule
    const quote2 = await calculateQuote({
      customerName: '신규 고객사',
      date: '2026-11-06',
      serviceStartTime: '08:00',
      serviceEndTime: '22:00',
      serviceHours: 14, // 4 hours overtime
      origin: '서울역',
      destination: '파라다이스시티',
      vehicleModel: 'Mercedes-Benz Sprinter 319 CDI',
      vehicleCount: 1,
      driverLanguage: 'ko',
    });

    assert.strictEqual(quote2.overtimeHours, 4, 'Overtime hours must be 4');
    // Overtime fare is calculated ONLY when confirmed, never fabricated
    if (!quote2.isOvertimeRateConfirmed) {
      assert.strictEqual(quote2.overtimeFareTotal, 0, 'Unconfirmed overtime must be 0 KRW');
    }
    console.log('  ✅ Unconfirmed overtime rule strictly enforced (zero-fabrication compliant).');
  }

  // Test 3: Navigation -> Driving Log Auto-Sync
  console.log('\n[Test 3] Navigation to Driving Log Auto-Sync');
  {
    // Mock window & localStorage in Node environment
    const storage: Record<string, string> = {};
    (global as any).window = {};
    (global as any).localStorage = {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, val: string) => { storage[key] = val; },
      removeItem: (key: string) => { delete storage[key]; },
    };

    // 1st navigation launch
    const res1 = addNavigationRouteToDrivingLog({
      originName: '조선팰리스 강남',
      destinationName: '인천국제공항 T1',
      destinationAddress: '인천 중구 공항로 272',
    });

    assert.strictEqual(res1.success, true, 'First navigation route must be successfully added');
    assert.strictEqual(res1.isDuplicate, false, 'First route must not be flagged duplicate');
    assert.strictEqual(res1.stop?.place, '인천국제공항 T1', 'Stop place must match destination');

    // 2nd navigation launch with same destination (Immediate re-launch -> duplicate prevention)
    const res2 = addNavigationRouteToDrivingLog({
      originName: '조선팰리스 강남',
      destinationName: '인천국제공항 T1',
      destinationAddress: '인천 중구 공항로 272',
    });

    assert.strictEqual(res2.success, true, 'Duplicate call must succeed gracefully');
    assert.strictEqual(res2.isDuplicate, true, 'Repeated destination must be detected as duplicate');

    // 3rd navigation launch with new destination
    const res3 = addNavigationRouteToDrivingLog({
      originName: '인천국제공항 T1',
      destinationName: '신라호텔 서울',
      destinationAddress: '서울 중구 동호로 249',
    });

    assert.strictEqual(res3.success, true, 'New route must be added');
    assert.strictEqual(res3.isDuplicate, false, 'New route must not be duplicate');

    // Verify localStorage draft has exactly 2 stops
    const rawIndex = storage[DRIVING_LOG_INDEX_KEY];
    assert.ok(rawIndex, 'Driving log index must exist in localStorage');
    const index = JSON.parse(rawIndex);
    assert.ok(index.length > 0, 'Index must have at least one entry');

    const draftKey = `${DRIVING_LOG_STORAGE_PREFIX}${index[0].reportId}`;
    const draft = JSON.parse(storage[draftKey]);
    assert.strictEqual(draft.stops.length, 2, 'Draft must contain exactly 2 unique stops');
    assert.strictEqual(draft.stops[0].place, '인천국제공항 T1');
    assert.strictEqual(draft.stops[1].place, '신라호텔 서울');

    console.log('  ✅ Navigation destination successfully recorded to today\'s driving log without artificial arrival timestamps.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL Phase 2 Pipeline Tests Passed Successfully!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
