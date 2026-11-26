import {createHash} from 'node:crypto';
import {supabaseAdmin as db} from '../supabase/server';
import {verifyTenantAuthCandidate} from '../auth/tenantAuthCandidate.server';
import type {TenantIdentity} from '../auth/tenantIdentity';

const MAX=10*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const orgPattern=/^[a-z][a-z0-9_]{2,62}$/;
const formats={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'} as const;
type Mime=keyof typeof formats;
type Evidence={expenseId:string;driverId:string;path:string;sha256:string;size:number;mime:Mime;revision:string};
type Gate={expenseId:string;driverId:string;revision:string};
type Reply={data:unknown;error:{code?:string}|null};
export type ReceiptDependencies={
 verify:(host:string,token:string)=>Promise<TenantIdentity|null>;
 authorize:(identity:TenantIdentity,id:string,op:'prepare'|'attach'|'read',evidence?:Record<string,unknown>)=>Promise<Reply>;
 privateBucket:()=>Promise<boolean>;
 upload:(path:string,bytes:Uint8Array,mime:Mime)=>Promise<'ok'|'exists'|'error'>;
 download:(path:string)=>Promise<Blob|null>;
 now:()=>Date;
};
type Failure={ok:false;status:number;error:string};
const fail=(status:number):Failure=>({ok:false,status,error:status===403?'영수증 접근 권한이 없습니다.':status===409?'경비 정보가 변경되었습니다. 다시 확인해 주세요.':status===400?'영수증 파일 정보를 확인해 주세요.':'영수증 무결성 또는 저장소를 확인해 주세요.'});
const isMime=(v:unknown):v is Mime=>typeof v==='string'&&Object.prototype.hasOwnProperty.call(formats,v);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const record=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const gate=(v:unknown,id:string,identity:TenantIdentity):Gate|null=>{
 const r=record(v);
 if(!r||r.expenseId!==id||typeof r.driverId!=='string'||!uuid.test(r.driverId)||typeof r.revision!=='string'||!/^[0-9a-f]{64}$/.test(r.revision)
 ||(identity.role==='driver'&&identity.driverId!==r.driverId))return null;
 return {expenseId:id,driverId:r.driverId,revision:r.revision};
};
const authorized=(i:TenantIdentity|null):i is TenantIdentity=>!!i&&orgPattern.test(i.orgId)&&['driver','company_admin','company_owner'].includes(i.role);
function signature(bytes:Uint8Array,mime:Mime):boolean{
 const b=Buffer.from(bytes);
 if(mime==='image/jpeg')return b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255;
 if(mime==='image/png')return b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/webp')return b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 return b.length>=5&&b.toString('ascii',0,5)==='%PDF-';
}
function evidence(v:unknown,id:string,i:TenantIdentity):Evidence|null{
 const g=gate(v,id,i),r=record(v);
 if(!g||!r||!isMime(r.mime)||typeof r.sha256!=='string'||!/^[0-9a-f]{64}$/.test(r.sha256)||typeof r.size!=='number'||!Number.isInteger(r.size)||r.size<1||r.size>MAX||typeof r.path!=='string')return null;
 const parts=r.path.split('/');
 if(parts.length!==7||parts[0]!==i.orgId||parts[1]!=='expenses'||parts[2]!=='receipts'||parts[3]!==g.driverId||!/^\d{4}$/.test(parts[4])||!/^(0[1-9]|1[0-2])$/.test(parts[5])||parts[6]!==r.sha256+'.'+formats[r.mime])return null;
 return {...g,path:r.path,sha256:r.sha256,size:r.size,mime:r.mime};
}
async function checkedBytes(blob:Blob|null,p:Pick<Evidence,'size'|'sha256'|'mime'>):Promise<Uint8Array|null>{
 if(!blob||blob.size!==p.size||blob.size>MAX||blob.type!==p.mime)return null;
 const bytes=new Uint8Array(await blob.arrayBuffer());
 return bytes.length===p.size&&signature(bytes,p.mime)&&hash(bytes)===p.sha256?bytes:null;
}
const sqlError=(r:Reply)=>fail(r.error?.code==='40001'?409:r.error?.code==='42501'?403:r.error?.code==='22023'?400:503);

/** Internal candidate, never accepts a path, tenant or driver from the client. */
export async function uploadTenantReceipt(host:string,token:string,id:string,revision:string,file:Blob,deps:ReceiptDependencies):Promise<Failure|{ok:true;expenseId:string}>{
 try{
  const i=await deps.verify(host,token);
  if(!authorized(i))return fail(403);
  if(!uuid.test(id)||!/^[0-9a-f]{64}$/.test(revision)||!isMime(file.type)||file.size<1||file.size>MAX)return fail(400);
  const g=await deps.authorize(i,id,'prepare');if(g.error)return sqlError(g);
  const target=gate(g.data,id,i);if(!target)return fail(403);
  if(target.revision!==revision)return fail(409);
  const mime=file.type,bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size||!signature(bytes,mime))return fail(400);
  const digest=hash(bytes),kst=new Date(deps.now().getTime()+9*3600000).toISOString().slice(0,7).split('-');
  const path=[i.orgId,'expenses','receipts',target.driverId,...kst,digest+'.'+formats[mime]].join('/');
  if(!await deps.privateBucket())return fail(503);
  const outcome=await deps.upload(path,bytes,mime);
  if(outcome!=='ok'&&outcome!=='exists')return fail(503);
  const proof={path,sha256:digest,size:bytes.length,mime,revision};
  if(!await checkedBytes(await deps.download(path),proof))return fail(503);
  const fresh=await deps.verify(host,token);
  if(!authorized(fresh)||fresh.orgId!==i.orgId||fresh.userId!==i.userId||fresh.sessionId!==i.sessionId||fresh.role!==i.role||fresh.driverId!==i.driverId)return fail(403);
  const saved=await deps.authorize(fresh,id,'attach',proof);
  if(saved.error)return sqlError(saved);
  const r=record(saved.data);if(r?.expenseId!==id||r.attached!==true)return fail(503);
  return {ok:true,expenseId:id};
 }catch{return fail(503);}
}
export async function readTenantReceipt(host:string,token:string,id:string,deps:ReceiptDependencies):Promise<Failure|{ok:true;bytes:Uint8Array;mime:Mime}>{
 try{
  const i=await deps.verify(host,token);if(!authorized(i))return fail(403);
  if(!uuid.test(id))return fail(400);
  const before=await deps.authorize(i,id,'read');if(before.error)return sqlError(before);
  const p=evidence(before.data,id,i);if(!p)return fail(403);
  if(!await deps.privateBucket())return fail(503);
  const bytes=await checkedBytes(await deps.download(p.path),p);if(!bytes)return fail(503);
  const fresh=await deps.verify(host,token);
  if(!authorized(fresh)||fresh.orgId!==i.orgId||fresh.userId!==i.userId||fresh.sessionId!==i.sessionId||fresh.role!==i.role||fresh.driverId!==i.driverId)return fail(403);
  const after=await deps.authorize(fresh,id,'read');if(after.error)return sqlError(after);
  const q=evidence(after.data,id,fresh);
  if(!q||q.path!==p.path||q.sha256!==p.sha256||q.size!==p.size||q.mime!==p.mime||q.revision!==p.revision)return fail(409);
  return {ok:true,bytes,mime:p.mime};
 }catch{return fail(503);}
}
const dependencies:ReceiptDependencies={
 verify:verifyTenantAuthCandidate,
 async authorize(i,id,op,proof){return db.rpc('tenant_receipt_v1',{p_org:i.orgId,p_user:i.userId,p_session:i.sessionId,p_expense:id,p_op:op,p_evidence:proof??null});},
 async privateBucket(){const r=await db.storage.getBucket('cockpit-assets');return !r.error&&r.data?.public===false;},
 async upload(path,bytes,mime){const r=await db.storage.from('cockpit-assets').upload(path,bytes,{contentType:mime,upsert:false});return !r.error?'ok':String((r.error as {statusCode?:string}).statusCode)==='409'?'exists':'error';},
 async download(path){const r=await db.storage.from('cockpit-assets').download(path);return r.error?null:r.data;},
 now:()=>new Date(),
};
export const uploadTenantReceiptCandidate=(host:string,token:string,id:string,revision:string,file:Blob)=>uploadTenantReceipt(host,token,id,revision,file,dependencies);
export const readTenantReceiptCandidate=(host:string,token:string,id:string)=>readTenantReceipt(host,token,id,dependencies);
