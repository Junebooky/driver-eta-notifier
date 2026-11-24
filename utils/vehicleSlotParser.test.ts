import assert from 'node:assert/strict';
import {
  normalizeVehicleModelName,
  parseVehicleSlotsFromRequestedClass,
  resolveVehicleSlotsForDraft,
} from './vehicleSlotParser';

console.log('Testing vehicleSlotParser...');

// Test 1: Single vehicle with 1대
{
  const slots = parseVehicleSlotsFromRequestedClass('스타리아 리무진 1대');
  assert.equal(slots.length, 1);
  assert.equal(slots[0].vehicleModel, '스타리아 리무진');
  assert.equal(slots[0].driver, null);
  assert.equal(slots[0].status, 'unassigned');
  console.log('✓ Test 1: 스타리아 리무진 1대 -> exactly 1 slot');
}

// Test 2: Single vehicle without count
{
  const slots = parseVehicleSlotsFromRequestedClass('스타리아 리무진');
  assert.equal(slots.length, 1);
  assert.equal(slots[0].vehicleModel, '스타리아 리무진');
  console.log('✓ Test 2: 스타리아 리무진 -> exactly 1 slot');
}

// Test 3: Multiple vehicles of same type
{
  const slots = parseVehicleSlotsFromRequestedClass('카니발 2대');
  assert.equal(slots.length, 2);
  assert.equal(slots[0].vehicleModel, '카니발 하이리무진 (1호차)');
  assert.equal(slots[1].vehicleModel, '카니발 하이리무진 (2호차)');
  console.log('✓ Test 3: 카니발 2대 -> 2 slots with 1호차 / 2호차 labels');
}

// Test 4: Multiple vehicles of different types
{
  const slots = parseVehicleSlotsFromRequestedClass('스프린터 1대, G90 1대');
  assert.equal(slots.length, 2);
  assert.equal(slots[0].vehicleModel, '스프린터 319 CDI');
  assert.equal(slots[1].vehicleModel, 'G90 LWB');
  console.log('✓ Test 4: 스프린터 1대, G90 1대 -> 2 separate model slots');
}

// Test 5: Typo normalization (CDOI -> CDI)
{
  const normalized = normalizeVehicleModelName('스프린터 319 CDOI');
  assert.equal(normalized, '스프린터 319 CDI');
  const slots = parseVehicleSlotsFromRequestedClass('스프린터 319 CDOI 2대');
  assert.equal(slots.length, 2);
  assert.equal(slots[0].vehicleModel, '스프린터 319 CDI (1호차)');
  assert.equal(slots[1].vehicleModel, '스프린터 319 CDI (2호차)');
  console.log('✓ Test 5: 319 CDOI typo normalized to 319 CDI');
}

// Test 6: Unspecified / Empty / 차종 미정
{
  const slots1 = parseVehicleSlotsFromRequestedClass('차종 미정');
  assert.equal(slots1.length, 1);
  assert.equal(slots1[0].vehicleModel, '차량 미지정');

  const slots2 = parseVehicleSlotsFromRequestedClass('');
  assert.equal(slots2.length, 1);
  assert.equal(slots2[0].vehicleModel, '차량 미지정');

  const slots3 = parseVehicleSlotsFromRequestedClass(null);
  assert.equal(slots3.length, 1);
  assert.equal(slots3[0].vehicleModel, '차량 미지정');
  console.log('✓ Test 6: Unspecified / empty -> 1 unassigned slot with "차량 미지정"');
}

// Test 7: Date-scoped parenthetical replacement notes must never spawn phantom extra vehicle slots
{
  const slots = parseVehicleSlotsFromRequestedClass(
    '카니발 하이 리무진 1대, 벤츠 스프린터 리무진 1대 (11/9 스타리아 라운지 대체)'
  );
  assert.equal(slots.length, 2);
  assert.deepEqual(
    slots.map((s) => s.vehicleModel),
    ['카니발 하이리무진', '스프린터 319 CDI']
  );

  const specWithParens = parseVehicleSlotsFromRequestedClass(
    '카니발 1대 (11/8~11/13), 벤츠 스프린터 (519 CDI) 1대 (11/9, 11/13 스타리아 대체)'
  );
  assert.equal(specWithParens.length, 2);
  assert.deepEqual(
    specWithParens.map((s) => s.vehicleModel),
    ['카니발 하이리무진', '스프린터 519 CDI']
  );

  const slashSeparated = parseVehicleSlotsFromRequestedClass('스프린터 1대 / G90 1대');
  assert.equal(slashSeparated.length, 2);
  assert.deepEqual(
    slashSeparated.map((s) => s.vehicleModel),
    ['스프린터 319 CDI', 'G90 LWB']
  );

  const singleWithDateRange = parseVehicleSlotsFromRequestedClass('카니발 하이리무진 11/8~11/13');
  assert.equal(singleWithDateRange.length, 1);
  assert.equal(singleWithDateRange[0].vehicleModel, '카니발 하이리무진');

  const multiCarSchedules = [
    { id: 'car-1', label: 'Car 1 일정표_v2.xlsx', dates: ['2026-11-08'], waypoints: [] },
    { id: 'car-2', label: 'Car 2 일정표_v2.xlsx', dates: ['2026-11-08'], waypoints: [] },
  ];
  const mergedSlots = resolveVehicleSlotsForDraft({
    requestedVehicleClass: '카니발 하이 리무진 1대, 벤츠 스프린터 리무진 1대 (11/9 스타리아 라운지 대체)',
    excelVehicleSchedules: multiCarSchedules,
  } as any);
  assert.equal(mergedSlots.length, 2);

  const car1Slots = resolveVehicleSlotsForDraft({
    requestedVehicleClass: '카니발 하이 리무진 1대, 벤츠 스프린터 리무진 1대 (11/9 스타리아 라운지 대체)',
    excelVehicleSchedules: multiCarSchedules,
    activeVehicleScheduleId: 'car-1',
  } as any);
  assert.equal(car1Slots.length, 1);
  assert.equal(car1Slots[0].vehicleModel, '카니발 하이리무진');

  const car2Slots = resolveVehicleSlotsForDraft({
    requestedVehicleClass: '카니발 하이 리무진 1대, 벤츠 스프린터 리무진 1대 (11/9 스타리아 라운지 대체)',
    excelVehicleSchedules: multiCarSchedules,
    activeVehicleScheduleId: 'car-2',
  } as any);
  assert.equal(car2Slots.length, 1);
  assert.equal(car2Slots[0].vehicleModel, '스프린터 319 CDI');
  console.log('✓ Test 7: Parenthetical date notes do not create 3rd slots & active Excel tab scopes slot count');
}

console.log('All vehicleSlotParser tests passed successfully!');
