import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantSessionCache,parseTenantSessionView} from '../lib/auth/tenantSessionCache';
import type {TenantAuthLock,TenantRead} from '../lib/auth/tenantAuthCoordinator';
const host='vip.example.test',org='vip_limousine_korea';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const session={hostname:host,orgId:org,userId:id(1),sessionId:id(2),role:'company_admin',driverId:null,expiresAt:200,home:'/hq?tab=dashboard'};
function setup(){
 let now=100,reply:TenantRead<unknown>={kind:'authenticated',session};
 const lock:TenantAuthLock={request:async(_name,work)=>work()};
 const c=createTenantSessionCache({hostname:host,orgId:org,lock,now:()=>now,read:async()=>reply,refresh:async()=>{assert.fail('unexpected refresh');}});
 return {c,setTime:(n:number)=>{now=n;},setReply:(r:TenantRead<unknown>)=>{reply=r;}};
}
test('strict identity projection rejects wrong host, organization, role, home, expiry and malformed ids',()=>{
 assert.deepEqual(parseTenantSessionView({...session,accessToken:'never-copy'},host,org,100),session);
 for(const patch of [{hostname:'other.example.test'},{orgId:'other_org'},{userId:1},{sessionId:undefined},{driverId:id(3)},{role:'owner'},{home:'/'},{expiresAt:100},{expiresAt:Infinity}])assert.equal(parseTenantSessionView({...session,...patch},host,org,100),null);
 assert.ok(parseTenantSessionView({...session,role:'driver',driverId:id(3),home:'/'},host,org,100));
});
test('account switch immediately invalidates old leases and late writes',async()=>{
 const {c,setReply}=setup();const a=await c.reconcile();assert.equal(a.kind,'ready');if(a.kind!=='ready')return;
 assert.equal(a.cache.set('bookings',[1]),true);
 setReply({kind:'authenticated',session:{...session,userId:id(3),sessionId:id(4)}});
 const pending=c.reconcile();assert.equal(c.current().kind,'blocked');assert.equal(a.cache.get('bookings'),undefined);assert.equal(a.cache.set('bookings',[2]),false);
 const b=await pending;assert.equal(b.kind,'ready');if(b.kind!=='ready')return;
 assert.equal(b.cache.get('bookings'),undefined);assert.equal(b.session.userId,id(3));assert.equal(b.cache.set('bookings',[3]),true);
 setReply({kind:'signed-out'});assert.equal((await c.reconcile()).kind,'signed-out');assert.equal(b.cache.set('bookings',[4]),false);
});
test('expiration disables issued leases without requiring a new reconciliation',async()=>{
 const {c,setTime}=setup();const a=await c.reconcile();assert.equal(a.kind,'ready');if(a.kind!=='ready')return;
 a.cache.set('expenses',[1]);setTime(200);assert.equal(a.cache.get('expenses'),undefined);assert.equal(a.cache.set('expenses',[2]),false);assert.equal(c.current().kind,'blocked');
});
test('invalidation during an in-flight read prevents stale activation and refresh',async()=>{
 let resolve!:(v:TenantRead<unknown>)=>void;let started!:()=>void;
 const gate=new Promise<TenantRead<unknown>>(r=>{resolve=r;});const entered=new Promise<void>(r=>{started=r;});
 const lock:TenantAuthLock={request:async(_name,work)=>work()};
 const c=createTenantSessionCache({hostname:host,orgId:org,lock,now:()=>100,read:async()=>{started();return gate;},refresh:async()=>{assert.fail('superseded request must not refresh');}});
 const pending=c.reconcile();await entered;c.invalidate();resolve({kind:'refresh-required'});assert.equal((await pending).kind,'superseded');assert.equal(c.current().kind,'blocked');
});
test('refresh result is checked against host and org, unavailable response clears cache',async()=>{
 const lock:TenantAuthLock={request:async(_name,work)=>work()};let n=0;
 const c=createTenantSessionCache({hostname:host,orgId:org,lock,now:()=>100,read:async()=>({kind:'refresh-required'}),refresh:async()=>{n++;return {kind:'authenticated',session:{...session,orgId:'other_org'}};}});
 assert.equal((await c.reconcile()).kind,'unavailable');assert.equal(n,1);
 const {c:other,setReply}=setup();const a=await other.reconcile();assert.equal(a.kind,'ready');if(a.kind!=='ready')return;
 setReply({kind:'unavailable'});assert.equal((await other.reconcile()).kind,'unavailable');assert.equal(a.cache.set('logs',[]),false);
});
