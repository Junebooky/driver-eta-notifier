import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Client} from 'pg';

export async function verifyTenantBranding(admin:Client){
 const before=(await admin.query('SELECT to_jsonb(s) row FROM cockpit.schedules s ORDER BY id')).rows;
 await admin.query(readFileSync('supabase/proposals/taas_white_label_branding.sql','utf8'));
 const vip='vip_limousine_korea',ch='chauffeur_service',a='a'.repeat(64),b='b'.repeat(64);
 const read=async(host:string)=>(await admin.query('SELECT cockpit.tenant_public_brand_v1($1) result',[host])).rows[0].result;
 await admin.query('BEGIN');
 try{
  const fails=async(fn:()=>Promise<unknown>,code:string)=>{await admin.query('SAVEPOINT fail');try{await assert.rejects(fn(),{code});}finally{await admin.query('ROLLBACK TO SAVEPOINT fail');await admin.query('RELEASE SAVEPOINT fail');}};
  await admin.query('SET LOCAL ROLE service_role');
  assert.equal(await read('vip.example.test'),null);
  await admin.query('RESET ROLE');
  await admin.query('ALTER TABLE cockpit.organizations DROP CONSTRAINT organizations_p0_runtime_hold');
  await admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id IN ($1,$2)",[vip,ch]);
  await admin.query("UPDATE cockpit.organization_domains SET status='verified',verified_at=now() WHERE org_id IN ($1,$2)",[vip,ch]);
  await admin.query('SET LOCAL ROLE service_role');
  assert.equal(await read('chauffeur.example.test'),null);
  await admin.query("UPDATE cockpit.organization_settings SET app_short_name='VIP test',app_description='VIP driver app fixture',icon_192_sha256=$2,icon_512_sha256=$3 WHERE org_id=$1",[vip,a,b]);
  await admin.query("UPDATE cockpit.organization_settings SET app_short_name='Chauffeur test',app_description='Chauffeur driver app fixture',icon_192_sha256=$2,icon_512_sha256=$3 WHERE org_id=$1",[ch,b,a]);
  const x=await read('vip.example.test'),y=await read('chauffeur.example.test');
  assert.equal(x.orgId,vip);assert.equal(y.orgId,ch);assert.equal(x.icon192,a);assert.equal(y.icon192,b);
  assert.deepEqual(Object.keys(y).sort(),['appName','description','displayName','hostname','icon192','icon512','orgId','shortName']);
  assert.equal(await read('unknown.example.test'),null);assert.equal(await read('VIP.example.test'),null);
  await fails(()=>admin.query("UPDATE cockpit.organization_settings SET icon_192_sha256='https://outside.test/a' WHERE org_id=$1",[ch]),'23514');
  await admin.query("UPDATE cockpit.organization_domains SET verified_at=now()+interval '1 day' WHERE org_id=$1",[ch]);
  assert.equal(await read('chauffeur.example.test'),null);
  await admin.query("UPDATE cockpit.organization_domains SET status='disabled' WHERE org_id=$1",[vip]);
  assert.equal(await read('vip.example.test'),null);
  await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE authenticated');await fails(()=>read('vip.example.test'),'42501');await admin.query('RESET ROLE');
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual((await admin.query('SELECT to_jsonb(s) row FROM cockpit.schedules s ORDER BY id')).rows,before);
 console.log('PASS white-label branding: only verified active domain and complete settings, no legacy schedule mutation');
}
