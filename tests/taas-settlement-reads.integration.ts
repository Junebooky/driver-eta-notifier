import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {buildSettlementSource,calculateSettlement,validateSettlementContract} from '../lib/settlement/serverLedger';

export async function verifyTenantSettlementReads(admin:Client){
 // Reuse existing ledger migration unchanged in the disposable expanded DB.
 await admin.query(readFileSync('supabase/migrations/20261108163000_server_settlement_ledger.sql','utf8'));
 await admin.query(readFileSync('supabase/proposals/taas_settlement_reads.sql','utf8'));
 await admin.query(readFileSync('supabase/proposals/taas_settlement_writes.sql','utf8'));
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
  for(const [id,org] of [[a,vip],[unowned,null]])await admin.query("INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,vehicle_no,customer_name,status,dispatch_status,schedule_meta) VALUES($1,$2,'2027-03-01','09:00','미배정','same customer','draft','draft','{}')",[id,org]);
  const vehicle=randomUUID(),date='2027-03-01',plate='fixture-'+vehicle;
  await admin.query("INSERT INTO cockpit.vehicles(id,organization_id,plate,model,brand,category,category_label) VALUES($1,$2,$3,'fixture van','fixture','van','fixture')",[vehicle,ch,plate]);
  await admin.query('SET LOCAL ROLE service_role');
  const row={id:b,date,pickup_time:'09:00',end_time:'20:00',origin:'A',destination:'B',driver_id:driver,vehicle_id:vehicle,routeWaypoints:[{location:'A',date,lat:37.4,lng:127.1,isPoiConfirmed:true},{location:'B',date,lat:37.5,lng:127.2,isPoiConfirmed:true}]};
  const saved=(await admin.query('SELECT cockpit.commit_tenant_draft_v1($1,$2,$3,$4,$5::jsonb) result',[ch,owner,session,randomUUID(),JSON.stringify([{row}])])).rows[0].result[0];
  // The existing HQ display fields are fixture-supplied; full HQ mapping remains a release gate.
  await admin.query("UPDATE cockpit.schedules SET customer_name='same customer',vehicle_model='fixture van' WHERE id=$1 AND org_id=$2",[b,ch]);
  await admin.query('SELECT cockpit.publish_tenant_dispatch_v1($1,$2,$3,$4,$5::jsonb)',[ch,owner,session,randomUUID(),JSON.stringify([{id:b,expected_updated_at:saved.updated_at}])]);
  const reportCall=async(cmd:unknown)=>(await admin.query('SELECT cockpit.tenant_standard_report_v1($1,$2,$3,$4::jsonb) result',[ch,owner,session,JSON.stringify(cmd)])).rows[0].result;
  const create=async(kind:string,fields:Record<string,unknown>)=>reportCall({kind,op:'create',requestId:randomUUID(),fields:{driverId:driver,bookingId:b,date,...fields}});
  const log=await create('log',{clockIn:'07:00',clockOut:'22:00',customerServiceStart:'09:00',customerServiceEnd:'20:00',startKm:100,endKm:180,submit:true});
  const expense=await create('expense',{time:'10:00',amount:8000,category:'toll',merchant:'fixture',paymentMethod:'company_card',drivingLogId:log.id,submit:true});
  const lookup=async(kind:string,id:string)=>(await reportCall({kind,op:'list'})).records.find((x:{id:string})=>x.id===id);
  const change=async(kind:string,op:string,id:string,fields:Record<string,unknown>)=>reportCall({kind,op,id,revision:(await lookup(kind,id)).revision,requestId:randomUUID(),fields});
  await admin.query('RESET ROLE');
  const h=(await admin.query('SELECT cockpit.settlement_live_source_hash($1,$2) hash',[b,ch])).rows[0].hash;
  const va=(await admin.query('SELECT cockpit.settlement_live_source_hash($1,$2) hash',[a,vip])).rows[0].hash;
  const docs=(await admin.query("INSERT INTO cockpit.settlement_documents(organization_id,schedule_id,source_hash,source_snapshot,created_by,updated_by) VALUES($1,$2,$3,'{}','fixture','fixture'),($4,$5,$6,'{}','fixture','fixture') RETURNING id,organization_id",[vip,a,va,ch,b,h])).rows;
  const own=docs.find(x=>x.organization_id===ch).id,foreign=docs.find(x=>x.organization_id===vip).id;
  await admin.query('SET LOCAL ROLE authenticated');await fails(()=>call(ch,'list',null),'42501');await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>call(ch,'source',a),'42501');await fails(()=>call(ch,'source',unowned),'42501');
  await fails(()=>call(ch,'document',foreign),'42501');await fails(()=>call(ch,'list',null,owner,randomUUID()),'42501');
  const write=(org:string,sid:string,action:string,version:number,hash:string,source:unknown=null,contract:unknown=null,totals:unknown=null)=>admin.query('SELECT * FROM cockpit.commit_tenant_settlement_v1($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)',[org,sid,owner,session,action,version,hash,JSON.stringify(source),JSON.stringify(contract),JSON.stringify(totals)].map((v,i)=>i>=7&&v==='null'?null:v));
  await fails(()=>write(ch,a,'prepare',0,va,{scheduleId:a}),'42501');
  const data=(await call(ch,'source',b)).rows[0].result;
  assert.equal(data.hash,h);assert.equal(data.schedule.org_id,ch);assert.equal(data.expenses.length,1);assert.equal(data.expenses[0].amount,8000);assert.equal(data.logs.length,1);
  const list=(await call(ch,'list',null)).rows[0].result;
  assert.deepEqual(list.documents.map((x:{id:string})=>x.id),[own]);assert.ok(list.schedules.every((x:{org_id:string})=>x.org_id===ch));
  assert.equal((await call(ch,'document',own)).rows[0].result.id,own);
  await admin.query("UPDATE cockpit.expenses SET amount=9000 WHERE booking_id=$1 AND organization_id=$2",[b,ch]);
  assert.notEqual((await call(ch,'source',b)).rows[0].result.hash,h);
  assert.equal((await call(vip,'source',a)).rows[0].result.hash,va);
  await fails(()=>write(ch,b,'prepare',1,h,{scheduleId:b}),'40001');
  await change('log','review',log.id,{status:'승인 완료'});
  await change('expense','review',expense.id,{status:'반려'});
  // Simulated storage attestation in disposable DB; byte verification remains in receipt adapter tests.
  const direct=await create('expense',{time:'11:00',amount:3000,category:'parking',merchant:'fixture direct cost',paymentMethod:'company_card',drivingLogId:log.id,billableToCustomer:false,submit:false});
  const receipt=async(op:string,proof:unknown=null)=>(await admin.query('SELECT cockpit.tenant_receipt_v1($1,$2,$3,$4,$5,$6::jsonb) result',[ch,owner,session,direct.id,op,JSON.stringify(proof)])).rows[0].result;
  const gate=await receipt('prepare'),digest='a'.repeat(64);
  await receipt('attach',{path:ch+'/expenses/receipts/'+driver+'/2027/03/'+digest+'.jpg',sha256:digest,size:100,mime:'image/jpeg',revision:gate.revision});
  await change('expense','update',direct.id,{submit:true});
  await change('expense','review',direct.id,{status:'승인 완료'});
  const actual=(await call(ch,'source',b)).rows[0].result;
  const hash=actual.hash;
  const src=buildSettlementSource(b,actual.schedule,actual.logs,actual.expenses);
  assert.equal(src.serviceVerified,true);assert.equal(src.serviceMinutes,660);
  assert.equal(src.approvedExpenseTotal,3000);assert.deepEqual(src.billableExpenses,[]);assert.equal(src.pendingExpenseCount,0);
  const contract=validateSettlementContract({reference:'FIXTURE-CONTRACT',laborReference:'FIXTURE-LABOR',baseRate:800000,overtimeHourlyRate:60000,driverLaborCost:150000,baseHours:10,roundingMinutes:30,vatMode:'excluded'});
  const totals=calculateSettlement(src,contract);
  assert.equal(totals.overtimeMinutes,60);assert.equal(totals.billableExpenses,0);assert.equal(totals.approvedDirectExpenses,3000);assert.equal(totals.grandTotal,946000);
  const prepared=(await write(ch,b,'prepare',1,hash,src)).rows[0];assert.equal(prepared.version,2);
  await fails(()=>write(ch,b,'price',1,hash,null,contract,totals),'P0001');
  const priced=(await write(ch,b,'price',2,hash,null,contract,totals)).rows[0];assert.equal(priced.status,'reviewing');
  const approved=(await write(ch,b,'approve',3,hash)).rows[0];assert.equal(approved.status,'approved');
  const issued=(await write(ch,b,'issue',4,hash)).rows[0];assert.equal(issued.status,'issued');assert.deepEqual(issued.totals_snapshot,totals);assert.deepEqual(issued.source_snapshot,src);
  await fails(()=>write(ch,b,'prepare',5,hash,src),'P0001');
  const audit=(await admin.query('SELECT organization_id,version,action FROM cockpit.settlement_document_audit WHERE document_id=$1 ORDER BY version',[own])).rows;
  assert.deepEqual(audit.map(x=>x.action),['prepare','price','approve','issue']);assert.ok(audit.every(x=>x.organization_id===ch));
  assert.equal((await call(vip,'document',foreign)).rows[0].result.version,1);
  await admin.query('RESET ROLE');
  await admin.query("UPDATE cockpit.organization_members SET status='revoked' WHERE org_id=$1 AND user_id=$2",[ch,owner]);
  await admin.query('SET LOCAL ROLE service_role');await fails(()=>call(ch,'list',null),'42501');
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual(await snapshot(),before);
 console.log('PASS tenant settlement reads: strict org and session scope, original fingerprint, legacy rows unchanged');
}
