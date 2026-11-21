import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchDriverWithCardSlots } from '@/utils/driverDispatchCardVehicles';
const r = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = r('components/hq/drivers/HqDriversView.tsx');
const table = r('components/hq/drivers/HqDriversTableView.tsx');
const detail = r('components/hq/drivers/HqDriverDetailSplitView.tsx');
const edit = r('components/hq/drivers/HqDriverEditModal.tsx');
const hook = r('utils/useHqDrivers.ts');
const header = r('components/hq/HqHeader.tsx');
const css = r('app/globals.css');

test('driver administration uses only scoped A-plan white surfaces, keeps table/detail switch', () => {
  assert.match(page, /hq-drivers-a space-y-5/);
  assert.match(page, /<HqDriversTableView/);
  assert.match(page, /<HqDriverDetailSplitView/);
  assert.match(detail, /hq-driver-detail-a space-y-4/);
  assert.match(table, /rounded-\[23px\] bg-white shadow-\[0_6px_20px/);
  assert.match(css, /HQ Driver Management A-plan only/);
});

test('driver creation and editing keep existing auth, validation and save workflows', () => {
  assert.match(page, /handleCreateDriver\(e, false\)/);
  assert.match(page, /handleCreateDriver\(undefined, true\)/);
  assert.match(page, /duplicateInfo\.existing\.map/);
  assert.match(page, /setIsLoginModalOpen\(true\)/);
  assert.match(page, /setIsEnglish\(!isEnglish\)/);
  assert.match(page, /hq-driver-form-a/);
  assert.match(edit, /onSubmit=\{handleSubmit\}/);
  assert.match(edit, /hq-driver-form-a/);
  assert.match(edit, /setAffiliationType\('employed'\)/);
  assert.match(edit, /setAffiliationType\('freelance'\)/);
  assert.doesNotMatch(edit, /bg-slate-700 text-white border-slate-700/);
});

test('driver profile details, schedule and table actions remain hooked up', () => {
  assert.match(table, /onSelectDriver\(/);
  assert.match(table, /onOpenAddDriver/);
  assert.match(table, /setAffiliationFilter/);
  assert.match(table, /setResidenceFilter/);
  assert.match(table, /setStatusFilter/);
  // Actions formerly hidden in ··· now live in the profile or vehicle picker.
  assert.match(table, /setCardPickerDriverId/);
  assert.match(table, /<HqDriverCardPickerModal/);
  assert.match(table, /<HqDispatchCardQuickFindModal/);
  assert.doesNotMatch(table, /setMenuOpenDriverId|setDriverToRemove/);
  assert.match(detail, /deleteDriver\(activeDriver\.id\)/);
  assert.match(detail, /setShowRemoveConfirm\(true\)/);
  assert.match(detail, /className="ml-auto inline-flex shrink-0 items-center gap-1"/);
  assert.match(detail, /<HqModal/);
  assert.match(detail, /onSelectDriver\(driver\.id\)/);
  assert.match(detail, /onBackToTable/);
  assert.match(detail, /activeDriver\.name/);
  assert.match(detail, /setFilterAffiliation/);
});

test('driver table keeps mobile search larger, desktop search compact, names horizontal, and cache sync deferred out of state updaters', () => {
  const ui = r('components/hq/ui/index.tsx');
  assert.match(table, /<HqSearchInput[\s\S]*aria-label="기사명 차종 연락처 검색"/);
  assert.match(table, /<HqSearchInput[\s\S]*aria-label="기사 이름 연락처 검색"/);
  assert.match(ui, /hq-ui-search-input h-12 sm:h-11 w-full rounded-\[14px\] bg-white pl-10 text-\[15px\] sm:text-\[14px\] font-medium text-\[#17233B\] outline-none placeholder:text-\[14px\] sm:placeholder:text-\[14px\]/);
  assert.match(css, /input\.hq-ui-search-input::placeholder/);
  assert.match(css, /\.hq-drivers-a input\.hq-ui-search-input::placeholder/);
  assert.match(table, /<td className="py-4 px-5 whitespace-nowrap">/);
  assert.match(table, /whitespace-nowrap font-bold text-slate-900/);
  assert.match(table, /shrink-0 whitespace-nowrap px-1\.5 py-0\.5 rounded text-\[10px\]/);
  assert.match(hook, /queueMicrotask\(/);
  assert.doesNotMatch(hook, /setDrivers\(\(prev\) => [\s\S]*?(writeCache|setCounts)\(/);
  assert.match(header, /sticky top-0 z-40/);
  assert.match(table, /relative z-10 rounded-\[23px\]/);

  const picker = r('components/hq/drivers/HqDriverCardPickerModal.tsx');
  const quickFind = r('components/hq/drivers/HqDispatchCardQuickFindModal.tsx');
  assert.match(picker, /<HqSegmentedTabs[\s\S]*variant="underline"/);
  assert.match(quickFind, /<HqSegmentedTabs[\s\S]*variant="underline"/);
  assert.match(picker, /h-\[min\(680px,88dvh\)\]/);
  assert.match(quickFind, /h-\[min\(680px,88dvh\)\]/);
  assert.match(css, /\.hq-ui-underline-tabs[\s\S]*scrollbar-width:\s*none/);
  assert.match(css, /\.hq-ui-underline-tabs::-webkit-scrollbar\s*\{\s*display:\s*none/);
  assert.match(css, /@keyframes hqCardPlateFloat/);
  assert.match(r('components/hq/drivers/HqDriverCardVehicleGroups.tsx'), /여깄어요!/);
  assert.match(picker, /여깄어요!/);
});

test('multi-token driver search ("김승준 1336") finds driver via dispatch card slot and identifies the 1336 plate', () => {
  const vehicleById = new Map([
    ['v-1336', { uuid: 'v-1336', model: 'Mercedes Sprinter', modelShort: '스프린터 15인승', plate: '서울70바 1336' } as any],
    ['v-9999', { uuid: 'v-9999', model: 'Carnival Hi-Limousine', modelShort: '카니발', plate: '서울70바 9999' } as any],
  ]);
  const coverage = {
    id: 'drv-1',
    slots: [
      { vehicleId: 'v-1336', plate: '서울70바 1336', pc: true, mobile: true },
      { vehicleId: 'v-9999', plate: '서울70바 9999', pc: false, mobile: false },
    ],
  } as any;

  const matched = matchDriverWithCardSlots({
    query: '김승준 1336',
    driver: { name: '김승준', phone: '010-1234-5678', residence: '서울 강남', affiliationLabel: '소속' },
    driverCoverage: coverage,
    vehicleById,
  });
  assert.equal(matched.matched, true);
  assert.deepEqual(matched.matchedVehicleIds, ['v-1336']);
  assert.equal(matched.matchedHighlightLabel, '1336');

  const wrongDriver = matchDriverWithCardSlots({
    query: '홍길동 1336',
    driver: { name: '김승준', phone: '010-1234-5678', residence: '서울 강남', affiliationLabel: '소속' },
    driverCoverage: coverage,
    vehicleById,
  });
  assert.equal(wrongDriver.matched, false);

  const wrongPlate = matchDriverWithCardSlots({
    query: '김승준 7777',
    driver: { name: '김승준', phone: '010-1234-5678', residence: '서울 강남', affiliationLabel: '소속' },
    driverCoverage: coverage,
    vehicleById,
  });
  assert.equal(wrongPlate.matched, false);
});
