import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=r('components/hq/drivers/HqDriversView.tsx');
const table=r('components/hq/drivers/HqDriversTableView.tsx');
const detail=r('components/hq/drivers/HqDriverDetailSplitView.tsx');
const edit=r('components/hq/drivers/HqDriverEditModal.tsx');
const css=r('app/globals.css');

test('driver administration uses only scoped A-plan white surfaces, keeps table/detail switch',()=>{
  assert.match(page,/hq-drivers-a space-y-5/);
  assert.match(page,/<HqDriversTableView/);
  assert.match(page,/<HqDriverDetailSplitView/);
  assert.match(detail,/hq-driver-detail-a space-y-4/);
  assert.match(table,/rounded-\[23px\] bg-white shadow-\[0_6px_20px/);
  assert.match(css,/HQ Driver Management A-plan only/);
});

test('driver creation and editing keep existing auth, validation and save workflows',()=>{
  assert.match(page,/handleCreateDriver\(e, false\)/);
  assert.match(page,/handleCreateDriver\(undefined, true\)/);
  assert.match(page,/duplicateInfo\.existing\.map/);
  assert.match(page,/setIsLoginModalOpen\(true\)/);
  assert.match(page,/setIsEnglish\(!isEnglish\)/);
  assert.match(page,/hq-driver-form-a/);
  assert.match(edit,/onSubmit=\{handleSubmit\}/);
  assert.match(edit,/hq-driver-form-a/);
  assert.match(edit,/setAffiliationType\('employed'\)/);
  assert.match(edit,/setAffiliationType\('freelance'\)/);
  assert.doesNotMatch(edit,/bg-slate-700 text-white border-slate-700/);
});

test('driver profile details, schedule and table actions remain hooked up',()=>{
  assert.match(table,/onSelectDriver\(/);
  assert.match(table,/onOpenAddDriver/);
  assert.match(table,/setAffiliationFilter/);
  assert.match(table,/setResidenceFilter/);
  assert.match(table,/setStatusFilter/);
  assert.match(table,/setEditingDriver\(driver\)/);
  assert.match(table,/deleteDriver\(driverToRemove\.id\)/);
  assert.match(table,/<HqModal/);
  assert.match(table,/setDriverToRemove\(driver\)/);
  assert.match(detail,/onSelectDriver\(driver\.id\)/);
  assert.match(detail,/onBackToTable/);
  assert.match(detail,/activeDriver\.name/);
  assert.match(detail,/setFilterAffiliation/);
});
