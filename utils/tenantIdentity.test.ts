import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { canonicalTenantHostname, evaluateTenantIdentity, type TenantAuthDependencies } from '../lib/auth/tenantIdentity';
import { verifyTenantAuthCandidate } from '../lib/auth/tenantAuthCandidate.server';
import { accountHome } from './loginPortal';

const now=1795650000;
const confirmed=new Date((now-3600)*1000).toISOString();
const vip='vip_limousine_korea',ch='chauffeur_service';
const user='a0000000-0000-4000-8000-000000000001',other='a0000000-0000-4000-8000-000000000002';
const session='b0000000-0000-4000-8000-000000000001';
const driverA='c0000000-0000-4000-8000-000000000001',driverB='c0000000-0000-4000-8000-000000000002';
const hostA='vip.example.test',hostB='chauffeur.example.test';
const jwt=(patch:Record<string,unknown>={})=>[
 Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),
 Buffer.from(JSON.stringify({sub:user,session_id:session,aud:'authenticated',role:'authenticated',iat:now-60,exp:now+3600,aal:'aal1',...patch})).toString('base64url'),
 'fixture_signature'
].join('.');
function fixture(){
 const domains=new Map([[hostA,{hostname:hostA,org_id:vip,status:'verified',verified_at:confirmed}],[hostB,{hostname:hostB,org_id:ch,status:'verified',verified_at:confirmed}]]);
 const orgs=new Map([[vip,{id:vip,status:'active',runtime_enabled:true}],[ch,{id:ch,status:'active',runtime_enabled:true}]]);
 const members=new Map([
  [vip,{org_id:vip,user_id:user,role:'driver',status:'active',driver_id:driverA as string|null}],
  [ch,{org_id:ch,user_id:user,role:'driver',status:'active',driver_id:driverB as string|null}]
 ]);
 const calls:string[]=[];
 const deps:TenantAuthDependencies={
  async getUser(){calls.push('provider');return {id:user,email_confirmed_at:confirmed,app_metadata:{org:vip,cockpit_role:'hq_admin'},user_metadata:{role:'super_admin',driver_id:driverB}};},
  async isSessionActive(u,s){calls.push('session');return u===user&&s===session;},
  async getDomain(h){calls.push('domain:'+h);return domains.get(h)||null;},
  async getOrganization(o){return orgs.get(o)||null;},
  async getMembership(u,o){calls.push('member:'+u+':'+o);return u===user?members.get(o)||null:null;},
  async ownsActiveDriver(o,d){return (o===vip&&d===driverA)||(o===ch&&d===driverB);}
 };
 return {domains,orgs,members,calls,deps};
}
const resolve=(d:TenantAuthDependencies,host=hostA,token=jwt())=>evaluateTenantIdentity(host,token,d,now);

test('one verified account maps to distinct driver UUIDs and tenants, never name or metadata role',async()=>{
 const f=fixture();
 const a=await resolve(f.deps,hostA),b=await resolve(f.deps,hostB);
 assert.equal(a?.orgId,vip);assert.equal(b?.orgId,ch);
 assert.equal(a?.userId,b?.userId);assert.equal(a?.driverId,driverA);assert.equal(b?.driverId,driverB);
 assert.equal(a?.role,'driver');assert.equal(a?.home,'/');
 f.members.set(ch,{org_id:ch,user_id:user,role:'company_owner',status:'active',driver_id:null});
 assert.equal((await resolve(f.deps,hostB))?.home,'/hq?tab=dashboard');
 assert.equal((await resolve(f.deps,hostA))?.role,'driver');
 assert.ok(f.calls.includes('member:'+user+':'+ch));
});

test('unknown and malformed hostnames, unverified and disabled domains, dormant tenants fail closed',async()=>{
 const f=fixture();
 for(const host of ['unknown.example.test','https://vip.example.test','vip.example.test:443','vip.example.test.','vip.example.test/path','vip.example.test,chauffeur.example.test','*.example.test','localhost',' vip.example.test','127.0.0.1'])assert.equal(await resolve(f.deps,host),null);
 assert.equal(canonicalTenantHostname('VIP.EXAMPLE.TEST'),hostA);
 assert.equal(f.calls.includes('provider'),false);
 for(const status of ['pending','disabled']){
  f.domains.get(hostA)!.status=status;assert.equal(await resolve(f.deps),null);
 }
 f.domains.get(hostA)!.status='verified';
 f.domains.get(hostA)!.verified_at='not a date';assert.equal(await resolve(f.deps),null);
 f.domains.get(hostA)!.verified_at=confirmed;
 f.orgs.get(vip)!.runtime_enabled=false;assert.equal(await resolve(f.deps),null);
 f.orgs.get(vip)!.runtime_enabled=true;f.orgs.get(vip)!.status='suspended';assert.equal(await resolve(f.deps),null);
});

test('provider rejection, malformed JWT, expired or forged claims, unverified email, MFA and revocation',async()=>{
 const f=fixture();
 for(const patch of [{sub:other},{exp:now},{iat:now+61},{session_id:'bad'},{role:'service_role'},{aud:'anon'},{is_anonymous:true},{aal:'invalid'}])assert.equal(await resolve(f.deps,hostA,jwt(patch)),null);
 for(const token of ['rdev_'+'a'.repeat(43),'cockpit_s1.abc.def','not-a-token','a.b.c',''])assert.equal(await resolve(f.deps,hostA,token),null);
 const provider=f.deps.getUser;
 f.deps.getUser=async()=>null;assert.equal(await resolve(f.deps),null);
 f.deps.getUser=async()=>({id:user,email_confirmed_at:null});assert.equal(await resolve(f.deps),null);
 f.deps.getUser=async()=>({id:user,email_confirmed_at:confirmed,app_metadata:{disabled:true}});assert.equal(await resolve(f.deps),null);
 f.deps.getUser=async()=>({id:user,email_confirmed_at:confirmed,app_metadata:{require_mfa:true}});
 assert.equal(await resolve(f.deps),null);assert.ok(await resolve(f.deps,hostA,jwt({aal:'aal2'})));
 f.deps.getUser=provider;f.deps.isSessionActive=async()=>false;assert.equal(await resolve(f.deps),null);
});

test('membership revocation, incorrect tenant/user, missing driver ownership and DB failures deny every call',async()=>{
 const f=fixture();assert.ok(await resolve(f.deps));
 for(const status of ['pending','revoked','suspended']){
  f.members.get(vip)!.status=status;assert.equal(await resolve(f.deps),null);
 }
 f.members.get(vip)!.status='active';assert.ok(await resolve(f.deps));
 f.members.get(vip)!.driver_id=driverB;assert.equal(await resolve(f.deps),null);
 f.members.get(vip)!.driver_id=driverA;
 f.members.get(vip)!.org_id=ch;assert.equal(await resolve(f.deps),null);
 f.members.get(vip)!.org_id=vip;f.members.get(vip)!.user_id=other;assert.equal(await resolve(f.deps),null);
 f.members.get(vip)!.user_id=user;f.members.get(vip)!.role='super_admin';assert.equal(await resolve(f.deps),null);
 f.members.get(vip)!.role='company_admin';assert.equal(await resolve(f.deps),null);
 f.members.delete(vip);assert.equal(await resolve(f.deps),null);
 f.deps.getDomain=async()=>{throw Error('fixture outage');};assert.equal(await resolve(f.deps),null);
});

test('production adapter is locked; legacy routing including report-only device is unchanged',async()=>{
 assert.equal(await verifyTenantAuthCandidate(hostA,jwt()),null);
 assert.equal(await verifyTenantAuthCandidate(hostB,jwt()),null);
 assert.equal(accountHome({role:'hq_admin',isRepresentative:true}),'/hq?tab=dashboard');
 assert.equal(accountHome({role:'driver'}),'/');
 assert.equal(accountHome({role:'driver',reportDevice:true}),'/driver/reports');
});
