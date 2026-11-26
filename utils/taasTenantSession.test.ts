import test from 'node:test';
import assert from 'node:assert/strict';
import {loginTenantSession,readTenantSession,logoutTenantSession,TENANT_ACCESS_COOKIE,TENANT_BINDING_COOKIE,type TenantSessionDependencies} from '../lib/auth/tenantSession';
import {loginTenantSessionCandidate} from '../lib/auth/tenantSession.server';
import type {TenantIdentity} from '../lib/auth/tenantIdentity';
const host='chauffeur.example.test',other='vip.example.test',org='chauffeur_service',id='a0000000-0000-4000-8000-000000000001',token='fixture.jwt.signature';
const identity:TenantIdentity={hostname:host,orgId:org,userId:id,sessionId:id,role:'company_owner',driverId:null,issuedAt:100,expiresAt:400,home:'/hq?tab=dashboard'};
const input={email:' TEST@example.test ',password:'fixture password'};
function setup(){
 let signins=0,discards=0,revokes=0,checks=0;
 const deps:TenantSessionDependencies={
  brandOrg:async h=>h===host?org:h===other?'vip_limousine_korea':null,
  verify:async h=>{checks++;return h===host?identity:{...identity,hostname:other,orgId:'vip_limousine_korea'};},
  consume:async(email,ip)=>{assert.equal(email,'test@example.test');assert.equal(ip,'192.0.2.1');return 'allow';},
  signIn:async()=>{signins++;return {kind:'ok',token};},discard:async()=>{discards++;},revoke:async()=>{revokes++;return true;},
  secret:()=> 'x'.repeat(48),now:()=>200
 };
 return {deps,counts:()=>({signins,discards,revokes,checks})};
}
const login=(deps:TenantSessionDependencies,body:unknown=input,origin:unknown='https://'+host)=>loginTenantSession(host,'192.0.2.1',origin,body,deps);
test('host-only separate secure cookies, no token in JSON; copied cookies denied on another company host',async()=>{
 const {deps,counts}=setup(),r=await login(deps);assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.session.home,'/hq?tab=dashboard');assert.ok(!JSON.stringify(data).includes(token));
 const cookies={access:r.cookies.get(TENANT_ACCESS_COOKIE)?.value,binding:r.cookies.get(TENANT_BINDING_COOKIE)?.value};
 assert.equal(cookies.access,token);assert.ok(cookies.binding);
 for(const key of [TENANT_ACCESS_COOKIE,TENANT_BINDING_COOKIE]){
  const c=r.cookies.get(key);assert.equal(c?.secure,true);assert.equal(c?.httpOnly,true);assert.equal(c?.path,'/');assert.equal(c?.domain,undefined);assert.equal(c?.sameSite,'lax');assert.equal(c?.maxAge,200);
 }
 assert.equal((await readTenantSession(host,cookies,deps)).status,200);
 const checks=counts().checks;
 assert.equal((await readTenantSession(other,cookies,deps)).status,401);assert.equal(counts().checks,checks);
 assert.equal((await readTenantSession(host,{...cookies,access:'different.jwt.signature'},deps)).status,401);
 const csrf=await logoutTenantSession(host,'https://evil.test',cookies,deps);assert.equal(csrf.status,403);assert.equal(csrf.cookies.getAll().length,0);
 const done=await logoutTenantSession(host,'https://'+host,cookies,deps);assert.equal(done.status,200);assert.equal(counts().revokes,1);
 assert.equal(done.cookies.get(TENANT_ACCESS_COOKIE)?.maxAge,0);assert.equal(done.cookies.get(TENANT_BINDING_COOKIE)?.maxAge,0);
});
test('preflight and rate limiting precede provider; role/tenant fields and cross-site credentials rejected',async()=>{
 const {deps,counts}=setup();
 for(const body of [{...input,orgId:org},{...input,role:'company_owner'},{...input,portal:'hq'},{...input,code:'abcdef'}])assert.equal((await login(deps,body)).status,400);
 assert.equal((await login(deps,input,null)).status,403);
 assert.equal((await login({...deps,brandOrg:async()=>null})).status,403);
 assert.equal((await login({...deps,consume:async()=> 'limit'})).status,429);
 assert.equal(counts().signins,0);
 const mfa=await login({...deps,signIn:async()=>({kind:'mfa'})});assert.equal((await mfa.json()).code,'MFA_REQUIRED');assert.equal(mfa.cookies.getAll().length,0);
 const denied=await login({...deps,verify:async()=>null});assert.equal(denied.status,403);assert.equal(counts().discards,1);
 assert.notEqual((await loginTenantSessionCandidate(host,'192.0.2.1','https://'+host,input)).status,200);
});
test('revoked membership or expiry denies existing session; unconfirmed revoke clears without success',async()=>{
 const {deps}=setup(),r=await login(deps),cookies={access:r.cookies.get(TENANT_ACCESS_COOKIE)?.value,binding:r.cookies.get(TENANT_BINDING_COOKIE)?.value};
 assert.equal((await readTenantSession(host,cookies,{...deps,verify:async()=>null})).status,401);
 assert.equal((await readTenantSession(host,cookies,{...deps,now:()=>401})).status,401);
 const failed=await logoutTenantSession(host,'https://'+host,cookies,{...deps,revoke:async()=>false});
 assert.equal(failed.status,503);assert.equal(failed.cookies.get(TENANT_ACCESS_COOKIE)?.maxAge,0);
});
