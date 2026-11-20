import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '@/lib/dispatchCards/dispatchCardAssetManifest.json';

const availableImageSets: Record<string, { exterior: string; interiorOne: string; interiorTwo: string }> = manifest;
import { VIP_REAL_VEHICLES } from './vehicleData';
import { dispatchCardModelFolder, dispatchCardVehicleLabel, resolveDispatchCardPhotos } from '@/lib/dispatchCards/dispatchCardAssets';
import { DISPATCH_CARD_DIMENSIONS } from '@/lib/dispatchCards/renderDispatchCard';
import {
  calculatePortraitCrop,
  DEFAULT_DISPATCH_PORTRAIT_PLACEMENT,
  normalizePortraitPlacement,
  parsePortraitPlacement,
} from '@/lib/dispatchCards/portraitCrop';

test('initial assets: Staria shared, 1458-specific Sprinter, no seat mixups', () => {
  const staria = VIP_REAL_VEHICLES.filter(v => v.category === 'staria');
  assert.equal(staria.length, 4);
  for (const vehicle of staria) {
    const photos = resolveDispatchCardPhotos(vehicle);
    assert.ok(photos);
    assert.equal(photos.source, 'model');
    assert.equal(photos.exterior, '/images/dispatch_cards/vehicles/staria/exterior.webp');
  }
  const sprinter1458 = VIP_REAL_VEHICLES.find(v => v.plateShort === '1458');
  assert.ok(sprinter1458);
  const photos = resolveDispatchCardPhotos(sprinter1458);
  assert.ok(photos);
  assert.equal(photos.source, 'vehicle');
  assert.match(photos.interiorOne, /sprinter_519\/1458\/interior_02\.webp$/);
  assert.match(photos.interiorTwo, /sprinter_519\/1458\/interior_03\.webp$/);
  for (const other of VIP_REAL_VEHICLES.filter(v => v.category === 'sprinter' && v.plateShort !== '1458')) {
    assert.equal(resolveDispatchCardPhotos(other), null);
  }
});

test('new-model mapping is ready for Carnival 5336 and vehicle-specific overrides', () => {
  const carnival = VIP_REAL_VEHICLES.find(v => v.plateShort === '5336');
  assert.ok(carnival);
  assert.equal(dispatchCardModelFolder(carnival), 'carnival_high');
  // Until an actual complete photo set is uploaded, it must remain unavailable.
  if (!availableImageSets['carnival_high']) assert.equal(resolveDispatchCardPhotos(carnival), null);
});

test('all advertised image triplets physically exist as WebP', () => {
  for (const [folder, photos] of Object.entries(manifest)) {
    assert.match(folder, /^[a-zA-Z0-9_/-]+$/);
    const paths = [photos.exterior, photos.interiorOne, photos.interiorTwo];
    assert.equal(new Set(paths).size, 3);
    for (const url of paths) {
      const file = join(process.cwd(), 'public', url.replace(/^\//, ''));
      const bytes = readFileSync(file);
      assert.ok(bytes.length > 100, file + ' unexpectedly small');
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file);
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file);
    }
  }
  assert.deepEqual(DISPATCH_CARD_DIMENSIONS.pc, { width: 2000, height: 1500 });
  assert.deepEqual(DISPATCH_CARD_DIMENSIONS.mobile, { width: 1080, height: 1920 });
});

test('each chauffeur can save an independent bounded crop, with a safe default', () => {
  assert.deepEqual(normalizePortraitPlacement(undefined), { zoom: 118, x: 0, y: 0 });
  assert.deepEqual(parsePortraitPlacement({ zoom: 215, x: -22, y: 13 }), { zoom: 215, x: -22, y: 13 });
  assert.equal(parsePortraitPlacement({ zoom: 241, x: 0, y: 0 }), null);
  assert.equal(parsePortraitPlacement({ zoom: 120, x: 60, y: 0 }), null);
  assert.equal(parsePortraitPlacement({ zoom: '120', x: 0, y: 0 }), null);
  assert.equal(parsePortraitPlacement({ zoom: NaN, x: 0, y: 0 }), null);
});

test('800x800 portrait covers both card frames without a blank strip even at slider extremes', () => {
  const frames = [
    { x: 1326, y: 288, w: 430, h: 537 },
    { x: 75, y: 1218, w: 297, h: 370 },
  ];
  for (const frame of frames) {
    for (const placement of [
      DEFAULT_DISPATCH_PORTRAIT_PLACEMENT,
      { zoom: 100, x: -50, y: -50 },
      { zoom: 100, x: 50, y: 50 },
      { zoom: 240, x: -50, y: 50 },
      { zoom: 240, x: 50, y: -50 },
      { zoom: 160, x: 23, y: -18 },
    ]) {
      const image = calculatePortraitCrop(800, 800, frame, placement);
      const tolerance = 1e-7;
      assert.ok(image.x <= frame.x + tolerance, JSON.stringify({ image, frame, placement }));
      assert.ok(image.y <= frame.y + tolerance, JSON.stringify({ image, frame, placement }));
      assert.ok(image.x + image.w >= frame.x + frame.w - tolerance);
      assert.ok(image.y + image.h >= frame.y + frame.h - tolerance);
      assert.ok(image.w >= frame.w && image.h >= frame.h);
    }
  }
});

test('customer card names use official Mercedes-Benz Sprinter and the verified seats for each plate', () => {
  const seating: Record<string, number> = {
    '9982': 6, '1458': 9, '8040': 11, '2658': 15, '3864': 15,
    '3338': 9, '2553': 12, '3285': 9, '1058': 12,
  };
  const sprinters = VIP_REAL_VEHICLES.filter(vehicle => vehicle.category === 'sprinter');
  assert.equal(sprinters.length, Object.keys(seating).length);
  for (const vehicle of sprinters) {
    const expectedModel = vehicle.plateShort === '9982' ? '319' : '519';
    assert.equal(
      dispatchCardVehicleLabel(vehicle),
      `Mercedes-Benz Sprinter ${expectedModel} CDI · ${seating[vehicle.plateShort]} Seats`,
      vehicle.plate,
    );
  }

  // Stale DB labels must not change the model-specific photo lookup.
  for (const plate of ['9982', '8040']) {
    const car = sprinters.find(vehicle => vehicle.plateShort === plate);
    assert.ok(car);
    const staleModel = plate === '9982' ? '벤츠 스프린터 519 CDI' : '벤츠 스프린터 319 CDI';
    assert.equal(dispatchCardModelFolder({ ...car, model: staleModel }), plate === '9982' ? 'sprinter_319' : 'sprinter_519');
  }

  // A stale DB row must never change the customer-visible model or seat count.
  const sprinter1458 = sprinters.find(vehicle => vehicle.plateShort === '1458');
  assert.ok(sprinter1458);
  const stale = { ...sprinter1458, modelShort: '스프린터 319 CDI', capacity: '15인승' };
  assert.equal(dispatchCardVehicleLabel(stale), 'Mercedes-Benz Sprinter 519 CDI · 9 Seats');

  const staria = VIP_REAL_VEHICLES.find(vehicle => vehicle.plateShort === '8407');
  assert.ok(staria);
  assert.equal(dispatchCardVehicleLabel(staria), 'Staria Limousine · 9 Seats');
  const s560 = VIP_REAL_VEHICLES.find(vehicle => vehicle.plateShort === '3343');
  assert.ok(s560);
  assert.equal(dispatchCardVehicleLabel(s560), 'Mercedes-Benz S560 · 4 Seats');
  assert.equal(dispatchCardVehicleLabel({ model: '스프린터 519 CDI', modelShort: '스프린터 519 CDI' }),
    'Mercedes-Benz Sprinter 519 CDI');
});
