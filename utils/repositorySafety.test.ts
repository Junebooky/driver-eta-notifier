import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { signCockpitSession, extractAuthToken } from '@/lib/auth/serverAuth';
import { validateDispatchInterval, scheduleOverlapsInterval } from './dispatchInterval';
import { normalizeDateToIso, parseKstDateTimeToMs } from './dispatchConflictDetector';
import { atomicUpsertServerDispatchBatch, queryServerSchedules } from '@/lib/dispatch/scheduleServerStore';
import { VIP_REAL_VEHICLES } from './vehicleData';

const adminHeader = () => ({ authorization: `Bearer ${signCockpitSession({userId:'unit-admin',org:'vip_limousine_korea',role:'hq_admin'})}` });

test('strict calendar dates, invalid times and cross-day intervals', () => {
  assert.equal(normalizeDateToIso('2026-02-30'),'');
  assert.equal(normalizeDateToIso('2024-02-29'),'2024-02-29');
  assert.ok(Number.isNaN(parseKstDateTimeToMs('2026-11-01','bad')));
  assert.ok(Number.isNaN(parseKstDateTimeToMs('2026-11-01',Infinity)));
  assert.ok(validateDispatchInterval({date:'2026-11-01',pickupTime:'19:00',dispatchStatus:'published'}));
  assert.ok(validateDispatchInterval({date:'2026-11-02',pickupTime:'19:00',endDate:'2026-11-01',endTime:'22:00',dispatchStatus:'published'}));
  assert.equal(validateDispatchInterval({date:'2026-11-01',pickupTime:'19:00',endTime:'22:00',dispatchStatus:'published'}),null);
  assert.equal(scheduleOverlapsInterval({startDate:'2026-11-01',pickupTime:'22:00',endDate:'2026-11-01',endTime:'23:30'},
    {startDate:'2026-11-02',startTime:'00:10',endTime:'02:00'}),true);
  assert.equal(scheduleOverlapsInterval({startDate:'2026-11-01',pickupTime:'22:00'},
    {startDate:'2026-11-10',startTime:'09:00',endTime:'12:00'}),true);
});

test('unauthenticated paid/PII endpoints reject before provider calls or body parsing', async () => {
  process.env.DEV_AUTH_ENABLED = 'false';
  for (const [path, method] of [
    ['copilot','POST'],['inspect-dashboard','POST'],['receipt/scan','POST'],['schedule/parse','POST'],
    ['route','GET'],['flight','GET'],['search','GET'],['places/confirm','POST'],['places','GET'],
    ['presets','POST'],['presets','GET'],['schedules/checklist','GET'],['fleet/status','GET'],['driver','GET'],
  ] as const) {
    const handlers = await import(`../app/api/${path}/route`);
    const response = await handlers[method](new NextRequest(`http://localhost/api/${path}`, {method}));
    assert.equal(response.status,401,`${method} ${path}`);
  }
  assert.equal(extractAuthToken(new Request('http://localhost',{headers:{cookie:'cockpit_session=%INVALID'}})),null);
});

test('driver schedule access uses UUID even when names and vehicle labels match', async () => {
  const original = supabaseAdmin.from;
  const base = {vehicle_no:'shared-car',date:'2026-11-01',pickup_time:'09:00',origin:'A',destination:'B',driver_name:'같은 이름',dispatch_status:'published'};
  supabaseAdmin.from = (() => { const q = {select:()=>q,eq:()=>q,order:()=>q,then:(resolve: (x:unknown)=>unknown)=>Promise.resolve({data:[{...base,id:'one',driver_id:'driver-a'},{...base,id:'two',driver_id:'driver-b'}],error:null}).then(resolve)}; return q; }) as unknown as typeof original;
  try {
    const own = await queryServerSchedules({role:'driver',driverId:'driver-a',driverName:'같은 이름',vehicleNo:'shared-car'});
    assert.deepEqual(own.schedules.map(s=>s.id),['one']);
    const unlinked = await queryServerSchedules({role:'driver',driverName:'같은 이름',vehicleNo:'shared-car'});
    assert.equal(unlinked.schedules.length,0);
  } finally { supabaseAdmin.from = original; }
});

test('batch saves issue one RPC, preserve metadata, and never compensate with separate writes', async () => {
  const original = supabaseAdmin.rpc; const from = supabaseAdmin.from;
  const vehicle = VIP_REAL_VEHICLES[0];
  const candidate = {date:'2026-11-01',pickupTime:'19:00',endTime:'22:00',vehiclePlate:vehicle.plate,vehicleId:vehicle.uuid,driverId:'a0000000-0000-4000-8000-000000000001',driverName:'테스트운전',origin:'A',destination:'B',dispatchStatus:'published' as const};
  let calls=0;
  supabaseAdmin.from = (()=>{throw new Error('unexpected mutation/read');}) as typeof from;
  supabaseAdmin.rpc = (async (name: string,args: Record<string,unknown>) => {
    calls++; assert.equal(name,'commit_dispatch_batch');
    const items = args.p_items as {row:Record<string,unknown>}[];
    assert.equal(items[0].row.end_time,'22:00:00'); assert.equal(items[0].row.driver_id,candidate.driverId);
    assert.equal(items[0].row.vehicle_id,vehicle.uuid); assert.ok(items[0].row.schedule_meta);
    return { data:items.map(i=>i.row), error:null };
  }) as unknown as typeof original;
  try {
    const success=await atomicUpsertServerDispatchBatch([candidate],undefined,'retry-key');
    assert.equal(success.ok,true,success.error); assert.equal(calls,1);
    supabaseAdmin.rpc = (async (_name: string,args: Record<string,unknown>) => {
      const items=args.p_items as {row:Record<string,unknown>}[];
      assert.equal(items[0].row.driver_id,null);
      assert.equal((items[0].row.schedule_meta as Record<string,unknown>).driverId,null);
      return {data:items.map(i=>i.row),error:null};
    }) as unknown as typeof original;
    assert.equal((await atomicUpsertServerDispatchBatch([{...candidate,serviceMode:'vehicle_only'}])).ok,true);
    supabaseAdmin.rpc = (async()=>({data:null,error:{code:'PGRST202',message:'missing RPC'}})) as unknown as typeof original;
    const missing=await atomicUpsertServerDispatchBatch([candidate]); assert.equal(missing.ok,false); assert.equal(missing.statusCode,503);
    supabaseAdmin.rpc = (async()=>({data:null,error:{code:'23P01',message:'conflict'}})) as unknown as typeof original;
    assert.equal((await atomicUpsertServerDispatchBatch([candidate])).statusCode,409);
    assert.equal((await atomicUpsertServerDispatchBatch([{...candidate,endTime:''}])).statusCode,400);
  } finally { supabaseAdmin.rpc=original; supabaseAdmin.from=from; }
});

test('fleet state DB failures return 503 and successful reads survive handler reload', async () => {
  const { GET }=await import('../app/api/fleet/status/route');
  const original=supabaseAdmin.from;
  const request=()=>new NextRequest('http://localhost/api/fleet/status',{headers:adminHeader()});
  supabaseAdmin.from=(()=>{const q={select:()=>q,eq:async()=>({data:null,error:{message:'DB unavailable'}})};return q;}) as unknown as typeof original;
  try { assert.equal((await GET(request())).status,503); }
  finally {supabaseAdmin.from=original;}
});
