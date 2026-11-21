import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=readFileSync(new URL('../components/hq/operations/HqOperationsBoard.tsx',import.meta.url),'utf8');

test('operations A-plan dashboard keeps KPI and event navigation interactive',()=>{
  assert.match(src,/hq-operations-a space-y-5/);
  assert.match(src,/rounded-\[24px\] bg-white/);
  assert.match(src,/onClick=\{\(\) => toggleEventAccordion\(group\.id\)\}/);
  assert.match(src,/setActiveTab\('running'\)/);
  assert.match(src,/setActiveTab\('closed'\)/);
  assert.match(src,/setSelectedEventInfo\(group\)/);
  assert.match(src,/setSelectedSchedule\(item\)/);
  assert.match(src,/setSearchQuery\(e\.target\.value\)/);
});

test('operations status labels remain individually meaningful but never use green visual fill',()=>{
  for (const label of ['운행 준비','픽업지 도착','승객 탑승','운행 중','운행 종료']) {
    assert.ok(src.includes(label),label);
  }
  assert.match(src,/in_transit:\s*\{[\s\S]*?badgeClass: 'bg-\[#EEF3FF\] text-\[#31598F\]'/);
  assert.doesNotMatch(src,/bg-emerald-|text-emerald-|border-emerald-/);
  assert.doesNotMatch(src,/bg-slate-900\/60|shadow-2xl/);
});

test('arrival notifications, event dialog and history timeline keep their handlers',()=>{
  assert.match(src,/handleSendArrivalNotice\(e, item\)/);
  assert.match(src,/handleSendArrivalNotice\(e, selectedSchedule\)/);
  assert.match(src,/selectedSchedule\.operationHistory/);
  assert.match(src,/setSelectedEventInfo\(null\)/);
  assert.match(src,/setSelectedSchedule\(null\)/);
});
