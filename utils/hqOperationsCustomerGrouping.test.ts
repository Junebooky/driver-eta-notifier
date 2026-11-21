import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupOperationsByCustomer, normalizeOperationalCustomerName } from './hqOperationsCustomerGroups';

test('same customer with separate event/group IDs renders one card containing each driver', () => {
  const rows = [
    { id: 'a', customerName: 'CHANEL', groupId: 'driver-a', eventId: 'event-1', driverName: '기사 A' },
    { id: 'b', customerName: '  chanel  ', groupId: 'driver-b', eventId: 'event-2', driverName: '기사 B' },
    { id: 'c', customerName: 'ＣＨＡＮＥＬ', groupId: 'driver-c', eventId: 'event-3', driverName: '기사 C' },
    { id: 'd', customerName: 'FRED', groupId: 'driver-d', eventId: 'event-4', driverName: '기사 D' },
  ];
  const groups = groupOperationsByCustomer(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].schedules.map(row => row.driverName), ['기사 A','기사 B','기사 C']);
  assert.equal(groups[0].key, 'customer:chanel');
  assert.equal(groups[0].customerScoped, true);
  assert.deepEqual(groups[1].schedules.map(row => row.driverName), ['기사 D']);
  assert.equal(normalizeOperationalCustomerName('  VIP  LIMOUSINE　KOREA '), 'vip limousine korea');
});

test('missing/generic customer labels must not combine unrelated drivers into one deletable group', () => {
  const groups = groupOperationsByCustomer([
    { id: 'one', customerName: '고객사', groupId: 'event-A' },
    { id: 'two', customerName: '고객사', groupId: 'event-B' },
    { id: 'three', customerName: '-', eventId: 'event-C' },
  ]);
  assert.equal(groups.length, 3);
  assert.ok(groups.every(group => group.customerScoped === false));
});

test('operations keeps the updated deletion dialog copy and actions', () => {
  const file = readFileSync(new URL('../components/hq/operations/HqOperationsBoard.tsx', import.meta.url), 'utf8');
  assert.match(file, /setEventToDelete\(eventGroups\.find\(item => item\.id === group\.id\) \|\| group\)/);
  for (const phrase of [
    '이 행사를 삭제할까요?',
    '배차된 일정과 기사·차량 배정이 모두 취소돼요.',
    '한 번 삭제하면 다시 되돌릴 수 없어요.',
    '선택한 범위에 따라 관련 기록 보존 여부가 결정돼요.',
    "'삭제 중…' : '삭제하기'",
    '>\n                취소\n',
  ]) assert.ok(file.includes(phrase), phrase);
});

test('unidentified rows on overlapping or consecutive dates collapse into one card while distant dates stay separate', () => {
  const groups = groupOperationsByCustomer([
    { id: 's-1', customerName: '고객사', eventName: 'VIP 의전 행사', startDate: '2026-09-20' },
    { id: 's-2', customerName: '고객사', eventName: 'VIP 의전 행사', startDate: '2026-09-19' },
    { id: 's-3', customerName: '고객사', eventName: 'VIP 의전 행사', startDate: '2026-09-18' },
    { id: 's-4', customerName: '고객사', eventName: 'VIP 의전 행사', startDate: '2026-11-10' },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].customerScoped, false);
  assert.deepEqual(groups[0].schedules.map(r => r.id), ['s-1', 's-2', 's-3']);
  assert.equal(groups[1].customerScoped, false);
  assert.deepEqual(groups[1].schedules.map(r => r.id), ['s-4']);
});

test('unidentified rows with 고객사 미확정 and same specific eventName merge across distinct eventIds', () => {
  const groups = groupOperationsByCustomer([
    { id: 'q-1', customerName: '고객사 미확정', eventName: '[QA 원본 확인] 11/9 Car 1', eventId: 'ev-1' },
    { id: 'q-2', customerName: '고객사 미확정', eventName: '[QA 원본 확인] 11/9 Car 1', eventId: 'ev-2' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].customerScoped, false);
  assert.deepEqual(groups[0].schedules.map(r => r.id), ['q-1', 'q-2']);
});

test('named customers sharing customerId merge across English and Korean alias names', () => {
  const groups = groupOperationsByCustomer([
    { id: 'c-1', customerId: 'cust-cpb', customerName: 'Central Pacific Bank', driverName: '기사 1' },
    { id: 'c-2', customerId: 'cust-cpb', customerName: '센트럴 퍼시픽 뱅크', driverName: '기사 2' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].customerScoped, true);
  assert.deepEqual(groups[0].schedules.map(r => r.driverName), ['기사 1', '기사 2']);
});
