import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIP_REAL_VEHICLES } from './vehicleData';
import { resolveDispatchCardPhotos, dispatchCardVehicleLabel } from '@/lib/dispatchCards/dispatchCardAssets';
import { DISPATCH_CARD_DIMENSIONS } from '@/lib/dispatchCards/renderDispatchCard';

test('dispatch card builder: only verified vehicle photos may be used', () => {
  const staria = VIP_REAL_VEHICLES.filter(v => v.category === 'staria');
  assert.equal(staria.length, 4);
  for (const vehicle of staria) {
    const photos = resolveDispatchCardPhotos(vehicle);
    assert.ok(photos);
    assert.equal(photos.source, 'model');
    assert.equal(photos.exterior, '/images/dispatch_cards/vehicles/staria/exterior.webp');
    assert.equal(photos.interiorOne, '/images/dispatch_cards/vehicles/staria/interior_01.webp');
    assert.equal(photos.interiorTwo, '/images/dispatch_cards/vehicles/staria/interior_02.webp');
    assert.equal(dispatchCardVehicleLabel(vehicle), 'Staria Limousine');
  }

  const sprinter1458 = VIP_REAL_VEHICLES.find(v => v.plateShort === '1458');
  assert.ok(sprinter1458);
  const sprinterPhotos = resolveDispatchCardPhotos(sprinter1458);
  assert.ok(sprinterPhotos);
  assert.equal(sprinterPhotos.source, 'vehicle');
  assert.match(sprinterPhotos.exterior, /sprinter_519\/1458\/exterior\.webp$/);
  assert.match(sprinterPhotos.interiorOne, /sprinter_519\/1458\/interior_02\.webp$/);
  assert.match(sprinterPhotos.interiorTwo, /sprinter_519\/1458\/interior_03\.webp$/);

  const otherSprinters = VIP_REAL_VEHICLES.filter(v =>
    v.category === 'sprinter' && v.plateShort !== '1458');
  assert.ok(otherSprinters.length > 0);
  for (const vehicle of otherSprinters) {
    assert.equal(resolveDispatchCardPhotos(vehicle), null,
      'Other Sprinter interiors must never borrow the 1458 photo.');
  }

  const unknown = VIP_REAL_VEHICLES.find(v => v.category === 'genesis');
  assert.ok(unknown);
  assert.equal(resolveDispatchCardPhotos(unknown), null,
    'A generic fleet thumbnail cannot replace the required 3-card photo set.');
});

test('dispatch card exports match approved original formats', () => {
  assert.deepEqual(DISPATCH_CARD_DIMENSIONS.pc, { width: 2000, height: 1500 });
  assert.deepEqual(DISPATCH_CARD_DIMENSIONS.mobile, { width: 1080, height: 1920 });
});

test('all mapped uploaded assets exist and contain WebP bytes', () => {
  const mappedVehicles = VIP_REAL_VEHICLES.filter(v => resolveDispatchCardPhotos(v) !== null);
  const paths = new Set<string>();
  for (const vehicle of mappedVehicles) {
    const photos = resolveDispatchCardPhotos(vehicle);
    assert.ok(photos);
    paths.add(photos.exterior);
    paths.add(photos.interiorOne);
    paths.add(photos.interiorTwo);
  }
  assert.equal(paths.size, 6, 'Expected exactly the six user-uploaded images.');
  for (const urlPath of paths) {
    const file = join(process.cwd(), 'public', urlPath.replace(/^\//, ''));
    const bytes = readFileSync(file);
    assert.ok(bytes.length > 100_000, file + ': unexpectedly small');
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file + ': missing RIFF header');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file + ': not a WebP image');
  }
});
