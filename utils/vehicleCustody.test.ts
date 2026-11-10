import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, PATCH } from '../app/api/vehicle-custody/route';
import { signCockpitSession } from '../lib/auth/serverAuth';
import { normalizeCustodyWrite, storeCustodyPhoto } from '../lib/fleet/custodyStore';
import { supabaseAdmin } from '../lib/supabase/server';
import { custodyBlocksInterval, custodyOdometerForLog } from './vehicleCustody';
import { checkFleetAvailability } from './availabilityEngine';
import { VIP_REAL_VEHICLES } from './vehicleData';
import { getVerifiedInspectionOdometer } from './drivingLog';
import type { VehicleCustody } from '../types/vehicleCustody';

const driver = 'a0000000-0000-4000-8000-000000000001', booking = 'b0000000-0000-4000-8000-000000000001';
const car = VIP_REAL_VEHICLES[0];
const lease: VehicleCustody = {id:'c0000000-0000-4000-8000-000000000001',organization_id:'vip_limousine_korea',driver_id:driver,driver_name:'기사',booking_id:booking,booking_version:1,vehicle_id:car.uuid,vehicle_plate:car.plate,pickup_odometer:100,pickup_details:{odometer:100,damage:'무',parts:[]},picked_up_at:'2026-11-01T00:00:00Z',expected_return_at:'2026-11-01T03:00:00Z',return_odometer:null,return_details:null,returned_at:null};
const body = {action:'pickup',vehicleId:car.uuid,bookingId:booking,expectedVersion:1,confirmed:true,inspection:{odometer:100,damage:'무',parts:[]}};

test('company custody uses canonical vehicle UUID/full plate and explicit confirmed odometer, never client identity or photo paths', () => {
  const normalized=normalizeCustodyWrite({...body,driverId:'spoof',vehiclePlate:'fake',inspection:{...body.inspection,photoPath:'somebody/else.png'}});
  assert.equal(normalized.vehiclePlate,car.plate);assert.equal(normalized.inspection.photoPath,undefined);
  for (const invalid of [{confirmed:false},{vehicleId:car.plateShort},{expectedVersion:0},{bookingId:'unknown'},{inspection:{odometer:-1}},{inspection:{odometer:NaN}},{inspection:{odometer:2.5}},{inspection:{odometer:100,parts:['x'.repeat(101)]}}]) assert.throws(()=>normalizeCustodyWrite({...body,...invalid}));
  assert.throws(()=>normalizeCustodyWrite({...body,action:'return',custodyId:'unknown'}));
});

test('active custody affects live status and interval allocation; overdue possession holds future slots until return', async () => {
  const now=Date.parse('2026-11-01T01:00:00Z');
  const query={startDate:'2026-11-01',startTime:'10:00',endTime:'11:00'};
  assert.equal(custodyBlocksInterval(lease,query,now),true);
  assert.equal(custodyBlocksInterval(lease,{...query,excludeScheduleId:booking},now),false);
  assert.equal(custodyBlocksInterval(lease,{startDate:'2026-11-02',startTime:'10:00',endTime:'11:00'},now),false);
  assert.equal(custodyBlocksInterval(lease,{startDate:'2026-11-02',startTime:'10:00',endTime:'11:00'},Date.parse('2026-11-01T04:00:00Z')),true);
  const result=await checkFleetAvailability(query,{injectedSchedules:[],injectedDrivers:[{id:driver,driver_name:'기사'}],injectedOperations:[],injectedCustodies:[lease],nowMs:now});
  const held=result.vehicles.find(row=>row.uuid===car.uuid)!;
  assert.equal(held.currentStatus,'in_service');assert.equal(held.isAvailable,false);assert.equal(held.requestedIntervalStatus,'custody_hold');assert.equal(result.drivers[0].isAvailable,false);
  const released=await checkFleetAvailability(query,{injectedSchedules:[],injectedDrivers:[],injectedOperations:[],injectedCustodies:[{...lease,returned_at:'2026-11-01T01:00:00Z'}],nowMs:now});
  assert.equal(released.vehicles.find(row=>row.uuid===car.uuid)?.currentStatus,'available');
});

test('daily log mileage requires the same driver, booking, date and completed return; local inspection cannot verify company mileage', () => {
  const returned={...lease,returned_at:'2026-11-01T02:00:00Z',return_odometer:140};
  assert.equal(custodyOdometerForLog(lease,booking,driver,'2026-11-01'),null);
  assert.equal(custodyOdometerForLog(returned,'other',driver,'2026-11-01'),null);
  assert.equal(custodyOdometerForLog(returned,booking,'other','2026-11-01'),null);
  assert.equal(custodyOdometerForLog({...returned,returned_at:'2026-11-02T00:00:00Z'},booking,driver,'2026-11-01'),null);
  assert.equal(custodyOdometerForLog(returned,booking,driver,'2026-11-01')?.endKm,'140');
  assert.deepEqual(getVerifiedInspectionOdometer('vehicle','2026-11-01',booking,driver),{startKm:'',endKm:'',isVerified:false});
});

test('anonymous/HQ cannot submit driver custody, and a driver cannot resolve HQ alerts', async () => {
  assert.equal((await POST(new NextRequest('http://localhost/api/vehicle-custody',{method:'POST',body:JSON.stringify(body)}))).status,401);
  const request=(role:'driver'|'hq_admin')=>new NextRequest('http://localhost/api/vehicle-custody',{method:'POST',headers:{authorization:'Bearer '+signCockpitSession({userId:driver,driverId:driver,role,org:'vip_limousine_korea'})},body:JSON.stringify(body)});
  assert.equal((await POST(request('hq_admin'))).status,403);assert.equal((await PATCH(request('driver'))).status,403);
});

test('private photo upload is content addressed, verifies a duplicate object and never succeeds on storage failure', async () => {
  const descriptor=Object.getOwnPropertyDescriptor(supabaseAdmin,'storage');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=','base64');
  const data='data:image/png;base64,'+bytes.toString('base64');
  const session={userId:driver,driverId:driver,org:'vip_limousine_korea' as const,role:'driver' as const,issuedAt:1,expiresAt:2};
  let failure=false,existing=false,path='';
  Object.defineProperty(supabaseAdmin,'storage',{configurable:true,value:{from:(bucket:string)=>{assert.equal(bucket,'cockpit-assets');return {upload:async(value:string)=>{path=value;return {error:failure?{statusCode:'500'}:existing?{statusCode:'409'}:null};},download:async()=>({error:null,data:new Blob([bytes])})};}}});
  try {
    assert.match(await storeCustodyPhoto(data,session),new RegExp('^'+session.org+'/custody/'+driver+'/[a-f0-9]{64}\\.png$'));
    existing=true;assert.equal(await storeCustodyPhoto(data,session),path);
    failure=true;await assert.rejects(storeCustodyPhoto(data,session),/저장하지 못/);
    await assert.rejects(storeCustodyPhoto('data:image/png;base64,bm90LXBuZw==',session),/올바른/);
  } finally { if(descriptor)Object.defineProperty(supabaseAdmin,'storage',descriptor); }
});
