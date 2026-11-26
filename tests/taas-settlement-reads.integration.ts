import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';

export async function verifyTenantSettlementReads(admin:Client){
 // Reuse existing ledger migration unchanged in the disposable expanded DB.
 await admin.query(readFileSync('supabase/migrations/20261108163000_server_settlement_ledger.sql','utf8'));
 await admin.query(readFileSync('supabase/proposals/taas_settlement_reads.sql','utf8'));
 const snapshot=async()=>{const out=[];for(const t of ['schedules','driving_logs','expenses','settlement_documents','settlement_document_audit','report_messages'])out.push((await admin.query('SELECT to_jsonb(t) AS row FROM cockpit.'+t+' t ORDER BY id')).rows);return out;};
 const before=await snapshot();
 const vip='vip_limousine_korea',ch='chauffeur_service',owner=randomUUID(),session=randomUUID(),driver=randomUUID(),a=randomUUID(),b=randomUUID(),unowned=randomUUID();
 const call=(org:string,op:string,id:string|null,u=owner,s=session)=>admin.query('SELECT cockpit.tenant_settlement_read_v1($1,$2,$3,$4,$5) result',[org,u,s,op,id]);
 await admin.query('BEGIN');
 try{
  const fails=async(fn:()=>Promise<unknown>,code:string)=>{await admin.query('SAVEPOINT failure');try{await assert.rejects(fn(),{code});}finally{await admin.query('ROLLBACK TO SAVEPOINT failure');await admin.query('RELEASE SAVEPOINT failure');}};
  await admin.query('SET LOCAL ROLE service_role');await fails(()=>call(ch,'list',null),'42501');await admin.query('RESET ROLE');
  // Minimal historical fixture is not the live schema; add only missing
  // projection columns in this rolled-back transaction.
  await admin.query('ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS customer_name text, ADD COLUMN IF NOT EXISTS event_name text, ADD COLUMN IF NOT EXISTS vehicle_model text, ADD COLUMN IF NOT EXISTS customer_id text');
  await admin.query('ALTER TABLE cockpit.organizations DROP CONSTRAINT organizations_p0_runtime_hold; ALTER TABLE cockpit.organization_members DROP CONSTRAINT organization_members_p0_activation_hold');
  await admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id IN ($1,$2)",[vip,ch]);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,owner]);
  await admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,status) VALUES($1,$3,'company_admin','active'),($2,$3,'company_admin','active')",[vip,ch,owner]);
  await admin.query("INSERT INTO cockpit.drivers(id,vehicle_no,driver_name,org_id,driver_meta) VALUES($1,$2,'fixture',$3,'{\"status\":\"active\"}')",[driver,'fixture-'+driver,ch]);
  for(const [id,org] of [[a,vip],[b,ch],[unowned,null]])await admin.query("INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,vehicle_no,customer_name,status,dispatch_status,schedule_meta) VALUES($1,$2,'2027-03-01','09:00','미배정','same customer','draft','draft','{}')",[id,org]);
  await admin.query('UPDATE cockpit.schedules SET driver_id=$1 WHERE id=$2',[driver,b]);
  // Test read scope and fingerprint, not approval; no fabricated live data.
  await admin.query("INSERT INTO cockpit.driving_logs(organization_id,booking_id,driver_id,driver_name,driving_date,status,customer_service_start,customer_service_end) VALUES($1,$2,$3,'fixture','2027-03-01','검토 대기','09:00','20:00')",[ch,b,driver]);
  await admin.query("INSERT INTO cockpit.expenses(organization_id,booking_id,driver_id,driver_name,expense_date,expense_time,category,amount,merchant,status) VALUES($1,$2,$3,'fixture','2027-03-01','10:00','toll',8000,'fixture','검수 대기')",[ch,b,driver]);
  const h=(await admin.query('SELECT cockpit.settlement_live_source_hash($1,$2) hash',[b,ch])).rows[0].hash;
  const va=(await admin.query('SELECT cockpit.settlement_live_source_hash($1,$2) hash',[a,vip])).rows[0].hash;
  const docs=(await admin.query("INSERT INTO cockpit.settlement_documents(organization_id,schedule_id,source_hash,source_snapshot,created_by,updated_by) VALUES($1,$2,$3,'{}','fixture','fixture'),($4,$5,$6,'{}','fixture','fixture') RETURNING id,organization_id",[vip,a,va,ch,b,h])).rows;
  const own=docs.find(x=>x.organization_id===ch).id,foreign=docs.find(x=>x.organization_id===vip).id;
  await admin.query('SET LOCAL ROLE authenticated');await fails(()=>call(ch,'list',null),'42501');await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>call(ch,'source',a),'42501');await fails(()=>call(ch,'source',unowned),'42501');
  await fails(()=>call(ch,'document',foreign),'42501');await fails(()=>call(ch,'list',null,owner,randomUUID()),'42501');
  const data=(await call(ch,'source',b)).rows[0].result;
  assert.equal(data.hash,h);assert.equal(data.schedule.org_id,ch);assert.equal(data.expenses.length,1);assert.equal(data.expenses[0].amount,8000);assert.equal(data.logs.length,1);
  const list=(await call(ch,'list',null)).rows[0].result;
  assert.deepEqual(list.documents.map((x:{id:string})=>x.id),[own]);assert.ok(list.schedules.every((x:{org_id:string})=>x.org_id===ch));
  assert.equal((await call(ch,'document',own)).rows[0].result.id,own);
  await admin.query("UPDATE cockpit.expenses SET amount=9000 WHERE booking_id=$1 AND organization_id=$2",[b,ch]);
  assert.notEqual((await call(ch,'source',b)).rows[0].result.hash,h);
  assert.equal((await call(vip,'source',a)).rows[0].result.hash,va);
  await admin.query('RESET ROLE');
  await admin.query("UPDATE cockpit.organization_members SET status='revoked' WHERE org_id=$1 AND user_id=$2",[ch,owner]);
  await admin.query('SET LOCAL ROLE service_role');await fails(()=>call(ch,'list',null),'42501');
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual(await snapshot(),before);
 console.log('PASS tenant settlement reads: strict org and session scope, original fingerprint, legacy rows unchanged');
}
