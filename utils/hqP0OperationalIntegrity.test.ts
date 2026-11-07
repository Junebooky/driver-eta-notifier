import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeFleetRegistry, type FleetRegistryRecord } from './fleetVehicleRegistry';
import { VIP_REAL_VEHICLES, type VipRealVehicle } from './vehicleData';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = VIP_REAL_VEHICLES[0];
const custom: VipRealVehicle = {
  ...base,
  id: 'vehicle-custom-100',
  uuid: 'c0f7c22a-0001-4c12-8800-000000009982',
  plate: '345가 6789',
  plateShort: '6789',
  model: '제네시스 GV80',
  modelShort: 'GV80',
  category: 'genesis',
  capacity: '6인승',
  brand: '제네시스',
};
const record = (vehicle: VipRealVehicle, archived: boolean, org = 'vip_limousine_korea'): FleetRegistryRecord => ({
  vehicle_id: vehicle.uuid, plate: vehicle.plate, profile: vehicle,
  organization_id: org, archived,
});

test('server registry includes registered custom vehicles in the same fleet as defaults', () => {
  const fleet = mergeFleetRegistry([record(custom, false)]);
  assert.equal(fleet.length, VIP_REAL_VEHICLES.length + 1);
  assert.equal(fleet.find(v => v.plate === custom.plate)?.uuid, custom.uuid);
});

test('archiving a default vehicle removes it from every HQ fleet consumer', () => {
  const fleet = mergeFleetRegistry([record(base, true)]);
  assert.equal(fleet.length, VIP_REAL_VEHICLES.length - 1);
  assert.equal(fleet.some(v => v.plate === base.plate), false);
});

test('registry rejects wrong org and mismatched plate payloads', () => {
  assert.equal(mergeFleetRegistry([record(custom, false, 'other-org')]).length, VIP_REAL_VEHICLES.length);
  assert.equal(mergeFleetRegistry([{ ...record(custom, false), plate: 'broken' }]).length, VIP_REAL_VEHICLES.length);
});

test('known fleet plates retain canonical vehicle UUID and verified capacity', () => {
  const modified = { ...base, uuid: custom.uuid, capacity: '999인승', model: '잘못된 모델' };
  const fleet = mergeFleetRegistry([record(modified, false)]);
  const vehicle = fleet.find(v => v.plate === base.plate)!;
  assert.equal(vehicle.uuid, base.uuid);
  assert.equal(vehicle.capacity, base.capacity);
  assert.equal(vehicle.model, base.model);
});

test('HQ dispatch, server validation, and availability all use the shared registry', () => {
  const availability = read('utils/availabilityEngine.ts');
  const store = read('lib/dispatch/scheduleServerStore.ts');
  const quick = read('components/hq/HqQuickDispatch.tsx');
  const vehicleManage = read('components/hq/vehicles/HqVehicleManagementView.tsx');
  assert.match(availability, /const registeredVehicles = mergeFleetRegistry\(fleetRegistry\)/);
  assert.match(store, /const fleetVehicles = mergeFleetRegistry\(await readFleetRegistry\(\)\)/);
  assert.match(quick, /\(fleet\.data\?\.vehicles \|\| \[\]\)\.map/);
  assert.match(quick, /allVehicles\.find\(v => v\.plate === resolvedPlate\)/);
  assert.doesNotMatch(quick, /const isAvailable = live \? live\.isAvailable : true/);
  assert.match(vehicleManage, /fetch\('\/api\/fleet\/registry'/);
  assert.match(vehicleManage, /await persistFleetVehicle\(newVehicle\)/);
  assert.match(vehicleManage, /method: 'DELETE'/);
  assert.match(vehicleManage, /handleImportLegacyVehicles/);
});

test('original schedule reference is server-persisted, mapped and immutable across edits', () => {
  const store = read('lib/dispatch/scheduleServerStore.ts');
  const map = read('utils/dispatchConflictDetector.ts');
  const quick = read('components/hq/HqQuickDispatch.tsx');
  assert.match(store, /existingHydrated\?\._meta\.originalDispatchBaseline \|\|/);
  assert.match(store, /originalDispatchBaseline: initialBaseline/);
  assert.match(store, /original_dispatch_baseline: meta\.originalDispatchBaseline/);
  assert.match(map, /originalDispatchBaseline: item\.original_dispatch_baseline/);
  assert.match(quick, /initialBooking\.originalDispatchBaseline\?\.vehiclePlate/);
  assert.match(quick, /initialBooking\.originalDispatchBaseline\?\.pickupTime/);
  assert.match(quick, /initialBooking\.originalDispatchBaseline\?\.endTime/);
});

test('customer contact registration and log reviews do not claim unverified success', () => {
  const contacts = read('components/hq/customers/HqCustomersView.tsx');
  const logs = read('components/hq/driving-logs/HqDrivingLogsView.tsx');
  assert.match(contacts, /<HqCustomerAddContactModal/);
  assert.match(contacts, /await saveContactToCrmDb\(/);
  assert.match(contacts, /await fetchHqCustomersFromDb\(\)/);
  assert.doesNotMatch(contacts, /신규 담당자 추가 모달을 호출합니다/);
  assert.doesNotMatch(logs, /updateHqDrivingLogStatus\(/);
  assert.match(logs, /if \(!ok\) \{\s+showToast\('승인 저장에 실패/);
  assert.match(logs, /if \(!ok\) \{\s+showToast\('보완 요청 저장에 실패/);
  assert.match(logs, /if \(!ok\) \{\s+showToast\('반려 저장에 실패/);
});
