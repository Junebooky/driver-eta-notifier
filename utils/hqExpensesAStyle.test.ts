import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const list=r('components/hq/expenses/HqExpensesView.tsx');
const hipass=r('components/hq/expenses/HqHipassImportModal.tsx');
const review=r('components/hq/expenses/HqReceiptReviewWorkspace.tsx');

test('expense list A-plan retains record/receipt selection and CSV export',()=>{
  assert.match(list,/handleExportCsv/);
  assert.match(list,/setSelectedExpenseId\(item\.id\)/);
  assert.match(list,/setReviewQueue\(filteredExpenses\.map/);
  assert.match(list,/HqReceiptReviewWorkspace/);
  assert.match(list,/handleExportCsv/);
  assert.match(list,/setSelectedStatus/);
  assert.doesNotMatch(list,/shadow-2xl|bg-slate-900\/95/);
});
test('Hi-Pass statement evidence import still processes local upload and confirmed reconciliation',()=>{
  assert.match(hipass,/handleFileUpload/);
  assert.match(hipass,/handleLoadDemoSample/);
  assert.match(hipass,/fileInputRef\.current\?\.click\(\)/);
  assert.match(hipass,/bg-\[#1E60F3\]/);
  assert.doesNotMatch(hipass,/shadow-2xl/);
});
test('receipt review retains original evidence, amount editing, safe approval and reject actions',()=>{
  assert.match(review,/src=\{saved\.receiptUrl\}/);
  assert.match(review,/setAmount\(event\.target\.value\)/);
  assert.match(review,/onClick=\{save\}/);
  assert.match(review,/disabled=\{!canApprove\}/);
  assert.match(review,/persist\(\{ status: '승인 완료' \}, true\)/);
  assert.match(review,/persist\(\{ status: '반려' \}\)/);
  assert.match(review,/receiptApprovalShortcut/);
  assert.doesNotMatch(review,/shadow-2xl|bg-slate-900 text-white/);
});
