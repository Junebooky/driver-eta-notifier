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

test('operations keeps the user-approved exact deletion dialog copy and actions', () => {
  const file = readFileSync(new URL('../components/hq/operations/HqOperationsBoard.tsx', import.meta.url), 'utf8');
  for (const phrase of [
    '이 행사를 삭제할까요?',
    '배차된 일정과 기사·차량 배정이 모두 취소돼요.',
    '한 번 삭제하면 다시 되돌릴 수 없어요.',
    '운행일지나 정산 기록이 남아있는 예약은 안전하게 보관돼요.',
    "'삭제 중…' : '삭제하기'",
    '>\n                취소\n',
  ]) assert.ok(file.includes(phrase), phrase);
});
