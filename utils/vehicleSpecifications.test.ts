import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIP_REAL_VEHICLES,
  VIP_VEHICLE_FLEET_CATEGORIES,
  findVipVehicle,
  reconcileRegisteredVehicle,
  resolveVehicleEntity,
} from './vehicleData';

const registered = (shortPlate: string) => {
  const vehicle = VIP_REAL_VEHICLES.find((v) => v.plateShort === shortPlate);
  assert.ok(vehicle, `Missing canonical vehicle ${shortPlate}`);
  return vehicle;
};

test('20 registered vehicles retain immutable identity and unique plates', () => {
  assert.equal(VIP_REAL_VEHICLES.length, 20);
  assert.equal(new Set(VIP_REAL_VEHICLES.map((v) => v.uuid)).size, 20);
  assert.equal(new Set(VIP_REAL_VEHICLES.map((v) => v.plate)).size, 20);
});

test('owner-verified sprinter seating and models (all except 9982 are 519 CDI)', () => {
  const seats: Record<string, string> = {
    '9982': '6인승',
    '1458': '9인승',
    '1058': '12인승',
    '3285': '9인승',
    '3338': '9인승',
    '2553': '12인승',
  };
  for (const [plate, capacity] of Object.entries(seats)) {
    assert.equal(registered(plate).capacity, capacity, `Incorrect seating for ${plate}`);
  }
  const sprinters = VIP_REAL_VEHICLES.filter((v) => v.category === 'sprinter');
  assert.equal(sprinters.length, 9);
  for (const v of sprinters) {
    const expected = v.plateShort === '9982' ? '319 CDI' : '519 CDI';
    assert.equal(v.model, `벤츠 스프린터 ${expected}`, v.plate);
    assert.equal(v.subType, expected, v.plate);
    assert.ok(!/투어러|tourer/i.test(v.model + v.modelShort + v.subType), v.plate);
    assert.equal(v.fuelType, '디젤', v.plate);
  }
  const summary = VIP_VEHICLE_FLEET_CATEGORIES.find((v) => v.id === 'sprinter');
  assert.ok(summary?.details.includes('319 CDI 1대 · 519 CDI 8대'));
});

test('all Staria models have 9 seats, 1514 uses gasoline, the others diesel', () => {
  const starias = VIP_REAL_VEHICLES.filter((v) => v.category === 'staria');
  assert.equal(starias.length, 4);
  for (const v of starias) {
    assert.equal(v.capacity, '9인승', v.plate);
    assert.equal(v.fuelType, v.plateShort === '1514' ? '가솔린' : '디젤', v.plate);
  }
});

test('both Carnival plates are gasoline-powered high-limousines', () => {
  const carnivals = VIP_REAL_VEHICLES.filter((v) => v.category === 'carnival');
  assert.equal(carnivals.length, 2);
  for (const v of carnivals) {
    assert.equal(v.model, '기아 카니발 하이리무진');
    assert.equal(v.subType, '카니발 하이리무진');
    assert.equal(v.fuelType, '가솔린');
  }
  assert.deepEqual(carnivals.map((v) => v.plateShort).sort(), ['5336','7681']);
});

test('all Genesis vehicles use gasoline and existing plate identities are unchanged', () => {
  const genesis = VIP_REAL_VEHICLES.filter((v) => v.category === 'genesis');
  assert.equal(genesis.length, 4);
  for (const v of genesis) assert.equal(v.fuelType, '가솔린', v.plate);
});

test('stale browser custom vehicle specs cannot override the verified fleet registry', () => {
  const canonical = registered('1458');
  const stale = {
    ...canonical,
    id: 'legacy-vehicle-id',
    uuid: '00000000-0000-4000-8000-000000000000',
    model: '벤츠 스프린터 319 CDI',
    modelShort: '스프린터 319 CDI',
    subType: '319 CDI',
    capacity: '11인승',
    fuelType: '가솔린' as const,
    year: '2023',
    color: '딥 블랙',
    adminMemo: '등록된 기존 차량 메모',
    imageUrl: '/user-uploads/sprinter1458.webp',
  };
  const corrected = reconcileRegisteredVehicle(stale);
  assert.equal(corrected.id, canonical.id);
  assert.equal(corrected.uuid, canonical.uuid);
  assert.equal(corrected.model, '벤츠 스프린터 519 CDI');
  assert.equal(corrected.capacity, '9인승');
  assert.equal(corrected.fuelType, '디젤');
  assert.equal(corrected.year, '2023');
  assert.equal(corrected.color, '딥 블랙');
  assert.equal(corrected.adminMemo, '등록된 기존 차량 메모');
  assert.equal(corrected.imageUrl, '/user-uploads/sprinter1458.webp');

  // Unregistered custom cars must remain untouched.
  const unknown = { ...stale, plate: '123가 9999', plateShort: '9999' };
  assert.equal(reconcileRegisteredVehicle(unknown), unknown);
  // Assignment resolution always picks canonical values for a registered plate.
  assert.equal(resolveVehicleEntity('700호 1458').capacity, '9인승');
  assert.equal(findVipVehicle('116허 1514')?.fuelType, '가솔린');
});
