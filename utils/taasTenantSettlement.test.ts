import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSettlement,validateSettlementContract} from '../lib/settlement/serverLedger';
import {loadTenantSettlementSource,listTenantSettlements,downloadTenantSettlement,tenantSettlementSourceCandidate,mutateTenantSettlement,tenantSettlementMutationCandidate,type SettlementWriteDependencies,type SettlementReadDependencies} from '../lib/taas/tenantSettlement.server';
import type {TenantIdentity} from '../lib/auth/tenantIdentity';
const id='a0000000-0000-4000-8000-000000000001',driver='b0000000-0000-4000-8000-000000000002',log='c0000000-0000-4000-8000-000000000003',expense='d0000000-0000-4000-8000-000000000004',doc='e0000000-0000-4000-8000-000000000005';
const org='chauffeur_service',vip='vip_limousine_korea',hash='a'.repeat(32);
const identity:TenantIdentity={orgId:org,userId:id,sessionId:id,hostname:'chauffeur.example.test',role:'company_admin',driverId:null,issuedAt:1,expiresAt:2,home:'/hq?tab=dashboard'};
const source={hash,schedule:{id,org_id:org,date:'2027-01-01',customer_name:'fixture',event_name:'event',vehicle_model:'van',vehicle_plate:'12가 3456',driver_name:'fixture',driver_id:driver,schedule_meta:{}},
 logs:[{id:log,organization_id:org,booking_id:id,driver_id:driver,status:'승인 완료',customer_service_start:'09:00',customer_service_end:'20:00'}],
 expenses:[{id:expense,organization_id:org,booking_id:id,driving_log_id:log,expense_date:'2027-01-01',category:'toll',amount:8000,merchant:'TG',billable_to_customer:true,status:'승인 완료'}]};
const contract=validateSettlementContract({reference:'FIXTURE-CONTRACT',laborReference:'FIXTURE-LABOR',baseRate:800000,overtimeHourlyRate:60000,driverLaborCost:150000,baseHours:10,roundingMinutes:30,vatMode:'excluded'});
const deps=(payload:unknown):SettlementReadDependencies=>({verify:async()=>identity,read:async()=>({data:payload,error:null})});
test('tenant source uses existing calculations; no foreign log, expense or reservation',async()=>{
 const good=await loadTenantSettlementSource(identity.hostname,'token',id,deps(source));
 assert.ok(good.ok);if(good.ok){const t=calculateSettlement(good.data.source,contract);assert.equal(t.overtimeMinutes,60);assert.equal(t.billableExpenses,8000);assert.equal(t.grandTotal,954800);}
 for(const bad of [{...source,schedule:{...source.schedule,org_id:vip}},{...source,schedule:{...source.schedule,org_id:null}},{...source,logs:[{...source.logs[0],organization_id:vip}]},{...source,expenses:[{...source.expenses[0],organization_id:vip}]},{...source,expenses:[{...source.expenses[0],driving_log_id:driver}]}]){
  assert.equal((await loadTenantSettlementSource(identity.hostname,'token',id,deps(bad))).ok,false);
 }
 assert.equal((await tenantSettlementSourceCandidate(identity.hostname,'token',id)).ok,false);
});
test('admin list and download scope; no unauthorized calls or unissued/stale exports',async()=>{
 const good=await loadTenantSettlementSource(identity.hostname,'token',id,deps(source));assert.ok(good.ok);if(!good.ok)return;
 const document={id:doc,organization_id:org,schedule_id:id,status:'issued',version:4,source_hash:hash,source_snapshot:good.data.source,contract_snapshot:contract,totals_snapshot:calculateSettlement(good.data.source,contract),approved_at:'2027-01-01',issued_at:'2027-01-01'};
 assert.ok((await listTenantSettlements(identity.hostname,'token',deps({documents:[document],schedules:[source.schedule]}))).ok);
 assert.equal((await listTenantSettlements(identity.hostname,'token',deps({documents:[{...document,organization_id:vip}],schedules:[]}))).ok,false);
 const download: SettlementReadDependencies={verify:async()=>identity,read:async(_i,op)=>({data:op==='document'?document:source,error:null})};
 const exported=await downloadTenantSettlement(identity.hostname,'token',doc,download);assert.ok(exported.ok);if(exported.ok){assert.ok(!exported.data.includes('150000'));assert.ok(exported.data.includes('954800'));}
 for(const d of [{...document,status:'approved'},{...document,organization_id:vip},{...document,source_hash:'b'.repeat(32)}]){
  assert.equal((await downloadTenantSettlement(identity.hostname,'token',doc,{...download,read:async(_i,op)=>({data:op==='document'?d:source,error:null})})).ok,false);
 }
 let calls=0;
 const denied={...download,verify:async()=>({...identity,role:'driver' as const,driverId:driver}),read:async()=>{calls++;return {data:source,error:null};}};
 assert.equal((await loadTenantSettlementSource(identity.hostname,'token',id,denied)).ok,false);assert.equal(calls,0);
 let n=0;
 assert.equal((await loadTenantSettlementSource(identity.hostname,'token',id,{...deps(source),verify:async()=>++n===1?identity:null})).ok,false);
});

test('existing settlement state machine uses server source and pricing, rejects forged fields and stale approval',async()=>{
 const good=await loadTenantSettlementSource(identity.hostname,'token',id,deps(source));assert.ok(good.ok);if(!good.ok)return;
 let current:Record<string,unknown>|null=null,commits=0;
 const write: SettlementWriteDependencies={
  verify:async()=>identity,
  read:async()=>({data:{...source,document:current},error:null}),
  commit:async(i,c)=>{
   commits++;assert.equal(i.orgId,org);assert.equal(c.hash,hash);
   const status={prepare:'draft',price:'reviewing',approve:'approved',issue:'issued'}[c.action];
   current={...current,id:doc,organization_id:org,schedule_id:id,version:c.expectedVersion+1,status,source_hash:hash,
    ...(c.source?{source_snapshot:c.source}:{}),...(c.contract?{contract_snapshot:c.contract,totals_snapshot:c.totals}:{})};
   return {data:current,error:null};
  }
 };
 const run=(action:string,expectedVersion:number,extra:Record<string,unknown>={})=>mutateTenantSettlement(identity.hostname,'token',{scheduleId:id,action,expectedVersion,...extra},write);
 assert.equal((await run('prepare',0,{totals:{grandTotal:1}})).ok,false);assert.equal(commits,0);
 assert.ok((await run('prepare',0)).ok);assert.equal((await run('price',0,{contract})).ok,false);
 assert.ok((await run('price',1,{contract})).ok);
 const priced=current as unknown as Record<string,unknown>;
 const totals=priced.totals_snapshot as Record<string,unknown>;
 // JSONB key ordering must not break genuine approvals.
 priced.totals_snapshot=Object.fromEntries(Object.entries(totals).reverse());
 assert.equal(totals.grandTotal,954800);
 priced.totals_snapshot={...totals,grandTotal:1};
 assert.equal((await run('approve',2)).ok,false);
 priced.totals_snapshot=totals;
 assert.ok((await run('approve',2)).ok);assert.ok((await run('issue',3)).ok);
 assert.equal((await run('prepare',4)).ok,false);assert.equal(commits,4);
 assert.equal((await tenantSettlementMutationCandidate(identity.hostname,'token',{scheduleId:id,action:'prepare',expectedVersion:0})).ok,false);
});
