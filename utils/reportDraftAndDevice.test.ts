import test from 'node:test';import assert from 'node:assert/strict';
import {newDeviceSecret,tokenHash,validSecret,devicePrefix} from '../lib/driverDevices/tokens';
import {parseAndVerifyToken} from '../lib/auth/serverAuth';
import {supabaseAdmin as db} from '../lib/supabase/server';
import {accountHome} from './loginPortal';
import {readChatDraft,saveChatDraft,clearChatDrafts,draftPrefix} from './reportChatDraft';
function storage():Storage{const m=new Map<string,string>();return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);},removeItem:k=>{m.delete(k);},clear:()=>m.clear()};}
test('drafts/outbox survive reload with same request key and are removed on account changes/logout',()=>{
 const s=storage(),out={id:'a0000000-0000-4000-8000-000000000001',body:'긴 보고'.repeat(100),created_at:new Date().toISOString(),failed:false};
 saveChatDraft(s,'driver-a','작성 중',[out]);const d=readChatDraft(s,'driver-a');assert.equal(d?.text,'작성 중');assert.equal(d?.outgoing[0].id,out.id);assert.equal(d?.outgoing[0].failed,true);
 assert.equal(readChatDraft(s,'driver-b'),null);assert.equal(s.getItem(draftPrefix+'driver-a'),null);
 saveChatDraft(s,'driver-b','다른 기사',[]);clearChatDrafts(s);assert.equal(s.length,0);
});
test('device tokens are random opaque secrets and only server-verified driver identities are accepted',async()=>{
 const a=newDeviceSecret(),b=newDeviceSecret();assert.equal(validSecret(a),true);assert.notEqual(a,b);assert.equal(tokenHash(a).length,64);assert.notEqual(tokenHash(a),a);assert.equal(validSecret('short'),false);
 const original=db.rpc;try{
 db.rpc=(async()=>({data:{role:'driver',driverId:'a0000000-0000-4000-8000-000000000001',org:'vip_limousine_korea',reportDevice:true},error:null})) as unknown as typeof db.rpc;
 const session=await parseAndVerifyToken(devicePrefix+a);assert.equal(session?.role,'driver');assert.equal(accountHome(session!),'/driver/reports');
 db.rpc=(async()=>({data:{role:'hq_admin',driverId:'forged'},error:null})) as unknown as typeof db.rpc;assert.equal(await parseAndVerifyToken(devicePrefix+a),null);
 db.rpc=(async()=>({data:null,error:null})) as unknown as typeof db.rpc;assert.equal(await parseAndVerifyToken(devicePrefix+a),null);
 }finally{db.rpc=original;}
});
