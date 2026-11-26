import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';

export async function verifyTenantPublish(admin:Client){
 const vip='vip_limousine_korea',ch='chauffeur_service';
 // Mirror existing live columns absent from the minimal historical CI fixture.
 await admin.query('ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS version integer DEFAULT 1, ADD COLUMN IF NOT EXISTS published_at timestamptz, ADD COLUMN IF NOT EXISTS published_by text');
 const before=(await admin.query('SELECT to_jsonb(s) AS row FROM cockpit.schedules s ORDER BY id')).rows;
 const oldGuard=(await admin.query("SELECT pg_get_functiondef('cockpit.guard_dispatch_schedule()'::regprocedure) def")).rows[0].def;
 await admin.query(readFileSync('supabase/proposals/taas_dispatch_publication.sql','utf8'));
 assert.equal((await admin.query("SELECT pg_get_functiondef('cockpit.guard_dispatch_schedule()'::regprocedure) def")).rows[0].def,oldGuard);
 const user=randomUUID(),session=randomUUID(),driver=randomUUID(),vehicle=randomUUID(),otherDriver=randomUUID(),supplier=randomUUID(),foreignSupplier=randomUUID();
 const route=(date:string)=>[{location:'A',date,lat:37.4,lng:127.1,isPoiConfirmed:true},{location:'B',date,lat:37.5,lng:127.2,isPoiConfirmed:true},{location:'C',date,lat:37.6,lng:127.3,isPoiConfirmed:true}];
 const date='2027-04-10';
 const draft=(id=randomUUID(),start='09:00',end='12:00',extra:Record<string,unknown>={})=>({id,date,pickup_time:start,end_time:end,origin:'A',destination:'C',routeWaypoints:route(date),driver_id:driver,vehicle_id:vehicle,...extra});
 const save=async(row:Record<string,unknown>)=>(await admin.query('SELECT cockpit.commit_tenant_draft_v1($1,$2,$3,$4,$5::jsonb) result',[ch,user,session,randomUUID(),JSON.stringify([{row}])])).rows[0].result[0];
 const publish=(items:unknown[],key=randomUUID(),org=ch)=>admin.query('SELECT cockpit.publish_tenant_dispatch_v1($1,$2,$3,$4,$5::jsonb) result',[org,user,session,key,JSON.stringify(items)]);
 const ref=(x:{id:string,updated_at:string})=>({id:x.id,expected_updated_at:x.updated_at});
 await admin.query('BEGIN');
 try{
  const fails=async(fn:()=>Promise<unknown>,code:string)=>{
   await admin.query('SAVEPOINT expected_failure');
   try{await assert.rejects(fn(),{code});}finally{await admin.query('ROLLBACK TO SAVEPOINT expected_failure');await admin.query('RELEASE SAVEPOINT expected_failure');}
  };
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>publish([{id:randomUUID(),expected_updated_at:new Date().toISOString()}]),'42501');
  await admin.query('RESET ROLE');
  // Only the isolated fixture temporarily lifts runtime holds.
  await admin.query('ALTER TABLE cockpit.organizations DROP CONSTRAINT organizations_p0_runtime_hold; ALTER TABLE cockpit.organization_members DROP CONSTRAINT organization_members_p0_activation_hold');
  await admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id IN ($1,$2)",[vip,ch]);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,user]);
  await admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,status) VALUES($1,$3,'company_admin','active'),($2,$3,'company_admin','active')",[vip,ch,user]);
  await admin.query("INSERT INTO cockpit.drivers(id,vehicle_no,driver_name,org_id,driver_meta,english_available) VALUES($1,$3,'same name',$5,'{\"status\":\"active\"}',true),($2,$4,'same name',$6,'{\"status\":\"active\"}',true)",[driver,otherDriver,'fixture-'+driver,'fixture-'+otherDriver,ch,vip]);
  await admin.query("INSERT INTO cockpit.vehicles(id,organization_id,plate,model,brand,category,category_label) VALUES($1,$2,$3,'fixture van','fixture','van','fixture')",[vehicle,ch,'fixture-'+vehicle]);
  await admin.query('INSERT INTO cockpit.organization_vehicle_suppliers(org_id,id,display_name) VALUES($1,$3,\'supplier\'),($2,$4,\'other supplier\')',[ch,vip,supplier,foreignSupplier]);
  await fails(()=>admin.query("INSERT INTO cockpit.organization_vehicle_supply(org_id,vehicle_id,supplier_id,supply_kind) VALUES($1,$2,$3,'supplier')",[ch,vehicle,foreignSupplier]),'23503');
  await admin.query("INSERT INTO cockpit.organization_vehicle_supply(org_id,vehicle_id,supplier_id,supply_kind,valid_from,valid_until) VALUES($1,$2,$3,'temporary','2027-04-10 00:00+09','2027-04-11 00:00+09')",[ch,vehicle,supplier]);
  await admin.query('SET LOCAL ROLE authenticated');
  await fails(()=>publish([{id:randomUUID(),expected_updated_at:new Date().toISOString()}]),'42501');
  await fails(()=>admin.query('SELECT * FROM cockpit.organization_vehicle_suppliers'),'42501');
  await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE service_role');
  const a=await save(draft()),b=await save(draft(randomUUID(),'12:30','14:00')),c=await save(draft(randomUUID(),'13:00','14:00'));
  await fails(()=>publish([ref(a),ref(b)]),'23P01');
  assert.equal((await admin.query('SELECT count(*)::int n FROM cockpit.schedules WHERE id IN ($1,$2) AND dispatch_status=\'published\'',[a.id,b.id])).rows[0].n,0);
  await fails(()=>publish([ref(a)],randomUUID(),vip),'42501');
  await fails(()=>publish([{...ref(a),expected_updated_at:'2000-01-01T00:00:00Z'}]),'40001');
  const key=randomUUID();const first=(await publish([ref(a)],key)).rows[0].result;
  assert.deepEqual((await publish([ref(a)],key)).rows[0].result,first);
  await fails(()=>publish([ref(b)],key),'40001');
  await fails(()=>publish([ref(b)]),'23P01');
  assert.equal((await publish([ref(c)])).rows[0].result[0].dispatch_status,'published');
  const saved=(await admin.query('SELECT schedule_meta,org_id,version,last_ack_version,last_ack_at,published_at,published_by FROM cockpit.schedules WHERE id=$1',[a.id])).rows[0];
  assert.deepEqual(saved.schedule_meta.routeWaypoints,route(date));assert.equal(saved.org_id,ch);assert.equal(saved.version,2);assert.equal(saved.last_ack_version,0);assert.equal(saved.last_ack_at,null);assert.ok(saved.published_at);assert.equal(saved.published_by,user);assert.equal(saved.schedule_meta.version,saved.version);
  await fails(()=>admin.query('UPDATE cockpit.schedules SET org_id=$1 WHERE id=$2',[vip,a.id]),'42501');
  const bad=await save(draft(randomUUID(),'16:00','17:00',{routeWaypoints:[{location:'unverified'}]}));
  await fails(()=>publish([ref(bad)]),'23514');
  const late=await save(draft(randomUUID(),'23:30','23:59'));
  await fails(()=>publish([ref(late)]),'23P01');
  const free=await save(draft(randomUUID(),'17:00','18:00'));
  await admin.query('UPDATE cockpit.organization_vehicle_suppliers SET active=false WHERE org_id=$1 AND id=$2',[ch,supplier]);
  await fails(()=>publish([ref(free)]),'23P01');
  await admin.query('UPDATE cockpit.organization_vehicle_suppliers SET active=true WHERE org_id=$1 AND id=$2',[ch,supplier]);
  await admin.query("UPDATE cockpit.vehicles SET status='maintenance' WHERE id=$1",[vehicle]);
  await fails(()=>publish([ref(free)]),'23P01');
  await admin.query("UPDATE cockpit.vehicles SET status='available' WHERE id=$1",[vehicle]);
  await admin.query("UPDATE cockpit.drivers SET unavailable_windows='[{\"start_at\":\"2027-04-10T16:00:00+09:00\",\"end_at\":\"2027-04-10T19:00:00+09:00\"}]' WHERE id=$1",[driver]);
  await fails(()=>publish([ref(free)]),'23P01');
  await admin.query("UPDATE cockpit.drivers SET unavailable_windows='[]' WHERE id=$1",[driver]);
  const english=await save(draft(randomUUID(),'19:00','20:00',{requestedLanguage:'en'}));
  await admin.query('UPDATE cockpit.drivers SET english_available=false WHERE id=$1',[driver]);
  await fails(()=>publish([ref(english)]),'23514');
  await admin.query('UPDATE cockpit.drivers SET english_available=true WHERE id=$1',[driver]);
  assert.equal((await publish([ref(english)])).rows[0].result[0].dispatch_status,'published');
  await admin.query('RESET ROLE');
  await admin.query("UPDATE cockpit.organization_members SET status='revoked' WHERE org_id=$1 AND user_id=$2",[ch,user]);
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>publish([ref(free)]),'42501');
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual((await admin.query('SELECT to_jsonb(s) AS row FROM cockpit.schedules s ORDER BY id')).rows,before);
 console.log('PASS scoped publication: supplier links, physical identity, verified route, same-batch rollback, interval buffer, maintenance, leave and legacy rows retained');
}
