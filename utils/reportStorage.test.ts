import test from 'node:test';import assert from 'node:assert/strict';
import {supabaseAdmin as db} from '../lib/supabase/server';
import {storeWorkbook,readWorkbook} from '../lib/driverReports/storage';
import {activeLedgerYear} from '../lib/driverReports/service';
test('private immutable object upload is read back and hashed; outages/corruption never return a commit plan',async()=>{
 const old=process.env.REPORT_STORAGE_MODE,from=db.from;process.env.REPORT_STORAGE_MODE='object';
 const descriptor=Object.getOwnPropertyDescriptor(db,'storage');let payload=new Uint8Array(),failure=false,corrupt=false,publicBucket=false;const paths:string[]=[];
 const storage={getBucket:async()=>({data:{public:publicBucket},error:null}),from:()=>({upload:async(path:string,bytes:Uint8Array,options:{upsert:boolean})=>{assert.equal(options.upsert,false);paths.push(path);payload=Uint8Array.from(bytes);return {error:failure?{message:'outage'}:null};},download:async()=>({error:failure?{message:'outage'}:null,data:new Blob([corrupt?new Uint8Array([0]):payload])})})};
 Reflect.defineProperty(db,'storage',{value:storage,configurable:true});db.from=(()=>({insert:async()=>({error:null})})) as unknown as typeof db.from;
 try{
  const original=new Uint8Array([80,75,1,2]);const plan=await storeWorkbook('org',original);assert.ok(plan.path);assert.equal(plan.hex,undefined);assert.equal(plan.size,4);assert.equal(plan.sha256.length,64);
  assert.deepEqual(await readWorkbook({bytes:null,object_path:plan.path,sha256:plan.sha256,byte_size:plan.size}),original);
  assert.deepEqual(await readWorkbook({bytes:'\\x'+Buffer.from(original).toString('hex')}),original);
  await storeWorkbook('org',original);assert.notEqual(paths[0],paths[1]);
  failure=true;await assert.rejects(storeWorkbook('org',original),/연결/);failure=false;corrupt=true;await assert.rejects(storeWorkbook('org',original),/무결성/);corrupt=false;publicBucket=true;await assert.rejects(storeWorkbook('org',original),/비공개/);
 }finally{db.from=from;if(descriptor)Reflect.defineProperty(db,'storage',descriptor);else Reflect.deleteProperty(db,'storage');if(old===undefined)delete process.env.REPORT_STORAGE_MODE;else process.env.REPORT_STORAGE_MODE=old;}
});
test('registered year metadata remains available without touching unavailable file storage',async()=>{
 const from=db.from;const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{active_version:'version'},error:null}),single:async()=>({data:{ledger_year:2027},error:null})};db.from=(()=>q) as unknown as typeof db.from;
 try{assert.equal(await activeLedgerYear('org'),2027);}finally{db.from=from;}
});
