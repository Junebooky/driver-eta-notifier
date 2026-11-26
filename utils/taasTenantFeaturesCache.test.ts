import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTenantFeaturePolicy,legacyExcelVisible,resolveTenantHqTab} from '../lib/taas/tenantFeatures';
import {loadTenantFeaturePolicy,tenantFeatureCandidate} from '../lib/taas/tenantFeatures.server';
import {createTenantResponseCache} from '../lib/taas/tenantResponseCache';
import type {TenantIdentity} from '../lib/auth/tenantIdentity';
const user='a0000000-0000-4000-8000-000000000001',session='b0000000-0000-4000-8000-000000000002',driver='c0000000-0000-4000-8000-000000000003';
const vip:TenantIdentity={orgId:'vip_limousine_korea',hostname:'vip.example.test',userId:user,sessionId:session,role:'company_owner',driverId:null,home:'/hq?tab=dashboard',issuedAt:1,expiresAt:2};
const ch={...vip,orgId:'chauffeur_service',hostname:'chauffeur.example.test'};
test('only VIP with explicit server flag may show Excel; no direct tab bypass',async()=>{
 assert.deepEqual(parseTenantFeaturePolicy(vip,{...vip,legacyReportExcel:true}),{legacyReportExcel:true});
 assert.deepEqual(parseTenantFeaturePolicy(ch,{...ch,legacyReportExcel:true}),{legacyReportExcel:false});
 assert.equal(parseTenantFeaturePolicy(ch,{...vip,legacyReportExcel:true}),null);
 assert.equal(legacyExcelVisible(null),true);assert.equal(legacyExcelVisible({}),false);
 assert.equal(resolveTenantHqTab('excel_import',{}),'dispatch');
 assert.equal(resolveTenantHqTab('driving_logs',{}),'driving_logs');
 assert.equal(resolveTenantHqTab('excel_import',null),'excel_import');
 let n=0;
 assert.equal(await loadTenantFeaturePolicy(vip.hostname,'token',{verify:async()=>++n===1?vip:null,load:async()=>({...vip,legacyReportExcel:true})}),null);
 assert.equal(await tenantFeatureCandidate(ch.hostname,'token'),null);
});
test('cache isolates same account across companies and role/session changes, late response cannot repopulate',()=>{
 const cache=createTenantResponseCache(),a=cache.activate(vip)!;
 assert.ok(a.set('expenses',[{amount:8000}]));assert.deepEqual(a.get('expenses'),[{amount:8000}]);
 const same=cache.activate(vip)!;assert.deepEqual(same.get('expenses'),[{amount:8000}]);
 const b=cache.activate(ch)!;assert.equal(b.get('expenses'),undefined);assert.equal(a.set('expenses',[{amount:1}]),false);
 assert.ok(b.set('expenses',[{amount:3000}]));
 const c=cache.activate({...ch,role:'driver',driverId:driver})!;assert.equal(c.get('expenses'),undefined);assert.equal(b.get('expenses'),undefined);
 const d=cache.activate({...ch,sessionId:driver})!;assert.equal(c.set('expenses',[]),false);assert.equal(d.get('expenses'),undefined);
 cache.clear();assert.equal(d.set('expenses',[]),false);
 const again=cache.activate(vip)!;assert.equal(again.get('expenses'),undefined);assert.equal(a.set('expenses',[]),false);
 assert.equal(cache.activate({...vip,orgId:''}),null);assert.equal(again.set('expenses',[]),false);
});
test('cache never shares mutable reference or accepts arbitrary storage keys',()=>{
 const cache=createTenantResponseCache(),lease=cache.activate(ch)!;const value={items:[1]};
 assert.ok(lease.set('bookings',value));value.items.push(2);
 const out=lease.get<typeof value>('bookings')!;out.items.push(3);assert.deepEqual(lease.get('bookings'),{items:[1]});
 assert.equal(lease.set('../foreign',value),false);assert.equal(lease.set('bookings',undefined),false);
});
