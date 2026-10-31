import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '../lib/supabase/server';
import { parseAndVerifyToken, signCockpitSession } from '../lib/auth/serverAuth';
import { POST as updateProfile } from '../app/api/driver/route';
import { GET as readHqDriver } from '../app/api/hq/drivers/[id]/route';
const id='a0000000-0000-4000-8000-000000000001';
const sessionId='b0000000-0000-4000-8000-000000000001';
const userId='c0000000-0000-4000-8000-000000000001';
const jwt=(patch={})=>'header.'+Buffer.from(JSON.stringify({sub:userId,session_id:sessionId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,aal:'aal1',...patch})).toString('base64url')+'.provider-verified-signature';

test('personal authentication binds provider identity, active session and immutable driver UUID', async()=>{
  const from=supabaseAdmin.from,rpc=supabaseAdmin.rpc,getUser=supabaseAdmin.auth.getUser;
  let meta:Record<string,unknown>={org:'vip_limousine_korea',cockpit_role:'driver',driver_id:id};
  let active=true,failWrite=false; let writes=0;
  const row={id,driver_name:'본인',vehicle_no:'8호차',car_number:'123가4567',driver_meta:{status:'active'}};
  supabaseAdmin.auth.getUser=(async()=>({data:{user:{id:userId,aud:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:meta,user_metadata:{cockpit_role:'hq_admin',driver_id:'spoofed'}}},error:null})) as typeof getUser;
  supabaseAdmin.from=((table:string)=>{
    assert.equal(table,'drivers');
    const q={select:()=>q,eq:(key:string,value:string)=>{assert.equal(key,'id');assert.equal(value,id);return q;},maybeSingle:async()=>({data:row,error:null})};return q;
  }) as unknown as typeof from;
  supabaseAdmin.rpc=(async(name:string,args:Record<string,unknown>)=>{
    if(name==='is_active_auth_session'){assert.equal(args.p_session_id,sessionId);return {data:active,error:null};}
    assert.equal(name,'update_driver_profile_by_id');assert.equal(args.p_driver_id,id);writes++;
    assert.deepEqual(args.p_preferences,{presetOrder:['home','airport']});
    assert.deepEqual(args.p_patch,{driver_name:'새 성함'});
    return {data:failWrite?null:{...row,driver_name:'새 성함'},error:failWrite?{message:'offline'}:null};
  }) as unknown as typeof rpc;
  const req=(body:unknown)=>new NextRequest('http://localhost/api/driver',{method:'POST',headers:{authorization:`Bearer ${jwt()}`,'content-type':'application/json'},body:JSON.stringify(body)});
  try{
    const own=await parseAndVerifyToken(jwt());assert.equal(own?.role,'driver');assert.equal(own?.driverId,id);assert.equal(own?.driverName,'본인');
    assert.equal((await readHqDriver(new NextRequest('http://localhost/api/hq/drivers/'+id,{headers:{authorization:`Bearer ${jwt()}`}}),{params:Promise.resolve({id})})).status,403);
    meta={...meta,org:'other'};assert.equal(await parseAndVerifyToken(jwt()),null);
    meta={org:'vip_limousine_korea',cockpit_role:'driver',driver_id:id,disabled:true};assert.equal(await parseAndVerifyToken(jwt()),null);
    meta={org:'vip_limousine_korea',cockpit_role:'driver',driver_id:id,require_mfa:true};assert.equal(await parseAndVerifyToken(jwt()),null);assert.ok(await parseAndVerifyToken(jwt({aal:'aal2'})));
    meta={org:'vip_limousine_korea',cockpit_role:'driver',driver_id:id};active=false;assert.equal(await parseAndVerifyToken(jwt()),null);active=true;
    assert.equal(await parseAndVerifyToken(jwt({exp:1})),null);
    assert.equal((await updateProfile(req({driverId:'d0000000-0000-4000-8000-000000000001',driverName:'다른 사람'}))).status,403);
    assert.equal((await updateProfile(req({vehicleNo:'다른 차량',driverName:'본인'}))).status,409);
    assert.equal((await updateProfile(req({driverId:id,driverName:'새 성함',presetOrder:['home','airport']}))).status,200);
    failWrite=true;assert.equal((await updateProfile(req({driverName:'새 성함',presetOrder:['home','airport']}))).status,503);
    assert.equal(writes,2);
    meta={org:'vip_limousine_korea',cockpit_role:'hq_admin'};
    assert.equal((await updateProfile(req({vehicle_no:'8호차',driver_name:'덮어쓰기'}))).status,400);
    // Production rejects every legacy signed shared-credential session, even with a valid signature.
    const legacy=signCockpitSession({userId,org:'vip_limousine_korea',role:'hq_admin'});
    const env=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'production'});
    try{assert.equal(await parseAndVerifyToken(legacy),null);}finally{Object.assign(process.env,{NODE_ENV:env});}
  }finally{supabaseAdmin.from=from;supabaseAdmin.rpc=rpc;supabaseAdmin.auth.getUser=getUser;}
});

test('client session refresh is single-flight and a late response cannot restore a purged identity',async()=>{
 const {ensureClientAuth,purgeLocalCaches,logoutClientSession}=await import('./cockpitClientAuth');
 const original=globalThis.fetch;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 let release!:()=>void;const paused=new Promise<void>(resolve=>release=resolve);let calls=0;
 globalThis.fetch=(async()=>{calls++;await paused;return Response.json({authenticated:true,session:{role:'driver',userId:'old-driver'}});}) as typeof fetch;
 try{
  purgeLocalCaches();
  const first=ensureClientAuth(),second=ensureClientAuth();assert.equal(calls,1);
  purgeLocalCaches();release();assert.equal((await first).authenticated,false);assert.equal((await second).authenticated,false);
  globalThis.fetch=(async()=>Response.json({authenticated:true,session:{role:'driver',userId:'new-driver'}})) as typeof fetch;
  assert.equal((await ensureClientAuth()).userId,'new-driver');
  globalThis.fetch=(async()=>Response.json({ok:false},{status:503})) as typeof fetch;
  assert.equal(await logoutClientSession(),false);
 }finally{purgeLocalCaches();globalThis.fetch=original;Reflect.deleteProperty(globalThis,'window');}
});
