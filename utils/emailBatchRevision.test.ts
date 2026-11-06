import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import type { ExistingEmailBookingCandidate } from '../services/emailBookingMatchService';
import { matchEmailBookingCandidates } from '../services/emailBookingMatchService';
import {
  emailBatchKey, emailBatchRows, emailBatchNeedsReview,
  prepareEmailBatchRevisionDraft, buildEmailBatchRevisionApproval, type EmailBatchSlot,
} from './emailBatchRevision';
import { HqEmailBatchRevisionPanel } from '../components/hq/email/HqEmailBatchRevisionPanel';

const dates = ['2026-11-10', '2026-11-11', '2026-11-12'];
const plates = ['125호 9982', '700호 1458', '73호 2553'];
const locations = ['인천공항', '그랜드 하얏트 서울', '코엑스', '그랜드 하얏트 서울'];

function stops(date: string, changed = false): RouteWaypointItem[] {
  return locations.map((location,index) => ({
    id: `${date}-${index}`,order:index+1,date,
    time:['09:00','11:00',changed?'15:00':'14:00','18:00'][index],
    location,address:'검증된 테스트 상세주소',lat:37.5 + index*.01,lng:127 + index*.01,
    isPoiConfirmed:true,
  }));
}
const slots: EmailBatchSlot[] = plates.map((plate,i)=>({
  vehiclePlate:plate,vehicleModel:'벤츠 스프린터',
  driver:{id:`driver-${i+1}`,name:`기사${i+1}`,phone:'010-0000-0000',languages:['ko']},
}));
const originals: ExistingEmailBookingCandidate[] = dates.flatMap(date =>
  plates.map((plate,i)=>({
    scheduleId:`old-${date}-${i}`,version:4,bookingNo:`#261110-${100+i}`,
    customerName:'테스트코리아',pickupDate:date,pickupTime:'09:00',endTime:'18:00',
    pickupLocation:locations[0],destination:locations[3],routeWaypoints:stops(date),
    vehiclePlate:plate,vehicleModel:'벤츠 스프린터',
    vehicleId:undefined,driverName:`기사${i+1}`,driverId:`driver-${i+1}`,
    passengerName:'VIP 홍길동',passengerCount:3,flightNumber:'KE101',notes:'생수 준비',
    dispatchStatus:'published' as const,eventId:'email-old-event',
    groupId:`email-old-event-${date}`,groupVehicleIndex:i+1,groupTotalVehicles:3,
    score:95,reasons:['원본 메일 대화 일치'],
  }))
);

function draft(override: Partial<HqEmailExtractedDraft>={}): HqEmailExtractedDraft {
  return {
    id:'draft-2',emailId:'naver-200',companyName:'테스트코리아',
    passengerName:'VIP 홍길동',passengerPhone:'',passengerCount:3,
    pickupDate:dates[0],pickupTime:'09:00',pickupLocation:locations[0],
    dropoffLocation:locations[3],waypoints:dates.flatMap(date=>stops(date,date===dates[1])),
    dayEndTimes:Object.fromEntries(dates.map(d=>[d,'18:00'])),
    flightNumber:'KE101',requestedVehicleClass:'스프린터 3대',specialRequests:'생수 준비',
    tripType:'modification',revisionScope:'full',confidence:0.96,warnings:[],
    assignedDriver:null,assignedVehicle:null,assignedVehiclePlate:null,status:'draft',
    updatedAt:'2026-11-09T00:00:00Z',...override,
  };
}
const selectAll = () => Object.fromEntries(dates.flatMap(date=>
  plates.map((_,i)=>[emailBatchKey(date,i),`old-${date}-${i}`])));

test('three dates × three independent vehicles render exactly nine distinct review rows',()=>{
  const rows=emailBatchRows(draft(),slots,originals,selectAll());
  assert.equal(rows.length,9);
  assert.equal(new Set(rows.map(row=>row.key)).size,9);
  assert.equal(rows.find(row=>row.date===dates[1] && row.index===2)?.action,'update');
  assert.equal(rows.filter(row=>row.action==='update').length,3);
  assert.ok(rows.every(row=>row.stops.length===4));
  assert.equal(rows[3].stops[2].time,'15:00');
  assert.equal(rows[0].stops[2].time,'14:00');
  assert.ok(emailBatchNeedsReview(draft(),3,9));
});

test('explicit row mappings prepare nine atomic in-place updates without duplicating schedule IDs',()=>{
  const result=buildEmailBatchRevisionApproval(draft(),slots,originals,selectAll(),[],{}, {},'published');
  assert.equal(result.items.length,9);
  assert.equal(result.changes.updated,3);
  assert.equal(result.changes.unchanged,6);
  assert.equal(result.changes.new,0);
  assert.ok(result.items.every(item=>item.scheduleId && item.expectedVersion===4));
  assert.equal(new Set(result.items.map(item=>item.scheduleId)).size,9);
  assert.equal(result.items[4].routeWaypoints && (result.items[4].routeWaypoints as RouteWaypointItem[])[2].time,'15:00');
  assert.equal(result.items[0].eventId,'email-old-event');
  assert.equal(result.items[0].bookingNo,'#261110-100');
  assert.equal(result.items[7].driverId,'driver-2');
});

test('adding one date/vehicle and explicitly cancelling an omitted original is one mixed batch',()=>{
  const choices=selectAll();
  choices[emailBatchKey(dates[2],2)]='new';
  const oldId=`old-${dates[2]}-2`;
  const result=buildEmailBatchRevisionApproval(draft(),slots,originals,choices,[oldId],{[oldId]:'고객사에서 3호차 제외 요청'}, {},'published');
  assert.equal(result.items.length,10);
  assert.equal(result.changes.new,1);
  assert.equal(result.changes.cancelled,1);
  const cancel=result.items.find(item=>item.dispatchStatus==='cancelled');
  assert.equal(cancel?.scheduleId,oldId);
  assert.equal(cancel?.expectedVersion,4);
  assert.equal(cancel?.cancelReason,'고객사에서 3호차 제외 요청');
  assert.ok(result.items.some(item=>!item.scheduleId));
});

test('omitted original rows are untouched unless HQ explicitly checks cancellation',()=>{
  const choices=selectAll();
  const droppedId=`old-${dates[2]}-2`;
  choices[emailBatchKey(dates[2],2)]='new';
  const result=buildEmailBatchRevisionApproval(draft(),slots,originals,choices,[],{}, {},'published');
  assert.equal(result.changes.cancelled,0);
  assert.equal(result.items.some(item=>item.scheduleId===droppedId),false);
});

test('mismatched, duplicate and unsafe cancellation choices fail before any server request',()=>{
  const duplicate=selectAll();
  duplicate[emailBatchKey(dates[1],1)]=duplicate[emailBatchKey(dates[1],0)];
  assert.throws(()=>buildEmailBatchRevisionApproval(draft(),slots,originals,duplicate,[],{}, {},'published'),/중복/);
  const missing=selectAll();
  delete missing[emailBatchKey(dates[2],0)];
  assert.throws(()=>buildEmailBatchRevisionApproval(draft(),slots,originals,missing,[],{}, {},'published'),/선택/);
  assert.throws(()=>buildEmailBatchRevisionApproval(draft(),slots,originals,selectAll(),[originals[0].scheduleId],{[originals[0].scheduleId]:'취소 요청'}, {},'published'),/동시에/);
  const newChoices=selectAll();
  const removed=originals[0].scheduleId;
  newChoices[emailBatchKey(dates[0],0)]='new';
  assert.throws(()=>buildEmailBatchRevisionApproval(draft(),slots,originals,newChoices,[removed],{}, {},'published'),/사유/);
});

test('each date can use its own independently verified vehicle and driver assignment',()=>{
  const override={
    [emailBatchKey(dates[0],1)]: {
      vehiclePlate:'101호 7681',
      driver:{ id:'driver-new',name:'재배정 기사',phone:'010-1234-5678',languages:['ko'] },
    },
  };
  const approval=buildEmailBatchRevisionApproval(draft(),slots,originals,selectAll(),[],{},override,'published');
  assert.equal(approval.items[1].vehiclePlate,'101호 7681');
  assert.equal(approval.items[1].driverId,'driver-new');
  assert.equal(approval.items[4].vehiclePlate,plates[1]);
  assert.equal(approval.items[4].driverId,'driver-2');
  assert.equal(approval.changes.updated,4);
});

test('partial changes keep all four stops and preserve repeated hotel visits and verified coordinates',()=>{
  const partial=draft({
    revisionScope:'partial', passengerCount:0,
    waypoints:[{id:'change-only',order:1,date:dates[1],time:'15:00',location:'코엑스'}],
    pickupDate:dates[1],pickupTime:'',pickupLocation:'',dropoffLocation:'',
    dayEndTimes:{},
  });
  const choices={
    [emailBatchKey(dates[1],0)]:`old-${dates[1]}-0`,
    [emailBatchKey(dates[1],1)]:`old-${dates[1]}-1`,
    [emailBatchKey(dates[1],2)]:`old-${dates[1]}-2`,
  };
  const prepared=prepareEmailBatchRevisionDraft(partial,slots,originals,choices);
  assert.equal(prepared.passengerCount,3);
  assert.equal(prepared.waypoints?.length,4);
  assert.deepEqual(prepared.waypoints?.map(p=>p.time),['09:00','11:00','15:00','18:00']);
  assert.equal(prepared.waypoints?.[1].location,'그랜드 하얏트 서울');
  assert.equal(prepared.waypoints?.[3].location,'그랜드 하얏트 서울');
  assert.ok(prepared.waypoints?.every(p=>p.isPoiConfirmed));
});

test('different old route per vehicle on one day is blocked instead of corrupting other drivers',()=>{
  const changed=originals.map(item=>({...item}));
  changed[1]={...changed[1],routeWaypoints:stops(dates[0]).map((p,i)=>i===1?{...p,location:'별도 호텔'}:p)};
  const choices={ [emailBatchKey(dates[0],0)]:changed[0].scheduleId,[emailBatchKey(dates[0],1)]:changed[1].scheduleId};
  assert.throws(()=>prepareEmailBatchRevisionDraft(draft(),slots,changed,choices),/차량별 이전 경로/);
});

test('matching searches every proposed day and returns more than six valid reservations',()=>{
  const rows=originals.map(item=>({
    id:item.scheduleId,org_id:'vip_limousine_korea',date:item.pickupDate,
    pickup_time:'09:00:00',end_time:'18:00:00',origin:item.pickupLocation,destination:item.destination,
    passenger_name:item.passengerName,passenger_count:3,
    dispatch_status:'published',status:'scheduled',
    vehicle_plate:item.vehiclePlate,version:item.version,
    schedule_meta:{customerName:item.customerName,sourceSenderEmail:'booking@client.com',routeWaypoints:item.routeWaypoints},
  }));
  const result=matchEmailBookingCandidates({
    sender:'booking@client.com',companyName:'테스트코리아',subject:'3일간 일정 변경',
    pickupDate:dates[0],scheduleDates:dates,batchMode:true,
  },rows);
  assert.equal(result.length,9);
  assert.equal(new Set(result.map(r=>r.pickupDate)).size,3);
});

test('White First review displays all nine rows with explicit unmapped and cancellation controls',()=>{
  const html=renderToStaticMarkup(createElement(HqEmailBatchRevisionPanel,{
    draft:draft(),slots,candidates:originals,decisions:selectAll(),
    cancelIds:[],cancelReasons:{},assignments:{},
    onSelect:()=>{},onCancel:()=>{},onCancelReason:()=>{},onAssignment:()=>{},
  }));
  assert.ok(html.includes('일정 일괄 비교'));
  assert.ok(html.includes('2026-11-10'));
  assert.ok(html.includes('2026-11-12'));
  assert.ok(html.includes('원본')||html.includes('기존'));
  assert.ok(html.includes('수정본에 연결되지 않은 기존 일정')===false);
  assert.ok(html.includes('bg-white'));
});


test('different dates may intentionally run different numbers of vehicles without phantom schedules', () => {
  const decisions=selectAll();
  // First day: 2 vehicles. Second day: 3. Last day: 1.
  decisions[emailBatchKey(dates[0],2)]='skip';
  decisions[emailBatchKey(dates[2],1)]='skip';
  decisions[emailBatchKey(dates[2],2)]='skip';
  const rows=emailBatchRows(draft(),slots,originals,decisions);
  assert.equal(rows.filter(row=>row.action==='skip').length,3);
  const approved=buildEmailBatchRevisionApproval(draft(),slots,originals,decisions,[],{}, {},'published');
  assert.equal(approved.items.length,6);
  assert.equal(approved.changes.new,0);
  assert.equal(approved.changes.cancelled,0);
  assert.equal(new Set(approved.items.map(item=>item.scheduleId)).size,6);
  assert.deepEqual(
    dates.map(date=>approved.items.filter(item=>item.date===date).length),
    [2,3,1],
  );
  assert.ok(approved.items.every(item=>item.vehiclePlate && item.driverId));
  // Existing schedules on an excluded day are NOT auto-cancelled.
  assert.ok(!approved.items.some(item=>item.scheduleId===`old-${dates[2]}-2`));
});

test('all days intentionally excluded cannot be approved as an empty successful batch',()=>{
  const decisions=Object.fromEntries(dates.flatMap(date=>
    plates.map((_,i)=>[emailBatchKey(date,i),'skip'])));
  assert.throws(()=>buildEmailBatchRevisionApproval(draft(),slots,originals,decisions,[],{}, {},'published'),/저장할 운행 일정/);
});

test('review UI shows a no-service choice and preserves three day groupings',()=>{
  const decisions=selectAll();
  decisions[emailBatchKey(dates[0],2)]='skip';
  const html=renderToStaticMarkup(createElement(HqEmailBatchRevisionPanel,{
    draft:draft(),slots,candidates:originals,decisions,
    cancelIds:[],cancelReasons:{},assignments:{},
    onSelect:()=>{},onCancel:()=>{},onCancelReason:()=>{},onAssignment:()=>{},
    showAssignments:true,onApprove:()=>{},
  }));
  assert.ok(html.includes('이 날짜에는 차량 운행 없음'));
  assert.ok(html.includes('운행 없음'));
  assert.ok(html.includes('6') || html.includes('8건 배차'));
  assert.ok(html.includes('2026-11-12'));
});
