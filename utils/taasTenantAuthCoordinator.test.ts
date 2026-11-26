import test from 'node:test';
import assert from 'node:assert/strict';
import {browserTenantAuthLock,coordinateTenantAuthMutation,coordinateTenantRefresh,TENANT_AUTH_LOCK,type TenantAuthLock,type TenantRead} from '../lib/auth/tenantAuthCoordinator';

function queue():TenantAuthLock{
 let tail:Promise<unknown>=Promise.resolve();
 return {request<T>(name:string,work:()=>Promise<T>){
  assert.equal(name,TENANT_AUTH_LOCK);
  const next=tail.then(work);
  tail=next.catch(()=>undefined);
  return next;
 }};
}
function deferred(){
 let resolve!:()=>void;
 const promise=new Promise<void>(r=>{resolve=r;});
 return {promise,resolve};
}
test('parallel tabs re-read under one origin lock and rotate exactly once',async()=>{
 const lock=queue(),started=deferred(),release=deferred();
 let current:TenantRead<string>={kind:'refresh-required'};
 let reads=0,rotations=0;
 const read=async()=>{reads++;return current;};
 const refresh=async()=>{rotations++;started.resolve();await release.promise;current={kind:'authenticated',session:'new'};return current;};
 const a=coordinateTenantRefresh(lock,read,refresh);
 await started.promise;
 const b=coordinateTenantRefresh(lock,read,refresh);
 assert.equal(reads,1);assert.equal(rotations,1);
 release.resolve();
 assert.deepEqual(await Promise.all([a,b]),[{kind:'authenticated',session:'new'},{kind:'authenticated',session:'new'}]);
 assert.equal(reads,2);assert.equal(rotations,1);
});
test('queued refresh observes completed logout and does not restore the session',async()=>{
 const lock=queue(),started=deferred(),release=deferred();
 let current:TenantRead<string>={kind:'refresh-required'};
 const logout=coordinateTenantAuthMutation(lock,async()=>{started.resolve();await release.promise;current={kind:'signed-out'};});
 await started.promise;
 const pending=coordinateTenantRefresh(lock,async()=>current,async()=>{assert.fail('must not rotate after logout');});
 release.resolve();
 assert.equal((await logout).kind,'complete');
 assert.deepEqual(await pending,{kind:'signed-out'});
});
test('unsupported lock, failed request and unavailable read never bypass lock or retry',async()=>{
 assert.equal(browserTenantAuthLock(),null);
 const never=async()=>{assert.fail('must not execute');};
 assert.deepEqual(await coordinateTenantAuthMutation(null,never),{kind:'unavailable'});
 assert.deepEqual(await coordinateTenantRefresh<string>(null,never,never),{kind:'unavailable'});
 const lock=queue();
 assert.deepEqual(await coordinateTenantRefresh<string>(lock,async()=>({kind:'unavailable'}),never),{kind:'unavailable'});
 let n=0;
 assert.deepEqual(await coordinateTenantRefresh<string>(lock,async()=>({kind:'refresh-required'}),async()=>{n++;throw Error('ambiguous network failure');}),{kind:'unavailable'});
 assert.equal(n,1);
 assert.deepEqual(await coordinateTenantRefresh(lock,async()=>({kind:'authenticated',session:'current'}),never),{kind:'authenticated',session:'current'});
});
test('separate origin locks do not serialize unrelated tenants',async()=>{
 const a=queue(),b=queue(),started=deferred(),release=deferred();
 const first=coordinateTenantAuthMutation(a,async()=>{started.resolve();await release.promise;return 'a';});
 await started.promise;
 assert.deepEqual(await coordinateTenantAuthMutation(b,async()=> 'b'),{kind:'complete',value:'b'});
 release.resolve();
 assert.deepEqual(await first,{kind:'complete',value:'a'});
});
