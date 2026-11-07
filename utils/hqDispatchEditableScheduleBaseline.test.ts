import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dispatch = readFileSync(new URL('../components/hq/HqQuickDispatch.tsx', import.meta.url), 'utf8');

test('existing dispatch departure and end times have visible editable controls', () => {
  assert.ok(dispatch.includes('aria-label="출발 시간 수정"'));
  assert.ok(dispatch.includes('aria-label="종료 시간 수정"'));
  assert.ok(dispatch.includes('value={pickupTimeOnly}'));
  assert.ok(dispatch.includes('value={endTime}'));
  assert.ok(dispatch.includes('setPickupTimeOnly(event.target.value)'));
  assert.ok(dispatch.includes('setEndTime(event.target.value)'));
  assert.ok(!dispatch.includes("endTime ? formatTimeKoreanAmPm(endTime) : '오후 09:00'"));
});

test('schedule values are shown separately without replacing current dispatch inputs', () => {
  assert.ok(dispatch.includes('aria-label="스케줄 기준 배차 정보"'));
  assert.ok(dispatch.includes('스케줄 차량'));
  assert.ok(dispatch.includes('스케줄 출발 시간'));
  assert.ok(dispatch.includes('스케줄 종료 시간'));
  assert.ok(dispatch.includes('initialBooking.vehiclePlate'));
  assert.ok(dispatch.includes('initialBooking.pickupTime'));
  assert.ok(dispatch.includes('initialBooking.endTime'));
  assert.ok(dispatch.includes('차량 변경 중'));
  assert.ok(dispatch.includes('출발 시간 변경 중'));
  assert.ok(dispatch.includes('종료 시간 변경 중'));
  assert.ok(dispatch.includes('rounded-[20px] bg-[#F7F9FC]'));
});

test('existing vehicle and driver selectors use live choices and availability', () => {
  assert.ok(dispatch.includes('setIsVehicleModalOpen(true)'));
  assert.ok(dispatch.includes('setIsDriverModalOpen(true)'));
  assert.ok(dispatch.includes('vehicles={fleet.data?.vehicles}'));
  assert.ok(dispatch.includes('loading={fleet.loading}'));
  assert.ok(dispatch.includes('error={fleet.error}'));
  assert.ok(dispatch.includes('drivers={hqDrivers}'));
  assert.ok(dispatch.includes('requiredLanguage={commonLanguage === \'en\' ? \'english\' : \'any\'}'));
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
