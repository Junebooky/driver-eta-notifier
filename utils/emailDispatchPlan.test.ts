import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEmailDispatchPlan,emailDispatchDays} from './emailDispatchPlan';
import {createEmptyDraft} from '../services/emailBookingGeminiService';
import {atomicUpsertServerDispatchBatch} from '../lib/dispatch/scheduleServerStore';
import {supabaseAdmin} from '../lib/supabase/server';
import {VIP_REAL_VEHICLES} from './vehicleData';
const draft=()=>({...createEmptyDraft({emailId:'message-one',subject:'일정',sender:'fixture@example.invalid',bodyText:''}),companyName:'테스트 고객',passengerName:'테스트 승객',pickupDate:'2026-12-10',pickupTime:'09:00',pickupLocation:'공항',dropoffLocation:'호텔',waypoints:['2026-12-10','2026-12-11'].flatMap((date,day)=>['공항','행사장','호텔'].map((location,index)=>({id:`${day}-${index}`,order:day*3+index,date,time:['09:00','12:00','18:00'][index],location,lat:37.4,lng:126.5,isPoiConfirmed:true})))});
const slots=()=>VIP_REAL_VEHICLES.slice(0,2).map((car,index)=>({vehicleModel:car.model,vehiclePlate:car.plate,driver:{id:`a0000000-0000-4000-8000-00000000000${index+1}`,name:`기사 ${index+1}`}}));
test('existing extracted stops become independent daily rows for every selected vehicle, without inter-day phantom routes',()=>{
 const resumed=buildEmailDispatchPlan({...draft(),savedScheduleIds:{'2026-12-10:0':'existing-one'}},slots(),'published');assert.equal(resumed[0].scheduleId,'existing-one');
 const days=emailDispatchDays(draft());assert.equal(days.length,2);assert.equal(days[0].points.length,3);
 const plan=buildEmailDispatchPlan(draft(),slots(),'published');assert.equal(plan.length,4);assert.deepEqual(plan.map(row=>row.date),['2026-12-10','2026-12-10','2026-12-11','2026-12-11']);assert.ok(plan.every(row=>row.origin==='공항'&&row.destination==='호텔'&&row.endTime==='18:00'&&row.routeWaypoints.length===3));
});
test('missing end/POI/assignment fails; an unassigned mobile request retains every day without inventing an assignment',()=>{
 const missing=draft();missing.waypoints[2].time='';assert.throws(()=>buildEmailDispatchPlan(missing,slots(),'published'),/종료/);
 missing.waypoints[2].isPoiConfirmed=false;assert.equal(buildEmailDispatchPlan(missing,slots().map(s=>({...s,driver:null,vehiclePlate:undefined})),'unassigned').length,4);
 const plan=buildEmailDispatchPlan(missing,slots(),'unassigned');assert.ok(plan.every(row=>!row.driverId&&!row.vehiclePlate));
 assert.throws(()=>buildEmailDispatchPlan(draft(),slots().map(s=>({...s,vehiclePlate:undefined})),'published'),/번호판/);
 const unknown=draft();unknown.waypoints[0].date='12/10';assert.throws(()=>emailDispatchDays(unknown),/추정/);
});
test('existing atomic save preserves the full route for the driver app and uses existing IDs on continuation',async()=>{
 const original=supabaseAdmin.rpc;let calls=0;
 supabaseAdmin.rpc=(async(name:string,args:{p_items:Array<{row:Record<string,unknown>}>})=>{calls++;assert.equal(name,'commit_dispatch_batch');assert.equal(args.p_items.length,4);assert.ok(args.p_items.every(i=>(i.row.schedule_meta as {routeWaypoints:unknown[]}).routeWaypoints.length===3));return {data:args.p_items.map(i=>i.row),error:null};}) as unknown as typeof original;
 try{const result=await atomicUpsertServerDispatchBatch(buildEmailDispatchPlan(draft(),slots(),'published'));assert.equal(result.ok,true,result.error);assert.equal(calls,1);assert.equal(result.schedules?.[0].adminWaypoints?.[0].name,'행사장');}finally{supabaseAdmin.rpc=original;}
});
import {acknowledgeServerSchedule} from '../lib/dispatch/scheduleServerStore';
import {POST as ackRoute} from '../app/api/schedules/ack/route';
import {NextRequest} from 'next/server';
import {signCockpitSession} from '../lib/auth/serverAuth';
test('HQ cannot impersonate a driver acknowledgment; same-name other UUID is rejected',async()=>{
 const token=signCockpitSession({userId:'hq',org:'vip_limousine_korea',role:'hq_admin'});
 assert.equal((await ackRoute(new NextRequest('http://localhost/api/schedules/ack',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({scheduleId:'one',driverId:'assigned'})}))).status,403);
 const original=supabaseAdmin.from;let writes=0;
 const row={id:'one',driver_id:'assigned',driver_name:'같은 이름',date:'2026-12-10',pickup_time:'09:00',dispatch_status:'published',schedule_meta:{version:1,driverId:'assigned',driverName:'같은 이름',dispatchStatus:'published'}};
 supabaseAdmin.from=(()=>{let patch={};const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row,error:null}),update:(value:object)=>{writes++;patch=value;return q;},single:async()=>({data:{...row,...patch},error:null})};return q;}) as unknown as typeof original;
 try{assert.equal((await acknowledgeServerSchedule({scheduleId:'one',driverId:'other',driverName:'같은 이름',version:1})).statusCode,403);assert.equal(writes,0);assert.equal((await acknowledgeServerSchedule({scheduleId:'one',driverId:'assigned',driverName:'변경된 성함',version:1})).error,undefined);assert.equal(writes,1);}finally{supabaseAdmin.from=original;}
});
