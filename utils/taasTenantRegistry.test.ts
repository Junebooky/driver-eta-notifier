import test from 'node:test';
import assert from 'node:assert/strict';
import {runTenantRegistry,tenantRegistryCandidate,type RegistryDependencies,type RegistryCommand} from '../lib/taas/tenantRegistry.server';
import type {TenantIdentity} from '../lib/auth/tenantIdentity';
const id='a0000000-0000-4000-8000-000000000001';
const identity:TenantIdentity={orgId:'chauffeur_service',userId:id,sessionId:id,hostname:'chauffeur.example.test',role:'company_admin',driverId:null,issuedAt:1,expiresAt:2,home:'/hq?tab=dashboard'};
const command:RegistryCommand={kind:'driver',op:'create',requestId:'request-fixture',fields:{name:'fixture'}};
test('registry uses verified tenant identity and refuses non-admin or runtime-locked requests',async()=>{
 let calls=0;
 const deps:RegistryDependencies={verify:async()=>identity,call:async(i,c)=>{calls++;assert.equal(i.orgId,'chauffeur_service');assert.deepEqual(c,command);return {data:{id},error:null};}};
 assert.deepEqual(await runTenantRegistry(identity.hostname,'fixture',command,deps),{ok:true,data:{id}});
 deps.verify=async()=>({...identity,role:'driver'});
 assert.equal((await runTenantRegistry(identity.hostname,'fixture',command,deps)).ok,false);
 deps.verify=async()=>null;
 assert.equal((await runTenantRegistry(identity.hostname,'fixture',command,deps)).ok,false);
 assert.equal(calls,1);
 assert.equal((await tenantRegistryCandidate(identity.hostname,'fixture',command)).ok,false);
});
test('registry maps SQL errors without leaking other tenant data',async()=>{
 for(const [code,status] of [['42501',403],['23505',409],['40001',409],['22023',400],['XX000',503]] as const){
  const result=await runTenantRegistry(identity.hostname,'fixture',command,{verify:async()=>identity,call:async()=>({data:null,error:{code,message:'private company detail'}})});
  assert.equal(result.ok,false);
  if(!result.ok){assert.equal(result.status,status);assert.ok(!result.error.includes('private company detail'));}
 }
});
