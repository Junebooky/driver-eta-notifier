import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {VIP_REAL_VEHICLES} from '@/utils/vehicleData';
import {buildDispatchCardCoverage} from '@/lib/dispatchCards/dispatchCardCoverage';
import {resolveDispatchCardPhotos,dispatchCardKebabPath} from '@/lib/dispatchCards/dispatchCardAssets';
import {summarizeDriverCardCoverage,groupDriverCardVehicles} from '@/utils/driverDispatchCardVehicles';

const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');
const driver={
  id:'driver-test',driver_name:'김승준',phone:'010-1234-5678',
  driver_meta:{dispatch_card_identity:{koreanName:'김승준',englishName:'Seung-jun Kim',
    positionCode:'chauffeur',phone:'010-1234-5678'}},
};

test('denominator counts ALL registered fleet vehicles, not only 12/13 image-ready vehicles',()=>{
  const current=buildDispatchCardCoverage([driver],VIP_REAL_VEHICLES,[{driver_id:driver.id}],[]);
  assert.equal(current.vehicles.length,VIP_REAL_VEHICLES.length);
  assert.equal(current.totalVehicles,20);
  assert.equal(current.drivers[0].slots.length,20);
  assert.equal(current.imageReadyVehicles,current.vehicles.filter(v=>!!resolveDispatchCardPhotos(v)).length);
  assert.equal(current.imageMissingVehicles,20-current.imageReadyVehicles);
  assert.equal(current.requiredVariants,40);
  assert.equal(current.missingVariants,40);
  assert.equal(current.drivers[0].slots.filter(s=>s.imageReady===false).length,current.imageMissingVehicles);
  // Adding future registered cars automatically expands the denominator;
  // don't hardcode the user's estimate of 30 or 20 into the UI.
  const custom=Array.from({length:13},(_,index)=>({
    ...VIP_REAL_VEHICLES[0],
    id:'new-car-'+index,
    uuid:'cafebabe-0000-4000-8000-'+String(index+1).padStart(12,'0'),
    plate:'추가차량 '+String(index+1000),
    plateShort:String(index+1000),
    model:'미확인 새 차종',
  }));
  const later=buildDispatchCardCoverage([driver],[...VIP_REAL_VEHICLES,...custom],[{driver_id:driver.id}],[]);
  assert.equal(later.totalVehicles,33);
  assert.equal(later.drivers[0].slots.length,33);
  assert.equal(later.imageMissingVehicles,20-current.imageReadyVehicles+13);
});

test('12 full cards across 20 registered vehicles displays 12/20, not 12/12',()=>{
  const fleet=VIP_REAL_VEHICLES;
  const cards=fleet.slice(0,12).flatMap(vehicle=>([
    {driver_id:driver.id,vehicle_id:vehicle.uuid,variant:'pc'},
    {driver_id:driver.id,vehicle_id:vehicle.uuid,variant:'mobile'},
  ]));
  const all=buildDispatchCardCoverage([driver],fleet,[{driver_id:driver.id}],cards);
  const summary=summarizeDriverCardCoverage(all.drivers[0]);
  assert.equal(summary.totalVehicles,20);
  assert.equal(summary.completeVehicles,12);
  assert.equal(summary.label,'12/20대 완료');
  assert.equal(summary.unregisteredSlots.length,8);
  assert.equal(summary.imageMissingSlots.length,all.imageMissingVehicles);
  const groups=groupDriverCardVehicles(all.drivers[0].slots,all.vehicles);
  assert.equal(groups.flatMap(g=>g.entries).length,20);
  assert.ok(groups.some(g=>g.entries.some(e=>e.status==='photos_missing')));
});

test('101호 7681 stays Carnival HI-LIMOUSINE even if DB still carries old ordinary-limousine name',()=>{
  const real=VIP_REAL_VEHICLES.find(v=>v.plate==='101호 7681');
  assert.ok(real);
  assert.match(real.model,/하이리무진/);
  assert.equal(dispatchCardKebabPath({...real,model:'기아 카니발 리무진'}),'kia/carnival-hi-limousine');
  const fleetReader=source('lib/fleet/registryStore.ts');
  assert.match(fleetReader,/verifiedCarnival/);
  assert.match(fleetReader,/modelShort:verifiedCarnival.modelShort/);
  const ui=source('components/hq/drivers/HqDriverCardVehicleGroups.tsx');
  assert.match(ui,/models\.entries\(\)/);
  assert.match(ui,/이미지 미준비/);
  assert.match(ui,/onCreate\(slot\)/);
  assert.match(ui,/onView\(slot\)/);
});

test('card manager shares both PNGs in a single action, never only signed URLs',()=>{
  const manager=source('components/hq/drivers/HqDriverAssetManagerModal.tsx');
  const share=source('utils/shareDispatchCardPng.ts');
  const view=source('components/hq/drivers/HqDriversTableView.tsx');
  const coverage=source('lib/dispatchCards/dispatchCardCoverage.ts');
  assert.match(share,/new File\(\[png\]/);
  assert.match(share,/navigator\.share\(\{/);
  assert.match(share,/files:\[\.\.\.files\]/);
  assert.match(share,/createDispatchCardPairZip/);
  assert.match(share,/\/api\/hq\/drivers\/assets\/preview\?path=/);
  assert.match(manager,/prepareSavedDispatchCardPng\(path,fileName\)/);
  assert.match(manager,/shareDispatchCardPngPair\(/);
  assert.match(manager,/PC·모바일 함께 공유/);
  assert.match(manager,/PC·모바일 ZIP 저장/);
  assert.doesNotMatch(manager,/PNG 이미지 공유|PNG 다운로드/);
  assert.match(manager,/selectedVehiclePhotoReady/);
  assert.match(coverage,/imageReady: imageReadyByVehicle\.get/);
  assert.match(view,/완료 \{cardSummary\.completeVehicles\}\/\{cardSummary\.totalVehicles\}대/);
});
