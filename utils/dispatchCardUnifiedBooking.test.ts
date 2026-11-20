import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {isGeneratedDispatchCardFileName} from '@/lib/dispatchCards/cardRevision';
import {
  partitionDispatchCardVehicles,
  pickDefaultDispatchCardVehicle,
  sanitizeInitialDispatchCardPlate,
  summarizeDriverCardCoverage,
} from '@/utils/driverDispatchCardVehicles';

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

test('driver dispatch card manager prioritizes registered vehicles, separates unregistered ones, and uses updated copy',()=>{
  assert.equal(sanitizeInitialDispatchCardPlate('차량 미등록'),'');
  assert.equal(sanitizeInitialDispatchCardPlate('미배정'),'');
  assert.equal(sanitizeInitialDispatchCardPlate('-'),'');
  assert.equal(sanitizeInitialDispatchCardPlate(' 125호 9982 '),'125호 9982');

  const vehicles=[
    {uuid:'v-unreg',plate:'142호 8407'},
    {uuid:'v-reg',plate:'125호 9982'},
  ];
  const summary={
    'v-reg':{pc:true,mobile:true},
  };
  const partitioned=partitionDispatchCardVehicles(vehicles,summary);
  assert.deepEqual(partitioned.registered.map(v=>v.plate),['125호 9982']);
  assert.deepEqual(partitioned.unregistered.map(v=>v.plate),['142호 8407']);

  assert.equal(
    pickDefaultDispatchCardVehicle({vehicles,summary,initialVehiclePlate:'차량 미등록'})?.plate,
    '125호 9982',
  );
  assert.equal(
    pickDefaultDispatchCardVehicle({vehicles,summary,initialVehiclePlate:'142호 8407',preferRegistered:true})?.plate,
    '125호 9982',
  );
  assert.equal(
    pickDefaultDispatchCardVehicle({vehicles,summary,initialVehiclePlate:'142호 8407',preferRegistered:false})?.plate,
    '142호 8407',
  );

  const manager=source('components/hq/drivers/HqDriverAssetManagerModal.tsx');
  for(const phrase of [
    '기사와 차량을 선택해 최신 배차카드를 확인하고 수정해요.',
    'PC·모바일 사용 가능',
    '카드 만들기·수정',
    '원본 보기',
    '등록된 차량',
    '미등록 차량',
    '기사 정보(이름·직책·연락처)나 사진이 바뀌면 카드 만들기·수정에서 모든 차량 카드를 최신 버전으로 업데이트해 주세요.',
  ])assert.ok(manager.includes(phrase),phrase);
});

test('driver table surfaces inline per-driver dispatch card coverage with registered/unregistered vehicle slots',()=>{
  const complete=summarizeDriverCardCoverage({
    id:'d1',name:'김승준',
    portraitReady:true,englishNameReady:true,positionReady:true,identityReady:true,
    savedVariants:4,missingVariants:0,
    slots:[
      {vehicleId:'v1',plate:'125호 9982',pc:true,mobile:true},
      {vehicleId:'v2',plate:'142호 8407',pc:true,mobile:true},
    ],
  });
  assert.equal(complete.tone,'selected');
  assert.equal(complete.label,'2/2대 완료');
  assert.equal(complete.registeredSlots.length,2);
  assert.equal(complete.unregisteredSlots.length,0);

  const partial=summarizeDriverCardCoverage({
    id:'d2',name:'이영수',
    portraitReady:true,englishNameReady:true,positionReady:true,identityReady:true,
    savedVariants:1,missingVariants:3,
    slots:[
      {vehicleId:'v1',plate:'125호 9982',pc:true,mobile:false},
      {vehicleId:'v2',plate:'142호 8407',pc:false,mobile:false},
    ],
  });
  assert.equal(partial.tone,'selected');
  assert.equal(partial.label,'1/2대 등록');
  assert.equal(partial.registeredSlots.length,1);
  assert.equal(partial.unregisteredSlots.length,1);

  const readyZero=summarizeDriverCardCoverage({
    id:'d3',name:'박민수',
    portraitReady:true,englishNameReady:true,positionReady:true,identityReady:true,
    savedVariants:0,missingVariants:2,
    slots:[{vehicleId:'v1',plate:'125호 9982',pc:false,mobile:false}],
  });
  assert.equal(readyZero.tone,'neutral');
  assert.equal(readyZero.label,'0/1대 미등록');

  const needsInfo=summarizeDriverCardCoverage({
    id:'d4',name:'최현우',
    portraitReady:false,englishNameReady:true,positionReady:false,identityReady:false,
    savedVariants:0,missingVariants:2,
    slots:[{vehicleId:'v1',plate:'125호 9982',pc:false,mobile:false}],
  });
  assert.equal(needsInfo.tone,'warning');
  assert.equal(needsInfo.label,'0/1대 · 정보 필요');
  assert.deepEqual(needsInfo.missingIdentityLabels,['프로필 사진','직책']);

  const table=source('components/hq/drivers/HqDriversTableView.tsx');
  assert.match(table,/<span>배차카드 관리<\/span>\s*<ChevronDown/);
  assert.doesNotMatch(table,/<RefreshCw[^>]*\/>\s*배차카드 관리/);
  assert.match(table,/<th className="py-3\.5 px-5 font-medium">배차카드<\/th>/);
  assert.match(table,/등록된 차량 \(/);
  assert.match(table,/미등록 차량 \(/);
  assert.match(table,/<HqBadge/);
  assert.match(table,/<HqCard/);
  assert.match(table,/<HqButton/);
  assert.match(table,/<HqDriverAssetManagerModal/);
  assert.match(table,/<HqDispatchCardBuilderModal/);
});
