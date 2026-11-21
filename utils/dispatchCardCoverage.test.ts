import test from 'node:test';
import assert from 'node:assert/strict';
import {VIP_REAL_VEHICLES} from './vehicleData';
import {buildDispatchCardCoverage} from '@/lib/dispatchCards/dispatchCardCoverage';
import {resolveDispatchCardPhotos} from '@/lib/dispatchCards/dispatchCardAssets';

const readyIdentity={
  dispatch_card_identity:{
    koreanName:'김민수',englishName:'Minsu Kim',positionCode:'chauffeur',phone:'+82-10-1234-5678',
  },
};
test('all active stock drivers map to every photo-ready vehicle, including new color-specific G90 sets',()=>{
  const cars=VIP_REAL_VEHICLES.filter(v=>resolveDispatchCardPhotos(v));
  assert.equal(cars.length,13);
  assert.deepEqual(['4280','1336','8839'].filter(p=>cars.some(v=>v.plateShort===p)).length,3);
  const drivers=[
    {id:'d1',driver_name:'김민수',phone:'01012345678',driver_meta:readyIdentity},
    {id:'d2',driver_name:'박민수',phone:'01012345678',driver_meta:{}},
    {id:'d3',driver_name:'윤태준',phone:'01012345678',driver_meta:{
      dispatch_card_identity:{koreanName:'윤태준',englishName:'',positionCode:'chauffeur',phone:'01012345678'},
    }},
  ];
  const sprinter9982=cars.find(c=>c.plateShort==='9982')!;
  const data=buildDispatchCardCoverage(drivers,cars,[{driver_id:'d1'},{driver_id:'d2'},{driver_id:'d3'}],[
    {driver_id:'d1',vehicle_id:sprinter9982.uuid,variant:'mobile'},
    {driver_id:'d1',vehicle_id:sprinter9982.uuid,variant:'pc'},
    {driver_id:'d1',vehicle_id:sprinter9982.uuid,variant:'mobile'}, // duplicate history
  ]);
  assert.equal(data.vehicles.length,13);
  assert.equal(data.requiredVariants,78);
  assert.equal(data.savedVariants,2);
  assert.equal(data.missingVariants,76);
  assert.equal(data.drivers[0].identityReady,true);
  assert.equal(data.drivers[1].identityReady,false);
  assert.equal(data.drivers[1].englishNameReady,true);
  assert.equal(data.drivers[2].englishNameReady,true);
  assert.equal(data.drivers[2].identityReady,true); // No saved English name: fixed format generated automatically
  assert.equal(data.drivers[1].slots.length,13);
  assert.equal(data.drivers[0].slots.find(s=>s.vehicleId===sprinter9982.uuid)?.mobile,true);
  assert.equal(data.drivers[0].slots.find(s=>s.vehicleId===sprinter9982.uuid)?.pc,true);
  // Missing cards are a virtual relation, NOT rows faked into the asset store.
});
test('unpictured vehicles, duplicate IDs and archived/missing-identity drivers cannot manufacture completed cards',()=>{
  const cars=[...VIP_REAL_VEHICLES,VIP_REAL_VEHICLES[0]];
  const result=buildDispatchCardCoverage([
    {id:'d1',driver_name:'테스트',phone:'',driver_meta:{}},
  ],cars,[],[{driver_id:'d1',vehicle_id:'nonexistent',variant:'pc'}]);
  assert.equal(result.vehicles.length,20);
  assert.equal(result.totalVehicles,20);
  assert.equal(result.imageReadyVehicles,13);
  assert.equal(result.imageMissingVehicles,7);
  assert.equal(result.drivers[0].slots.length,20);
  assert.equal(result.drivers[0].slots.filter(slot=>slot.imageReady===false).length,7);
  assert.equal(result.requiredVariants,40);
  assert.equal(result.missingVariants,40);
  assert.equal(result.savedVariants,0);
  assert.equal(result.drivers[0].portraitReady,false);
  assert.equal(result.drivers[0].identityReady,false);
});
