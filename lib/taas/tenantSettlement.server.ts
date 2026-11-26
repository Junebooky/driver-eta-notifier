import {supabaseAdmin as db} from '../supabase/server';
import {verifyTenantAuthCandidate} from '../auth/tenantAuthCandidate.server';
import type {TenantIdentity} from '../auth/tenantIdentity';
import {buildSettlementSource,validScheduleId,exportIssuedClientCsv,type LedgerDocument,type SettlementScheduleRow,type SettlementLogRow,type SettlementExpenseRow,type SettlementSource} from '../settlement/serverLedger';
type Op='list'|'source'|'document';
type Reply={data:unknown;error:{code?:string}|null};
export type SettlementReadDependencies={
 verify:(host:string,token:string)=>Promise<TenantIdentity|null>;
 read:(i:TenantIdentity,op:Op,id:string|null)=>Promise<Reply>;
};
type Failure={ok:false;status:number;error:string};
type Result<T>={ok:true;data:T}|Failure;
const fail=(status:number):Failure=>({ok:false,status,error:status===403?'정산 접근 권한이 없습니다.':status===409?'정산 원본이 변경되었습니다. 다시 확인해 주세요.':status===400?'정산 요청을 확인해 주세요.':'정산 원본을 조회할 수 없습니다.'});
const record=(x:unknown):Record<string,unknown>|null=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:null;
const isAdmin=(i:TenantIdentity|null):i is TenantIdentity=>!!i&&/^[a-z][a-z0-9_]{2,62}$/.test(i.orgId)&&i.driverId===null&&['company_owner','company_admin'].includes(i.role);
const same=(a:TenantIdentity,b:TenantIdentity|null)=>isAdmin(b)&&a.orgId===b.orgId&&a.userId===b.userId&&a.sessionId===b.sessionId&&a.role===b.role;
const rows=(x:unknown,org:string,key:string):Record<string,unknown>[]|null=>{
 if(!Array.isArray(x))return null;
 const list=x.map(record);
 if(list.some(r=>!r||r[key]!==org||!validScheduleId(r.id)))return null;
 const typed=list as Record<string,unknown>[];
 return new Set(typed.map(r=>r.id)).size===typed.length?typed:null;
};
async function read(i:TenantIdentity,op:Op,id:string|null,deps:SettlementReadDependencies):Promise<Result<unknown>>{
 const r=await deps.read(i,op,id);
 return r.error?fail(r.error.code==='42501'?403:r.error.code==='22023'?400:503):{ok:true,data:r.data};
}
function sourceFrom(raw:unknown,org:string,id:string):{source:SettlementSource;hash:string}|null{
 const r=record(raw),s=record(r?.schedule);
 if(!r||!s||s.org_id!==org||s.id!==id||typeof r.hash!=='string'||!/^[0-9a-f]{32}$/.test(r.hash))return null;
 const logs=rows(r.logs,org,'organization_id'),expenses=rows(r.expenses,org,'organization_id');
 if(!logs||!expenses||logs.some(l=>l.booking_id!==id||l.driver_id!==s.driver_id))return null;
 const ids=new Set(logs.map(l=>l.id));
 if(expenses.some(e=>!(e.booking_id===id||(e.booking_id===null&&ids.has(e.driving_log_id)))||(e.driving_log_id!==null&&!ids.has(e.driving_log_id))||typeof e.amount!=='number'||!Number.isSafeInteger(e.amount)||e.amount<0))return null;
 // SQL projection is internal and minimal; reuse existing calculation source rules.
 return {hash:r.hash,source:buildSettlementSource(id,s as unknown as SettlementScheduleRow,logs as unknown as SettlementLogRow[],expenses as unknown as SettlementExpenseRow[])};
}
export async function loadTenantSettlementSource(host:string,token:string,id:string,deps:SettlementReadDependencies):Promise<Result<{source:SettlementSource;hash:string}>>{
 try{
  const i=await deps.verify(host,token);if(!isAdmin(i))return fail(403);if(!validScheduleId(id))return fail(400);
  const r=await read(i,'source',id,deps);if(!r.ok)return r;
  const source=sourceFrom(r.data,i.orgId,id);if(!source)return fail(403);
  if(!same(i,await deps.verify(host,token)))return fail(403);
  return {ok:true,data:source};
 }catch{return fail(503);}
}
export async function listTenantSettlements(host:string,token:string,deps:SettlementReadDependencies):Promise<Result<{documents:Record<string,unknown>[];schedules:Record<string,unknown>[]}>>{
 try{
  const i=await deps.verify(host,token);if(!isAdmin(i))return fail(403);
  const result=await read(i,'list',null,deps);if(!result.ok)return result;
  const raw=record(result.data),documents=rows(raw?.documents,i.orgId,'organization_id'),schedules=rows(raw?.schedules,i.orgId,'org_id');
  if(!documents||!schedules||documents.some(d=>!validScheduleId(d.schedule_id)))return fail(403);
  if(!same(i,await deps.verify(host,token)))return fail(403);
  return {ok:true,data:{documents,schedules}};
 }catch{return fail(503);}
}
export async function downloadTenantSettlement(host:string,token:string,id:string,deps:SettlementReadDependencies):Promise<Result<string>>{
 try{
  const i=await deps.verify(host,token);if(!isAdmin(i))return fail(403);if(!validScheduleId(id))return fail(400);
  const r=await read(i,'document',id,deps);if(!r.ok)return r;
  const d=record(r.data);if(!d||d.id!==id||d.organization_id!==i.orgId||!validScheduleId(d.schedule_id)||d.status!=='issued')return fail(403);
  const s=await read(i,'source',d.schedule_id,deps);if(!s.ok)return s;
  const fresh=sourceFrom(s.data,i.orgId,d.schedule_id);
  if(!fresh||fresh.hash!==d.source_hash)return fail(409);
  if(!same(i,await deps.verify(host,token)))return fail(403);
  return {ok:true,data:exportIssuedClientCsv(d as unknown as LedgerDocument)};
 }catch{return fail(503);}
}
const dependencies:SettlementReadDependencies={
 verify:verifyTenantAuthCandidate,
 async read(i,op,id){return db.rpc('tenant_settlement_read_v1',{p_org:i.orgId,p_user:i.userId,p_session:i.sessionId,p_op:op,p_id:id});}
};
// No public route imports these candidates; the verified identity gate is locked.
export const tenantSettlementSourceCandidate=(host:string,token:string,id:string)=>loadTenantSettlementSource(host,token,id,dependencies);
export const tenantSettlementListCandidate=(host:string,token:string)=>listTenantSettlements(host,token,dependencies);
export const tenantSettlementDownloadCandidate=(host:string,token:string,id:string)=>downloadTenantSettlement(host,token,id,dependencies);
