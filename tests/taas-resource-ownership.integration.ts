import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { checkTenantDispatchReferences, ownsActiveDriver, scopeColumn, type ScopedResourceReader } from '../lib/taas/resourceOwnership';
import type { TenantIdentity } from '../lib/auth/tenantIdentity';

export async function verifyResourceOwnership(admin:Client){
 const vip='vip_limousine_korea',ch='chauffeur_service';
 // Existing dispatch fixture has no CRM table; reproduce its live text PK.
 await admin.query('CREATE TABLE IF NOT EXISTS cockpit.customers(id text PRIMARY KEY)');
 const oldDriver=randomUUID(),oldCustomer='legacy-'+randomUUID();
 await admin.query("INSERT INTO cockpit.drivers(id,vehicle_no,driver_name) VALUES($1,$2,'legacy driver')",[oldDriver,'legacy-'+oldDriver]);
 await admin.query('INSERT INTO cockpit.customers(id) VALUES($1)',[oldCustomer]);
 const snapshot=async()=> {
  const out=[];
  for(const table of ['drivers','customers','vehicles','schedules','report_messages']){
   const r=await admin.query("SELECT count(*)::text n, md5(coalesce(string_agg((to_jsonb(t)-'org_id')::text,chr(10) ORDER BY (to_jsonb(t)-'org_id')::text),'')) digest FROM cockpit."+table+' t');
   out.push(r.rows[0]);
  }
  return out;
 };
 const before=await snapshot();
 await admin.query(readFileSync('supabase/proposals/taas_resource_ownership.sql','utf8'));
 assert.deepEqual(await snapshot(),before);
 assert.equal((await admin.query('SELECT org_id FROM cockpit.drivers WHERE id=$1',[oldDriver])).rows[0].org_id,null);
 assert.equal((await admin.query('SELECT org_id FROM cockpit.customers WHERE id=$1',[oldCustomer])).rows[0].org_id,null);
 // Synthetic scoped rows exist only within a rolled-back test transaction.
 const d1=randomUUID(),d2=randomUUID(),c1='tenant-'+randomUUID(),c2='tenant-'+randomUUID();
 const tables={driver:'drivers',vehicle:'vehicles',customer:'customers',schedule:'schedules'} as const;
 const read:ScopedResourceReader=async(kind,org,id)=>(await admin.query('SELECT * FROM cockpit.'+tables[kind]+' WHERE '+scopeColumn(kind)+'=$1 AND id=$2',[org,id])).rows[0]||null;
 const identity:TenantIdentity={orgId:vip,userId:randomUUID(),hostname:'vip.example.test',role:'company_admin',driverId:null,sessionId:randomUUID(),issuedAt:1,expiresAt:2,home:'/hq?tab=dashboard'};
 await admin.query('BEGIN');
 try{
  await admin.query("INSERT INTO cockpit.drivers(id,vehicle_no,driver_name,org_id,driver_meta) VALUES($1,$3,'동명이인',$5,'{\"status\":\"active\"}'),($2,$4,'동명이인',$6,'{\"status\":\"active\"}')",[d1,d2,'fixture-'+d1,'fixture-'+d2,vip,ch]);
  await admin.query('INSERT INTO cockpit.customers(id,org_id) VALUES($1,$3),($2,$4)',[c1,c2,vip,ch]);
  const v=(await admin.query('SELECT id FROM cockpit.vehicles WHERE organization_id=$1 ORDER BY id LIMIT 1',[vip])).rows[0].id;
  assert.equal(await ownsActiveDriver(read,vip,oldDriver),false);
  assert.equal(await checkTenantDispatchReferences(identity,{driverId:d1,vehicleId:v,customerId:c1},read),true);
  assert.equal(await checkTenantDispatchReferences(identity,{driverId:d2},read),false);
  assert.equal(await checkTenantDispatchReferences(identity,{customerId:c2},read),false);
  assert.equal(await checkTenantDispatchReferences({...identity,orgId:ch},{vehicleId:v},read),false);
 }finally{await admin.query('ROLLBACK');}
 assert.deepEqual(await snapshot(),before,'existing row values changed');
 console.log('PASS nullable ownership expansion preserves legacy IDs/rows; same-name cross-tenant driver/customer and vehicle reference rejected');
}
