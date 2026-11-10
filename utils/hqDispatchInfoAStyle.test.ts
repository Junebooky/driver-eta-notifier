import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const info = read('components/hq/HqQuickDispatch.tsx');
const customerCard = read('components/hq/bookings/HqDriverVehicleInfoModal.tsx');
const table = read('components/hq/HqDispatchTable.tsx');
const css = read('app/globals.css');

test('all three requested image assets exist in the committed project',()=>{
  for (const path of [
    'public/images/icons/driver_ui/icon_talk.png',
    'public/images/icons/eemail/icon_email.png',
    'public/images/icons/drivers/icon_profile_card.png',
  ]) assert.ok(existsSync(new URL('../'+path, import.meta.url)), path);
});

test('existing booking details retain every working action and use requested simple Korean labels',()=>{
  assert.match(info, /onOpenDriverVehicleInfo\(initialBooking\)/);
  assert.match(info, /onOpenCustomerMessage\(initialBooking\)/);
  assert.match(info, /renderAllocationSelector\(firstAlloc, 0\)/);
  assert.match(info, /allocations\.map\(\(allocation, index\) => renderAllocationSelector\(allocation, index\)\)/);
  assert.match(info, /setActiveCardDropdown\(\{ allocId: allocation\.id, type: 'vehicle' \}\)/);
  assert.match(info, /setActiveCardDropdown\(\{ allocId: allocation\.id, type: 'driver' \}\)/);
  assert.match(info, /handleSubmit\('unassigned'\)/);
  assert.match(info, /handleSubmit\('published'\)/);
  assert.match(info, /handleDeleteDispatch/);
  assert.match(info, /hardDeleteHqSchedule\(targetId, 'booking', undefined, deleteMode\)/);
  assert.match(info, /initialBooking \? '변경 내용 저장' : '예약만 등록'/);
  assert.match(info, /initialBooking \? '배차 확정' : '바로 배차'/);
  assert.ok(info.includes('배차 삭제'));
  assert.ok(info.includes('배차 완전 삭제'));
  assert.match(table, /placeholder="고객사, 승객, 목적지 검색"/);
});

test('dispatch info uses A-plan white cards, neutral shadows and scoped mobile input styles',()=>{
  assert.match(info, /hq-dispatch-info-a bg-transparent/);
  assert.match(info, /max-w-\[760px\]/);
  assert.match(info, /bg-\[#FAFBFD\]/);
  assert.match(info, /shadow-\[0_6px_20px_rgba\(35,49,78,0\.055\)/);
  assert.match(css, /\.hq-dispatch-info-a :is\(input\[type="text"\]/);
  assert.match(css, /background-color: #FFFFFF/);
  assert.match(css, /box-shadow: 0 5px 16px rgba\(35, 49, 78, 0\.045\)/);
  assert.match(css, /font-size: 16px/);
});

test('customer card still records preparation vs confirmed manual send without pretending to auto-send',()=>{
  assert.match(customerCard, /isPreparationOnly: !manualDeliveryConfirmed/);
  assert.match(customerCard, /manualDeliveryConfirmed,/);
  assert.match(customerCard, /onDispatchRecorded\?\./);
  assert.match(customerCard, /autoComplete="off"/);
  assert.ok(customerCard.includes('자동으로 발송되지 않아요.'));
});
