import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {emptyFieldKnowledgeGuide,validateFieldKnowledgeGuide,legacyFieldKnowledgeEntries} from '@/utils/fieldKnowledgeGuide';
import {fieldKnowledgeGuideRows} from '@/utils/fieldKnowledgeGuideDisplay';
import {normalizeKnowledgeItem} from '@/utils/sharedFieldKnowledge';
import {isValidFieldKnowledgeImageUrl} from '@/utils/hqKnowledgeImageUrl';
import {validateKnowledgePhoto} from '@/utils/fieldKnowledgeImageUpload';
import type {FieldKnowledgeItem} from '@/types/fieldKnowledge';

const src=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');
const base:FieldKnowledgeItem={
  id:'fk-test-hotel',title:'안다즈 서울 강남',category:'호텔',
  description:'강남 호텔',imageUrl:'/images/icons/knowledge/icon_knowledge.png',
  photos:[],address:'서울 강남구 논현로',updatedAt:'',updatedBy:'',
};
test('standard field knowledge form uses enum selections and typed safe fields',()=>{
  const guide=emptyFieldKnowledgeGuide();
  assert.equal(validateFieldKnowledgeGuide(guide).ok,true);
  const valid={
    ...guide,
    parking:{policy:'conditional',graceMinutes:30,validation:'hotel'},
    waiting:{level:'B2',zone:'대기구역 A',sprinter:'confirm',heightLimitCm:240},
    restroom:{level:'1F',landmark:'로비 우측',access:'public'},
    pickup:{level:'1F',gate:'정문',instruction:'직원 안내 후 진입'},
    restrictions:['no_roadside','registration'],
    notices:[{type:'event',detail:'행사 종료 후 출차'}],
  };
  const result=validateFieldKnowledgeGuide(valid);
  assert.equal(result.ok,true);
  const normalized=normalizeKnowledgeItem({...base,guide:valid});
  assert.equal(normalized.ok,true);
  if(normalized.ok){
    assert.equal(normalized.item.guide?.parking.graceMinutes,30);
    assert.equal(normalized.item.guide?.waiting.zone,'대기구역 A');
    const rows=fieldKnowledgeGuideRows(normalized.item);
    assert.match(rows.find(row=>row.key==='parking')?.value||'',/30분/);
    assert.match(rows.find(row=>row.key==='waiting')?.value||'',/대기구역 A/);
    assert.match(rows.find(row=>row.key==='restroom')?.value||'',/로비 우측/);
    assert.match(rows.find(row=>row.key==='pickup')?.value||'',/정문/);
    assert.match(rows.find(row=>row.key==='restrictions')?.value||'',/노상 정차 금지/);
  }
  assert.equal(validateFieldKnowledgeGuide({...valid,waiting:{...valid.waiting,level:''}}).ok,false);
  assert.equal(validateFieldKnowledgeGuide({...valid,restroom:{...valid.restroom,level:''}}).ok,false);
  assert.equal(validateFieldKnowledgeGuide({...valid,parking:{...valid.parking,graceMinutes:1441}}).ok,false);
  assert.equal(validateFieldKnowledgeGuide({...valid,restrictions:['arbitrary_text']}).ok,false);
  assert.equal(validateFieldKnowledgeGuide({...valid,notices:[{type:'other',detail:''}]}).ok,false);
  assert.equal(normalizeKnowledgeItem({...base,guide:{...valid,parking:{...valid.parking,policy:'invalid'}}}).ok,false);
});

test('legacy unstructured knowledge still reads without losing its original data',()=>{
  const legacy:FieldKnowledgeItem={...base,freeParkingNotice:'호텔 확인 시 30분 무료',
    restroomLocation:'로비 우측',sprinterWaiting:'B2 확인',
    vehicleWaitingNotes:'정문 옆',additionalNotes:'주차비 1시간 10000원'};
  const rows=fieldKnowledgeGuideRows(legacy);
  assert.match(rows.find(r=>r.key==='parking')?.value||'',/30분 무료/);
  assert.match(rows.find(r=>r.key==='restroom')?.value||'',/로비 우측/);
  assert.match(rows.find(r=>r.key==='waiting')?.value||'',/정문 옆/);
  assert.match(rows.find(r=>r.key==='legacy-sprinter')?.value||'',/B2 확인/);
  assert.equal(legacyFieldKnowledgeEntries(legacy).length,5);
  const updated={...legacy,guide:{...emptyFieldKnowledgeGuide(),restroom:{
    level:'1F',landmark:'로비 좌측',access:'public' as const}}};
  assert.equal(fieldKnowledgeGuideRows(updated).find(r=>r.key==='restroom')?.value.includes('로비 좌측'),true);
  assert.equal(updated.restroomLocation,'로비 우측');
});

test('private, permanent uploaded photo URLs are scoped and legacy HTTPS is accepted',()=>{
  const path='vip_limousine_korea/field-knowledge/fk-test-hotel/00000000-0000-4000-8000-000000000000.jpg';
  const good='/api/field-knowledge/image?path='+encodeURIComponent(path);
  assert.equal(isValidFieldKnowledgeImageUrl(good),true);
  assert.equal(isValidFieldKnowledgeImageUrl(good+'&other=1'),false);
  assert.equal(isValidFieldKnowledgeImageUrl('/api/field-knowledge/image?path=../../secret.jpg'),false);
  assert.equal(isValidFieldKnowledgeImageUrl('/api/field-knowledge/image?path='+encodeURIComponent('another/field-knowledge/a/'+path.split('/').at(-1))),false);
  assert.equal(isValidFieldKnowledgeImageUrl('https://example.com/old-photo.png'),true);
  assert.equal(validateKnowledgePhoto({type:'image/png',size:3_000_000}),null);
  assert.equal(validateKnowledgePhoto({type:'image/jpeg',size:8*1024*1024+1})?.includes('8MB'),true);
  assert.ok(validateKnowledgePhoto({type:'image/svg+xml',size:5_000}));
});

test('HQ common components and staged media uploads replace text-only URL editor',()=>{
  const view=src('components/hq/knowledge/HqFieldKnowledgeView.tsx');
  const editor=src('components/hq/knowledge/HqFieldKnowledgeEditor.tsx');
  const form=src('components/hq/knowledge/HqFieldKnowledgeStructuredForm.tsx');
  const driver=src('components/knowledge/DriverFieldKnowledgeModal.tsx');
  const route=src('app/api/field-knowledge/image/route.ts');
  assert.match(view,/<HqFieldKnowledgeEditor/);
  assert.match(view,/uploadKnowledgePhoto/);
  assert.match(view,/cleanupUncommittedKnowledgePhotos/);
  assert.doesNotMatch(view,/photoUrlDraft|HTTPS 이미지 주소 또는 앱 이미지 경로를 입력/);
  assert.match(editor,/대표 이미지 파일 업로드/);
  assert.match(editor,/현장 사진 파일 업로드/);
  assert.match(editor,/URL\.createObjectURL/);
  assert.match(editor,/<HqCard/);
  assert.match(editor,/<HqInput/);
  assert.match(editor,/<HqSegmentedTabs/);
  assert.match(form,/주차·무료회차/);
  assert.match(form,/차량 대기·진입/);
  assert.match(form,/화장실/);
  assert.match(form,/승·하차 위치/);
  assert.match(form,/주정차·진입 주의사항/);
  assert.match(form,/유형별 추가 안내/);
  assert.match(form,/<HqSelect/);
  assert.match(driver,/fieldKnowledgeGuideRows\(activeItem\)/);
  assert.match(route,/requireHqAdmin/);
  assert.match(route,/verifyServerAuth/);
  assert.match(route,/file\.arrayBuffer\(\)/);
  assert.match(route,/kind\.signature\(data\)/);
  assert.match(route,/contentType:file\.type,upsert:false/);
  assert.match(route,/X-Content-Type-Options/);
});
