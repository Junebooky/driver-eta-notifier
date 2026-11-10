import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { normalizeGeminiVehicleRoutes, reconcileVehicleExcelEvidence, vehicleRouteLabels, vehicleRouteDays } from './emailVehicleRoutes';
import { parseVehicleSlotsFromDraft } from './vehicleSlotParser';
import { buildEmailDispatchPlan } from './emailDispatchPlan';
import { getUnconfirmedEmailRouteStops,confirmEmailRouteStop } from './emailRoutePlaceVerification';
import { verifyAttachmentCoverage } from './emailAttachmentCoverage';

const sampleDraft=():HqEmailExtractedDraft=>({
  id:'test-draft',emailId:'test-mail',companyName:'고객사',passengerName:'',passengerPhone:'',
  passengerCount:0,pickupDate:'2026-11-08',pickupTime:'08:00',
  pickupLocation:'첫 호텔',dropoffLocation:'마지막 호텔',flightNumber:'',
  requestedVehicleClass:'카니발 2대',specialRequests:'',tripType:'group',
  confidence:0.96,warnings:[],assignedDriver:null,assignedVehicle:null,assignedVehiclePlate:null,
  status:'draft',updatedAt:'2026-11-08T00:00:00.000Z',
});
const raw=(label:string,date:string,places:string[])=>({
  vehicleLabel:label,date,vehicleClass:'카니발',passengerName:label+' 탑승객',passengerCount:2,
  endTime:'19:00',
  stops:places.map((location,i)=>({time:i===0?'08:00':i===places.length-1?'18:00':`1${i}:00`,location,
    clientAddress:location+' 고객주소',notes:'고객사 원본'})),
});
test('Gemini complete multi-vehicle itinerary keeps every date and waypoint separate',()=>{
  const input=[raw('Car 1','2026-11-08',['Hotel','Meeting','Restaurant','Return hotel']),
    raw('Car 1','2026-11-09',['Hotel','Factory','Hotel']),
    raw('Car 2','2026-11-09',['Airport','VIP lounge','Exhibition','Another hotel'])];
  const draft={...sampleDraft(),vehicleRoutes:normalizeGeminiVehicleRoutes(input,'2026-11-08')};
  assert.deepEqual(vehicleRouteLabels(draft),['Car 1','Car 2']);
  assert.deepEqual(vehicleRouteDays(draft).map(r=>[r.date,r.vehicleLabel,r.stops.length]),[
    ['2026-11-08','Car 1',4],['2026-11-09','Car 1',3],['2026-11-09','Car 2',4],
  ]);
  assert.equal(draft.vehicleRoutes![0].stops[1].clientAddress,'Meeting 고객주소');
  const slots=parseVehicleSlotsFromDraft(draft);
  assert.equal(slots.length,2);
  const available=slots.map((slot,i)=>({
    ...slot,vehiclePlate:`test-vehicle-${i+1}`,
    driver:{id:`test-driver-${i+1}`,name:`기사 ${i+1}`,languages:['ko']},
  }));
  const confirmed={...draft,vehicleRoutes:draft.vehicleRoutes!.map(r=>({
    ...r,stops:r.stops.map(p=>({...p,isPoiConfirmed:true,lat:37.5,lng:127.0,address:p.location+' 실제주소'})),
  }))};
  const items=buildEmailDispatchPlan(confirmed,available,'published');
  assert.equal(items.length,3);
  assert.deepEqual(items.map(i=>[i.date,i.groupVehicleIndex,i.vehiclePlate,i.routeWaypoints.length]),[
    ['2026-11-08',1,'test-vehicle-1',4],
    ['2026-11-09',1,'test-vehicle-1',3],
    ['2026-11-09',2,'test-vehicle-2',4],
  ]);
  assert.deepEqual(items[0].routeWaypoints.map(p=>p.location),['Hotel','Meeting','Restaurant','Return hotel']);
  assert.deepEqual(items[2].routeWaypoints.map(p=>p.location),['Airport','VIP lounge','Exhibition','Another hotel']);
  assert.ok(!items.some(item=>item.date==='2026-11-08' && item.groupVehicleIndex===2));
  assert.equal(items[0].passengerName,'Car 1 탑승객');
  assert.equal(items[2].passengerName,'Car 2 탑승객');
});
test('Excel Car 1/Car 2 missing from Gemini get their OWN source-backed stops',()=>{
  const records=['Car 1 일정표.xlsx','Car 2 일정표.xlsx'].flatMap((filename,sourceIndex)=>[
    {filename,sourceIndex,sourceSha256:`sha${sourceIndex}`,sheetName:'일정표',
      cell:'B2',date:'2026-11-10',dateLabel:'Nov 10',time:'09:00',title:'Pickup at hotel',
      originalText:'Pickup at hotel',clockSource:'text' as const},
    {filename,sourceIndex,sourceSha256:`sha${sourceIndex}`,sheetName:'일정표',
      cell:'B3',date:'2026-11-10',dateLabel:'Nov 10',time:'11:00',title:'Meeting',
      originalText:'Meeting / Hotel',clockSource:'text' as const},
  ]);
  const merged=reconcileVehicleExcelEvidence(sampleDraft(),records);
  assert.deepEqual(vehicleRouteLabels(merged),['Car 1','Car 2']);
  assert.equal(merged.vehicleRoutes?.length,2);
  assert.equal(merged.vehicleRoutes?.[0].stops.length,2);
  assert.equal(merged.vehicleRoutes?.[1].stops.length,2);
  assert.equal(merged.vehicleRoutes?.[1].stops[0].location,'Pickup at hotel');
  assert.deepEqual([...new Set(merged.vehicleRoutes?.map(r=>r.date))],['2026-11-10']);
});
test('POI confirmation for Car 2 never updates Car 1',()=>{
  const draft={...sampleDraft(),vehicleRoutes:normalizeGeminiVehicleRoutes([
    raw('Car 1','2026-11-10',['A','B']),raw('Car 2','2026-11-10',['C','D']),
  ],'2026-11-10')};
  assert.equal(getUnconfirmedEmailRouteStops(draft).length,4);
  const target=draft.vehicleRoutes![1].stops[0];
  const changed=confirmEmailRouteStop(draft,target.id,{name:'확정 C',address:'서울 강남로 1',lat:37,lng:127});
  assert.equal(changed.vehicleRoutes![1].stops[0].location,'확정 C');
  assert.equal(changed.vehicleRoutes![0].stops[0].location,'A');
  assert.equal(getUnconfirmedEmailRouteStops(changed).length,3);
});
test('missing vehicle route never gets silently duplicated across multiple fleet slots',()=>{
  const draft={...sampleDraft(),vehicleRoutes:normalizeGeminiVehicleRoutes([
    raw('Car 1','2026-11-10',['Hotel','Museum']),
  ],'2026-11-10')};
  const slots=parseVehicleSlotsFromDraft(draft);
  assert.equal(slots.length,2,'client asks 2 vehicles even if AI omitted second route');
  assert.throws(()=>buildEmailDispatchPlan(draft,slots,'unassigned'),/고객사 요청 차량은 1대인데 배정 차량은 2대/);
});
test('route viewer has no native per-date registration method dropdown',()=>{
  const ui=readFileSync(new URL('../components/hq/email/HqStep1ExtractView.tsx',import.meta.url),'utf8');
  const inbox=readFileSync(new URL('../components/hq/email/HqEmailInboxView.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/등록 방법 선택|해당 날짜 운행 없음|<select/);
  assert.doesNotMatch(inbox,/emailBatchNeedsReview|buildEmailBatchRevisionApproval/);
  assert.match(ui,/HqEmailVehicleRouteEditor/);
  assert.match(inbox,/parseVehicleSlotsFromDraft/);
});

test('plain text email, one unlabeled car: one neutral route and exactly one slot',()=>{
  const routes=normalizeGeminiVehicleRoutes([{
    vehicleLabel:'',date:'2026-11-10',stops:[
      {time:'10:00',location:'인천공항'}, {time:'',location:'서울 호텔'},
    ],
  }],'2026-11-10');
  assert.equal(routes.length,1);
  assert.equal(routes[0].vehicleLabel,'의전 차량');
  const draft={...sampleDraft(),tripType:'single' as const,requestedVehicleClass:'',vehicleRoutes:routes};
  assert.deepEqual(vehicleRouteLabels(draft),['의전 차량']);
  const slots=parseVehicleSlotsFromDraft(draft);
  assert.equal(slots.length,1);
  assert.equal(slots[0].vehicleModel,'차량 미지정');
  const planned=buildEmailDispatchPlan(draft,slots,'unassigned');
  assert.equal(planned.length,1);
  assert.deepEqual(planned[0].routeWaypoints.map(p=>p.location),['인천공항','서울 호텔']);
  assert.equal(planned[0].vehicleModel,'차량 미지정');
});

test('plain text multi-day event for one vehicle creates one slot but different dated schedules',()=>{
  const draft={...sampleDraft(),tripType:'single' as const,requestedVehicleClass:'스타리아 리무진 1대',
    vehicleRoutes:normalizeGeminiVehicleRoutes([
      {vehicleLabel:'',date:'2026-11-10',stops:[{time:'09:00',location:'호텔'},{time:'17:00',location:'행사장'}]},
      {vehicleLabel:'',date:'2026-11-11',stops:[{time:'09:00',location:'행사장'},{time:'17:00',location:'공항'}]},
    ],'2026-11-10'),
  };
  const slots=parseVehicleSlotsFromDraft(draft);
  assert.equal(slots.length,1);
  assert.equal(buildEmailDispatchPlan(draft,slots,'unassigned').length,2);
  assert.deepEqual(buildEmailDispatchPlan(draft,slots,'unassigned').map(p=>p.origin),['호텔','행사장']);
});

test('two attachment files without car labels are not automatically two vehicle requests',()=>{
  const records=['programme.xlsx','revision.xlsx'].flatMap((filename,sourceIndex)=>[
    {filename,sourceIndex,sourceSha256:'hash-'+sourceIndex,sheetName:'일정',
      cell:'B2',date:'2026-11-10',dateLabel:'Nov 10',time:'09:00',
      title:'Lobby pickup',originalText:'Lobby pickup',clockSource:'text' as const},
  ]);
  const draft={...sampleDraft(),requestedVehicleClass:''};
  const missingGemini=reconcileVehicleExcelEvidence(draft,records);
  assert.equal(missingGemini.vehicleRoutes?.length || 0,0);
  assert.match(missingGemini.warnings.join(' '),/차량별 경로를 특정할 수 없어서/);
  const extracted={...draft,vehicleRoutes:normalizeGeminiVehicleRoutes([
    {vehicleLabel:'',date:'2026-11-10',sourceFilename:'programme.xlsx',
      stops:[{time:'09:00',location:'Lobby pickup'},{time:'18:00',location:'Hotel return'}]},
  ],'2026-11-10')};
  const reconciled=reconcileVehicleExcelEvidence(extracted,records);
  assert.deepEqual(vehicleRouteLabels(reconciled),['의전 차량']);
  assert.equal(parseVehicleSlotsFromDraft(reconciled).length,1);
});

test('Gemini keeps arbitrary customer labels and vehicle counts without hard-coded Car 1 or Car 2',()=>{
  const draft={...sampleDraft(),requestedVehicleClass:'스타리아 1대, 카니발 1대',
    vehicleRoutes:normalizeGeminiVehicleRoutes([
      raw('VIP Van','2026-11-10',['터미널','호텔']),
      raw('Chairman Sedan','2026-11-10',['회사','공항']),
    ],'2026-11-10')};
  assert.deepEqual(vehicleRouteLabels(draft),['VIP Van','Chairman Sedan']);
  assert.equal(parseVehicleSlotsFromDraft(draft).length,2);
  assert.notEqual(draft.vehicleRoutes?.[0].stops[0].location,draft.vehicleRoutes?.[1].stops[0].location);
});
