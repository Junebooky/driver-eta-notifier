import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dispatch = readFileSync(new URL('../components/hq/HqQuickDispatch.tsx', import.meta.url), 'utf8');
const timeField = readFileSync(new URL('../components/hq/ui/HqDispatchTimeField.tsx', import.meta.url), 'utf8');

test('existing dispatch departure and end times have visible editable controls', () => {
  assert.ok(dispatch.includes('<HqDispatchTimeField'));
  assert.ok(dispatch.includes('label="출발 시간"'));
  assert.ok(dispatch.includes('label="종료 시간"'));
  assert.ok(dispatch.includes('value={pickupTimeOnly}'));
  assert.ok(dispatch.includes('value={endTime}'));
  assert.ok(dispatch.includes('setPickupTimeOnly(nextTime)'));
  assert.ok(dispatch.includes('setEndTime(nextTime)'));
  assert.ok(timeField.includes('type="text"'));
  assert.ok(timeField.includes('aria-label={`${label} 직접 입력`}'));
  assert.ok(timeField.includes('aria-label={`${label} 목록 열기`}'));
  assert.ok(timeField.includes('onClick={() => choose(option)}'));
  assert.ok(timeField.includes('flex max-h-56 flex-col'));
  assert.ok(timeField.includes('relative z-20 mt-3'));
  assert.ok(!dispatch.includes("endTime ? formatTimeKoreanAmPm(endTime) : '오후 09:00'"));
});

test('A-style time fields show readable one-per-row options and allow both fields to stay open', () => {
  assert.ok(timeField.includes('placeholder="미지정"'));
  assert.ok(timeField.includes("<span>미지정</span>"));
  assert.ok(timeField.includes('flex max-h-56 flex-col'));
  assert.ok(timeField.includes('w-full shrink-0 items-center justify-between'));
  assert.ok(timeField.includes("!target?.closest('[data-hq-dispatch-time]')"));
  assert.ok(timeField.includes("if (event.key === 'Escape')"));
  assert.ok(!timeField.includes('grid-cols-3'));
  assert.ok(!timeField.includes('sm:grid-cols-4'));
});

test('schedule values are shown separately without replacing current dispatch inputs', () => {
  assert.ok(dispatch.includes('aria-label="스케줄 기준 배차 정보"'));
  assert.ok(dispatch.includes('스케줄 차량'));
  assert.ok(dispatch.includes('스케줄 출발 시간'));
  assert.ok(dispatch.includes('스케줄 종료 시간'));
  assert.ok(dispatch.includes('initialBooking.vehiclePlate'));
  assert.ok(dispatch.includes('initialBooking.pickupTime'));
  assert.ok(dispatch.includes('initialBooking.endTime'));
  assert.ok(dispatch.includes('originalDispatchBaseline?.vehiclePlate'));
  assert.ok(dispatch.includes('originalDispatchBaseline?.pickupTime'));
  assert.ok(dispatch.includes('originalDispatchBaseline?.endTime'));
  assert.ok(dispatch.includes('최초 스케줄 기준 정보'));
  assert.ok(dispatch.includes('현재 배차와 다름'));
  assert.ok(dispatch.includes('rounded-[20px] bg-[#F7F9FC]'));
});

test('existing vehicle and driver selectors use live choices and availability', () => {
  assert.ok(dispatch.includes('renderAllocationSelector(firstAlloc, 0)'));
  assert.ok(dispatch.includes('allocations.map((allocation, index) => renderAllocationSelector(allocation, index))'));
  assert.ok(dispatch.includes("type: 'vehicle'"));
  assert.ok(dispatch.includes("type: 'driver'"));
  assert.ok(dispatch.includes('filteredVehiclesForDropdown.map((v) =>'));
  assert.ok(dispatch.includes('filteredDriversForDropdown.map((d) =>'));
  assert.ok(dispatch.includes('disabled={!v.isAvailable || !fleet.data}'));
  assert.ok(dispatch.includes("initialBooking ? 'relative mt-2'"));
  assert.ok(dispatch.includes('const fleet = useFleetAvailability('));
  assert.ok(dispatch.includes('handleSelectVehicle(allocation.id, v)'));
  assert.ok(dispatch.includes('handleSelectDriver(allocation.id, d)'));
});

test('saving an already-published assignment keeps published status and never clears its assignment', () => {
  assert.ok(dispatch.includes("['배차 완료', '재확인 필요'].includes(initialBooking.dispatchStatus)"));
  assert.ok(dispatch.includes("if (isPreviouslyPublished) {\n                handleSubmit('published');"));
  assert.ok(dispatch.includes("handleSubmit('unassigned')"));
  assert.ok(dispatch.includes("const currentVehiclePlate = firstAlloc?.selectedVehiclePlate ?? initialBooking?.vehiclePlate ?? ''"));
  assert.ok(dispatch.includes("const currentDriverId = firstAlloc?.selectedDriver ?? initialBooking?.driverId ?? ''"));
  assert.ok(dispatch.includes('totalLiveConflicts > 0'));
  assert.ok(dispatch.includes('validateDispatchInterval'));
});
