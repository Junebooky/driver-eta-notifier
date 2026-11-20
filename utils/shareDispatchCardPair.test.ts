import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {unzipSync} from 'fflate';
import {
  createDispatchCardPairZip,shareDispatchCardPngPair,supportsDispatchCardPairShare,
  DISPATCH_CARD_PAIR_SHARE_TEXT,DISPATCH_CARD_SINGLE_SHARE_TEXT,
} from '@/utils/shareDispatchCardPng';

const read=(p:string)=>readFileSync(join(process.cwd(),p),'utf8');
const pc=()=>new File([new TextEncoder().encode('pc-image-bytes')],'VIP_193호_5336_pc.png',{type:'image/png'});
const mobile=()=>new File([new TextEncoder().encode('mobile-image-bytes')],'VIP_193호_5336_mobile.png',{type:'image/png'});

test('one ZIP fallback contains both untouched PNG files under distinct names',async()=>{
  const files=[pc(),mobile()] as [File,File];
  const zip=await createDispatchCardPairZip(files);
  assert.equal(zip.type,'application/zip');
  const entries=unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(Object.keys(entries).sort(),files.map(f=>f.name).sort());
  assert.deepEqual(Array.from(entries[files[0].name]),Array.from(new Uint8Array(await files[0].arrayBuffer())));
  assert.deepEqual(Array.from(entries[files[1].name]),Array.from(new Uint8Array(await files[1].arrayBuffer())));
  await assert.rejects(
    createDispatchCardPairZip([pc(),new File([new Uint8Array([1])],pc().name,{type:'image/png'})]),
    /PC·모바일 PNG 두 장/,
  );
  await assert.rejects(
    createDispatchCardPairZip([pc(),new File([new Uint8Array([1])],'mobile.webp',{type:'image/webp'})]),
    /PC·모바일 PNG 두 장/,
  );
});

test('native share receives two different PNG attachments in one call',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const captured:{shared?:ShareData}={};
  let called=0;
  Object.defineProperty(globalThis,'navigator',{
    configurable:true,value:{
      canShare:(data:ShareData)=>data.files?.length===2,
      share:async(data:ShareData)=>{called++;captured.shared=data;},
    },
  });
  try{
    const files=[pc(),mobile()] as [File,File];
    assert.equal(supportsDispatchCardPairShare(files),true);
    assert.equal(await shareDispatchCardPngPair(files,'VIP_193호_5336_PC_Mobile'),'shared');
    assert.equal(called,1);
    assert.equal(captured.shared?.files?.length,2);
    assert.equal(captured.shared?.files?.[0],files[0]);
    assert.equal(captured.shared?.files?.[1],files[1]);
    assert.equal(captured.shared?.title,undefined);
    assert.equal(captured.shared?.text,DISPATCH_CARD_PAIR_SHARE_TEXT);
    assert.equal(captured.shared?.text,
      '안녕하세요 VIP리무진코리아입니다. 기사 인포카드 전달드립니다. 보기 편하시도록 PC용과 모바일용 함께 보내드려요.');
    assert.doesNotMatch(captured.shared?.text||'',/\:\)|기사 인포카드 보내드립니다/);
    assert.equal(DISPATCH_CARD_SINGLE_SHARE_TEXT,'안녕하세요 VIP리무진코리아입니다. 기사 인포카드 전달드립니다.');
  }finally{
    if(previous)Object.defineProperty(globalThis,'navigator',previous);
    else Reflect.deleteProperty(globalThis,'navigator');
  }
});

test('cancelled native share never downloads files',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{
    configurable:true,value:{
      canShare:()=>true,
      share:async()=>{const error=new Error('User dismissed');error.name='AbortError';throw error;},
    },
  });
  try{
    assert.equal(await shareDispatchCardPngPair([pc(),mobile()],'VIP_Pair'),'cancelled');
  }finally{
    if(previous)Object.defineProperty(globalThis,'navigator',previous);
    else Reflect.deleteProperty(globalThis,'navigator');
  }
});

test('asset manager uses one pair action, requires both current cards, removes noisy badge and shortens copy',()=>{
  const source=read('components/hq/drivers/HqDriverAssetManagerModal.tsx');
  assert.match(source,/shareDispatchCardPngPair\(/);
  assert.match(source,/onClick=\{\(\)=>\{void handleShareBoth\(\);\}\}/);
  assert.match(source,/prepared\.pc\?\.path===bundle\?\.pcInfo\?\.filePath/);
  assert.match(source,/prepared\.mobile\?\.path===bundle\?\.mobileInfo\?\.filePath/);
  assert.match(source,/!bothFilesPrepared\|\|preparing\.pc\|\|preparing\.mobile/);
  assert.match(source,/PC·모바일 두 장 생성 후 공유/);
  assert.match(source,/PC·모바일 함께 공유/);
  assert.match(source,/PC·모바일 ZIP 저장/);
  assert.equal((source.match(/<HqIconButton/g)||[]).length,3);
  assert.match(source,/headerActions=\{<>/);
  assert.match(source,/<Pencil className="size-4"/);
  assert.match(source,/<Share2 className="size-4"/);
  assert.doesNotMatch(source,/ImageIcon className/);
  assert.doesNotMatch(source,/footer=\{<HqButton variant="secondary" onClick=\{onClose\}>닫기/);
  const modal=read('components/hq/ui/HqModal.tsx');
  assert.match(modal,/headerActions\?: React.ReactNode/);
  assert.match(modal,/\{headerActions\}/);
  assert.match(source,/기사 정보·사진 변경 시, 배차카드를 다시 갱신해 주세요/);
  assert.doesNotMatch(source,/PC·모바일 사용 가능/);
  assert.doesNotMatch(source,/PNG 이미지 공유/);
  assert.doesNotMatch(source,/handleShare\(variant\)/);
  assert.equal((source.match(/handleShareBoth\(\)/g)||[]).length,1);
});
