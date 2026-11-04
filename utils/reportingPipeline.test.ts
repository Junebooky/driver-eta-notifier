import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '../lib/supabase/server';
import { signCockpitSession } from '../lib/auth/serverAuth';
import { GET as overview } from '../app/api/hq/reporting/summary/route';
import { loadDrivingLogDraft,saveDrivingLogDraft } from './drivingLog';
import { loadExpenses,saveExpenses,type ExpenseItem } from './expense';
import { prepareExpenseReceipt } from './receiptSubmission';
import { fetchHqExpensesFromDb,getHqExpenses,saveHqExpenses,submitDriverExpensesToHqDb,getHqExpenseKpiSummary } from './expenseHqStorage';
import { getKstTodayDateStr } from './dispatchConflictDetector';
import type { DriverProfile } from '../types';
const driver='a0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000001';
const item:ExpenseItem={id:'c0000000-0000-4000-8000-000000000001',category:'parking',date:'2026-12-01',time:'10:00',merchant:'주차장',amount:1000,paymentMethod:'company_card',createdAt:'2026-12-01',updatedAt:'2026-12-01'};

test('driver-local drafts are scoped and the same navigation report reopens with one submission ID',()=>{
 const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value)};
 Object.assign(globalThis,{window:{},localStorage:storage});
 const profile:DriverProfile={driverId:driver,driverName:'같은 이름',vehicleNo:'같은 차량',phone:'',defaultNavi:'tmap'};
 try{
  const log=loadDrivingLogDraft(profile,undefined,'2026-12-01','booking-one');log.stops=[{id:'actual',time:'10:00',place:'확인된 장소'}];log.status='submitted';saveDrivingLogDraft(log);
  const reopened=loadDrivingLogDraft(profile,undefined,'2026-12-01','booking-one');assert.equal(reopened.submissionId,log.submissionId);assert.equal(reopened.status,'submitted');assert.equal(reopened.stops.length,1);
  assert.equal(loadDrivingLogDraft({...profile,driverId:other},undefined,'2026-12-01','booking-one').stops.length,0);
  assert.equal(loadDrivingLogDraft(profile,undefined,'2026-12-01','booking-two').stops.length,0);
  saveExpenses([item],false,driver);assert.equal(loadExpenses(driver).items.length,1);assert.equal(loadExpenses(other).items.length,0);assert.equal(loadExpenses(other).isDemo,false);
 }finally{Reflect.deleteProperty(globalThis,'window');Reflect.deleteProperty(globalThis,'localStorage');}
});

test('expense retry retains UUID, removes base64 from JSON, rejects partial saves and clears stale HQ rows on an empty server response',async()=>{
 const original=globalThis.fetch;let body='';
 globalThis.fetch=(async(_url:unknown,options:RequestInit={})=>{body=String(options.body);throw new Error('lost response');}) as typeof fetch;
 const ready={...item,receiptUrl:'data:image/png;base64,aGVsbG8=',receiptStoragePath:`vip_limousine_korea/expenses/receipts/${driver}/proof.png`};
 try{
  assert.equal((await submitDriverExpensesToHqDb([ready])).ok,false);const first=JSON.parse(body);assert.equal(first.items[0].id,item.id);assert.equal(first.items[0].receiptUrl,undefined);
  globalThis.fetch=(async(_url:unknown,options:RequestInit={})=>{body=String(options.body);return Response.json({ok:true,count:1,totalAmount:1000,expenses:[{...item,rawDate:item.date,status:'검수 대기'}]});}) as typeof fetch;
  assert.equal((await submitDriverExpensesToHqDb([ready])).ok,true);assert.equal(JSON.parse(body).items[0].id,first.items[0].id);
  globalThis.fetch=(async()=>Response.json({ok:true,expenses:[]})) as typeof fetch;
  assert.equal((await submitDriverExpensesToHqDb([ready])).ok,false);
  saveHqExpenses([{...item,no:1,rawDate:item.date,status:'검수 대기',driverName:'같은 이름',vehicleModel:'차량',vehiclePlate:'차량',categoryLabel:'주차비',paymentMethodLabel:'회사 카드',hasReceiptImage:false,submittedAt:'',submittedDate:''}]);
  assert.equal((await fetchHqExpensesFromDb()).ok,true);assert.equal(getHqExpenses().length,0);
  await assert.rejects(prepareExpenseReceipt({...item,receiptUrl:'/images/receipt_sample_cu.jpg'}),/샘플/);
 }finally{globalThis.fetch=original;saveHqExpenses([]);}
});

test('the HQ accumulated summary requires HQ authorization and never replaces an unavailable DB with fake zero totals',async()=>{
 const original=supabaseAdmin.rpc;let calls=0;
 supabaseAdmin.rpc=(async()=>{calls++;return {data:null,error:{message:'missing migration'}};}) as unknown as typeof original;
 const request=(role?:'driver'|'hq_admin')=>new NextRequest('http://localhost/api/hq/reporting/summary',{headers:role?{authorization:'Bearer '+signCockpitSession({userId:driver,driverId:driver,role,org:'vip_limousine_korea'})}:{}});
 try{
  assert.equal((await overview(request())).status,401);assert.equal((await overview(request('driver'))).status,403);assert.equal(calls,0);
  const failure=await overview(request('hq_admin'));assert.equal(failure.status,503);assert.equal((await failure.json()).summary,undefined);
  supabaseAdmin.rpc=(async(_name:string,args:{p_org:string})=>{assert.equal(args.p_org,'vip_limousine_korea');return {data:{logs:{total:0},expenses:{total:0}},error:null};}) as unknown as typeof original;
  const empty=await overview(request('hq_admin'));assert.equal(empty.status,200);assert.equal((await empty.json()).summary.logs.total,0);assert.equal(empty.headers.get('cache-control'),'no-store');
 }finally{supabaseAdmin.rpc=original;}
});

test('today/month expense KPIs use actual Korean dates and do not count rejected expenses as incurred totals',()=>{
 const today=getKstTodayDateStr();const base={...item,no:1,submittedAt:'',submittedDate:'',driverName:'기사',vehicleModel:'차량',vehiclePlate:'차량',categoryLabel:'주차비',paymentMethodLabel:'회사 카드',hasReceiptImage:false};
 const result=getHqExpenseKpiSummary([{...base,id:'one',rawDate:today,status:'검수 대기'},{...base,id:'two',rawDate:'2000-01-01',status:'승인 완료'},{...base,id:'three',rawDate:today,status:'반려'}]);
 assert.equal(result.todayTotal,1000);assert.equal(result.monthTotal,1000);assert.equal(result.totalCount,3);
});
