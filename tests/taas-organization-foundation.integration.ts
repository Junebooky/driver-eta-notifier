import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

const added=['organizations','organization_members','organization_domains','organization_settings','organization_features'];
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';

/** Only runs on the existing disposable dispatch Postgres fixture. */
async function legacySnapshot(db:Client){
 const catalog=await db.query(
  "SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cockpit','auth','chauffeur') AND c.relkind IN ('r','p','v','m') AND NOT (n.nspname='cockpit' AND c.relname=ANY($1::text[])) ORDER BY 1,2",[added]);
 const rows=[];
 for(const rel of catalog.rows){
  if(rel.relkind!=='r'&&rel.relkind!=='p')continue;
  const table=quote(rel.schema)+'.'+quote(rel.name);
  const result=await db.query("SELECT count(*)::text AS count,md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) AS digest FROM "+table+' t');
  rows.push({table,...result.rows[0]});
 }
 const columns=await db.query(
  "SELECT table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('cockpit','auth','chauffeur') AND NOT (table_schema='cockpit' AND table_name=ANY($1::text[])) ORDER BY 1,2,4",[added]);
 const constraints=await db.query(
  "SELECT n.nspname,c.relname,co.conname,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cockpit','auth','chauffeur') AND NOT (n.nspname='cockpit' AND c.relname=ANY($1::text[])) ORDER BY 1,2,3",[added]);
 const functions=await db.query(
  "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('cockpit','auth','chauffeur') AND p.prokind IN ('f','p') ORDER BY 1,2,3");
 const policies=await db.query(
  "SELECT * FROM pg_policies WHERE schemaname IN ('cockpit','auth','chauffeur') AND NOT (schemaname='cockpit' AND tablename=ANY($1::text[])) ORDER BY schemaname,tablename,policyname",[added]);
 const views=await db.query(
  "SELECT schemaname,viewname,definition FROM pg_views WHERE schemaname IN ('cockpit','auth','chauffeur') ORDER BY 1,2");
 const triggers=await db.query(
  "SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cockpit','auth','chauffeur') AND NOT (n.nspname='cockpit' AND c.relname=ANY($1::text[])) ORDER BY 1,2,3",[added]);
 return {catalog:catalog.rows,rows,columns:columns.rows,constraints:constraints.rows,functions:functions.rows,policies:policies.rows,views:views.rows,triggers:triggers.rows};
}

export async function verifyDormantTenantFoundation(admin:Client){
 // Synthetic Chauffeur record: checks the proposal does not touch another schema.
 await admin.query("CREATE SCHEMA chauffeur; CREATE TABLE chauffeur.reservations(id uuid PRIMARY KEY, reference text NOT NULL, amount numeric NOT NULL); INSERT INTO chauffeur.reservations VALUES ('00000000-0000-4000-8000-000000000009','isolated booking',123.45)");
 const before=await legacySnapshot(admin);
 assert.ok(before.rows.some(r=>r.table==='"cockpit"."schedules"'&&Number(r.count)>0));
 assert.ok(before.rows.some(r=>r.table==='"cockpit"."vehicles"'&&Number(r.count)>0));
 assert.ok(before.rows.some(r=>r.table==='"cockpit"."report_messages"'&&Number(r.count)>0));
 await admin.query(readFileSync('supabase/proposals/taas_organization_foundation.sql','utf8'));
 assert.deepEqual(await legacySnapshot(admin),before,'additive schema changed existing rows or DB contracts');

 const a='vip_limousine_korea',b='chauffeur_service',user=randomUUID(),driverA=randomUUID(),driverB=randomUUID();
 try {
  for(const role of ['anon','authenticated']){
   await admin.query('SET ROLE '+role);
   for(const table of added)await assert.rejects(admin.query('SELECT * FROM cockpit.'+table),{code:'42501'});
   await assert.rejects(admin.query("INSERT INTO cockpit.organizations(id,display_name) VALUES('forged_org','forged')"),{code:'42501'});
   await admin.query('RESET ROLE');
  }
  await admin.query('SET ROLE service_role');
  await admin.query('INSERT INTO cockpit.organizations(id,display_name) VALUES($1,$3),($2,$4)',[a,b,'VIP fixture','Chauffeur fixture']);
  const orgs=await admin.query('SELECT status,runtime_enabled FROM cockpit.organizations ORDER BY id');
  assert.deepEqual(orgs.rows,[{status:'draft',runtime_enabled:false},{status:'draft',runtime_enabled:false}]);
  await assert.rejects(admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id=$1",[a]),{code:'23514'});
  await admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,driver_id) VALUES($1,$3,'driver',$4),($2,$3,'driver',$5)",[a,b,user,driverA,driverB]);
  assert.equal((await admin.query('SELECT * FROM cockpit.organization_members WHERE user_id=$1',[user])).rowCount,2);
  await assert.rejects(admin.query("UPDATE cockpit.organization_members SET status='active' WHERE org_id=$1 AND user_id=$2",[a,user]),{code:'23514'});
  await assert.rejects(admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,driver_id) VALUES($1,$2,'driver',$3)",[b,randomUUID(),driverA]),{code:'23505'});
  await assert.rejects(admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role) VALUES('unknown_org',$1,'driver')",[randomUUID()]),{code:'23503'});
  await admin.query("INSERT INTO cockpit.organization_domains(hostname,org_id) VALUES('vip.example.test',$1),('chauffeur.example.test',$2)",[a,b]);
  await assert.rejects(admin.query("INSERT INTO cockpit.organization_domains(hostname,org_id) VALUES('vip.example.test',$1)",[b]),{code:'23505'});
  for(const host of ['VIP.example.test','https://vip.example.test','vip.example.test:443','vip.example.test/path','*.example.test']){
   await assert.rejects(admin.query('INSERT INTO cockpit.organization_domains(hostname,org_id) VALUES($1,$2)',[host,a]),{code:'23514'});
  }
  await assert.rejects(admin.query("UPDATE cockpit.organization_domains SET status='verified' WHERE hostname='vip.example.test'"),{code:'23514'});
  await admin.query("INSERT INTO cockpit.organization_settings(org_id,app_name) VALUES($1,'VIP fixture'),($2,'Chauffeur fixture')",[a,b]);
  await assert.rejects(admin.query('UPDATE cockpit.organization_settings SET signup_enabled=true WHERE org_id=$1',[b]),{code:'23514'});
  await admin.query("INSERT INTO cockpit.organization_features(org_id,feature_key,enabled) VALUES($1,'legacy_report_excel',true),($2,'legacy_report_excel',false)",[a,b]);
  await assert.rejects(admin.query("UPDATE cockpit.organization_features SET enabled=true WHERE org_id=$1 AND feature_key='legacy_report_excel'",[b]),{code:'23514'});
  await assert.rejects(admin.query('DELETE FROM cockpit.organizations WHERE id=$1',[a]),{code:'42501'});
 }finally{await admin.query('RESET ROLE');}
 const metadata=await admin.query("SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='cockpit'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",[added]);
 assert.equal(metadata.rows.length,added.length);
 assert.ok(metadata.rows.every(r=>r.relrowsecurity));
 assert.deepEqual(await legacySnapshot(admin),before,'staging new tenants altered existing data');
 console.log('PASS dormant tenant foundation: prior rows, views, RPCs, constraints, triggers and grants retained; new tenant activation denied');
}
