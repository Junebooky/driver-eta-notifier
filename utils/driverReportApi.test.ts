import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {signCockpitSession,type CockpitAuthSession} from '../lib/auth/serverAuth';
import {supabaseAdmin as db} from '../lib/supabase/server';
import {sameOrigin} from '../lib/driverReports/http';
import {GET,POST} from '../app/api/driver-reports/route';
import {GET as workbook} from '../app/api/hq/report-workbook/route';
const id='a0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000001';
const session:Omit<CockpitAuthSession,'issuedAt'|'expiresAt'>={userId:id,org:'vip_limousine_korea',role:'driver',driverId:id,driverName:'본인'};
const cookie=()=>`cockpit_session=${signCockpitSession(session)}`;
test('chat APIs enforce authenticated UUID/org and never grant workbook access to a driver',async()=>{
 assert.equal((await GET(new NextRequest('http://localhost/api/driver-reports'))).status,401);
 assert.equal((await GET(new NextRequest('http://localhost/api/driver-reports',{headers:{cookie:'cockpit_session='+signCockpitSession({...session,driverId:undefined})}}))).status,403);
 assert.equal((await GET(new NextRequest('http://localhost/api/driver-reports?driverId='+other,{headers:{cookie:cookie()}}))).status,403);
 assert.equal((await workbook(new NextRequest('http://localhost/api/hq/report-workbook?download=1',{headers:{cookie:cookie()}}))).status,403);
 assert.equal((await POST(new NextRequest('http://localhost/api/driver-reports',{method:'POST',headers:{cookie:cookie(),origin:'https://other.invalid'},body:'{}'}))).status,403);
 const originalFrom=db.from,originalRpc=db.rpc;
 const predicates:Record<string,unknown>={};let saved:Record<string,unknown>|undefined;
 const builder={eq:(k:string,v:unknown)=>{predicates[k]=v;return builder;},select:()=>builder,order:()=>builder,limit:()=>builder,
  then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[{id:'only-own-message'}],error:null}).then(resolve),single:async()=>({data:{excel_status:'review'},error:null})};
 try{
  db.from=(()=>builder) as unknown as typeof db.from;
  db.rpc=(async(_fn:string,args:Record<string,unknown>)=>{if(_fn==='allow_report_link_attempt')return {data:true,error:null};if(_fn==='submit_report'){saved=args;return {data:{id,duplicate:false},error:null};}return {data:[],error:null};}) as unknown as typeof db.rpc;
  const response=await GET(new NextRequest('http://localhost/api/driver-reports',{headers:{cookie:cookie()}}));assert.equal(response.status,200);assert.equal(predicates.driver_id,id);assert.equal(predicates.org_id,'vip_limousine_korea');assert.match(response.headers.get('cache-control')||'',/no-store/);
  const wrongThread=await POST(new NextRequest('http://localhost/api/driver-reports',{method:'POST',headers:{cookie:cookie(),'content-type':'application/json'},body:JSON.stringify({message:'다른 대화방',requestKey:other,driverId:other})}));assert.equal(wrongThread.status,403);
  const submitted=await POST(new NextRequest('http://localhost/api/driver-reports',{method:'POST',headers:{cookie:cookie(),'content-type':'application/json'},body:JSON.stringify({message:'未확정 보고',requestKey:other,org_id:'forged-org'})}));
  assert.equal(submitted.status,201);assert.equal(saved?.p_driver,id);assert.equal(saved?.p_org,'vip_limousine_korea');
 }finally{db.from=originalFrom;db.rpc=originalRpc;}
});

test('origin follows the received Host without trusting forwarded host',()=>{
 assert.equal(sameOrigin(new Request('http://localhost/api',{headers:{host:'127.0.0.1:35434',origin:'http://127.0.0.1:35434'}})),true);
 assert.equal(sameOrigin(new Request('http://localhost/api',{headers:{host:'company.example',origin:'https://evil.example','x-forwarded-host':'evil.example'}})),false);
 assert.equal(sameOrigin(new Request('https://company.example/api',{headers:{host:'company.example',origin:'http://company.example'}})),false);
});
