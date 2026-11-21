import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetryableJsonMutation, quickDispatchIntent } from './retryableJsonMutation';
import { dispatchRequestContext } from '../lib/dispatch/requestContext';
import { atomicUpsertServerDispatchBatch } from '../lib/dispatch/scheduleServerStore';
import { supabaseAdmin } from '../lib/supabase/server';

test('lost response and double taps reuse frozen body and key, while the next write gets a new key',async()=>{
 const seen:RequestInit[]=[];let release!:()=>void;
 const paused=new Promise<void>(r=>release=r);
 const request=(async(_url:unknown,options:RequestInit)=>{seen.push(options);if(seen.length===1){await paused;throw new Error('response lost after commit');}return Response.json({ok:true});}) as typeof fetch;
 const mutation=createRetryableJsonMutation(undefined,request);
 const first=mutation.send('/write',{bookingNo:'one',value:1});
 const duplicate=mutation.send('/write',{bookingNo:'one',value:1});release();
 assert.equal((await first).status,200);assert.equal((await duplicate).status,200);assert.equal(seen.length,2);
 assert.equal(new Headers(seen[0].headers).get('idempotency-key'),new Headers(seen[1].headers).get('idempotency-key'));assert.equal(seen[0].body,seen[1].body);
 await mutation.send('/write',{value:2});assert.notEqual(new Headers(seen[1].headers).get('idempotency-key'),new Headers(seen[2].headers).get('idempotency-key'));
});

test('uncertain requests survive reload, refuse changed intent and replay the original snapshot',async()=>{
 const memory=new Map<string,string>();
 Object.defineProperty(globalThis,'window',{configurable:true,value:{sessionStorage:{getItem:(k:string)=>memory.get(k),setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}}});
 const request=(async()=>{throw new Error('offline');}) as typeof fetch;
 try{
  const first=createRetryableJsonMutation('pending',request);await assert.rejects(first.send('/write',{value:1}));assert.ok(first.hasPending);
  assert.throws(()=>first.send('/write',{value:2}),/이전 저장/);
  const before=JSON.parse(memory.get('pending')!);let body:unknown,key:unknown;
  const reloaded=createRetryableJsonMutation('pending',(async(_url:unknown,options:RequestInit)=>{body=options.body;key=new Headers(options.headers).get('idempotency-key');return Response.json({ok:true});}) as typeof fetch);
  assert.equal((await reloaded.retry()).status,200);assert.equal(body,before.body);assert.equal(key,before.key);assert.equal(memory.size,0);
 }finally{Reflect.deleteProperty(globalThis,'window');}
 assert.deepEqual(quickDispatchIntent([{bookingNo:'generated',eventId:'generated',groupId:'generated',origin:'A'}]),[{origin:'A'}]);
});

test('HTTP idempotency keys are scoped per actor and operation; saved results replay before changed DB reads',async()=>{
 const actor={org:'vip_limousine_korea' as const,userId:'hq-one',role:'hq_admin' as const,issuedAt:1,expiresAt:2};
 const request=(path='/api/schedules/dispatch')=>new Request('http://localhost'+path,{method:'POST',headers:{'Idempotency-Key':'stable-client-key'}});
 const context=dispatchRequestContext(request(),actor,{b:2,a:1})!;
 assert.equal(context.fingerprint,dispatchRequestContext(request(),actor,{a:1,b:2})!.fingerprint);
 assert.notEqual(context.requestId,dispatchRequestContext(request(),{...actor,userId:'hq-two'},{b:2,a:1})!.requestId);
 assert.notEqual(context.requestId,dispatchRequestContext(request('/other'),actor,{b:2,a:1})!.requestId);
 const from=supabaseAdmin.from,rpc=supabaseAdmin.rpc;
 supabaseAdmin.rpc=(()=>{throw new Error('must not recommit');}) as typeof rpc;
 supabaseAdmin.from=((table:string)=>{assert.equal(table,'dispatch_requests');const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{request_payload:context.fingerprint,result:[{id:'saved',date:'2026-12-01',pickup_time:'09:00',end_time:'10:00',schedule_meta:{}}]},error:null})};return q;}) as unknown as typeof from;
 try{
  const replay=await atomicUpsertServerDispatchBatch([{date:'2026-12-01',pickupTime:'09:00',origin:'A',destination:'B'}],undefined,context.requestId,context.fingerprint);assert.equal(replay.ok,true);assert.equal(replay.schedules?.[0].id,'saved');
  assert.equal((await atomicUpsertServerDispatchBatch([{date:'2026-12-01',pickupTime:'09:00',origin:'A',destination:'B'}],undefined,context.requestId,'changed')).statusCode,409);
 }finally{supabaseAdmin.from=from;supabaseAdmin.rpc=rpc;}
});
