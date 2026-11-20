import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {calculateVehiclePhotoLiveCrop,VEHICLE_PREVIEW_WIDTH} from '@/lib/dispatchCards/vehiclePhotoLiveCrop';
import {calculatePortraitCrop} from '@/lib/dispatchCards/portraitCrop';

const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

test('vehicle live thumb exactly follows canvas photoFrame cover-fit, zoom and offsets',()=>{
  const placement={zoom:100,x:0,y:0};
  const v=calculateVehiclePhotoLiveCrop(1920,1080,'pc','exterior',placement);
  assert.equal(v.frame.w,VEHICLE_PREVIEW_WIDTH);
  assert.ok(Math.abs(v.frame.h-VEHICLE_PREVIEW_WIDTH*470/928)<.002);
  const cover=Math.max(v.frame.w/1920,v.frame.h/1080);
  assert.ok(Math.abs(v.image.w-1920*cover)<.001);
  assert.ok(Math.abs(v.image.h-1080*cover)<.001);
  assert.ok(Math.abs(v.image.x-(v.frame.w-v.image.w)/2)<.001);
  assert.ok(Math.abs(v.image.y-(v.frame.h-v.image.h)/2)<.001);
  const shifted=calculateVehiclePhotoLiveCrop(1920,1080,'pc','exterior',{zoom:125,x:12,y:-9});
  assert.ok(Math.abs(shifted.image.w-v.image.w*1.25)<.001);
  assert.ok(Math.abs(shifted.image.x-((v.frame.w-shifted.image.w)/2+v.frame.w*.12))<.001);
  assert.ok(Math.abs(shifted.image.y-((v.frame.h-shifted.image.h)/2-v.frame.h*.09))<.001);
  assert.ok(calculateVehiclePhotoLiveCrop(1080,1920,'mobile','interiorTwo',placement).frame.h>v.frame.h);
  assert.ok(calculateVehiclePhotoLiveCrop(1080,1920,'pc','interiorOne',placement).frame.h>v.frame.h);
});

test('portrait thumbnail uses the same frame math as the real card',()=>{
  const placement={zoom:118,x:0,y:0};
  const original=calculatePortraitCrop(1080,1350,{x:0,y:0,w:112,h:140},placement);
  const moved=calculatePortraitCrop(1080,1350,{x:0,y:0,w:112,h:140},{zoom:118,x:-20,y:20});
  assert.equal(original.w,moved.w);
  assert.equal(original.h,moved.h);
  assert.notDeepEqual({x:original.x,y:original.y},{x:moved.x,y:moved.y});
});

test('editor controls are next to full card preview, not below driver information',()=>{
  const modal=source('components/hq/drivers/HqDispatchCardBuilderModal.tsx');
  const editor=source('components/hq/drivers/HqDispatchCardLiveEditor.tsx');
  const controlStart=modal.indexOf('<HqDispatchCardLiveEditor');
  const previewImage=modal.indexOf("alt={vehicle?.plate + ' 배차카드 '");
  const driverInfo=modal.indexOf('>기사 정보</h3>');
  assert.ok(controlStart>0&&previewImage>controlStart&&driverInfo>previewImage);
  assert.equal(modal.split('<HqDispatchCardLiveEditor').length-1,1);
  assert.doesNotMatch(modal,/>기사 사진 구도<\/h3>/);
  assert.doesNotMatch(modal,/>이미지 위치 조정<\/h3>/);
  assert.match(editor,/aria-label="배차카드 이미지 편집 대상"/);
  assert.match(editor,/기사 사진 구도/);
  assert.match(editor,/차량 이미지 위치/);
  assert.match(editor,/aria-label="조정할 차량 이미지"/);
  assert.match(editor,/aria-label="기사 사진 실시간 확대·위치 미리보기"/);
  assert.match(editor,/aria-label="차량 이미지 실시간 크기·위치 미리보기"/);
  assert.match(editor,/calculatePortraitCrop/);
  assert.match(editor,/calculateVehiclePhotoLiveCrop/);
  assert.match(modal,/onPortraitChange=\{setPortraitPlacement\}/);
  assert.match(modal,/onVehicleChange=\{updatePlacement\}/);
  assert.match(modal,/setPerVehiclePlacements\(previous/);
  assert.match(modal,/portraitSettingsLoaded/);
});

test('full-card preview remains visible while async re-rendering and saved card controls stay intact',()=>{
  const modal=source('components/hq/drivers/HqDispatchCardBuilderModal.tsx');
  assert.match(modal,/previewObjectUrlRef/);
  assert.match(modal,/setPreviewLoading\(true\)/);
  assert.match(modal,/if \(previous\) window\.setTimeout\(\(\) => URL\.revokeObjectURL\(previous\), 1500\)/);
  assert.match(modal,/\{previewUrl && isComplete && \(/);
  assert.match(modal,/미리보기 갱신 중…/);
  assert.match(modal,/정보 반영 · 전체 카드 갱신/);
  assert.match(modal,/onClick=\{openComparison\}/);
  assert.match(modal,/persistCardSettings\(\)/);
  assert.match(modal,/portraitPlacement,/);
  assert.match(modal,/placements: perVehiclePlacements\[currentVehicle\.uuid\]/);
  assert.match(modal,/const \[orientation, setOrientation\]/);
  assert.match(modal,/saveAllToAssetLibrary/);
  assert.match(modal,/cardSettingsDirty/);
});
