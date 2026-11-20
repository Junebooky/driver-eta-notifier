import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {isGeneratedDispatchCardFileName} from '@/lib/dispatchCards/cardRevision';

const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

test('only canvas-generated dispatch-card versions are allowed in the current dispatch bundle',()=>{
  assert.equal(isGeneratedDispatchCardFileName('dispatch_142호_8407_pc.webp'),true);
  assert.equal(isGeneratedDispatchCardFileName('dispatch_8407_mobile.webp'),true);
  assert.equal(isGeneratedDispatchCardFileName('dispatch_125호_9982_mobile.webp'),true);
  assert.equal(isGeneratedDispatchCardFileName('uploaded-card.png'),false);
  assert.equal(isGeneratedDispatchCardFileName('old-info-mobile.webp'),false);
  assert.equal(isGeneratedDispatchCardFileName('dispatch_8407_pc.jpg'),false);
  assert.equal(isGeneratedDispatchCardFileName(null),false);
  const store=source('lib/assets/driverAssetServerStore.ts');
  assert.match(store,/isGeneratedDispatchCardFileName\(pcInfo\.fileName\)/);
  assert.match(store,/isGeneratedDispatchCardFileName\(mobileInfo\.fileName\)/);
  assert.match(store,/isGeneratedDispatchCardFileName\(row\.file_name\)/);
  assert.match(source('app/api/hq/drivers/assets/upload/route.ts'),/isGeneratedDispatchCardFileName\(existing\.fileName\)/);
});

test('booking dispatch card uses the same live driver x vehicle bundle and creation path as driver management',()=>{
  const bookingModal=source('components/hq/bookings/HqDriverVehicleInfoModal.tsx');
  const dashboard=source('components/hq/HqDashboard.tsx');
  const launcher=source('components/hq/bookings/HqBookingCardManagerLauncher.tsx');
  const manager=source('components/hq/drivers/HqDriverAssetManagerModal.tsx');
  assert.match(bookingModal,/type=bundle/);
  assert.match(bookingModal,/HqSegmentedTabs/);
  assert.match(bookingModal,/배차카드 만들기·갱신/);
  assert.match(bookingModal,/onOpenAssetManager\(booking\.driverId \|\| '', booking\.vehiclePlate \|\| ''\)/);
  assert.match(bookingModal,/navigator\.share/);
  assert.match(dashboard,/onOpenAssetManager=\{\(driverId,vehiclePlate\)=>/);
  assert.match(dashboard,/<HqBookingCardManagerLauncher/);
  assert.match(launcher,/<HqDriverAssetManagerModal/);
  assert.match(manager,/<HqDispatchCardBuilderModal/);
  assert.match(manager,/initialVehicleId=\{selectedVehicle\?\.uuid\}/);
  assert.doesNotMatch(manager,/isManualUploadOpen|고급 · 직접 업로드|handleFileUpload|onDrop=\{/);
  assert.match(manager,/<HqModal/);
  assert.match(manager,/HqSearchSelect/);
});

test('article-wide card coverage is embedded inside the existing driver management card on demand',()=>{
  const view=source('components/hq/drivers/HqDriversView.tsx');
  const table=source('components/hq/drivers/HqDriversTableView.tsx');
  const status=source('components/hq/drivers/HqDispatchCardCoveragePanel.tsx');
  assert.doesNotMatch(view,/<HqDispatchCardCoveragePanel/);
  assert.match(table,/배차카드 관리/);
  assert.match(table,/\{cardToolsOpen && <HqDispatchCardCoveragePanel/);
  assert.match(table,/embedded \/>/);
  assert.match(status,/embedded=false/);
  assert.doesNotMatch(status,/기사별 배차카드 제작 현황/);
  assert.match(status,/미생성 카드 일괄 생성/);
  assert.match(status,/HqDispatchCardBuilderModal/);
});

test('booking only exposes current generated versions, not historic upload URLs',()=>{
  const route=source('app/api/hq/drivers/assets/route.ts');
  const dispatch=source('app/api/hq/drivers/assets/dispatch/route.ts');
  assert.match(route,/getDriverVehicleBundle/);
  assert.match(dispatch,/getDriverVehicleBundle/);
  assert.match(dispatch,/pcInfoAssetId/);
  assert.match(dispatch,/mobileInfoAssetId/);
  assert.match(dispatch,/manualDeliveryConfirmed/);
  assert.doesNotMatch(source('components/hq/drivers/HqDriverAssetManagerModal.tsx'),/type="file"/);
});
