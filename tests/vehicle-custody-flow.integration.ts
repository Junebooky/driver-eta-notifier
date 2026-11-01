import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { VIP_REAL_VEHICLES } from '../utils/vehicleData';
import { getKstTodayDateStr, shiftIsoDate } from '../utils/dispatchConflictDetector';
import { fetchVehicleCustody } from '../utils/vehicleCustody';
import { submitDriverLogToHqDb } from '../utils/drivingLogHqStorage';

/** Runs through the shipped API handlers/client reads and real Postgres inside the reporting fixture. */
export async function verifyCustodyFlow(admin:Client, writer:Client, reader:Client, auth:{setActor:(role:'driver'|'hq_admin',id?:string)=>void}) {
  const org='vip_limousine_korea',driver=randomUUID(),other=randomUUID(),booking=randomUUID(),later=randomUUID(),car=VIP_REAL_VEHICLES[4];
  await admin.query('INSERT INTO cockpit.drivers(id,driver_name) VALUES($1,$3),($2,$3)',[driver,other,'인수 동명이인']);
  await admin.query(`INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,end_date,end_time,driver_id,vehicle_id,vehicle_plate,dispatch_status,schedule_meta)
    VALUES($1,$2,((clock_timestamp() AT TIME ZONE 'Asia/Seoul')-interval '1 hour')::date,((clock_timestamp() AT TIME ZONE 'Asia/Seoul')-interval '1 hour')::time,
      ((clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '2 hours')::date,((clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '2 hours')::time,$3,$4,$5,'published','{"version":1}'),
    ($6,$2,((clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '4 hours')::date,((clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '4 hours')::time,
      ((clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '5 hours')::date,((clock_timestamp() AT TIME ZONE 'Asia/Seoul')+interval '5 hours')::time,$7,$4,$5,'published','{"version":1}')`,[booking,org,driver,car.uuid,car.plate,later,other]);
  const write=(body:unknown,key=randomUUID())=>fetch('/api/vehicle-custody',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
  const pickup={action:'pickup',bookingId:booking,expectedVersion:1,vehicleId:car.uuid,confirmed:true,inspection:{odometer:100,damage:'무',parts:[]}};
  let currentDriverAvailable: boolean | undefined;
  const live=async()=>{const today=getKstTodayDateStr();const response=await fetch(`/api/fleet/availability?startDate=${today}&startTime=00:00&endDate=${shiftIsoDate(today,1)}&endTime=23:59`);assert.equal(response.status,200);const result=await response.json();currentDriverAvailable=result.drivers.find((row:{id:string})=>row.id===driver)?.isAvailable;return result.vehicles.find((row:{uuid:string})=>row.uuid===car.uuid);};
  auth.setActor('driver',other);assert.equal((await write(pickup)).status,403);
  auth.setActor('driver',driver);
  assert.equal((await write({...pickup,expectedVersion:2})).status,409);
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
  const mismatch=await (await write({...pickup,vehicleId:VIP_REAL_VEHICLES[5].uuid,reason:'차고지에서 다른 차량 확인',photo})).json();
  assert.equal(mismatch.outcome,'mismatch');
  assert.equal((await reader.query('SELECT vehicle_id FROM cockpit.schedules WHERE id=$1',[booking])).rows[0].vehicle_id,car.uuid);
  assert.equal(Number((await reader.query('SELECT count(*) FROM cockpit.vehicle_custodies WHERE booking_id=$1',[booking])).rows[0].count),0);
  auth.setActor('hq_admin');const alert=await fetchVehicleCustody();assert.equal(alert.mismatches.some(row=>row.request_id===mismatch.requestId),true);
  auth.setActor('driver',other);assert.equal((await fetch('/api/vehicle-custody/photo?requestId='+mismatch.requestId)).status,403);
  auth.setActor('driver',driver);assert.equal((await fetch('/api/vehicle-custody/photo?requestId='+mismatch.requestId)).status,200);
  const key=randomUUID();const simultaneous=await Promise.all([write({...pickup,photo},key),write({...pickup,photo},key)]);
  assert.deepEqual(simultaneous.map(row=>row.status),[200,200]);const saved=await simultaneous[0].json();assert.equal(saved.outcome,'picked_up');
  assert.equal(Number((await reader.query('SELECT count(*) FROM cockpit.vehicle_custodies WHERE booking_id=$1',[booking])).rows[0].count),1);
  assert.equal((await fetchVehicleCustody()).mismatches.length,0,'matching verified pickup resolves the driver mismatch');
  assert.equal((await write({...pickup,inspection:{...pickup.inspection,odometer:101}},key)).status,409,'frozen request key cannot change the confirmed mileage');
  assert.equal((await write(pickup)).status,409,'a second device with a different key cannot create another possession');
  auth.setActor('driver',other);assert.equal((await write({...pickup,bookingId:later})).status,409,'a future driver cannot claim a still-held vehicle');
  assert.equal((await fetchVehicleCustody()).custodies.length,0,'same-name drivers cannot see each other custody');
  auth.setActor('hq_admin');assert.equal((await live()).custody.id,saved.custody.id);
  assert.equal((await live()).currentStatus,'in_service');assert.equal((await live()).isAvailable,false);assert.equal(currentDriverAvailable,false,'a driver without a fixed vehicle_no stays in the roster and is held by their custody');
  await assert.rejects(writer.query('UPDATE cockpit.schedules SET driver_id=$2 WHERE id=$1',[booking,other]),{code:'23P01'});
  await admin.query("UPDATE cockpit.schedules SET dispatch_status='cancelled',status='cancelled' WHERE id=$1",[booking]);
  assert.equal((await live()).currentStatus,'in_service','cancelling a booking does not return a physical car');
  auth.setActor('driver',driver);
  const returning={action:'return',custodyId:saved.custody.id,vehicleId:car.uuid,confirmed:true,inspection:{odometer:140,damage:'무',parts:[],parkingLocation:'테스트 차고지 A',keyLocation:'테스트 키함'}};
  assert.equal((await write({...returning,inspection:{...returning.inspection,odometer:99}})).status,400);
  const returnKey=randomUUID();const returnedResponse=await write(returning,returnKey);assert.equal(returnedResponse.status,200);const returned=await returnedResponse.json();assert.equal(returned.outcome,'returned');
  assert.equal((await write(returning,returnKey)).status,200);assert.equal((await write(returning)).status,409);
  assert.equal((await fetchVehicleCustody()).custodies.find(row=>row.id===saved.custody.id)?.return_odometer,140);
  auth.setActor('hq_admin');assert.equal((await live()).currentStatus,'available','physical return releases current in-use state');
  await admin.query("UPDATE cockpit.schedules SET dispatch_status='published',status='scheduled' WHERE id=$1",[booking]);
  auth.setActor('driver',driver);
  const log={id:randomUUID(),bookingId:booking,driverId:driver,vehicleId:car.uuid,vehiclePlate:car.plate,drivingDate:getKstTodayDateStr(),startKm:'100',endKm:'140',status:'draft' as const,custodyId:saved.custody.id};
  const submitted=await submitDriverLogToHqDb(log);assert.equal(submitted.ok,true,submitted.error);
  assert.equal((await reader.query('SELECT meta FROM cockpit.driving_logs WHERE id=$1',[submitted.log!.id])).rows[0].meta.custodyId,saved.custody.id);
  assert.equal((await submitDriverLogToHqDb({...log,startKm:'101'})).ok,false,'linked mileage cannot differ from its custody original');
  await admin.query('SET ROLE authenticated');await assert.rejects(admin.query('SELECT * FROM cockpit.vehicle_custodies'),{code:'42501'});
  await assert.rejects(admin.query("SELECT cockpit.commit_vehicle_custody($1,$2,$3,$4,$5)",[org,driver,driver,randomUUID(),pickup]),{code:'42501'});await admin.query('RESET ROLE');
  console.log('PASS custody flow: real API/Postgres mismatch → HQ alert/private photo → concurrent idempotent pickup → fleet hold → other-driver denial → cancellation-safe return → fleet release → source-verified driving log; direct client table/RPC denied');
}
