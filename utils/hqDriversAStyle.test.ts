import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=r('components/hq/drivers/HqDriversView.tsx');
const table=r('components/hq/drivers/HqDriversTableView.tsx');
const detail=r('components/hq/drivers/HqDriverDetailSplitView.tsx');
const edit=r('components/hq/drivers/HqDriverEditModal.tsx');
const hook=r('utils/useHqDrivers.ts');
const header=r('components/hq/HqHeader.tsx');
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
  // Actions formerly hidden in ··· now live in the profile or vehicle picker.
  assert.match(table,/setCardPickerDriverId/);
  assert.match(table,/<HqDriverCardPickerModal/);
  assert.match(table,/<HqDispatchCardQuickFindModal/);
  assert.doesNotMatch(table,/setMenuOpenDriverId|setDriverToRemove/);
  assert.match(detail,/deleteDriver\(activeDriver\.id\)/);
  assert.match(detail,/setShowRemoveConfirm\(true\)/);
  assert.match(detail,/<HqModal/);
  assert.match(detail,/onSelectDriver\(driver\.id\)/);
  assert.match(detail,/onBackToTable/);
  assert.match(detail,/activeDriver\.name/);
  assert.match(detail,/setFilterAffiliation/);
});

test('driver table keeps mobile search placeholder compact, names horizontal, and cache sync deferred out of state updaters',()=>{
  assert.match(table,/hq-drivers-search/);
  assert.match(table,/placeholder:text-\[11px\] sm:placeholder:text-xs/);
  assert.match(css,/\.hq-drivers-a input\.hq-drivers-search::placeholder/);
  assert.match(table,/<td className="py-4 px-5 whitespace-nowrap">/);
  assert.match(table,/whitespace-nowrap font-bold text-slate-900/);
  assert.match(table,/shrink-0 whitespace-nowrap px-1\.5 py-0\.5 rounded text-\[10px\]/);
  assert.match(hook,/queueMicrotask\(/);
  assert.doesNotMatch(hook,/setDrivers\(\(prev\) => [\s\S]*?(writeCache|setCounts)\(/);
  assert.match(header,/sticky top-0 z-40/);
  assert.match(table,/relative z-10 rounded-\[23px\]/);
});
