import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';

export async function verifyTenantDraft(admin:Client){
 const vip='vip_limousine_korea',ch='chauffeur_service';
 // Disposable fixture only: live schedule already has customer_id.
 await admin.query('ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS customer_id text');
 // The real role has CRM grants; this synthetic CRM fixture must have them for the candidate.
 await admin.query('GRANT SELECT,UPDATE ON cockpit.customers TO service_role');
 await admin.query(readFileSync('supabase/proposals/taas_atomic_draft.sql','utf8'));
 const prior=(await admin.query('SELECT id,org_id,to_jsonb(s) AS row FROM cockpit.schedules s ORDER BY id')).rows;
 const user=randomUUID(),session=randomUUID(),d1=randomUUID(),d2=randomUUID(),cust1='c-'+randomUUID(),cust2='c-'+randomUUID();
 const vid=(await admin.query('SELECT id FROM cockpit.vehicles WHERE organization_id=$1 ORDER BY id LIMIT 1',[vip])).rows[0].id;
 const id=randomUUID(),id2=randomUUID();
 const route=[{name:'pickup'},{name:'stop'},{name:'dropoff'}];
 const row={id,date:'2027-02-03',pickup_time:'09:00',end_time:'12:00',origin:'A',destination:'C',routeWaypoints:route,driver_id:d1,vehicle_id:vid,customer_id:cust1,group_id:'fixture-group'};
 const call=(org:string,request:string,items:unknown[],u=user,s=session)=>admin.query('SELECT cockpit.commit_tenant_draft_v1($1,$2,$3,$4,$5::jsonb) result',[org,u,s,request,JSON.stringify(items)]);
 await admin.query('BEGIN');
 try{
  // Failure assertions use savepoints; no live or persistent synthetic activation.
  const fails=async(fn:()=>Promise<unknown>,code:string)=>{
   await admin.query('SAVEPOINT expected_failure');
   try{await assert.rejects(fn(),{code});}finally{await admin.query('ROLLBACK TO SAVEPOINT expected_failure');await admin.query('RELEASE SAVEPOINT expected_failure');}
  };
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>call(vip,'locked',[{row}]),'42501');
  await admin.query('RESET ROLE');
  // Test-only activation, rolled back with all new data below. Never lifted in shipped SQL.
  await admin.query('ALTER TABLE cockpit.organizations DROP CONSTRAINT organizations_p0_runtime_hold; ALTER TABLE cockpit.organization_members DROP CONSTRAINT organization_members_p0_activation_hold');
  await admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id IN ($1,$2)",[vip,ch]);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,user]);
  await admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,status) VALUES($1,$3,'company_admin','active'),($2,$3,'company_admin','active')",[vip,ch,user]);
  await admin.query("INSERT INTO cockpit.drivers(id,vehicle_no,driver_name,org_id,driver_meta) VALUES($1,$3,'same name',$5,'{\"status\":\"active\"}'),($2,$4,'same name',$6,'{\"status\":\"active\"}')",[d1,d2,'fixture-'+d1,'fixture-'+d2,vip,ch]);
  await admin.query('INSERT INTO cockpit.customers(id,org_id) VALUES($1,$3),($2,$4)',[cust1,cust2,vip,ch]);
  await admin.query('SET LOCAL ROLE authenticated');
  await fails(()=>call(vip,'browser',[{row}]),'42501');
  await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>call(vip,'wrong-session',[{row}],user,randomUUID()),'42501');
  await fails(()=>call(ch,'cross-driver',[{row}]),'42501');
  await fails(()=>call(vip,'cross-customer',[{row:{...row,customer_id:cust2}}]),'42501');
  await fails(()=>call(ch,'cross-vehicle',[{row:{...row,driver_id:d2,customer_id:cust2}}]),'42501');
  await fails(()=>call(vip,'forged-status',[{row:{...row,dispatch_status:'published'}}]),'22023');
  await fails(()=>call(vip,'batch-rollback',[{row},{row:{...row,id:id2,driver_id:d2}}]),'42501');
  assert.equal((await admin.query('SELECT id FROM cockpit.schedules WHERE id IN ($1,$2)',[id,id2])).rowCount,0);
  const first=(await call(vip,'save',[{row}])).rows[0].result;
  assert.deepEqual((await call(vip,'save',[{row}])).rows[0].result,first);
  await fails(()=>call(vip,'save',[{row:{...row,destination:'different'}}]),'40001');
  const saved=(await admin.query('SELECT * FROM cockpit.schedules WHERE id=$1',[id])).rows[0];
  assert.equal(saved.org_id,vip);assert.equal(saved.dispatch_status,'draft');
  assert.deepEqual(saved.schedule_meta.routeWaypoints,route);assert.equal(saved.customer_id,cust1);
  await fails(()=>call(ch,'edit-other',[{row:{...row,driver_id:d2,vehicle_id:null,customer_id:cust2},expected_updated_at:first[0].updated_at}]),'42501');
  const next=(await call(vip,'edit',[{row:{...row,destination:'D'},expected_updated_at:first[0].updated_at}])).rows[0].result;
  assert.equal(next[0].id,id);
  await fails(()=>call(vip,'stale',[{row,expected_updated_at:first[0].updated_at}]),'40001');
  // Same request ID in another org is independent; no automatic VIP fallback.
  const other=(await call(ch,'save',[{row:{...row,id:id2,driver_id:d2,vehicle_id:null,customer_id:cust2}}])).rows[0].result;
  assert.equal(other[0].org_id,ch);
  await admin.query('RESET ROLE');
  await admin.query("UPDATE cockpit.organization_members SET status='revoked' WHERE org_id=$1 AND user_id=$2",[vip,user]);
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>call(vip,'save',[{row}]),'42501');
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual((await admin.query('SELECT id,org_id,to_jsonb(s) AS row FROM cockpit.schedules s ORDER BY id')).rows,prior);
 console.log('PASS tenant atomic draft: locks, same-tenant references, multi-day route data, replay, stale update, rollback and revocation; legacy rows unchanged');
}
