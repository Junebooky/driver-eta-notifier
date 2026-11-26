import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';

export async function verifyTenantRegistry(admin:Client){
 const vip='vip_limousine_korea',ch='chauffeur_service';
 const snapshot=async()=>{
  const result=[];
  for(const table of ['drivers','customers','vehicles','schedules','report_messages']){
   const r=await admin.query('SELECT to_jsonb(t) AS row FROM cockpit.'+table+' t ORDER BY id');
   result.push(r.rows);
  }
  return result;
 };
 const before=await snapshot();
 await admin.query(readFileSync('supabase/proposals/taas_tenant_registry.sql','utf8'));
 const user=randomUUID(),session=randomUUID(),otherUser=randomUUID();
 const call=(org:string,cmd:Record<string,unknown>,u=user,s=session)=>admin.query('SELECT cockpit.tenant_registry_v1($1,$2,$3,$4::jsonb) result',[org,u,s,JSON.stringify(cmd)]);
 const create=(kind:string,fields:Record<string,unknown>,requestId=randomUUID())=>({op:'create',kind,requestId,fields});
 const list=async(org:string,kind:string,extra={})=>(await call(org,{op:'list',kind,...extra})).rows[0].result;
 const update=(kind:string,r:{id:string;revision:string},fields:Record<string,unknown>)=>({kind,op:'update',id:r.id,revision:r.revision,requestId:randomUUID(),fields});
 await admin.query('BEGIN');
 try{
  const fails=async(fn:()=>Promise<unknown>,code:string)=>{
   await admin.query('SAVEPOINT expected_failure');
   try{await assert.rejects(fn(),{code});}finally{await admin.query('ROLLBACK TO SAVEPOINT expected_failure');await admin.query('RELEASE SAVEPOINT expected_failure');}
  };
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>list(vip,'driver'),'42501');
  await admin.query('RESET ROLE');
  // Mirror columns and permissions of the real schema inside the rolled-back fixture only.
  await admin.query("ALTER TABLE cockpit.drivers ADD COLUMN IF NOT EXISTS car_number text, ADD COLUMN IF NOT EXISTS vehicle_model text, ADD COLUMN IF NOT EXISTS vehicle_status text; ALTER TABLE cockpit.customers ADD COLUMN IF NOT EXISTS name text, ADD COLUMN IF NOT EXISTS contact_person text, ADD COLUMN IF NOT EXISTS phone text, ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS address text, ADD COLUMN IF NOT EXISTS business_number text, ADD COLUMN IF NOT EXISTS pricing_preset jsonb DEFAULT '{}', ADD COLUMN IF NOT EXISTS quotes jsonb DEFAULT '[]', ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(), ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(); GRANT INSERT ON cockpit.drivers,cockpit.customers TO service_role");
  await admin.query('ALTER TABLE cockpit.organizations DROP CONSTRAINT organizations_p0_runtime_hold; ALTER TABLE cockpit.organization_members DROP CONSTRAINT organization_members_p0_activation_hold');
  await admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id IN ($1,$2)",[vip,ch]);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,user]);
  await admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,status) VALUES($1,$3,'company_admin','active'),($2,$3,'company_admin','active'),($2,$4,'driver','active')",[vip,ch,user,otherUser]);
  await admin.query('SET LOCAL ROLE authenticated');
  await fails(()=>list(ch,'driver'),'42501');
  await fails(()=>admin.query('SELECT * FROM cockpit.organization_registry_requests'),'42501');
  await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>call(ch,{op:'list',kind:'driver'},otherUser,session),'42501');
  await fails(()=>call(ch,{op:'list',kind:'driver'},user,randomUUID()),'42501');
  const cmd=create('driver',{name:'동명이인',phone:'010-0000-0000',email:'test@example.test',englishAvailable:true,affiliationType:'employed'});
  const a=(await call(vip,cmd)).rows[0].result;
  const b=(await call(ch,cmd)).rows[0].result;
  assert.notEqual(a.id,b.id);
  assert.deepEqual((await call(ch,cmd)).rows[0].result,b);
  await fails(()=>call(ch,{...cmd,fields:{name:'changed'}}),'40001');
  assert.deepEqual((await list(ch,'driver')).records.map((x:{id:string})=>x.id),[b.id]);
  assert.ok((await list(vip,'driver')).records.some((x:{id:string})=>x.id===a.id));
  await fails(()=>call(ch,update('driver',a,{name:'forged'})),'42501');
  await fails(()=>call(ch,create('driver',{name:'forged',org_id:vip})),'22023');
  await fails(()=>call(ch,create('driver',{name:'forged',role:'company_owner'})),'22023');
  await fails(()=>call(ch,{...cmd,id:a.id,requestId:randomUUID()}),'22023');
  await admin.query("UPDATE cockpit.drivers SET driver_meta=driver_meta||'{\"unrelated\":\"retained\"}' WHERE id=$1",[b.id]);
  await fails(()=>call(ch,update('driver',b,{memo:'memo'})),'40001');
  const current=(await list(ch,'driver')).records[0];
  const changed=(await call(ch,update('driver',current,{memo:'memo'}))).rows[0].result;
  assert.equal(changed.id,b.id);assert.notEqual(changed.revision,current.revision);
  const row=(await admin.query('SELECT driver_meta,vehicle_no FROM cockpit.drivers WHERE id=$1',[b.id])).rows[0];
  assert.equal(row.driver_meta.unrelated,'retained');assert.equal(row.vehicle_no,'DRV-'+b.id);
  assert.equal((await list(ch,'driver')).records[0].memo,'memo');
  const customer=(await call(ch,create('customer',{name:'fixture CRM',email:'crm@example.test'}))).rows[0].result;
  const customer2=(await call(ch,create('customer',{name:'fixture CRM'}))).rows[0].result;
  assert.notEqual(customer.id,customer2.id);
  const page=await list(ch,'customer',{limit:1});assert.equal(page.records.length,1);
  const next=await list(ch,'customer',{limit:1,cursor:page.nextCursor});assert.equal(next.records.length,1);assert.notEqual(next.records[0].id,page.records[0].id);
  assert.equal((await list(ch,'customer',{limit:1,cursor:next.nextCursor})).records.length,0);
  await admin.query("UPDATE cockpit.customers SET pricing_preset='{\"private\":\"retain\"}',quotes='[{\"amount\":100}]' WHERE id=$1",[customer.id]);
  const crm=(await list(ch,'customer')).records.find((x:{id:string})=>x.id===customer.id);
  assert.ok(!('quotes' in crm));
  await call(ch,update('customer',crm,{contactPerson:'new contact'}));
  const preserved=(await admin.query('SELECT pricing_preset,quotes FROM cockpit.customers WHERE id=$1',[customer.id])).rows[0];
  assert.deepEqual(preserved,{pricing_preset:{private:'retain'},quotes:[{amount:100}]});
  const originalPlate=(await admin.query('SELECT plate FROM cockpit.vehicles WHERE organization_id=$1 LIMIT 1',[vip])).rows[0].plate;
  const vehicleFields={plate:'fixture '+randomUUID().slice(0,8)+' 4321',model:'fixture van',brand:'현대',category:'staria',categoryLabel:'스타리아',capacity:'9인승',fuelType:'디젤'};
  await fails(()=>call(ch,create('vehicle',{...vehicleFields,plate:originalPlate.replace(/\s/g,'')})),'23505');
  const vehicle=(await call(ch,create('vehicle',vehicleFields))).rows[0].result;
  await fails(()=>call(ch,update('vehicle',vehicle,{plate:'new 1234'})),'22023');
  await call(ch,update('vehicle',vehicle,{memo:'fleet memo'}));
  assert.equal((await list(ch,'vehicle')).records[0].id,vehicle.id);
  const supplier=(await call(ch,create('supplier',{name:'fixture supplier'}))).rows[0].result;
  assert.equal((await list(ch,'supplier')).records[0].id,supplier.id);
  assert.equal((await list(vip,'supplier')).records.length,0);
  await fails(()=>call(ch,{op:'delete',kind:'driver',id:b.id}),'22023');
  await admin.query('RESET ROLE');
  await admin.query("UPDATE cockpit.organization_members SET status='revoked' WHERE org_id=$1 AND user_id=$2",[ch,user]);
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>call(ch,cmd),'42501');
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual(await snapshot(),before,'legacy registry/schedules/reports changed');
 console.log('PASS tenant registry: scoped list/create/update, immutable identity, replay, version conflict, retained metadata, no live activation');
}
