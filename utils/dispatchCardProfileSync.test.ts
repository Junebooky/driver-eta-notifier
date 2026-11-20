import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDispatchCardAssetStale, shouldRebuildDriverCards } from '@/lib/dispatchCards/cardRevision';
import { buildDispatchCardCoverage } from '@/lib/dispatchCards/dispatchCardCoverage';
import { VIP_REAL_VEHICLES } from './vehicleData';
import { resolveDispatchCardPhotos } from '@/lib/dispatchCards/dispatchCardAssets';

test('an identity / photo revision invalidates earlier static card files, but leaves legacy records alone', () => {
  const old = '2026-11-20T03:00:00.000Z';
  const revision = '2026-11-20T03:01:00.000Z';
  const current = '2026-11-20T03:02:00.000Z';
  assert.equal(isDispatchCardAssetStale(revision, old), true);
  assert.equal(isDispatchCardAssetStale(revision, current), false);
  assert.equal(isDispatchCardAssetStale(revision, revision), false);
  assert.equal(isDispatchCardAssetStale(revision, ''), true);
  assert.equal(isDispatchCardAssetStale(undefined, old), false);
  assert.equal(isDispatchCardAssetStale('invalid', old), false);
  assert.equal(shouldRebuildDriverCards(true, false), true);
  assert.equal(shouldRebuildDriverCards(false, true), true);
  assert.equal(shouldRebuildDriverCards(false, false), false);
});

test('one chauffeur revision hides only their old PC/mobile cards; other chauffeurs stay current', () => {
  const vehicle = VIP_REAL_VEHICLES.find(v => resolveDispatchCardPhotos(v))!;
  const drivers = [
    { id: 'd1', driver_name: '윤태준', phone: '01012345678', driver_meta: {
      dispatch_card_revision_at: '2026-11-20T03:01:00.000Z',
    } },
    { id: 'd2', driver_name: '김민수', phone: '01012345678', driver_meta: {} },
  ];
  const cards = [
    { driver_id:'d1', vehicle_id:vehicle.uuid, variant:'pc', created_at:'2026-11-20T03:00:00.000Z' },
    { driver_id:'d1', vehicle_id:vehicle.uuid, variant:'mobile', created_at:'2026-11-20T03:02:00.000Z' },
    { driver_id:'d2', vehicle_id:vehicle.uuid, variant:'pc', created_at:'2026-11-20T03:00:00.000Z' },
  ];
  const list = buildDispatchCardCoverage(drivers,[vehicle],[
    { driver_id:'d1', created_at:'2026-11-20T02:00:00.000Z' },
    { driver_id:'d2', created_at:'2026-11-20T02:00:00.000Z' },
  ],cards);
  assert.deepEqual(list.drivers[0].slots.map(s=>[s.pc,s.mobile]),[[false,true]]);
  assert.deepEqual(list.drivers[1].slots.map(s=>[s.pc,s.mobile]),[[true,false]]);
  assert.equal(list.savedVariants,2);
});

test('a new portrait invalidates all older cards of that driver even without identity edits', () => {
  const vehicle = VIP_REAL_VEHICLES.find(v => resolveDispatchCardPhotos(v))!;
  const list = buildDispatchCardCoverage([
    { id:'d1', driver_name:'윤태준', phone:'01012345678', driver_meta:{} },
  ],[vehicle],[{driver_id:'d1',created_at:'2026-11-20T03:05:00.000Z'}],[
    {driver_id:'d1',vehicle_id:vehicle.uuid,variant:'pc',created_at:'2026-11-20T03:00:00.000Z'},
  ]);
  assert.equal(list.drivers[0].slots[0].pc,false);
});

test('builder saves shared identity once and regenerates every vehicle/variant with retryable stale state', () => {
  const builder=readFileSync(join(process.cwd(),'components/hq/drivers/HqDispatchCardBuilderModal.tsx'),'utf8');
  const store=readFileSync(join(process.cwd(),'lib/assets/driverAssetServerStore.ts'),'utf8');
  const profileApi=readFileSync(join(process.cwd(),'app/api/hq/drivers/assets/card-profile/route.ts'),'utf8');
  const uploadApi=readFileSync(join(process.cwd(),'app/api/hq/drivers/assets/upload/route.ts'),'utf8');
  // The shared save action now lives in the modal footer; no duplicated
  // action below a long sidebar of photo sliders.
  assert.match(builder,/기사 정보 반영 · 전체 카드 갱신/);
  assert.match(builder,/void saveAllToAssetLibrary\(\)/);
  assert.match(builder,/await persistCardSettings\(\)/);
  assert.match(builder,/for \(const variant of \['pc', 'mobile'\] as const\)/);
  assert.match(builder,/staleCardCount/);
  assert.match(builder,/profilePhotoChanged/);
  assert.match(builder,/needsCardRefresh/);
  assert.match(store,/isReadyForCustomerDispatch: Boolean\(currentPc \|\| currentMobile\)/);
  assert.match(store,/dispatch_card_revision_at/);
  assert.match(profileApi,/dispatch_card_revision_at: new Date\(\)\.toISOString\(\)/);
  assert.match(uploadApi,/skipIfExists/);
  assert.match(uploadApi,/isDispatchCardAssetStale/);
});
