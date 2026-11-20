import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validateNewDriverPhotoFile} from '@/utils/driverProfileRegistrationUpload';

const source=(file:string)=>readFileSync(join(process.cwd(),file),'utf8');

test('new-driver photo checks use same supported formats and 10MB limit as dispatch card portraits',()=>{
  assert.equal(validateNewDriverPhotoFile({type:'image/png',size:2_000_000}),null);
  assert.equal(validateNewDriverPhotoFile({type:'image/jpeg',size:10*1024*1024}),null);
  assert.equal(validateNewDriverPhotoFile({type:'image/webp',size:1_000_000}),null);
  assert.match(validateNewDriverPhotoFile({type:'image/svg+xml',size:5_000})||'',/PNG/);
  assert.match(validateNewDriverPhotoFile({type:'image/png',size:10*1024*1024+1})||'',/10MB/);
  assert.match(validateNewDriverPhotoFile({type:'image/jpeg',size:0})||'',/10MB/);
});

test('registering a driver optionally uploads selected portrait to exact same assetType=profile API used by card builder',()=>{
  const view=source('components/hq/drivers/HqDriversView.tsx');
  const uploader=source('utils/driverProfileRegistrationUpload.ts');
  const builder=source('components/hq/drivers/HqDispatchCardBuilderModal.tsx');
  const uploadRoute=source('app/api/hq/drivers/assets/upload/route.ts');
  assert.match(view,/aria-label="기사 프로필 사진 선택"/);
  assert.match(view,/accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(view,/newProfilePreview/);
  assert.match(view,/setRegistrationPhoto\(file\)/);
  assert.match(view,/const result = await createDriver/);
  assert.match(view,/target = result.driver/);
  assert.match(view,/await uploadNewDriverProfilePhoto\(\{ id: target.id, name: target.name \}, newProfileFile\)/);
  assert.match(view,/setCreatedDriver\(target\)/);
  assert.match(view,/if \(!target\)/);
  assert.match(view,/사진 업로드 다시 시도/);
  assert.match(view,/사진 없이 완료/);
  assert.match(view,/max-h-\[94dvh\]/);
  assert.match(uploader,/form\.set\('assetType','profile'\)/);
  assert.match(uploader,/form\.set\('driverId',driver\.id\)/);
  assert.match(uploader,/fetch\('\/api\/hq\/drivers\/assets\/upload'/);
  assert.match(uploader,/dimensions\.width<400\|\|dimensions\.height<400/);
  assert.match(builder,/form\.set\('assetType', 'profile'\)/);
  assert.match(uploadRoute,/saveDriverProfileAsset/);
  assert.match(uploadRoute,/dispatch_card_revision_at/);
});

test('registration and card builder use driver-list icon when no profile is selected',()=>{
  const view=source('components/hq/drivers/HqDriversView.tsx');
  const builder=source('components/hq/drivers/HqDispatchCardBuilderModal.tsx');
  const editor=source('components/hq/drivers/HqDriverEditModal.tsx');
  assert.ok(view.split('/images/icons/drivers/icon_driver.png').length>=3);
  assert.match(builder,/src="\/images\/icons\/drivers\/icon_driver\.png"/);
  assert.match(editor,/src="\/images\/icons\/drivers\/icon_driver\.png"/);
  assert.doesNotMatch(view,/<User className="w-4 h-4"/);
});

test('asset GET profile shares same stored portrait with all driver dispatch cards',()=>{
  const route=source('app/api/hq/drivers/assets/route.ts');
  const builder=source('components/hq/drivers/HqDispatchCardBuilderModal.tsx');
  const listing=source('app/api/hq/drivers/route.ts');
  assert.match(route,/getDriverProfileAsset\(driverId, org\)/);
  assert.match(builder,/getPhotoPreviewUrl\(data\.profile\.filePath\)/);
  assert.match(builder,/handleProfileFile\(file\)/);
  assert.match(listing,/driver_profile_assets/);
  assert.match(listing,/createSignedAssetUrl\(p\.file_path\)/);
});
