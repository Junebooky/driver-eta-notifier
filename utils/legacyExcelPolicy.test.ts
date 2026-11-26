import test from 'node:test';
import assert from 'node:assert/strict';
import {hasLegacyExcelAccess,assertLegacyExcelAccess,VIP_EXCEL_ORG} from '../lib/driverReports/legacyExcelPolicy';
import {currentWorkbook,activeLedgerYear,processReport,runReportWorker,submitReport,registerWorkbook,replaceWorkbook,approveMonth,drainReports} from '../lib/driverReports/service';
import {storeWorkbook} from '../lib/driverReports/storage';
import {supabaseAdmin as db} from '../lib/supabase/server';
import type {CockpitAuthSession} from '../lib/auth/serverAuth';
const id='a0000000-0000-4000-8000-000000000001';
const wrong='chauffeur_service';
test('legacy Excel explicitly belongs to VIP; no missing or normalized org fallback',()=>{
 assert.equal(hasLegacyExcelAccess(VIP_EXCEL_ORG),true);
 for(const org of [wrong,'VIP_LIMOUSINE_KOREA',' vip_limousine_korea','',null,undefined,{},true]){
  assert.equal(hasLegacyExcelAccess(org),false);assert.throws(()=>assertLegacyExcelAccess(org));
 }
});
test('all legacy Excel entry points reject foreign scope before touching DB or storage',async()=>{
 const originalFrom=db.from,originalRpc=db.rpc;
 let calls=0;
 const foreign={userId:id,driverId:id,role:'driver',org:wrong} as unknown as CockpitAuthSession;
 try{
  db.from=(()=>{calls++;throw Error('unexpected DB access');}) as unknown as typeof db.from;
  db.rpc=(()=>{calls++;throw Error('unexpected RPC access');}) as unknown as typeof db.rpc;
  const bytes=new Uint8Array();
  for(const fn of [
    ()=>currentWorkbook(wrong),()=>activeLedgerYear(wrong),()=>processReport(wrong,id,id),
    ()=>runReportWorker(wrong),()=>runReportWorker(''),()=>submitReport(foreign,'report',id),
    ()=>registerWorkbook(foreign,bytes,'fixture.xlsx'),()=>replaceWorkbook(foreign,bytes,'fixture.xlsx',2026,id),
    ()=>approveMonth(foreign,2026,11,'10월'),()=>drainReports(foreign),()=>storeWorkbook(wrong,bytes)
  ])await assert.rejects(fn(),/Excel/);
  assert.equal(calls,0);
 }finally{db.from=originalFrom;db.rpc=originalRpc;}
});
test('cron defaults to VIP only and rejects any unexpected foreign lease before processing',async()=>{
 const originalFrom=db.from,originalRpc=db.rpc;
 const args:unknown[]=[];let reads=0;let jobs:unknown[]=[];
 try{
  db.from=(()=>{reads++;throw Error('unexpected workbook read');}) as unknown as typeof db.from;
  db.rpc=(async(name:string,p:unknown)=>{assert.equal(name,'claim_report_jobs');args.push(p);return {data:jobs,error:null};}) as unknown as typeof db.rpc;
  assert.equal(await runReportWorker(),0);
  assert.deepEqual(args[0],{p_limit:15,p_org:VIP_EXCEL_ORG,p_id:null});
  assert.equal(await runReportWorker(VIP_EXCEL_ORG,1,id),0);
  assert.deepEqual(args[1],{p_limit:1,p_org:VIP_EXCEL_ORG,p_id:id});
  jobs=[{org_id:VIP_EXCEL_ORG,submission_id:id,lease_token:id},{org_id:wrong,submission_id:id,lease_token:id}];
  await assert.rejects(()=>runReportWorker(),/Excel/);
  assert.equal(reads,0);
 }finally{db.from=originalFrom;db.rpc=originalRpc;}
});
