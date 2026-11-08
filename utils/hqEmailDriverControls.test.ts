import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('email revision rows use shared searchable candidate/driver/vehicle dropdowns', () => {
  const view = source('components/hq/email/HqEmailBatchRevisionPanel.tsx');
  assert.equal((view.match(/<HqSearchSelect/g) || []).length, 3);
  assert.doesNotMatch(view, /<select\b/);
  assert.match(view, /alreadyUsed\.has\(item\.scheduleId\)/);
  assert.match(view, /onSelect\(row\.key, next\)/);
  assert.match(view, /onAssignment\(row\.key/);
  assert.match(view, /cancelAcknowledged/);
  assert.match(view, /cancelIds\.every/);
  assert.match(view, /onCancelReason\(item\.scheduleId, e\.target\.value\)/);
});

test('email batch vehicle options use registered active fleet, with no hardcoded fallback', () => {
  const view = source('components/hq/email/HqEmailBatchRevisionPanel.tsx');
  const hook = source('hooks/useHqFleetRegistry.ts');
  assert.match(view, /useHqFleetRegistry\(showAssignments\)/);
  assert.match(view, /fleet\.vehicles\.map\(vehicle =>/);
  assert.match(view, /disabled=\{isSubmitting \|\| fleet\.loading \|\| !!fleet\.error\}/);
  assert.doesNotMatch(view, /VIP_REAL_VEHICLES/);
  assert.match(hook, /fetch\('\/api\/fleet\/registry'/);
  assert.match(hook, /mergeFleetRegistry\(data\.records\)/);
  assert.doesNotMatch(hook, /localStorage|VIP_REAL_VEHICLES/);
});

test('driver form and table filters share A-plan search select', () => {
  const page = source('components/hq/drivers/HqDriversView.tsx');
  const table = source('components/hq/drivers/HqDriversTableView.tsx');
  assert.match(page, /<HqSearchSelect/);
  assert.match(page, /setNewAffiliation\(next as 'employed' \| 'freelance'\)/);
  assert.equal((table.match(/<HqSearchSelect/g) || []).length, 2);
  assert.match(table, /setResidenceFilter\(next\)/);
  assert.match(table, /setStatusFilter\(next as typeof statusFilter\)/);
  assert.match(table, /setCurrentPage\(1\)/);
  assert.doesNotMatch(table, /<select\b/);
});

test('driver image manager uses active fleet and captured-target confirmation', () => {
  const view = source('components/hq/drivers/HqDriverAssetManagerModal.tsx');
  assert.match(view, /useHqFleetRegistry\(isOpen\)/);
  assert.match(view, /fleet\.vehicles\.filter/);
  assert.match(view, /fleet\.vehicles\.length/);
  assert.match(view, /assetVehicleReady/);
  assert.match(view, /role="alertdialog"/);
  assert.match(view, /driverId: activeDriver\.id/);
  assert.match(view, /vehiclePlate: activeVehicle\.plate/);
  assert.match(view, /driverId: pendingDelete\.driverId/);
  assert.match(view, /vehiclePlate: pendingDelete\.vehiclePlate/);
  assert.match(view, /bundleRequestSequence/);
  assert.match(view, /requestId !== bundleRequestSequence\.current/);
  assert.doesNotMatch(view, /VIP_REAL_VEHICLES|<select\b/);
  assert.doesNotMatch(view, /if \(!confirm\(|alert\(json\./);
});

test('asset upload/view/delete/dispatch resolve from real cockpit vehicles UUID', () => {
  const resolver = source('lib/fleet/resolveRegisteredVehicle.ts');
  const upload = source('app/api/hq/drivers/assets/upload/route.ts');
  const assets = source('app/api/hq/drivers/assets/route.ts');
  const dispatch = source('app/api/hq/drivers/assets/dispatch/route.ts');
  const store = source('lib/assets/driverAssetServerStore.ts');
  assert.match(resolver, /readFleetRegistry\(\)/);
  assert.match(resolver, /matching\.archived && !options\.allowArchived/);
  assert.match(resolver, /matching\.profile\.uuid !== matching\.vehicle_id/);
  assert.doesNotMatch(resolver, /getDeterministicVehicleUuid|VIP_REAL_VEHICLES/);
  assert.match(upload, /await resolveRegisteredFleetVehicle\(vehicleIdParam \|\| vehiclePlate/);
  assert.match(assets, /await resolveRegisteredFleetVehicle\(vehicleIdParam \|\| vehiclePlate!/);
  assert.match(assets, /getDriverVehicleBundle\(driverId, resolvedVehicle\.uuid, undefined, org, resolvedVehicle\)/);
  assert.match(dispatch, /await resolveRegisteredFleetVehicle\(canonicalPlate\)/);
  assert.match(dispatch, /getDriverVehicleBundle\(driverId, effVehicle\.uuid, effVehicle\.model, org, effVehicle\)/);
  assert.match(store, /registeredVehicle \|\| resolveVehicleEntity/);
});
