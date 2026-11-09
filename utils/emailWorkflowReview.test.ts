import test from 'node:test';
import assert from 'node:assert/strict';
import { emailVehicleChoices, findEmailSourceRanges } from './emailWorkflowReview';
import { VIP_REAL_VEHICLES } from './vehicleData';
import type { AvailableVehicleItem } from './availabilityEngine';

const inventory = VIP_REAL_VEHICLES.slice(0, 3);
const reason = '종료 시간 확인 필요';

test('missing interval/failed availability never hides registered cars or invents permission to book', () => {
  const rows = emailVehicleChoices(inventory, undefined, reason);
  assert.equal(rows.length, inventory.length);
  assert.ok(rows.every(row => !row.isAvailable && row.unavailabilityReason === reason));
  const available = { ...rows[0], isAvailable: true, currentStatus: 'available', requestedIntervalStatus: 'available', unavailabilityReason: undefined } as AvailableVehicleItem;
  const checked = emailVehicleChoices(inventory, [available], reason);
  assert.equal(checked[0].uuid, available.uuid);
  assert.equal(checked.filter(row => row.isAvailable).length, 1);
  assert.equal(emailVehicleChoices([], [available], reason).length, 0, 'archived/missing inventory cannot be resurrected by a stale availability response');
  assert.ok(emailVehicleChoices(inventory, [{...available, uuid:'another-vehicle'}], reason).every(row=>!row.isAvailable));
});

test('bookable waiting cars sort before bookable driving and blocked cars', () => {
  const rows = emailVehicleChoices(inventory, undefined, reason);
  const checked = emailVehicleChoices(inventory, rows.map((row, index) => ({...row, isAvailable:index!==0, currentStatus:index===1?'in_service':'available'})), reason);
  assert.equal(checked[0].uuid, rows[2].uuid);
  assert.equal(checked[1].uuid, rows[1].uuid);
  assert.equal(checked[2].isAvailable, false);
});

test('client-address evidence maps exact original UTF-16 ranges across Unicode, whitespace and repeated mentions', () => {
  const body = '🚗 Pickup: １２３ Teheran-ro,\n Gangnam-gu\nReturn: 123 TEHERAN-RO, Gangnam-gu';
  const ranges = findEmailSourceRanges(body, '123 Teheran-ro, Gangnam-gu');
  assert.equal(ranges.length,2);
  assert.equal(body.slice(ranges[0].start,ranges[0].end),'１２３ Teheran-ro,\n Gangnam-gu');
  assert.equal(body.slice(ranges[1].start,ranges[1].end),'123 TEHERAN-RO, Gangnam-gu');
  assert.equal(findEmailSourceRanges(body,'123 Teheran-ro, Seocho-gu').length,0);
  assert.equal(findEmailSourceRanges(body,'   ').length,0);
  const korean='주소: 서울시 강남구 테헤란로 123';
  const match=findEmailSourceRanges(korean,'서울시강남구\t테헤란로123')[0];
  assert.equal(korean.slice(match.start,match.end),'서울시 강남구 테헤란로 123');
  const escaped='<script>alert(1)</script> address';
  assert.deepEqual(findEmailSourceRanges(escaped,'<script>'),[{start:0,end:8}]);
});
