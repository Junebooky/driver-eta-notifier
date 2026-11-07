import * as custody from '../app/api/vehicle-custody/route';
import * as custodyPhotos from '../app/api/vehicle-custody/photo/route';
import { verifyCustodyFlow } from './vehicle-custody-flow.integration';
import * as dispatchRoute from '../app/api/schedules/dispatch/route';
import { GET as fleetAvailability } from '../app/api/fleet/availability/route';
import * as operationStatus from '../app/api/schedules/operation-status/route';
import { VIP_REAL_VEHICLES } from '../utils/vehicleData';
import { getKstTodayDateStr, shiftIsoDate } from '../utils/dispatchConflictDetector';
import { types,type Client } from 'pg';
import * as acknowledgment from '../app/api/schedules/ack/route';
import { GET as readSchedules } from '../app/api/schedules/route';
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
import { submitDriverExpensesToHqDb,fetchHqExpensesFromDb,updateHqExpenseReviewDb,getHqExpenses } from '../utils/expenseHqStorage';
import { submitDriverLogToHqDb,fetchHqDrivingLogsFromDb } from '../utils/drivingLogHqStorage';
import { expenseCorrectionFields } from '../utils/expenseReview';
import type { ExpenseItem } from '../utils/expense';

/** Actual API handlers and shipped client submission helpers, with real Postgres and isolated Auth/Storage fixtures. */
export async function verifyReportingFlow(admin:Client,writer:Client,reader:Client){
  const org='vip_limousine_korea',driver=randomUUID(),other=randomUUID(),booking=randomUUID(),otherBooking=randomUUID();
  await admin.query("INSERT INTO cockpit.drivers(id,driver_name,passenger_name) VALUES($1,$3,'VIP 고객 외 2명'),($2,$3,'다른 고객')",[driver,other,'동명이인']);
  await admin.query("INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,end_date,end_time,driver_id,vehicle_id,vehicle_plate,dispatch_status,schedule_meta) VALUES($1,'vip_limousine_korea','2026-12-12','09:00','2026-12-12','12:00',$2,$4,'fixture-car-one','published','{\"serviceMode\":\"with_driver\"}'),($3,'vip_limousine_korea','2026-12-12','13:00','2026-12-12','18:00',$2,$5,'fixture-car-two','published','{\"serviceMode\":\"with_driver\"}')",[booking,driver,otherBooking,randomUUID(),randomUUID()]);
  const token=(role:'driver'|'hq_admin',driverId:string=driver)=>signCockpitSession({userId:role==='driver'?driverId:'fixture-hq',org,role,driverId:role==='driver'?driverId:undefined,driverName:'동명이인'});
  let actor=token('driver'),storageFailure=false;const files=new Map<string,Buffer>();
  const timestampParser=types.getTypeParser(1184);types.setTypeParser(1184,value=>value);
  const original={from:supabaseAdmin.from,rpc:supabaseAdmin.rpc,storage:Object.getOwnPropertyDescriptor(supabaseAdmin,'storage'),fetch:globalThis.fetch};
  const column=(key:string)=>{if(key==='result->>outcome')return '"result"->>\'outcome\'';assert.match(key,/^[a-z_]+$/);return '"'+key+'"';};
  const value=(key:string,v:unknown)=>['stops','review_history','audit_history','operation_history','ocr_details','meta'].includes(key)?JSON.stringify(v):v;
  supabaseAdmin.from=((table:string)=>{
    assert.ok(['driving_logs','expenses','schedules','drivers','fleet_vehicle_operations','fleet_vehicle_registry','dispatch_requests','vehicle_custodies','vehicle_custody_requests'].includes(table));
    const filters:Array<[string,unknown,string?]>=[],orders:string[]=[];let rows:Record<string,unknown>[]|null=null,patch:Record<string,unknown>|null=null;
    let offset=0,limit=1000;let eitherDate: string | null=null;
    const execute=async(single=false)=>{try{
      let sql='';const params:unknown[]=[];
      if(rows){const keys=Object.keys(rows[0]);sql=`INSERT INTO cockpit.${table} (${keys.map(column)}) VALUES `+rows.map(row=>'('+keys.map(key=>{params.push(value(key,row[key]));return '$'+params.length;}).join(',')+')').join(',')+' ON CONFLICT(id) DO UPDATE SET '+keys.filter(k=>k!=='id').map(k=>`${column(k)}=EXCLUDED.${column(k)}`).join(',')+' RETURNING *';}
      else {let where=filters.map(([key,val,operator])=>{if(val===null)return column(key)+' IS NULL';params.push(val);return column(key)+(operator || '=')+'$'+params.length;}).join(' AND ');
        if(eitherDate){params.push(eitherDate);where+=(where?' AND ':'')+`(end_date >= $${params.length} OR date >= $${params.length})`;}
        if(patch){const assignments=Object.entries(patch).map(([key,val])=>{params.push(value(key,val));return column(key)+'=$'+params.length;});sql=`UPDATE cockpit.${table} SET ${assignments.join(',')}${where?' WHERE '+where:''} RETURNING *`;}
        else sql=`SELECT * FROM cockpit.${table}${where?' WHERE '+where:''}${orders.length?' ORDER BY '+orders.join(','):''} LIMIT ${limit} OFFSET ${offset}`;
      }
      const result=await writer.query(sql,params);const records=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,val])=>[key,val instanceof Date?(key==='date'||key.endsWith('_date')?val.toISOString().slice(0,10):val.toISOString()):val])));return {data:single?records[0] || null:records,error:null};
    }catch(error){const e=error as {message:string;code?:string};return {data:null,error:{message:e.message,code:e.code}};}};
    const q={select:()=>q,limit:(n:number)=>{limit=n;return q;},or:(expression:string)=>{const match=expression.match(/^end_date\.gte\.(\d{4}-\d{2}-\d{2}),date\.gte\.\1$/);assert.ok(match);eitherDate=match[1];return q;},eq:(key:string,val:unknown)=>{filters.push([key,val]);return q;},neq:(key:string,val:unknown)=>{filters.push([key,val,'<>']);return q;},lte:(key:string,val:unknown)=>{filters.push([key,val,'<=']);return q;},is:(key:string,val:null)=>{filters.push([key,val]);return q;},order:(key:string,options?:{ascending?:boolean})=>{orders.push(column(key)+(options?.ascending===false?' DESC':' ASC'));return q;},range:(start:number,end:number)=>{offset=start;limit=end-start+1;return q;},upsert:(input:Record<string,unknown>|Record<string,unknown>[])=>{rows=Array.isArray(input)?input:[input];return q;},update:(input:Record<string,unknown>)=>{patch=input;return q;},single:()=>execute(true),maybeSingle:()=>execute(true),then:(resolve:unknown,reject:unknown)=>execute().then(resolve as never,reject as never)};return q;
  }) as unknown as typeof supabaseAdmin.from;
  supabaseAdmin.rpc=(async(name:string,args:Record<string,unknown>)=>{
    if(name==='commit_vehicle_custody'){
      try{return {data:(await writer.query('SELECT cockpit.commit_vehicle_custody($1,$2,$3,$4,$5::jsonb) result',[args.p_org,args.p_driver_id,args.p_actor_id,args.p_request_id,JSON.stringify(args.p_data)])).rows[0].result,error:null};}
      catch(error){const e=error as {code:string;message:string};return {data:null,error:{code:e.code,message:e.message}};}
    }
    assert.equal(name,'reporting_summary');return {data:(await reader.query('SELECT cockpit.reporting_summary($1) result',[args.p_org])).rows[0].result,error:null};
  }) as unknown as typeof supabaseAdmin.rpc;
  Object.defineProperty(supabaseAdmin,'storage',{configurable:true,value:{from:(bucket:string)=>{assert.equal(bucket,'cockpit-assets');return {upload:async(path:string,data:Buffer)=>{if(storageFailure)return {error:{message:'isolated storage failure'}};if(files.has(path))return {error:{statusCode:'409'}};files.set(path,Buffer.from(data));return {error:null};},download:async(path:string)=>files.has(path)?{data:new Blob([new Uint8Array(files.get(path)!)],{type:'image/png'}),error:null}:{data:null,error:{message:'missing'}}};}}});
  globalThis.fetch=(async(input:unknown,init:RequestInit={})=>{
    const url=new URL(String(input),'http://localhost');const headers=new Headers(init.headers);headers.set('authorization','Bearer '+actor);
    const request=new NextRequest(url,{...init,signal:init.signal || undefined,headers});
    if(url.pathname==='/api/fleet/availability')return fleetAvailability(request);
    if(url.pathname==='/api/vehicle-custody')return init.method==='POST'?custody.POST(request):init.method==='PATCH'?custody.PATCH(request):custody.GET(request);
    if(url.pathname==='/api/vehicle-custody/photo')return custodyPhotos.GET(request);
    if(url.pathname==='/api/expenses/receipt')return init.method==='POST'?receipts.POST(request):receipts.GET(request);
    if(url.pathname==='/api/expenses')return init.method==='POST'?expenses.POST(request):init.method==='PUT'?expenses.PUT(request):expenses.GET(request);
    if(url.pathname==='/api/driving-logs')return init.method==='POST'?logs.POST(request):logs.GET(request);
    throw new Error('Unexpected test network request');
  }) as typeof fetch;
  const post=async(route:{POST:(req:NextRequest)=>Promise<Response>},path:string,body:unknown,extraHeaders:Record<string,string>={})=>route.POST(new NextRequest('http://localhost'+path,{method:'POST',headers:{authorization:'Bearer '+actor,'content-type':'application/json',...extraHeaders},body:JSON.stringify(body)}));
  const query=async()=> (await reader.query('SELECT expense_amount,expense_count FROM cockpit.driving_logs WHERE booking_id=$1',[booking])).rows[0];
  try{
    const item:ExpenseItem={id:randomUUID(),driverId:driver,bookingId:booking,category:'parking',date:'2026-12-12',time:'10:30',merchant:'격리 주차장',amount:8000,paymentMethod:'company_card',receiptUrl:'data:image/png;base64,iVBORw0KGgo=',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    storageFailure=true;await assert.rejects(prepareExpenseReceipt(item),/실패/);assert.equal((await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count,'0');storageFailure=false;
    const ready=await prepareExpenseReceipt(item);await prepareExpenseReceipt(item);assert.equal(files.size,1,'upload retries must reuse the content digest');
    const submitted=await submitDriverExpensesToHqDb([ready],'동명이인','테스트차량','테스트모델',booking);assert.equal(submitted.ok,true,submitted.error);assert.equal(submitted.expenses?.[0].receiptStoragePath,ready.receiptStoragePath);
    assert.equal((await submitDriverExpensesToHqDb([ready],'동명이인','테스트차량','테스트모델',booking)).ok,true);
    assert.equal((await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count,'1');
    const log={id:randomUUID(),driverId:driver,bookingId:booking,driverName:'동명이인',drivingDate:'2026-12-12',clockIn:'09:00',clockOut:'18:00',startKm:'1000',endKm:'1100',passengerCount:999,stops:[{id:'actual',time:'10:00',place:'실제 확인 장소'}],status:'검토 대기' as const,expenseAmount:999999};
    const saved=await submitDriverLogToHqDb(log);assert.equal(saved.ok,true,saved.error);assert.equal(saved.log?.expenseAmount,8000);assert.equal(saved.log?.passengerCount,3);assert.equal(saved.log?.passengerName,'VIP 고객 외 2명');
    assert.deepEqual(await query(),{expense_amount:8000,expense_count:1});
    assert.equal((await reader.query('SELECT driving_log_id FROM cockpit.expenses WHERE id=$1',[item.id])).rows[0].driving_log_id,saved.log?.id);
    const secondDevice=await submitDriverLogToHqDb({...log,id:randomUUID()});assert.equal(secondDevice.ok,true,secondDevice.error);assert.equal(secondDevice.log?.id,saved.log?.id);
    const second=await submitDriverExpensesToHqDb([{...ready,id:randomUUID(),amount:2000}],'동명이인','테스트차량','테스트모델',booking);assert.equal(second.ok,true,second.error);assert.deepEqual(await query(),{expense_amount:10000,expense_count:2});
    const separate=await submitDriverLogToHqDb({...log,id:randomUUID(),bookingId:otherBooking});assert.equal(separate.ok,true,separate.error);assert.equal(separate.log?.expenseAmount,0);
    actor=token('hq_admin');const hqLogs=await fetchHqDrivingLogsFromDb(),hqExpenses=await fetchHqExpensesFromDb();assert.equal(hqLogs.logs.find(row=>row.bookingId===booking)?.expenseAmount,10000);assert.equal(hqExpenses.expenses.length,2);assert.ok(hqExpenses.expenses[0].receiptUrl?.startsWith('/api/expenses/receipt?expenseId='));
    const overview=await summary(new NextRequest('http://localhost/api/hq/reporting/summary',{headers:{authorization:'Bearer '+actor}}));const dashboard=await overview.json();assert.equal(dashboard.summary.expenses.amount,10000);assert.equal(dashboard.summary.logs.submitted,2);assert.equal(dashboard.summary.expenses.unlinked,0);
    const photo=await fetch(hqExpenses.expenses[0].receiptUrl!);assert.equal(photo.status,200);assert.equal((await photo.arrayBuffer()).byteLength,8);
    const beforeReview=hqExpenses.expenses.find(row=>row.id===item.id)!;
    const approve=await updateHqExpenseReviewDb(item.id,{status:'승인 완료',reviewNotes:'원본 대조'},beforeReview.updatedAt);assert.equal(approve.ok,true,JSON.stringify(approve));
    const approved=getHqExpenses().find(row=>row.id===item.id)!;assert.equal(approved.status,'승인 완료');assert.equal(approved.auditHistory?.length,1);
    const stale=await updateHqExpenseReviewDb(item.id,{status:'반려'},beforeReview.updatedAt);assert.equal(stale.ok,false);if(!stale.ok)assert.equal(stale.conflict,true);
    assert.equal((await reader.query('SELECT status,jsonb_array_length(audit_history) n FROM cockpit.expenses WHERE id=$1',[item.id])).rows[0].n,1,'a stale review cannot discard or append audit entries');
    const classified=await updateHqExpenseReviewDb(item.id,{billableToCustomer:false},approved.updatedAt);assert.equal(classified.ok,true,JSON.stringify(classified));
    assert.equal((await reader.query('SELECT billable_to_customer FROM cockpit.expenses WHERE id=$1',[item.id])).rows[0].billable_to_customer,false);
    const badStatus=await expenses.PUT(new NextRequest('http://localhost/api/expenses',{method:'PUT',headers:{authorization:'Bearer '+actor,'content-type':'application/json'},body:JSON.stringify({id:item.id,status:'invented-success'})}));assert.equal(badStatus.status,400);
    const current=(await fetchHqExpensesFromDb()).expenses.find(row=>row.id===item.id)!;
    const raceReview=(status:string)=>expenses.PUT(new NextRequest('http://localhost/api/expenses',{method:'PUT',headers:{authorization:'Bearer '+actor,'content-type':'application/json'},body:JSON.stringify({id:item.id,status,expectedUpdatedAt:current.updatedAt})}));
    const race=await Promise.all([raceReview('금액 확인'),raceReview('반려')]);assert.deepEqual(race.map(result=>result.status).sort(),[200,409]);
    const afterRace=(await fetchHqExpensesFromDb()).expenses.find(row=>row.id===item.id)!;
    assert.equal(afterRace.auditHistory?.length,(current.auditHistory?.length || 0)+1,'only the winning review appends an audit entry');
    assert.equal((await updateHqExpenseReviewDb(item.id,{status:'승인 완료'},afterRace.updatedAt)).ok,true);
    console.log('PASS receipt review: shipped client helper → real API/Postgres → exact server row; stale and concurrent review 409/audit retained; billable classification persisted; invalid status denied');
    actor=token('driver');const own=await fetchHqExpensesFromDb();assert.equal(own.expenses.find(row=>row.id===item.id)?.status,'승인 완료');
    actor=token('hq_admin');
    const putReview=(body:unknown)=>expenses.PUT(new NextRequest('http://localhost/api/expenses',{method:'PUT',headers:{authorization:'Bearer '+actor,'content-type':'application/json'},body:JSON.stringify(body)}));
    const fresh=async()=>(await fetchHqExpensesFromDb()).expenses.find(row=>row.id===item.id)!;
    const duplicate=(await fetchHqExpensesFromDb()).expenses.find(row=>row.id!==item.id)!;
    const doubleApproval=await updateHqExpenseReviewDb(duplicate.id,{status:'승인 완료'},duplicate.updatedAt);assert.equal(doubleApproval.ok,false);if(!doubleApproval.ok)assert.equal(doubleApproval.conflict,true);
    await admin.query('UPDATE cockpit.expenses SET ocr_details=$2 WHERE id=$1',[item.id,JSON.stringify({total:8000,approvalNo:'immutable-proof'})]);
    let latest=await fresh();const originalPath=latest.receiptStoragePath;
    const correction={...expenseCorrectionFields(latest),amount:9000,merchant:'수정 주차장',address:'원본 대조 주소',memo:'검수 수정'};
    assert.equal((await putReview({id:item.id,expectedUpdatedAt:latest.updatedAt,status:'승인 완료',corrections:correction})).status,400,'save and approve must be separate');
    assert.equal((await putReview({id:item.id,expectedUpdatedAt:latest.updatedAt,corrections:{...correction,receiptStoragePath:'replacement'}})).status,400,'original evidence cannot be overwritten by a correction');
    const corrected=await updateHqExpenseReviewDb(item.id,{corrections:correction,reviewNotes:'금액 원본 대조'},latest.updatedAt);assert.equal(corrected.ok,true,JSON.stringify(corrected));
    latest=await fresh();assert.equal(latest.status,'검수 대기');assert.equal(latest.reviewedAt,undefined);assert.equal(latest.receiptStoragePath,originalPath);assert.deepEqual(latest.ocrDetails,{total:8000,approvalNo:'immutable-proof'});
    assert.ok(latest.auditHistory?.[0].changes.some((change:{field:string;before:unknown;after:unknown})=>change.field==='amount' && change.before===8000 && change.after===9000));assert.equal(latest.auditHistory?.[0].actorId,'fixture-hq');
    assert.deepEqual(await query(),{expense_amount:11000,expense_count:2});
    assert.equal((await putReview({id:item.id,expectedUpdatedAt:latest.updatedAt,corrections:{...correction,bookingId:otherBooking}})).status,403,'another vehicle booking cannot receive this receipt');
    const moved=await updateHqExpenseReviewDb(item.id,{corrections:{...correction,rawDate:'2026-12-13'}},latest.updatedAt);assert.equal(moved.ok,true,JSON.stringify(moved));
    latest=await fresh();assert.equal(latest.drivingLogId,undefined);assert.deepEqual(await query(),{expense_amount:2000,expense_count:1});
    assert.equal((await updateHqExpenseReviewDb(item.id,{corrections:{...correction,amount:8000,rawDate:item.date}},latest.updatedAt)).ok,true);
    latest=await fresh();assert.ok(latest.drivingLogId);assert.deepEqual(await query(),{expense_amount:10000,expense_count:2});
    assert.equal((await updateHqExpenseReviewDb(item.id,{status:'승인 완료'},latest.updatedAt)).ok,true);
    // The database guard also protects writes outside this HTTP handler.
    await assert.rejects(writer.query("UPDATE cockpit.expenses SET amount=0 WHERE id=$1",[item.id]),{code:'23514'});
    console.log('PASS receipt correction → real API/Postgres → aggregate relinking; before/after/actor audit and immutable OCR preserved; save-before-approve, duplicate source, invalid approval and cross-vehicle link denied');
    actor=token('driver',other);assert.equal((await fetch(hqExpenses.expenses[0].receiptUrl!)).status,403);assert.equal((await fetchHqDrivingLogsFromDb()).logs.length,0);
    actor=token('driver');
    const malicious=await post(expenses,'/api/expenses',{...item,id:randomUUID(),receiptUrl:undefined,drivingLogId:separate.log!.id,receiptStoragePath:ready.receiptStoragePath});assert.equal(malicious.status,403);
    const before=(await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count;
    await assert.rejects(writer.query("INSERT INTO cockpit.expenses(id,organization_id,driver_id,driver_name,booking_id,expense_date,expense_time,category,amount,merchant,status,driving_log_id) VALUES($1,$2,$3,'동명이인',$4,'2026-12-12','11:00','parking',1000,'정상','검수 대기',NULL),($5,$2,$3,'동명이인',$4,'2026-12-12','11:00','parking',1000,'잘못된 연결','검수 대기',$6)",[randomUUID(),org,driver,booking,randomUUID(),separate.log!.id]),{code:'23514'});
    assert.equal((await reader.query('SELECT count(*) FROM cockpit.expenses')).rows[0].count,before);assert.deepEqual(await query(),{expense_amount:10000,expense_count:2});
    await writer.query("UPDATE cockpit.expenses SET status='반려' WHERE id=$1",[second.expenses![0].id]);assert.deepEqual(await query(),{expense_amount:8000,expense_count:1});
    await writer.query('DELETE FROM cockpit.expenses WHERE id=$1',[second.expenses![0].id]);assert.deepEqual(await query(),{expense_amount:8000,expense_count:1});
    actor=token('driver',other);
    assert.equal((await post(acknowledgment,'/api/schedules/ack',{scheduleId:booking,driverId:driver,version:1})).status,403);
    actor=token('driver');
    assert.equal((await post(acknowledgment,'/api/schedules/ack',{scheduleId:booking,version:1})).status,200);
    const hqRequest=()=>new NextRequest('http://localhost/api/schedules?role=hq',{headers:{authorization:'Bearer '+token('hq_admin')}});
    let scheduleView=await (await readSchedules(hqRequest())).json();assert.equal(scheduleView.schedules.find((row:{id:string})=>row.id===booking).end_time,'12:00');assert.equal(scheduleView.schedules.find((row:{id:string})=>row.id===booking).end_date,'2026-12-12');assert.equal(scheduleView.schedules.find((row:{id:string})=>row.id===booking).isAcknowledged,true);
    await writer.query("UPDATE cockpit.schedules SET schedule_meta=jsonb_set(schedule_meta,'{version}','2'),updated_at=clock_timestamp() WHERE id=$1",[booking]);
    scheduleView=await (await readSchedules(hqRequest())).json();assert.equal(scheduleView.schedules.find((row:{id:string})=>row.id===booking).isAcknowledged,false);
    assert.equal((await post(acknowledgment,'/api/schedules/ack',{scheduleId:booking,version:1})).status,409);
    assert.equal((await post(acknowledgment,'/api/schedules/ack',{scheduleId:booking,version:2})).status,200);
    console.log('PASS actual driver acknowledgment → HQ confirmed, dispatch revision → reconfirmation required; forged/stale confirmations denied');
    actor=token('hq_admin');
    const staleEdit=await post(dispatchRoute,'/api/schedules/dispatch',{scheduleId:booking,expectedVersion:1,date:'2026-12-12',pickupTime:'09:00',endDate:'2026-12-12',endTime:'12:00',origin:'공항',destination:'호텔',dispatchStatus:'unassigned',allowUnverified:true},{'Idempotency-Key':randomUUID()});
    assert.equal(staleEdit.status,409,JSON.stringify(await staleEdit.json()));
    assert.equal((await reader.query('SELECT schedule_meta FROM cockpit.schedules WHERE id=$1',[booking])).rows[0].schedule_meta.version,2);
    console.log('PASS HTTP dispatch expectedVersion guard rejects a stale mobile edit and preserves the latest PC assignment in real Postgres');
    actor=token('driver');

    const navigation={...log,id:randomUUID(),bookingId:undefined,drivingDate:'2026-12-13',status:'draft' as const,startKm:'',endKm:'',stops:[{id:'navigation-one',time:'',place:'공항',departureTime:'09:00',actionIdempotencyKey:'nav-one'}]};
    const draft=await submitDriverLogToHqDb(navigation);assert.equal(draft.ok,true,draft.error);
    const nextStop={id:'navigation-two',time:'',place:'호텔',departureTime:'10:00',actionIdempotencyKey:'nav-two'};
    const append=await submitDriverLogToHqDb({...navigation,id:randomUUID(),stops:[nextStop]});assert.equal(append.ok,true,append.error);assert.equal(append.log?.id,draft.log?.id);assert.equal(append.log?.stops.length,2);
    const finish=await submitDriverLogToHqDb({...navigation,id:draft.log!.id,status:'검토 대기',startKm:'1000',endKm:'1050',stops:[{...nextStop,time:'11:00'}]});assert.equal(finish.ok,true,finish.error);assert.equal(finish.log?.stops.length,1);assert.equal(finish.log?.distanceKm,'50 km');
    console.log('PASS actual navigation draft append/replay, same-row final submission and deliberate route edit');
    // The same availability endpoint backs vehicle management, mobile and PC assignment.
    const today=getKstTodayDateStr(),car=VIP_REAL_VEHICLES[0],liveBooking=randomUUID();
    await writer.query("INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,end_date,end_time,driver_id,vehicle_id,vehicle_plate,dispatch_status,operation_status) VALUES($1,$2,$3,'09:00',$3,'12:00',$4,$5,$6,'published','ready')",[liveBooking,org,shiftIsoDate(today,3),driver,car.uuid,car.plate]);
    const liveFleet=async()=>{
      const response=await fleetAvailability(new NextRequest(`http://localhost/api/fleet/availability?startDate=${shiftIsoDate(today,7)}&endDate=${shiftIsoDate(today,7)}&startTime=09:00&endTime=12:00`,{headers:{authorization:'Bearer '+token('hq_admin')}}));
      assert.equal(response.status,200);return response.json();
    };
    const liveCar=async()=>(await liveFleet()).vehicles.find((row:{uuid:string})=>row.uuid===car.uuid);
    assert.equal((await liveCar()).currentStatus,'available','a future assignment stays waiting');
    await writer.query("UPDATE cockpit.schedules SET date=$2,pickup_time='00:00',end_date=$3,end_time='23:59',updated_at=clock_timestamp() WHERE id=$1",[liveBooking,shiftIsoDate(today,-1),shiftIsoDate(today,1)]);
    assert.equal((await liveCar()).currentStatus,'in_service','the live assignment window automatically puts the car into service');
    assert.notEqual((await liveFleet()).vehicles[0].uuid,car.uuid,'bookable waiting vehicles precede a currently driving vehicle');
    actor=token('driver',other);assert.equal((await post(operationStatus,'/api/schedules/operation-status',{scheduleId:liveBooking,status:'in_transit'})).status,403);
    actor=token('driver');assert.equal((await post(operationStatus,'/api/schedules/operation-status',{scheduleId:liveBooking,status:'in_transit'})).status,200);
    assert.equal((await liveCar()).currentStatus,'in_service');
    assert.equal((await post(operationStatus,'/api/schedules/operation-status',{scheduleId:liveBooking,status:'completed'})).status,200);
    assert.equal((await liveCar()).currentStatus,'available','driver completion reaches the vehicle-management server result immediately');
    console.log('PASS real Postgres schedule assignment → shared fleet API live status/order → assigned driver start/completion → waiting; other-driver update denied');

    await verifyCustodyFlow(admin,writer,reader,{setActor:(role,id)=>{actor=token(role,id);}});

    await admin.query('SET ROLE authenticated');await assert.rejects(admin.query('SELECT * FROM cockpit.expenses'),{code:'42501'});await assert.rejects(admin.query('SELECT cockpit.reporting_summary($1)',[org]),{code:'42501'});await admin.query('RESET ROLE');
    console.log('PASS reporting flow: client receipt upload → expense API → real Postgres → report linking/totals → HQ summary/read/photo/review → driver status; retries, other-driver denial and batch rollback');
  }finally{types.setTypeParser(1184,timestampParser);supabaseAdmin.from=original.from;supabaseAdmin.rpc=original.rpc;if(original.storage)Object.defineProperty(supabaseAdmin,'storage',original.storage);globalThis.fetch=original.fetch;}
}
