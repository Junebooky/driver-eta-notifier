import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantBrowserAuth,createTenantSessionTransport,browserTenantAuth} from '../lib/auth/tenantBrowserAuth';
import type {TenantAuthLock} from '../lib/auth/tenantAuthCoordinator';
const host='vip.example.test',org='vip_limousine_korea';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const a={hostname:host,orgId:org,userId:id(1),sessionId:id(2),role:'company_admin',driverId:null,expiresAt:200,home:'/hq?tab=dashboard'};
const b={...a,userId:id(3),sessionId:id(4)};
const json=(body:object,status=200)=>Response.json(body,{status});
const signedOut=()=>json({ok:false,authenticated:false,code:'SESSION_UNAVAILABLE'},401);
const authenticated=(session:typeof a)=>json({ok:true,authenticated:true,session});
function fixture(){
 let current:typeof a|null=a,posts=0,tail:Promise<unknown>=Promise.resolve();
 let refreshRequired=false,failMutation=false;
 const listeners=new Set<()=>void>();
 const lock:TenantAuthLock={request<T>(_name:string,work:()=>Promise<T>){const next=tail.then(work);tail=next.catch(()=>undefined);return next;}};
 function tab(){
  let notify=0,own:(()=>void)|undefined;
  const signal={publish:()=>{for(const listener of listeners)if(listener!==own)listener();},subscribe:(listener:()=>void)=>{own=listener;listeners.add(listener);return ()=>{listeners.delete(listener);};},close:()=>{}};
  const auth=createTenantBrowserAuth({hostname:host,orgId:org,now:()=>100,lock,signal,onInvalidate:()=>{notify++;},fetcher:async(url,init)=>{
   assert.equal(url,'/api/tenant/auth/session');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');
   if(init.method==='GET')return refreshRequired?json({ok:false,authenticated:false,code:'REFRESH_REQUIRED'},401):current?authenticated(current):signedOut();
   posts++;
   if(failMutation)throw Error('network failure');
   const body=JSON.parse(String(init.body));
   if(body.action==='logout'){current=null;return json({ok:true,authenticated:false});}
   if(body.action==='refresh'){refreshRequired=false;return current?authenticated(current):signedOut();}
   assert.deepEqual(Object.keys(body).sort(),['email','password']);current=b;return authenticated(b);
  }});
  return {auth,notifications:()=>notify};
 }
 return {tab,posts:()=>posts,switchTo:(s:typeof a|null)=>{current=s;},requireRefresh:()=>{refreshRequired=true;},fail:()=>{failMutation=true;}};
}
test('transport distinguishes refresh, signed-out, locked API and malformed response without retries',async()=>{
 let calls=0;
 const replies=[json({ok:false,authenticated:false,code:'REFRESH_REQUIRED'},401),signedOut(),json({ok:false},503),new Response('<html/>'),json({ok:true,authenticated:true,session:a})];
 const t=createTenantSessionTransport(async()=>{calls++;return replies.shift()!;});
 assert.deepEqual(await t.read(),{kind:'refresh-required'});assert.deepEqual(await t.read(),{kind:'signed-out'});
 assert.deepEqual(await t.read(),{kind:'unavailable'});assert.deepEqual(await t.read(),{kind:'unavailable'});
 assert.deepEqual(await t.refresh(),{kind:'authenticated',session:a});assert.equal(calls,5);
});
test('logout invalidates another tab and its previously issued cache lease',async()=>{
 const f=fixture(),x=f.tab(),y=f.tab();await x.auth.reconcile();const ready=await y.auth.reconcile();
 assert.equal(ready.kind,'ready');if(ready.kind!=='ready')return;
 assert.equal(ready.cache.set('bookings',[1]),true);
 assert.deepEqual(await x.auth.logout(),{kind:'complete'});assert.equal(f.posts(),1);
 assert.equal(y.auth.current().kind,'blocked');assert.equal(ready.cache.get('bookings'),undefined);assert.equal(ready.cache.set('bookings',[2]),false);
 assert.ok(y.notifications()>1);assert.equal((await y.auth.reconcile()).kind,'signed-out');
 x.auth.dispose();y.auth.dispose();
});
test('stale tab cannot log out a different cookie session or overwrite it through login',async()=>{
 const f=fixture(),x=f.tab();await x.auth.reconcile();f.switchTo(b);
 assert.deepEqual(await x.auth.logout(),{kind:'stale'});assert.equal(f.posts(),0);
 assert.deepEqual(await x.auth.login({email:'fixture@example.test',password:'fixture'}),{kind:'stale'});
 assert.equal(f.posts(),0);const r=await x.auth.reconcile();assert.equal(r.kind,'ready');if(r.kind==='ready')assert.equal(r.session.userId,b.userId);
});
test('login after confirmed signed-out remains blocked until explicit session reconciliation',async()=>{
 const f=fixture(),x=f.tab(),y=f.tab();await y.auth.reconcile();f.switchTo(null);
 assert.deepEqual(await x.auth.login({email:'fixture@example.test',password:'fixture'}),{kind:'complete'});
 assert.equal(f.posts(),1);assert.equal(x.auth.current().kind,'blocked');assert.equal(y.auth.current().kind,'blocked');
 const r=await x.auth.reconcile();assert.equal(r.kind,'ready');if(r.kind==='ready')assert.equal(r.session.userId,b.userId);
});
test('refresh-needed login cannot overwrite existing session; failed mutation never auto-retries',async()=>{
 const f=fixture(),x=f.tab();f.requireRefresh();
 assert.deepEqual(await x.auth.login({email:'fixture@example.test',password:'fixture'}),{kind:'stale'});assert.equal(f.posts(),0);
 assert.equal((await x.auth.reconcile()).kind,'ready');assert.equal(f.posts(),1);
 f.fail();assert.deepEqual(await x.auth.logout(),{kind:'unavailable'});assert.equal(f.posts(),2);assert.equal(x.auth.current().kind,'blocked');
});
test('unsupported environment cannot open a candidate browser session',()=>{
 assert.equal(browserTenantAuth(host,org,()=>{}),null);
});
