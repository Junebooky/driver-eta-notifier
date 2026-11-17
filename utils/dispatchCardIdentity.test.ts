import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAUFFEUR_POSITION_OPTIONS,
  formatBilingualChauffeurName,
  getEnglishPosition,
  validateDispatchCardProfile,
} from '@/lib/dispatchCards/chauffeurIdentity';
import { VIP_REAL_VEHICLES, getVehicleImage } from './vehicleData';

test('VIP card roles are exactly Chauffeur and Senior Chauffeur', () => {
  assert.deepEqual(CHAUFFEUR_POSITION_OPTIONS.map(option => option.value),
    ['chauffeur', 'senior_chauffeur']);
  assert.equal(getEnglishPosition('chauffeur'), 'Chauffeur');
  assert.equal(getEnglishPosition('senior_chauffeur'), 'Senior Chauffeur');
  assert.equal(getEnglishPosition('상무'), '');
  assert.equal(formatBilingualChauffeurName('윤태준', 'Tae-jun Yun'), '윤태준 · Tae-jun Yun');
});

test('English chauffeur name and selected role must be explicitly provided', () => {
  const source = { koreanName: '윤태준', englishName: '  Tae-jun  Yun ', phone: '010-0000-0000', positionCode: 'chauffeur' };
  const valid = validateDispatchCardProfile(source);
  assert.deepEqual(valid, {
    koreanName: '윤태준', englishName: 'Tae-jun Yun', phone: '010-0000-0000', positionCode: 'chauffeur',
  });
  assert.equal(validateDispatchCardProfile({ ...source, englishName: '' }), null);
  assert.equal(validateDispatchCardProfile({ ...source, positionCode: 'Executive Director' }), null);
  assert.equal(validateDispatchCardProfile({ ...source, positionCode: '' }), null);
});

test('only Sprinter 8040 is 319 CDI; remaining registered Sprinters are 519 CDI', () => {
  const cars = VIP_REAL_VEHICLES.filter(vehicle => vehicle.category === 'sprinter');
  assert.equal(cars.length, 9);
  for (const car of cars) {
    const expected = car.plateShort === '8040' ? '319 CDI' : '519 CDI';
    assert.ok(car.model.endsWith(expected), car.plate + ' / ' + car.model);
    assert.ok(car.modelShort.endsWith(expected), car.plate + ' / ' + car.modelShort);
    assert.equal(car.subType, expected);
    assert.ok(!/투어러|tourer/i.test(car.model + car.modelShort));
    assert.equal(getVehicleImage(car), '/images/vehicles/sprinter_' + (car.plateShort === '8040' ? '319' : '519') + '.webp');
  }
});
