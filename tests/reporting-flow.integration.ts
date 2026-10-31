import type { Client } from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '../lib/supabase/server';
import { signCockpitSession } from '../lib/auth/serverAuth';
import * as logs from '../app/api/driving-logs/route';
import * as expenses from '../app/api/expenses/route';
import * as receipts from '../app/api/expenses/receipt/route';
import { GET as summary } from '../app/api/hq/reporting/summary/route';
import { prepareExpenseReceipt } from '../utils/receiptSubmission';
import { submitDriverExpensesToHqDb,fetchHqExpensesFromDb } from '../utils/expenseHqStorage';
import { submitDriverLogToHqDb,fetchHqDrivingLogsFromDb } from '../utils/drivingLogHqStorage';
import type { ExpenseItem } from '../utils/expense';

/** Actual API handlers and shipped client submission helpers, with real Postgres and isolated Auth/Storage fixtures. */
export async function verifyReportingFlow(admin:Client,writer:Client,reader:Client){
  const org='vip_limousine_korea',driver=randomUUID(),other=randomUUID(),booking=randomUUID(),otherBooking=randomUUID();
  await admin.query('INSERT INTO cockpit.drivers(id,driver_name) VALUES($1,$3),($2,$3)',[driver,other,'동명이인']);
  await admin.query("INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,end_date,end_time,driver_id,vehicle_id,vehicle_plate,dispatch_status,schedule_meta) VALUES($1,'vip_limousine_korea','2026-12-12','09:00','2026-12-12','12:00',$2,$4,'fixture-car-one','published','{\"serviceMode\":\"with_driver\"}'),($3,'vip_limousine_korea','2026-12-12','13:00','2026-12-12','18:00',$2,$5,'fixture-car-two','published','{\"serviceMode\":\"with_driver\"}')",[booking,driver,otherBooking,randomUUID(),randomUUID()]);
  const token=(role:'driver'|'hq_admin',driverId=driver)=>signCockpitSession({userId:role==='driver'?driverId:'fixture-hq',org,role,driverId:role==='driver'?driverId:undefined,driverName:'동명이인'});
  let actor=token('driver'),storageFailure=false;const files=new Map<string,Buffer>();
  const original={from:supabaseAdmin.from,rpc:supabaseAdmin.rpc,storage:Object.getOwnPropertyDescriptor(supabaseAdmin,'storage'),fetch:globalThis.fetch};
  const column=(key:string)=>{assert.match(key,/^[a-z_]+$/);return '"'+key+'"';};
  const value=(key:string,v:unknown)=>['stops','review_history','audit_history','ocr_details','meta'].includes(key)?JSON.stringify(v):v;
  supabaseAdmin.from=((table:string)=>{
    assert.ok(['driving_logs','expenses','schedules'].includes(table));
    const filters:Array<[string,unknown]>=[],orders:string[]=[];let rows:Record<string,unknown>[]|null=null,patch:Record<string,unknown>|null=null;
    let offset=0,limit=1000;
    const execute=async(single=false)=>{try{
      let sql='';const params:unknown[]=[];
      if(rows){const keys=Object.keys(rows[0]);sql=`INSERT INTO cockpit.${table} (${keys.map(column)}) VALUES `+rows.map(row=>'('+keys.map(key=>{params.push(value(key,row[key]));return '$'+params.length;}).join(',')+')').join(',')+' ON CONFLICT(id) DO UPDATE SET '+keys.filter(k=>k!=='id').map(k=>`${column(k)}=EXCLUDED.${column(k)}`).join(',')+' RETURNING *';}
      else {const where=filters.map(([key,val])=>{if(val===null)return column(key)+' IS NULL';params.push(val);return column(key)+'=$'+params.length;}).join(' AND ');
        if(patch){const assignments=Object.entries(patch).map(([key,val])=>{params.push(value(key,val));return column(key)+'=$'+params.length;});sql=`UPDATE cockpit.${table} SET ${assignments.join(',')}${where?' WHERE '+where:''} RETURNING *`;}
        else sql=`SELECT * FROM cockpit.${table}${where?' WHERE '+where:''}${orders.length?' ORDER BY '+orders.join(','):''} LIMIT ${limit} OFFSET ${offset}`;
      }
      const result=await writer.query(sql,params);const records=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,val])=>[key,val instanceof Date?(key==='date'||key.endsWith('_date')?val.toISOString().slice(0,10):val.toISOString()):val])));return {data:single?records[0] || null:records,error:null};
    }catch(error){const e=error as {message:string;code?:string};return {data:null,error:{message:e.message,code:e.code}};}};
    const q={select:()=>q,eq:(key:string,val:unknown)=>{filters.push([key,val]);return q;},is:(key:string,val:null)=>{filters.push([key,val]);return q;},order:(key:string,options?:{ascending?:boolean})=>{orders.push(column(key)+(options?.ascending===false?' DESC':' ASC'));return q;},range:(start:number,end:number)=>{offset=start;limit=end-start+1;return q;},upsert:(input:Record<string,unknown>|Record<string,unknown>[])=>{rows=Array.isArray(input)?input:[input];return q;},update:(input:Record<string,unknown>)=>{patch=input;return q;},single:()=>execute(true),maybeSingle:()=>execute(true),then:(resolve:unknown,reject:unknown)=>execute().then(resolve as never,reject as never)};return q;
  }) as unknown as typeof supabaseAdmin.from;
  supabaseAdmin.rpc=(async(name:string,args:{p_org:string})=>{assert.equal(name,'reporting_summary');return {data:(await reader.query('SELECT cockpit.reporting_summary($1) result',[args.p_org])).rows[0].result,error:null};}) as unknown as typeof supabaseAdmin.rpc;
  Object.defineProperty(supabaseAdmin,'storage',{configurable:true,value:{from:(bucket:string)=>{assert.equal(bucket,'cockpit-assets');return {upload:async(path:string,data:Buffer)=>{if(storageFailure)return {error:{message:'isolated storage failure'}};if(files.has(path))return {error:{statusCode:'409'}};files.set(path,Buffer.from(data));return {error:null};},download:async(path:string)=>files.has(path)?{data:new Blob([new Uint8Array(files.get(path)!)],{type:'image/png'}),error:null}:{data:null,error:{message:'missing'}}};}}});
  globalThis.fetch=(async(input:unknown,init:RequestInit={})=>{
    const url=new URL(String(input),'http://localhost');const headers=new Headers(init.headers);headers.set('authorization','Bearer '+actor);
    const request=new NextRequest(url,{...init,signal:init.signal || undefined,headers});
    if(url.pathname==='/api/expenses/receipt')return init.method==='POST'?receipts.POST(request):receipts.GET(request);
    if(url.pathname==='/api/expenses')return init.method==='POST'?expenses.POST(request):expenses.GET(request);
    if(url.pathname==='/api/driving-logs')return init.method==='POST'?logs.POST(request):logs.GET(request);
    throw new Error('Unexpected test network request');
  }) as typeof fetch;
  const post=async(route:{POST:(req:NextRequest)=>Promise<Response>},path:string,body:unknown)=>route.POST(new NextRequest('http://localhost'+path,{method:'POST',headers:{authorization:'Bearer '+actor,'content-type':'application/json'},body:JSON.stringify(body)}));
  const query=async()=> (await reader.query('SELECT expense_amount,expense_count FROM cockpit.driving_logs WHERE booking_id=$1',[booking])).rows[0];
  try{
    const item:ExpenseItem={id:randomUUID(),driverId:driver,bookingId:booking,category:'parking',date:'2026-12-12',time:'10:30',merchant:'격리 주차장',amount:8000,paymentMethod:'company_card',receiptUrl:'data:image/png;base64,iVBORw0KGgo=',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    storageFailure=true;await assert.rejects(prepareExpenseReceipt(item),/실패/);assert.equal((await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count,'0');storageFailure=false;
    const ready=await prepareExpenseReceipt(item);await prepareExpenseReceipt(item);assert.equal(files.size,1,'upload retries must reuse the content digest');
    const submitted=await submitDriverExpensesToHqDb([ready],'동명이인','테스트차량','테스트모델',booking);assert.equal(submitted.ok,true,submitted.error);assert.equal(submitted.expenses?.[0].receiptStoragePath,ready.receiptStoragePath);
    assert.equal((await submitDriverExpensesToHqDb([ready],'동명이인','테스트차량','테스트모델',booking)).ok,true);
    assert.equal((await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count,'1');
    const log={id:randomUUID(),driverId:driver,bookingId:booking,driverName:'동명이인',drivingDate:'2026-12-12',clockIn:'09:00',clockOut:'18:00',startKm:'1000',endKm:'1100',passengerCount:3,stops:[{id:'actual',time:'10:00',place:'실제 확인 장소'}],status:'검토 대기' as const,expenseAmount:999999};
    const saved=await submitDriverLogToHqDb(log);assert.equal(saved.ok,true,saved.error);assert.equal(saved.log?.expenseAmount,8000);assert.equal(saved.log?.passengerCount,3);
    assert.deepEqual(await query(),{expense_amount:8000,expense_count:1});
    assert.equal((await reader.query('SELECT driving_log_id FROM cockpit.expenses WHERE id=$1',[item.id])).rows[0].driving_log_id,saved.log?.id);
    const secondDevice=await submitDriverLogToHqDb({...log,id:randomUUID()});assert.equal(secondDevice.ok,true,secondDevice.error);assert.equal(secondDevice.log?.id,saved.log?.id);
    const second=await submitDriverExpensesToHqDb([{...ready,id:randomUUID(),amount:2000}],'동명이인','테스트차량','테스트모델',booking);assert.equal(second.ok,true,second.error);assert.deepEqual(await query(),{expense_amount:10000,expense_count:2});
    const separate=await submitDriverLogToHqDb({...log,id:randomUUID(),bookingId:otherBooking});assert.equal(separate.ok,true,separate.error);assert.equal(separate.log?.expenseAmount,0);
    actor=token('hq_admin');const hqLogs=await fetchHqDrivingLogsFromDb(),hqExpenses=await fetchHqExpensesFromDb();assert.equal(hqLogs.logs.find(row=>row.bookingId===booking)?.expenseAmount,10000);assert.equal(hqExpenses.expenses.length,2);assert.ok(hqExpenses.expenses[0].receiptUrl?.startsWith('/api/expenses/receipt?expenseId='));
    const overview=await summary(new NextRequest('http://localhost/api/hq/reporting/summary',{headers:{authorization:'Bearer '+actor}}));const dashboard=await overview.json();assert.equal(dashboard.summary.expenses.amount,10000);assert.equal(dashboard.summary.logs.submitted,2);assert.equal(dashboard.summary.expenses.unlinked,0);
    const photo=await fetch(hqExpenses.expenses[0].receiptUrl!);assert.equal(photo.status,200);assert.equal((await photo.arrayBuffer()).byteLength,8);
    const approve=await expenses.PUT(new NextRequest('http://localhost/api/expenses',{method:'PUT',headers:{authorization:'Bearer '+actor,'content-type':'application/json'},body:JSON.stringify({id:item.id,status:'승인 완료'})}));assert.equal(approve.status,200);
    actor=token('driver');const own=await fetchHqExpensesFromDb();assert.equal(own.expenses.find(row=>row.id===item.id)?.status,'승인 완료');
    actor=token('driver',other);assert.equal((await fetch(hqExpenses.expenses[0].receiptUrl!)).status,403);assert.equal((await fetchHqDrivingLogsFromDb()).logs.length,0);
    actor=token('driver');
    const malicious=await post(expenses,'/api/expenses',{...item,id:randomUUID(),receiptUrl:undefined,drivingLogId:separate.log!.id,receiptStoragePath:ready.receiptStoragePath});assert.equal(malicious.status,403);
    const before=(await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count;
    await assert.rejects(writer.query("INSERT INTO cockpit.expenses(id,organization_id,driver_id,driver_name,booking_id,expense_date,expense_time,category,amount,merchant,status,driving_log_id) VALUES($1,$2,$3,'동명이인',$4,'2026-12-12','11:00','parking',1000,'정상','검수 대기',NULL),($5,$2,$3,'동명이인',$4,'2026-12-12','11:00','parking',1000,'잘못된 연결','검수 대기',$6)",[randomUUID(),org,driver,booking,randomUUID(),separate.log!.id]),{code:'23514'});
    assert.equal((await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count,before);assert.deepEqual(await query(),{expense_amount:10000,expense_count:2});
    await writer.query("UPDATE cockpit.expenses SET status='반려' WHERE id=$1",[second.expenses![0].id]);assert.deepEqual(await query(),{expense_amount:8000,expense_count:1});
    await writer.query('DELETE FROM cockpit.expenses WHERE id=$1',[second.expenses![0].id]);assert.deepEqual(await query(),{expense_amount:8000,expense_count:1});
    const navigation={...log,id:randomUUID(),bookingId:undefined,drivingDate:'2026-12-13',status:'draft' as const,startKm:'',endKm:'',stops:[{id:'navigation-one',time:'',place:'공항',departureTime:'09:00',actionIdempotencyKey:'nav-one'}]};
    const draft=await submitDriverLogToHqDb(navigation);assert.equal(draft.ok,true,draft.error);
    const nextStop={id:'navigation-two',time:'',place:'호텔',departureTime:'10:00',actionIdempotencyKey:'nav-two'};
    const append=await submitDriverLogToHqDb({...navigation,id:randomUUID(),stops:[nextStop]});assert.equal(append.ok,true,append.error);assert.equal(append.log?.id,draft.log?.id);assert.equal(append.log?.stops.length,2);
    const finish=await submitDriverLogToHqDb({...navigation,id:draft.log!.id,status:'검토 대기',startKm:'1000',endKm:'1050',stops:[{...nextStop,time:'11:00'}]});assert.equal(finish.ok,true,finish.error);assert.equal(finish.log?.stops.length,1);assert.equal(finish.log?.distanceKm,'50 km');
    console.log('PASS actual navigation draft append/replay, same-row final submission and deliberate route edit');
    await admin.query('SET ROLE authenticated');await assert.rejects(admin.query('SELECT * FROM cockpit.expenses'),{code:'42501'});await assert.rejects(admin.query('SELECT cockpit.reporting_summary($1)',[org]),{code:'42501'});await admin.query('RESET ROLE');
    console.log('PASS reporting flow: client receipt upload → expense API → real Postgres → report linking/totals → HQ summary/read/photo/review → driver status; retries, other-driver denial and batch rollback');
  }finally{supabaseAdmin.from=original.from;supabaseAdmin.rpc=original.rpc;if(original.storage)Object.defineProperty(supabaseAdmin,'storage',original.storage);globalThis.fetch=original.fetch;}
}
