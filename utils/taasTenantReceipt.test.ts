import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {uploadTenantReceipt,readTenantReceipt,uploadTenantReceiptCandidate,type ReceiptDependencies} from '../lib/taas/tenantReceipt.server';
import type {TenantIdentity} from '../lib/auth/tenantIdentity';
const id='a0000000-0000-4000-8000-000000000001',driver='b0000000-0000-4000-8000-000000000002',revision='a'.repeat(64);
const identity:TenantIdentity={orgId:'chauffeur_service',userId:id,sessionId:id,hostname:'chauffeur.example.test',role:'driver',driverId:driver,issuedAt:1,expiresAt:2,home:'/'};
const data=new Uint8Array([137,80,78,71,13,10,26,10,1,2]);
const blob=new Blob([data],{type:'image/png'});
const digest=createHash('sha256').update(data).digest('hex');
const path='chauffeur_service/expenses/receipts/'+driver+'/2027/01/'+digest+'.png';
function setup(){
 let attaches=0,uploads=0,downloads=0;
 const proof={expenseId:id,driverId:driver,revision,path,sha256:digest,size:data.length,mime:'image/png'};
 const deps:ReceiptDependencies={verify:async()=>identity,authorize:async(_i,_id,op,p)=>{
  if(op==='attach'){attaches++;assert.equal(p?.path,path);assert.equal(p?.sha256,digest);return {data:{expenseId:id,attached:true},error:null};}
  return {data:proof,error:null};
 },privateBucket:async()=>true,upload:async(p,b,m)=>{uploads++;assert.equal(p,path);assert.deepEqual(b,data);assert.equal(m,'image/png');return 'ok';},download:async()=>{downloads++;return blob;},now:()=>new Date('2026-12-31T15:00:00Z')};
 return {deps,counts:()=>({attaches,uploads,downloads}),proof};
}
test('verify stored bytes before attachment, including duplicate object response',async()=>{
 for(const duplicate of [false,true]){
  const {deps,counts}=setup();
  if(duplicate)deps.upload=async()=> 'exists';
  assert.deepEqual(await uploadTenantReceipt(identity.hostname,'token',id,revision,blob,deps),{ok:true,expenseId:id});
  assert.equal(counts().attaches,1);assert.equal(counts().downloads,1);
 }
});
test('deny invalid signature, stale revision, wrong driver, public bucket, damaged duplicate or revoked access',async()=>{
 for(const scenario of ['signature','stale','driver','public','corrupt','revoked','outage']){
  const {deps,counts,proof}=setup();let file=blob,rev=revision;
  if(scenario==='signature')file=new Blob(['not png'],{type:'image/png'});
  if(scenario==='stale')rev='b'.repeat(64);
  if(scenario==='driver')deps.authorize=async()=>({data:{...proof,driverId:id},error:null});
  if(scenario==='public')deps.privateBucket=async()=>false;
  if(scenario==='corrupt'){deps.upload=async()=> 'exists';deps.download=async()=>new Blob([new Uint8Array(data.length)],{type:'image/png'});}
  if(scenario==='revoked'){let n=0;deps.verify=async()=>++n===1?identity:null;}
  if(scenario==='outage')deps.upload=async()=> 'error';
  assert.equal((await uploadTenantReceipt(identity.hostname,'token',id,rev,file,deps)).ok,false,scenario);
  assert.equal(counts().attaches,0,scenario);
 }
 assert.equal((await uploadTenantReceiptCandidate(identity.hostname,'token',id,revision,blob)).ok,false);
});
test('read by expense id, validate exact scope and integrity and recheck authorization after download',async()=>{
 const ok=setup();const r=await readTenantReceipt(identity.hostname,'token',id,ok.deps);assert.ok(r.ok);if(r.ok)assert.deepEqual(r.bytes,data);
 for(const scenario of ['foreign','traversal','corrupt','changed','revoked']){
  const {deps,proof,counts}=setup();
  if(scenario==='foreign')deps.authorize=async()=>({data:{...proof,path:path.replace('chauffeur_service','vip_limousine_korea')},error:null});
  if(scenario==='traversal')deps.authorize=async()=>({data:{...proof,path:path.replace('/01/','/%2e%2e/')},error:null});
  if(scenario==='corrupt')deps.download=async()=>new Blob([new Uint8Array(data.length)],{type:'image/png'});
  if(scenario==='changed'){let n=0;deps.authorize=async()=>({data:{...proof,revision:++n===1?revision:'b'.repeat(64)},error:null});}
  if(scenario==='revoked'){let n=0;deps.verify=async()=>++n===1?identity:null;}
  assert.equal((await readTenantReceipt(identity.hostname,'token',id,deps)).ok,false,scenario);
  if(scenario==='foreign'||scenario==='traversal')assert.equal(counts().downloads,0);
 }
});
