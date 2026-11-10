import test from 'node:test';
import assert from 'node:assert/strict';
import { write, utils } from 'xlsx';
import { analyzeScheduleAttachments } from '../services/emailAttachmentIntake';
import { matchEmailBookingCandidates } from '../services/emailBookingMatchService';
import { emailRevisionDiff, prepareEmailRevisionDraft } from './emailBookingRevision';
import type { ExistingEmailBookingCandidate } from '../services/emailBookingMatchService';
import type { HqEmailExtractedDraft } from '@/types/emailHq';

const stops = [
  { id:'a', order:1, date:'2026-11-10', time:'09:00', location:'인천공항', lat:37.46, lng:126.43, isPoiConfirmed:true },
  { id:'b', order:2, date:'2026-11-10', time:'11:00', location:'그랜드 하얏트 서울', lat:37.53, lng:126.99, isPoiConfirmed:true },
  { id:'c', order:3, date:'2026-11-10', time:'14:00', location:'코엑스', lat:37.51, lng:127.06, isPoiConfirmed:true },
  { id:'d', order:4, date:'2026-11-10', time:'18:00', location:'그랜드 하얏트 서울', lat:37.53, lng:126.99, isPoiConfirmed:true },
];

const old: ExistingEmailBookingCandidate = {
  scheduleId:'existing-id',version:3,bookingNo:'#261110-456',customerName:'테스트코리아',
  pickupDate:'2026-11-10',pickupTime:'09:00',endTime:'18:00',pickupLocation:'인천공항',
  destination:'그랜드 하얏트 서울',routeWaypoints:stops,
  vehiclePlate:'193호 5336',vehicleModel:'카니발 하이리무진',driverName:'홍길동',
  driverId:'driver-one',passengerName:'Alex',passengerCount:3,flightNumber:'KE001',
  notes:'물 준비',dispatchStatus:'published',eventId:'email-old-uid',score:95,reasons:['발신자 일치'],
};

const draft = (override: Partial<HqEmailExtractedDraft> = {}) => ({
  id:'draft-email-new',emailId:'naver-999',companyName:'테스트코리아',
  passengerName:'Alex',passengerPhone:'',passengerCount:3,pickupDate:'2026-11-10',
  pickupTime:'09:00',pickupLocation:'인천공항',dropoffLocation:'그랜드 하얏트 서울',
  flightNumber:'KE001',requestedVehicleClass:'카니발 하이리무진',
  specialRequests:'',tripType:'modification' as const,confidence:0.9,
  warnings:[],assignedDriver:null,assignedVehicle:null,assignedVehiclePlate:null,
  status:'draft' as const,updatedAt:'2026-11-09T00:00:00Z',
  ...override,
}) as HqEmailExtractedDraft;

test('Excel schedule table: all named sheets, headers, times and stops reach one textual AI request', () => {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([
    ['날짜','시간','장소'],['2026-11-10','09:00','인천공항'],['','11:00','그랜드 하얏트 서울'],
    ['','14:00','코엑스'],['','18:00','그랜드 하얏트 서울'],
  ]), 'VIP 스케줄');
  const content = Buffer.from(write(book,{ bookType:'xlsx', type:'buffer' }));
  const result = analyzeScheduleAttachments([{filename:'VIP 수정본.xlsx',contentType:'application/octet-stream',content}]);
  assert.equal(result.analyzed.length,1);
  const text = result.analyzed[0].text || '';
  for(const value of ['Sheet: VIP 스케줄','09:00','11:00','14:00','18:00','코엑스']) assert.ok(text.includes(value),value);
  assert.equal(result.analyzed[0].sha256.length,64);
});

test('PDF attachment gets the original PDF bytes for Gemini multimodal, without converting to endpoints', () => {
  const file = Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n%%EOF');
  const result = analyzeScheduleAttachments([{filename:'revised.pdf',contentType:'application/pdf',content:file}]);
  assert.equal(result.analyzed[0].kind,'pdf');
  assert.equal(Buffer.from(result.analyzed[0].pdfBase64!, 'base64').toString(),file.toString());
});

test('unsupported attachments ignored, invalid or oversized files rejected', () => {
  assert.deepEqual(analyzeScheduleAttachments([{filename:'signature.png',contentType:'image/png',content:Buffer.from('hello')}]).ignored,['signature.png']);
  assert.throws(()=>analyzeScheduleAttachments([{filename:'fake.pdf',contentType:'application/pdf',content:Buffer.from('not a pdf')}]),/올바른 PDF/);
  assert.throws(()=>analyzeScheduleAttachments([{filename:'bad.xlsx',contentType:'application/octet-stream',content:Buffer.from('not excel')}]),/일치하지 않습니다/);
  assert.throws(()=>analyzeScheduleAttachments([{filename:'large.pdf',contentType:'application/pdf',content:Buffer.alloc(8*1024*1024+1)}]),/8MB/);
});

test('deterministic matching requires independent evidence and never changes a schedule automatically', () => {
  const row = {
    id:'existing-id',org_id:'vip_limousine_korea',date:'2026-11-10',
    pickup_time:'09:00:00',end_time:'18:00:00',origin:'인천공항',destination:'그랜드 하얏트 서울',
    passenger_name:'Alex',passenger_count:3,dispatch_status:'published',status:'scheduled',
    vehicle_plate:'193호 5336',version:3,
    schedule_meta:{customerName:'테스트코리아',bookingNo:'#261110-456',sourceSenderEmail:'booking@client.com',sourceMessageId:'<old-email@client.com>',routeWaypoints:stops,sourceAttachmentHashes:['a'.repeat(64)]},
  };
  const input = {sender:'booking@client.com',companyName:'테스트코리아',subject:'11월 10일 수정본',pickupDate:'2026-11-10',passengerName:'Alex'};
  const matches = matchEmailBookingCandidates(input,[row]);
  assert.equal(matches.length,1);
  assert.equal(matches[0].scheduleId,'existing-id');
  assert.deepEqual(matches[0].routeWaypoints.map(p=>p.location),stops.map(p=>p.location));
  // A different sender can still match the same client and itinerary.
  assert.equal(matchEmailBookingCandidates({...input,sender:'assistant@another-domain.com'},[row]).length,1);
  // The same sender on another day does not match without a booking reference.
  assert.equal(matchEmailBookingCandidates({...input,pickupDate:'2026-11-23'},[row]).length,0);
  // The same sender at a different organisation cannot access another tenant's schedule.
  assert.equal(matchEmailBookingCandidates(input,[{...row,org_id:'another_org'}]).length,0);
  // Exact thread or explicit booking number can match a moved date.
  assert.equal(matchEmailBookingCandidates({...input,pickupDate:'2026-11-23',inReplyTo:'<old-email@client.com>'},[row]).length,1);
  assert.equal(matchEmailBookingCandidates({...input,pickupDate:'2026-11-23',subject:'Revised #261110-456'},[row]).length,1);
});

test('partial revision changes only specified stop and retains all other stops, especially repeated hotel visits', () => {
  const revised = prepareEmailRevisionDraft(draft({
    revisionScope:'partial',
    waypoints:[{id:'c-change',order:1,date:'2026-11-10',time:'15:00',location:'코엑스'}],
  }),old);
  assert.equal(revised.waypoints?.length,4);
  assert.deepEqual(revised.waypoints?.map(p=>p.time),['09:00','11:00','15:00','18:00']);
  assert.equal(revised.waypoints?.[1].location,'그랜드 하얏트 서울');
  assert.equal(revised.waypoints?.[3].location,'그랜드 하얏트 서울');
  assert.equal(revised.revisionMatchedScheduleId,'existing-id');
  assert.equal(revised.revisionMatchedVersion,3);
  assert.equal(revised.waypoints?.[2].isPoiConfirmed,true);
});

test('partial revision without passenger count retains original count instead of inventing one passenger', () => {
  const revised = prepareEmailRevisionDraft(draft({
    passengerCount: 0,
    pickupTime: '10:00',
    revisionScope: 'partial',
    waypoints: undefined,
  }), old);
  assert.equal(revised.passengerCount, 3);
  assert.equal(revised.pickupTime, '10:00');
  assert.equal(revised.waypoints?.length, 4);
  assert.equal(revised.waypoints?.[0].time, '10:00');
  assert.equal(revised.waypoints?.[3].time, '18:00');
});

test('full replacement can add new stop but needs fresh TMAP POI confirmation', () => {
  const waypoints = [...stops.slice(0,2), {id:'new',order:3,date:'2026-11-10',time:'13:30',location:'새로운 호텔'}, ...stops.slice(2)].map((p,i)=>({...p,order:i+1}));
  const revised = prepareEmailRevisionDraft(draft({revisionScope:'full',waypoints}),old);
  assert.equal(revised.waypoints?.length,5);
  assert.equal(revised.waypoints?.[2].isPoiConfirmed,false);
  assert.equal(revised.waypoints?.[2].lat,undefined);
  assert.ok(emailRevisionDiff(draft({pickupTime:'10:00'}),old).some(x=>x.label==='픽업 시간'));
});
