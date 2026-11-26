import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LoginForm} from '../components/LoginForm';
import {TenantPresentationProvider} from '../components/taas/TenantPresentation';
import {resolveTenantEntry,tenantEntryDestination,tenantPresentation} from '../lib/taas/tenantEntry';
import {tenantEntryCandidate} from '../lib/taas/tenantEntry.server';
import type {TenantIdentity} from '../lib/auth/tenantIdentity';

const host='chauffeur.example.test',org='chauffeur_service',uuid='a0000000-0000-4000-8000-000000000001';
const brand={hostname:host,orgId:org,displayName:'Chauffeur fixture',appName:'Chauffeur Cockpit fixture',shortName:'Chauffeur',description:'fixture app',icon192:'a'.repeat(64),icon512:'b'.repeat(64)};
const identity:TenantIdentity={hostname:host,orgId:org,userId:uuid,sessionId:uuid,driverId:null,role:'company_owner',issuedAt:1,expiresAt:2,home:'/hq?tab=dashboard'};
test('same domain brand and verified membership must match, admin/driver use existing destinations',async()=>{
 let verified=0;
 const deps={brand:async()=>brand,verify:async()=>{verified++;return identity;}};
 const anonymous=await resolveTenantEntry(host,null,deps);assert.equal(anonymous.kind,'login');assert.equal(verified,0);
 assert.equal(tenantEntryDestination(anonymous,'/'),'/login');
 const admin=await resolveTenantEntry(host,'verified fixture',deps);assert.equal(admin.kind,'authorized');assert.equal(tenantEntryDestination(admin,'/'),'/hq?tab=dashboard');
 const driver=await resolveTenantEntry(host,'verified fixture',{...deps,verify:async()=>({...identity,role:'driver',driverId:uuid,home:'/'})});
 assert.equal(driver.kind,'authorized');assert.equal(tenantEntryDestination(driver,'/hq'),'/');
 for(const path of ['//evil.test','https://evil.test','/report','/driver/connect','/representative','/api/auth/session','/hq?next=//evil.test'])assert.equal(tenantEntryDestination(admin,path),null);
 for(const bad of [{...identity,orgId:'vip_limousine_korea'},{...identity,hostname:'vip.example.test'},{...identity,home:'/' as const},{...identity,driverId:uuid}]){
  assert.equal((await resolveTenantEntry(host,'token',{...deps,verify:async()=>bad})).kind,'unavailable');
 }
 assert.equal((await resolveTenantEntry('vip.example.test','token',deps)).kind,'unavailable');
 assert.equal((await resolveTenantEntry(host,'revoked',{...deps,verify:async()=>null})).kind,'login');
 assert.equal((await tenantEntryCandidate(host,'token')).kind,'unavailable');
});
test('existing login presentation reused, candidate has no legacy QA or role controls and no active submission',()=>{
 const legacy=renderToStaticMarkup(createElement(LoginForm));
 assert.match(legacy,/VIP LIMOUSINE KOREA/);assert.match(legacy,/빠른 선택 로그인/);assert.match(legacy,/본사 관리자 로그인/);
 const candidate=renderToStaticMarkup(createElement(TenantPresentationProvider,{brand:tenantPresentation(brand),children:createElement(LoginForm)}));
 assert.match(candidate,/Chauffeur fixture/);assert.match(candidate,/Chauffeur Cockpit fixture/);
 assert.match(candidate,/계정 이메일/);assert.match(candidate,/비밀번호/);assert.match(candidate,/업체 로그인 연동 준비 중/);
 assert.match(candidate,/<fieldset disabled=""/);
 assert.doesNotMatch(candidate,/VIP LIMOUSINE KOREA|빠른 선택 로그인|본사 관리자 로그인|기사 바로 로그인|관리자 바로 로그인/);
});
