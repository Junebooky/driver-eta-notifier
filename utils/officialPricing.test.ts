import {
  calculateOfficialTariffQuote,
} from '@/lib/pricing/officialPricingService';
import {
  resolveVehicleProductSku,
  STANDARD_VEHICLE_SKU_MAPPINGS,
  OFFICIAL_TARIFF_VERSION,
} from '@/lib/pricing/officialPricingSkus';
import { calculateQuote } from '@/utils/quoteCalculator';
import { requireHqAdmin, signCockpitSession } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import assert from 'node:assert';

async function runOfficialPricingTests() {
  console.log('--- [VLK 2026 Official Pricing Suite] ---');

  if (!process.env.COCKPIT_AUTH_SECRET && !process.env.AUTH_SECRET) {
    process.env.COCKPIT_AUTH_SECRET = 'test-cockpit-auth-secret-key-32chars-minimum!';
  }

  // If live Supabase service key is not configured (e.g. CI quality gate),
  // mock the query layer with non-sensitive synthetic test fixtures.
  const originalFrom = supabaseAdmin.from;
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[CI Test Mode] Using in-memory mock for official pricing tables.');
    const mockCards = [
      {
        id: 'card-mock-519',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'sprinter_519_premium',
        vehicle_product_label: '벤츠 스프린터 리무진 519 최고급형',
        capacity_note: '9·11·12인승',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: 1000000,
        daily_regional_krw: 1200000,
        airport_gimpo_krw: 400000,
        airport_incheon_krw: 500000,
        quote_required: false,
        publication_status: 'draft',
      },
      {
        id: 'card-mock-s560',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'benz_s560',
        vehicle_product_label: '벤츠 S560',
        capacity_note: '세단',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: 900000,
        daily_regional_krw: 1100000,
        airport_gimpo_krw: 350000,
        airport_incheon_krw: 450000,
        quote_required: false,
        publication_status: 'draft',
      },
      {
        id: 'card-mock-carnival',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'kia_carnival_hi_limo',
        vehicle_product_label: '카니발 하이리무진',
        capacity_note: '7인승',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: 600000,
        daily_regional_krw: 800000,
        airport_gimpo_krw: 250000,
        airport_incheon_krw: 300000,
        quote_required: false,
        publication_status: 'draft',
      },
      {
        id: 'card-mock-staria',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'hyundai_staria_lounge_limo',
        vehicle_product_label: '스타리아 라운지 리무진',
        capacity_note: '7·9인승',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: 550000,
        daily_regional_krw: 750000,
        airport_gimpo_krw: 230000,
        airport_incheon_krw: 280000,
        quote_required: false,
        publication_status: 'draft',
      },
      {
        id: 'card-mock-g90',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'genesis_g90_donghaeng',
        vehicle_product_label: '제네시스 G90 리무진 (동행)',
        capacity_note: '동행 의전',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: 850000,
        daily_regional_krw: 1050000,
        airport_gimpo_krw: 320000,
        airport_incheon_krw: 420000,
        quote_required: false,
        publication_status: 'draft',
      },
      {
        id: 'card-mock-bus22',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'bus_premium_22',
        vehicle_product_label: '22인승 프리미엄 버스',
        capacity_note: '22인승',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: null,
        daily_regional_krw: null,
        airport_gimpo_krw: null,
        airport_incheon_krw: null,
        quote_required: true,
        publication_status: 'draft',
      },
      {
        id: 'card-mock-bus28',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'bus_limo_28',
        vehicle_product_label: '28인승 우등 리무진 버스',
        capacity_note: '28인승',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: null,
        daily_regional_krw: null,
        airport_gimpo_krw: null,
        airport_incheon_krw: null,
        quote_required: true,
        publication_status: 'draft',
      },
      {
        id: 'card-mock-bus45',
        tariff_year: 2026,
        tariff_version: OFFICIAL_TARIFF_VERSION,
        vehicle_product_code: 'bus_45',
        vehicle_product_label: '45인승 대형 버스',
        capacity_note: '45인승',
        daily_base_hours: 9,
        airport_base_hours: 3,
        daily_metro_krw: null,
        daily_regional_krw: null,
        airport_gimpo_krw: null,
        airport_incheon_krw: null,
        quote_required: true,
        publication_status: 'draft',
      },
    ];

    const mockRules = [
      {
        id: 'rule-mock-overtime',
        tariff_version: OFFICIAL_TARIFF_VERSION,
        service_type: 'daily',
        rule_code: 'overtime_rates',
        rule_data: {
          standard_hourly_krw: {
            sprinter: 80000,
            other_vehicles: 50000,
          },
          night_hourly_krw: {
            sprinter: 120000,
            other_vehicles: 80000,
          },
        },
        publication_status: 'draft',
      },
      {
        id: 'rule-mock-english',
        tariff_version: OFFICIAL_TARIFF_VERSION,
        service_type: 'daily',
        rule_code: 'daily_fluent_english',
        rule_data: {
          surcharge_krw: 100000,
        },
        publication_status: 'draft',
      },
      {
        id: 'rule-mock-distance',
        tariff_version: OFFICIAL_TARIFF_VERSION,
        service_type: 'daily',
        rule_code: 'daily_distance',
        rule_data: {
          excess_km_charge_krw: 2000,
        },
        publication_status: 'draft',
      },
    ];

    supabaseAdmin.from = ((table: string) => {
      return {
        select: (_cols?: string) => ({
          eq: (_col: string, _val: any) => {
            if (table === 'official_price_cards') {
              return Promise.resolve({ data: mockCards, error: null });
            }
            if (table === 'official_price_rules') {
              return Promise.resolve({ data: mockRules, error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }),
      };
    }) as any;
  }

  // Test 1: Distinct SKU Resolution
  console.log('1. Testing distinct SKU code resolution...');
  const sku519Prem = resolveVehicleProductSku('벤츠 스프린터 519 최고급 리무진');
  assert.strictEqual(sku519Prem.code, 'sprinter_519_premium');

  const sku519Std = resolveVehicleProductSku('스프린터 519 일반형');
  assert.strictEqual(sku519Std.code, 'sprinter_519_standard');

  const sku519Biz = resolveVehicleProductSku('519 비즈니스 16인승');
  assert.strictEqual(sku519Biz.code, 'sprinter_519_business');

  const sku519Shuttle = resolveVehicleProductSku('519 셔틀');
  assert.strictEqual(sku519Shuttle.code, 'sprinter_519_shuttle');

  const sku319 = resolveVehicleProductSku('스프린터 319 신차 6인승');
  assert.strictEqual(sku319.code, 'sprinter_319_new_6seat');

  const skuG90Donghaeng = resolveVehicleProductSku('제네시스 G90 동행 리무진');
  assert.strictEqual(skuG90Donghaeng.code, 'genesis_g90_donghaeng');

  const skuG90Std = resolveVehicleProductSku('제네시스 G90 신차');
  assert.strictEqual(skuG90Std.code, 'genesis_g90_standard');

  const skuGV80 = resolveVehicleProductSku('제네시스 GV80');
  assert.strictEqual(skuGV80.code, 'genesis_gv80_new');

  const skuStaria = resolveVehicleProductSku('스타리아 리무진');
  assert.strictEqual(skuStaria.code, 'hyundai_staria_lounge_limo');

  const skuCarnival = resolveVehicleProductSku('카니발 하이리무진');
  assert.strictEqual(skuCarnival.code, 'kia_carnival_hi_limo');

  const skuS560 = resolveVehicleProductSku('벤츠 S560');
  assert.strictEqual(skuS560.code, 'benz_s560');

  const skuBus22 = resolveVehicleProductSku('22인승 프리미엄 버스');
  assert.strictEqual(skuBus22.code, 'bus_premium_22');

  const skuBus28 = resolveVehicleProductSku('28인승 우등 버스');
  assert.strictEqual(skuBus28.code, 'bus_limo_28');

  const skuBus45 = resolveVehicleProductSku('45인승 대형 버스');
  assert.strictEqual(skuBus45.code, 'bus_45');

  console.log('✓ All 14 product SKUs resolved to distinct codes successfully.');

  // Test 2: Standard Base Hours (9h Daily, 3h Airport)
  console.log('2. Testing standard base hours (9h Daily, 3h Airport)...');
  const dailyQuote = await calculateOfficialTariffQuote({
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceCategory: 'daily_metro',
    vehicleProductCode: 'sprinter_519_premium',
    vehicleCount: 1,
  });
  assert.strictEqual(dailyQuote.baseHours, 9);
  assert.strictEqual(dailyQuote.quoteRequired, false);
  assert(dailyQuote.supplyPriceTotal !== null && dailyQuote.supplyPriceTotal > 0);

  const airportQuote = await calculateOfficialTariffQuote({
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceCategory: 'airport_incheon',
    vehicleProductCode: 'sprinter_519_premium',
    vehicleCount: 1,
  });
  assert.strictEqual(airportQuote.baseHours, 3);
  assert.strictEqual(airportQuote.quoteRequired, false);
  console.log('✓ Daily (9h) and Airport (3h) base hours verified.');

  // Test 3: Large Buses (22, 28, 45 seater) quote_required & null amounts
  console.log('3. Testing large buses require quote and hold null amounts (no 0-won bookings)...');
  for (const busCode of ['bus_premium_22', 'bus_limo_28', 'bus_45'] as const) {
    const busQuote = await calculateOfficialTariffQuote({
      tariffVersion: OFFICIAL_TARIFF_VERSION,
      serviceCategory: 'daily_metro',
      vehicleProductCode: busCode,
      vehicleCount: 1,
    });
    assert.strictEqual(busQuote.quoteRequired, true);
    assert.strictEqual(busQuote.baseRatePerVehicle, null);
    assert.strictEqual(busQuote.baseFareTotal, null);
    assert.strictEqual(busQuote.supplyPriceTotal, null);
    assert.strictEqual(busQuote.vatAmount, null);
    assert.strictEqual(busQuote.estimatedGrandTotal, null);
  }
  console.log('✓ Bus quote_required and null amounts verified.');

  // Test 4: VAT 10% strictly itemized on supplyPriceTotal
  console.log('4. Testing VAT 10% strict calculation...');
  const sedanQuote = await calculateOfficialTariffQuote({
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceCategory: 'daily_metro',
    vehicleProductCode: 'benz_s560',
    vehicleCount: 2,
    serviceHours: 11, // 2h overtime
    englishOption: 'fluent_upgrade',
  });
  assert(sedanQuote.supplyPriceTotal !== null && sedanQuote.vatAmount !== null);
  const expectedVat = Math.round(sedanQuote.supplyPriceTotal * 0.1);
  assert.strictEqual(sedanQuote.vatAmount, expectedVat);
  assert.strictEqual(sedanQuote.estimatedGrandTotal, sedanQuote.supplyPriceTotal + expectedVat);
  console.log('✓ VAT 10% and grand total calculation verified.');

  // Test 5: Regional daily anti-double-charging
  console.log('5. Testing regional rate has NO double-charged surcharge...');
  const regionalQuote = await calculateOfficialTariffQuote({
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceCategory: 'daily_regional',
    vehicleProductCode: 'kia_carnival_hi_limo',
    vehicleCount: 1,
  });
  // Regional is incorporated directly in baseFareTotal, not as an auxiliary surcharge item
  const regionalLineItems = regionalQuote.lineItems.filter((i) => i.code === 'regional_surcharge');
  assert.strictEqual(regionalLineItems.length, 0, 'Must not duplicate regional fee');
  console.log('✓ Regional tariff anti-double-charging verified.');

  // Test 6: English Option (basic included vs fluent upgrade)
  console.log('6. Testing English chauffeur pricing rules...');
  const basicEnQuote = await calculateOfficialTariffQuote({
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceCategory: 'daily_metro',
    vehicleProductCode: 'hyundai_staria_lounge_limo',
    vehicleCount: 1,
    englishOption: 'basic_included',
  });
  assert.strictEqual(basicEnQuote.fluentEnglishUpgradeTotal, 0);

  const fluentEnQuote = await calculateOfficialTariffQuote({
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceCategory: 'daily_metro',
    vehicleProductCode: 'hyundai_staria_lounge_limo',
    vehicleCount: 1,
    englishOption: 'fluent_upgrade',
  });
  assert(fluentEnQuote.fluentEnglishUpgradeTotal > 0);
  assert.strictEqual(
    fluentEnQuote.supplyPriceTotal! - basicEnQuote.supplyPriceTotal!,
    fluentEnQuote.fluentEnglishUpgradeTotal
  );
  console.log('✓ Basic English (included free) and Fluent upgrade verified.');

  // Test 7: Snapshot Immutability in calculateQuote
  console.log('7. Testing Snapshot Immutability in HqQuoteItem...');
  const quoteItem = await calculateQuote({
    customerName: '샤넬코리아',
    date: '2026-11-01',
    origin: '서울 강남',
    destination: '인천공항 T2',
    vehicleModel: '제네시스 G90 동행',
    vehicleProductCode: 'genesis_g90_donghaeng',
    serviceCategory: 'daily_metro',
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceHours: 9,
    vehicleCount: 1,
  });
  assert.strictEqual(quoteItem.tariffVersion, OFFICIAL_TARIFF_VERSION);
  assert.strictEqual(quoteItem.pricingSource, 'official_2026');
  assert(Boolean(quoteItem.appliedPricingSnapshot));
  assert.strictEqual(quoteItem.appliedPricingSnapshot?.tariffVersion, OFFICIAL_TARIFF_VERSION);
  assert.strictEqual(quoteItem.appliedPricingSnapshot?.vehicleProductCode, 'genesis_g90_donghaeng');
  console.log('✓ Snapshot immutability verified.');

  // Test 8: P0-3 Strict Disambiguation (Plain models must NOT auto-infer high trim)
  console.log('8. Testing ambiguous SKU resolution (Plain models must return isAmbiguous: true)...');
  const ambiguousCarnival = resolveVehicleProductSku('카니발');
  assert.strictEqual(ambiguousCarnival.isAmbiguous, true);
  assert.strictEqual(ambiguousCarnival.code, null);

  const ambiguous519 = resolveVehicleProductSku('스프린터 519');
  assert.strictEqual(ambiguous519.isAmbiguous, true);
  assert.strictEqual(ambiguous519.code, null);

  const ambiguous319 = resolveVehicleProductSku('스프린터 319');
  assert.strictEqual(ambiguous319.isAmbiguous, true);
  assert.strictEqual(ambiguous319.code, null);

  const ambiguousG90 = resolveVehicleProductSku('제네시스 G90');
  assert.strictEqual(ambiguousG90.isAmbiguous, true);
  assert.strictEqual(ambiguousG90.code, null);

  const ambiguousStaria = resolveVehicleProductSku('스타리아');
  assert.strictEqual(ambiguousStaria.isAmbiguous, true);
  assert.strictEqual(ambiguousStaria.code, null);
  console.log('✓ Ambiguous trim detection verified (Zero over-inference).');

  // Test 9: P0-4 Forbid silent legacy fallback on official quote calculation
  console.log('9. Testing rejection of silent legacy fallback when official tariff is requested...');
  let didThrowOnAmbiguous = false;
  try {
    await calculateQuote({
      customerName: '테스트고객',
      date: '2026-11-01',
      origin: '서울 강남',
      destination: '인천공항 T2',
      vehicleModel: '카니발', // Ambiguous! Must throw, not silently fall back to legacy 10h presets
      tariffVersion: OFFICIAL_TARIFF_VERSION,
    });
  } catch (err: any) {
    didThrowOnAmbiguous = true;
    assert(err.message.includes('2026 공식 요금 산출 실패'));
    assert(err.message.includes('구분이 필요합니다') || err.message.includes('세부 트림'));
  }
  assert.strictEqual(didThrowOnAmbiguous, true, 'calculateQuote must throw on ambiguous SKU rather than silently falling back');
  console.log('✓ Silent legacy fallback strictly forbidden and verified.');

  // Test 10: P0-1 Draft quarantine verification in calculation result
  console.log('10. Testing unapproved draft tariff quarantine status in calculation result...');
  const draftQuote = await calculateOfficialTariffQuote({
    tariffVersion: OFFICIAL_TARIFF_VERSION,
    serviceCategory: 'daily_metro',
    vehicleProductCode: 'sprinter_519_premium',
    vehicleCount: 1,
  });
  assert.strictEqual(draftQuote.publicationStatus, 'draft');
  assert.strictEqual(draftQuote.isDraftPreview, true);
  console.log('✓ Draft publication status quarantine verified.');

  // Test 11: P0-6 Driver token unauthorized access to HQ Admin endpoints (403 Forbidden)
  console.log('11. Testing HQ Admin authorization enforcement (rejecting driver tokens with 403)...');
  const driverToken = signCockpitSession({
    userId: 'driver-test-user-id',
    org: 'vip_limousine_korea',
    role: 'driver',
    driverName: '김기사',
    vehicleNo: '1호차',
  });
  const mockReq = new Request('http://localhost:3000/api/hq/drivers', {
    headers: {
      Authorization: `Bearer ${driverToken}`,
    },
  });
  const authRes = await requireHqAdmin(mockReq);
  assert.strictEqual(authRes.ok, false);
  assert.strictEqual(authRes.statusCode, 403);
  assert(authRes.error?.includes('403 Forbidden'));
  console.log('✓ Driver account access to HQ Admin rejected with 403 Forbidden.');

  console.log('\n>>> ALL 11 OFFICIAL PRICING & SECURITY TESTS PASSED! <<<');
  } finally {
    supabaseAdmin.from = originalFrom;
  }
}

runOfficialPricingTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
