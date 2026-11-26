import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
export async function verifyTenantFeatures(admin:Client){
 await admin.query(readFileSync('supabase/proposals/taas_feature_policy.sql','utf8'));
 const vip='vip_limousine_korea',ch='chauffeur_service',user=randomUUID(),session=randomUUID();
 const read=async(org:string,u=user,s=session)=>(await admin.query('SELECT cockpit.tenant_feature_policy_v1($1,$2,$3) result',[org,u,s])).rows[0].result;
 const before=(await admin.query('SELECT to_jsonb(f) row FROM cockpit.organization_features f ORDER BY org_id,feature_key')).rows;
 await admin.query('BEGIN');
 try{
  const fails=async(fn:()=>Promise<unknown>,code:string)=>{await admin.query('SAVEPOINT feature_fail');try{await assert.rejects(fn(),{code});}finally{await admin.query('ROLLBACK TO SAVEPOINT feature_fail');await admin.query('RELEASE SAVEPOINT feature_fail');}};
  await admin.query('SET LOCAL ROLE service_role');await fails(()=>read(vip),'42501');await admin.query('RESET ROLE');
  await admin.query('ALTER TABLE cockpit.organizations DROP CONSTRAINT organizations_p0_runtime_hold; ALTER TABLE cockpit.organization_members DROP CONSTRAINT organization_members_p0_activation_hold');
  await admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id IN ($1,$2)",[vip,ch]);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,user]);
  await admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,status) VALUES($1,$3,'company_owner','active'),($2,$3,'company_admin','active')",[vip,ch,user]);
  await admin.query('SET LOCAL ROLE authenticated');await fails(()=>read(vip),'42501');await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE service_role');
  assert.equal((await read(vip)).legacyReportExcel,true);assert.equal((await read(ch)).legacyReportExcel,false);
  await fails(()=>read(vip,user,randomUUID()),'42501');
  await fails(()=>admin.query("UPDATE cockpit.organization_features SET enabled=true WHERE org_id=$1 AND feature_key='legacy_report_excel'",[ch]),'23514');
  await admin.query("UPDATE cockpit.organization_features SET enabled=false WHERE org_id=$1 AND feature_key='legacy_report_excel'",[vip]);
  assert.equal((await read(vip)).legacyReportExcel,false);
  await admin.query("UPDATE cockpit.organization_members SET status='revoked' WHERE org_id=$1 AND user_id=$2",[ch,user]);
  await fails(()=>read(ch),'42501');assert.equal((await read(vip)).legacyReportExcel,false);
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual((await admin.query('SELECT to_jsonb(f) row FROM cockpit.organization_features f ORDER BY org_id,feature_key')).rows,before);
 console.log('PASS tenant feature policy: VIP only, fresh membership, disabled feature, unchanged settings');
}
