import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const list=r('components/hq/driving-logs/HqDrivingLogsView.tsx');
const table=r('components/hq/driving-logs/HqDrivingLogsTable.tsx');
const detail=r('components/hq/driving-logs/HqDrivingLogDetailPanel.tsx');
const expense=r('components/hq/driving-logs/HqLogExpenseDetailModal.tsx');

test('driving reports A-plan retains review status selections and keyboard-accessible rows',()=>{
  assert.match(table,/onSelectStatus\?\./);
  assert.match(table,/totalCount/);
  assert.match(table,/selectedIds/);
  assert.match(table,/rounded-\[23px\] bg-white/);
  assert.doesNotMatch(table,/bg-slate-900/);
  assert.match(list,/HqDrivingLogsTable/);
});
test('driving log detail retains original report and approval/revision/reject dispatch using shared HQ UI primitives',()=>{
  assert.match(detail,/onRequestRevision\(log\.id/);
  assert.match(detail,/onReject\(log\.id/);
  assert.match(detail,/onClose\?\.\(\)/);
  assert.match(detail,/case '승인 완료':/);
  assert.match(detail,/<HqModal/);
  assert.match(detail,/<HqCard/);
  assert.match(detail,/<HqBadge/);
  assert.match(detail,/<HqButton/);
  assert.match(detail,/<HqTextarea/);
  assert.match(detail,/shadow-\[0_6px_20px/);
  assert.doesNotMatch(detail,/shadow-2xl|\(ID: \{log\.id\}\)|<span>전체보기<\/span>/);
});
test('expense details retain matched amounts, receipt previews and use shared HQ modal/card/badge primitives',()=>{
  assert.match(expense,/matchingExpenses\.map/);
  assert.match(expense,/totalAmount\.toLocaleString\(\)/);
  assert.match(expense,/onClose\(\)/);
  assert.match(expense,/<HqModal/);
  assert.match(expense,/<HqCard/);
  assert.match(expense,/<HqBadge/);
  assert.match(expense,/<HqButton/);
  assert.doesNotMatch(expense,/hq\?tab=expenses|경비 관리 탭에서 전체 확인|shadow-2xl|bg-gradient-to-r/);
});
