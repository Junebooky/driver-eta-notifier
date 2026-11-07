import test from 'node:test';
import assert from 'node:assert/strict';
import { mapScheduleItemToHqBooking } from './dispatchConflictDetector';
import { supabaseAdmin } from '../lib/supabase/server';
import { atomicUpsertServerDispatchBatch, hydrateRawScheduleRow, mapHydratedRowToScheduleItem } from '../lib/dispatch/scheduleServerStore';

test('a stale mobile assignment cannot overwrite a newer PC assignment',async()=>{
  const original={from:supabaseAdmin.from,rpc:supabaseAdmin.rpc};let writes=0;
  const row={id:'revision-one',date:'2026-12-20',pickup_time:'09:00',end_date:'2026-12-20',end_time:'12:00',vehicle_no:'미배정',origin:'공항',destination:'호텔',dispatch_status:'unassigned',schedule_meta:{version:2,dispatchStatus:'unassigned'},updated_at:'2026-10-31T12:00:00Z'};
  supabaseAdmin.from=((table:string)=>{if(table==='fleet_vehicle_registry'){const registry={select:()=>registry,eq:async()=>({data:[],error:null})};return registry;}const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:row,error:null})};return query;}) as unknown as typeof supabaseAdmin.from;
  supabaseAdmin.rpc=(async(_name:string,args:{p_items:Array<{row:unknown}>})=>{writes++;return {data:args.p_items.map(item=>item.row),error:null};}) as unknown as typeof supabaseAdmin.rpc;
  const input={scheduleId:row.id,expectedVersion:1,date:row.date,pickupTime:'09:00',endDate:row.end_date,endTime:'12:00',origin:'공항',destination:'호텔',dispatchStatus:'unassigned' as const,allowUnverified:true};
  try {
    assert.equal((await atomicUpsertServerDispatchBatch([input])).statusCode,409);assert.equal(writes,0);
    const saved=await atomicUpsertServerDispatchBatch([{...input,expectedVersion:2}]);assert.equal(saved.ok,true,saved.error);assert.equal(writes,1);
    assert.equal((await atomicUpsertServerDispatchBatch([{...input,expectedVersion:0}])).statusCode,400);
  } finally {supabaseAdmin.from=original.from;supabaseAdmin.rpc=original.rpc;}
});

test('stored overnight end date/time survive the schedule API and HQ assignment mapping',()=>{
 const row=hydrateRawScheduleRow({id:'overnight',date:'2026-12-20',pickup_time:'23:00:00',end_date:'2026-12-21',end_time:'03:00:00',origin:'공항',destination:'호텔',dispatch_status:'unassigned',schedule_meta:{version:1,dispatchStatus:'unassigned'}});
 const item=mapHydratedRowToScheduleItem(row),booking=mapScheduleItemToHqBooking(item,0);
 assert.equal(item.end_date,'2026-12-21');assert.equal(item.end_time,'03:00');
 assert.equal(booking.endDate,'2026-12-21');assert.equal(booking.endTime,'03:00');
});
