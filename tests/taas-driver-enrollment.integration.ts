import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import type {Client} from 'pg';

export async function verifyTenantEnrollment(admin:Client){
 const vip='vip_limousine_korea',ch='chauffeur_service';
 const snapshot=async()=>{
  const out=[];
  for(const table of ['drivers','customers','vehicles','schedules','report_messages'])out.push((await admin.query('SELECT to_jsonb(t) AS row FROM cockpit.'+table+' t ORDER BY id')).rows);
  return out;
 };
 const before=await snapshot();
 await admin.query(readFileSync('supabase/proposals/taas_driver_enrollment.sql','utf8'));
 const owner=randomUUID(),ownerSession=randomUUID(),driverUser=randomUUID(),driverSession=randomUUID(),other=randomUUID(),otherSession=randomUUID();
 const d1=randomUUID(),d2=randomUUID(),email='verified@example.test';
 const hash=()=>createHash('sha256').update(randomBytes(32)).digest('hex');
 const issue=(org:string,driver:string,h:string)=>admin.query('SELECT cockpit.issue_tenant_driver_invite_v1($1,$2,$3,$4,$5) result',[org,owner,ownerSession,driver,h]);
 const redeem=(org:string,h:string,e=email,u=driverUser,s=driverSession)=>admin.query('SELECT cockpit.redeem_tenant_driver_invite_v1($1,$2,$3,$4,$5) result',[org,u,s,e,h]);
 const state=(org:string,driver:string,action:string)=>admin.query('SELECT cockpit.set_tenant_driver_membership_v1($1,$2,$3,$4,$5) result',[org,owner,ownerSession,driver,action]);
 await admin.query('BEGIN');
 try{
  const fails=async(fn:()=>Promise<unknown>,code:string)=>{
   await admin.query('SAVEPOINT expected_failure');
   try{await assert.rejects(fn(),{code});}finally{await admin.query('ROLLBACK TO SAVEPOINT expected_failure');await admin.query('RELEASE SAVEPOINT expected_failure');}
  };
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>issue(vip,d1,hash()),'42501');
  await admin.query('RESET ROLE');
  await admin.query('ALTER TABLE cockpit.organizations DROP CONSTRAINT organizations_p0_runtime_hold; ALTER TABLE cockpit.organization_members DROP CONSTRAINT organization_members_p0_activation_hold');
  await admin.query("UPDATE cockpit.organizations SET status='active',runtime_enabled=true WHERE id IN ($1,$2)",[vip,ch]);
  await admin.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4),($5,$6)',[ownerSession,owner,driverSession,driverUser,otherSession,other]);
  await admin.query("INSERT INTO cockpit.organization_members(org_id,user_id,role,status) VALUES($1,$3,'company_admin','active'),($2,$3,'company_admin','active')",[vip,ch,owner]);
  for(const [org,id] of [[vip,d1],[ch,d2]])await admin.query("INSERT INTO cockpit.drivers(id,vehicle_no,driver_name,org_id,driver_meta) VALUES($1,$2,'same name',$3,$4::jsonb)",[id,'fixture-'+id,org,JSON.stringify({status:'active',enrollment_email:email,history:'retained'})]);
  await admin.query('SET LOCAL ROLE authenticated');
  await fails(()=>issue(vip,d1,hash()),'42501');
  await fails(()=>admin.query('SELECT * FROM cockpit.organization_driver_invites'),'42501');
  await admin.query('RESET ROLE');
  await admin.query('SET LOCAL ROLE service_role');
  await fails(()=>issue(vip,d2,hash()),'42501');
  const old=hash(),h1=hash(),h2=hash();
  await issue(vip,d1,old);await issue(vip,d1,h1);await issue(ch,d2,h2);
  await fails(()=>redeem(vip,old),'42501');
  await fails(()=>redeem(ch,h1),'42501');
  await fails(()=>redeem(vip,h1,'wrong@example.test',other,otherSession),'42501');
  await fails(()=>redeem(vip,h1,email,other,driverSession),'42501');
  await fails(()=>state(vip,d1,'approve'),'42501');
  assert.equal((await redeem(vip,h1)).rows[0].result.status,'pending');
  await fails(()=>redeem(vip,h1),'42501');
  await fails(()=>issue(vip,d1,hash()),'23505');
  assert.equal((await redeem(ch,h2)).rows[0].result.status,'pending');
  assert.equal((await state(vip,d1,'approve')).rows[0].result.status,'active');
  assert.equal((await state(ch,d2,'approve')).rows[0].result.status,'active');
  await fails(()=>state(vip,d2,'revoke'),'42501');
  const vehicle=(await admin.query('SELECT id,plate FROM cockpit.vehicles WHERE organization_id=$1 LIMIT 1',[vip])).rows[0];
  const booking=randomUUID();
  await admin.query("INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,end_date,end_time,vehicle_id,vehicle_plate,vehicle_no,driver_id,driver_name,status,dispatch_status,schedule_meta) VALUES($1,$2,'2099-01-01','09:00','2099-01-01','12:00',$3,$4,$4,$5,'same name','scheduled','published','{\"serviceMode\":\"with_driver\"}')",[booking,vip,vehicle.id,vehicle.plate,d1]);
  await fails(()=>state(vip,d1,'deactivate'),'23P01');
  assert.equal((await state(vip,d1,'revoke')).rows[0].result.status,'revoked');
  assert.equal((await admin.query('SELECT status FROM cockpit.organization_members WHERE org_id=$1 AND user_id=$2',[ch,driverUser])).rows[0].status,'active');
  assert.equal((await admin.query('SELECT cockpit.is_active_auth_session($1,$2) active',[driverSession,driverUser])).rows[0].active,true);
  assert.equal((await admin.query('SELECT driver_id FROM cockpit.schedules WHERE id=$1',[booking])).rows[0].driver_id,d1);
  assert.equal((await state(ch,d2,'deactivate')).rows[0].result.status,'revoked');
  const profile=(await admin.query('SELECT driver_meta FROM cockpit.drivers WHERE id=$1',[d2])).rows[0].driver_meta;
  assert.equal(profile.status,'inactive');assert.equal(profile.history,'retained');
 }finally{await admin.query('ROLLBACK');await admin.query('RESET ROLE');}
 assert.deepEqual(await snapshot(),before);
 console.log('PASS tenant driver enrollment: one-time email-bound invites, pending approval, independent membership revocation, safe deactivation and historical row preservation');
}
