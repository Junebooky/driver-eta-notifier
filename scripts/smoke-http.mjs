import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import assert from 'node:assert/strict';
const port=process.env.TEST_HTTP_PORT || '34063';
const providerPort=Number(process.env.TEST_AUTH_PORT || '43527');
const base=`http://127.0.0.1:${port}`;
const signingKey=randomBytes(32);
const driverId='a0000000-0000-4000-8000-000000000001';
const revoked=new Set(),sessions=new Map(),refreshes=new Map(),attempts=new Map();
const fixtureDriver={id:driverId,driver_name:'격리 테스트 기사',vehicle_no:'테스트호차',car_number:'테스트번호',driver_meta:{status:'active'}};
function issue(role,oldSession,ttl=3600){
 const id=oldSession || randomUUID(),userId=role==='hq_admin'?'b0000000-0000-4000-8000-000000000001':'c0000000-0000-4000-8000-000000000001';
 const user={id:userId,aud:'authenticated',role:'authenticated',email:role==='hq_admin'?'hq@example.invalid':'driver@example.invalid',app_metadata:{org:'vip_limousine_korea',cockpit_role:role,...(role==='driver'?{driver_id:driverId}:{})},user_metadata:{cockpit_role:'hq_admin',driver_name:'spoofed'},created_at:new Date().toISOString()};
 const claims={sub:userId,session_id:id,aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+ttl,aal:'aal1',jti:randomUUID()};
 const data=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
 const access_token=data+'.'+createHmac('sha256',signingKey).update(data).digest('base64url');
 const refresh_token=randomUUID();sessions.set(id,{user,claims});refreshes.set(refresh_token,{id,role});
 return {access_token,refresh_token,token_type:'bearer',expires_in:ttl,expires_at:claims.exp,user};
}
function verify(token){try{
 const [h,p,s]=token.split('.');const expected=createHmac('sha256',signingKey).update(h+'.'+p).digest();const actual=Buffer.from(s,'base64url');
 if(expected.length!==actual.length || !timingSafeEqual(expected,actual))return null;
 const claims=JSON.parse(Buffer.from(p,'base64url'));const session=sessions.get(claims.session_id);
 return session && claims.exp>Date.now()/1000?{...session,claims}:null;
}catch{return null;}}
const provider=createServer(async(req,res)=>{
 const url=new URL(req.url,`http://127.0.0.1:${providerPort}`);let body={};
 try{let raw='';for await(const chunk of req)raw+=chunk;if(raw)body=JSON.parse(raw);}catch{res.writeHead(400).end();return;}
 const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 if(url.pathname==='/auth/v1/token'){
  assert.equal(req.headers.apikey,'isolated-anon-key','sign-in must use a separate anon client');
  if(url.searchParams.get('grant_type')==='refresh_token'){
   const previous=refreshes.get(body.refresh_token);refreshes.delete(body.refresh_token);
   if(!previous || revoked.has(previous.id))return json(400,{error:'invalid_grant',msg:'revoked'});
   return json(200,issue(previous.role,previous.id));
  }
  if(!['hq@example.invalid','driver@example.invalid'].includes(body.email)||body.password!=='isolated-password')return json(400,{error:'invalid_grant',msg:'Invalid login credentials'});
  return json(200,issue(body.email.startsWith('hq')?'hq_admin':'driver'));
 }
 const token=req.headers.authorization?.replace(/^Bearer /,'') || '';
 const verified=verify(token);
 if(url.pathname==='/auth/v1/user')return verified?json(200,verified.user):json(401,{msg:'invalid token'});
 if(url.pathname==='/auth/v1/logout'){if(verified)for(const [key,value] of refreshes)if(value.id===verified.claims.session_id)refreshes.delete(key);res.writeHead(204).end();return;}
 if(url.pathname==='/rest/v1/rpc/consume_auth_login_attempt'){
  const key=body.p_keys[0],count=(attempts.get(key)||0)+1;attempts.set(key,count);return json(200,count<=8);
 }
 if(url.pathname==='/rest/v1/rpc/is_active_auth_session'){
  const session=sessions.get(body.p_session_id);return json(200,Boolean(session&&session.user.id===body.p_user_id&&!revoked.has(body.p_session_id)));
 }
 if(url.pathname==='/rest/v1/revoked_auth_sessions'&&req.method==='POST'){revoked.add(body.session_id);return json(201,[]);}
 if(url.pathname==='/rest/v1/drivers')return json(200,url.searchParams.get('id')===`eq.${driverId}`?[fixtureDriver]:[]);
 json(500,{message:'Unexpected fixture request: '+url.pathname});
});
await new Promise((resolve,reject)=>{provider.once('error',reject);provider.listen(providerPort,'127.0.0.1',resolve);});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',port],{
 stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',DEV_AUTH_ENABLED:'true',COCKPIT_AUTH_SECRET:randomBytes(32).toString('hex'),
 SUPABASE_URL:`http://127.0.0.1:${providerPort}`,SUPABASE_ANON_KEY:'isolated-anon-key',SUPABASE_SERVICE_ROLE_KEY:'isolated-service-key',GEMINI_API_KEY:''},
});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const post=(path,body,cookie,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},body:JSON.stringify(body)});
const cookies=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
try{
 let ready=false;for(let i=0;i<100;i++){
  try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}
  if(server.exitCode!==null)throw new Error(`Next server exited: ${logs}`);
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,`Next server did not start: ${logs}`);
 const html=await(await fetch(base+'/login')).text();assert.ok(html.includes('기사 로그인')&&html.includes('관리자 로그인')&&html.includes('계정 이메일'));
 assert.equal((await fetch(base+'/api/driver')).status,401);assert.equal((await fetch(base+'/api/schedules')).status,401);
 assert.equal((await post('/api/auth/session',{action:'dev_switch',target:'admin'})).status,403);
 assert.equal((await post('/api/auth/session',{role:'driver',driverName:'누구나',vehicleNo:'8호차',pin:'shared'})).status,400);
 assert.equal((await post('/api/auth/session',{role:'hq',secret:'shared'})).status,400);
 assert.equal((await post('/api/auth/session',{email:'hq@example.invalid',password:'incorrect'})).status,401);
 assert.equal((await post('/api/auth/session',{email:'hq@example.invalid',password:'isolated-password'},null,{origin:'https://other.invalid'})).status,403);
 const login=await post('/api/auth/session',{email:'hq@example.invalid',password:'isolated-password'});assert.equal(login.status,200);
 assert.ok(login.headers.getSetCookie().every(c=>/HttpOnly/i.test(c)&&/Secure/i.test(c)));
 const cookie=cookies(login),data=await login.json();assert.equal(data.session.role,'hq_admin');assert.equal(data.access_token,undefined);
 assert.equal((await(await fetch(base+'/api/auth/session',{headers:{cookie}})).json()).authenticated,true);
 assert.equal((await post('/api/receipt/scan',{image:'/../../.env'},cookie)).status,400);
 assert.equal((await post('/api/schedules/dispatch',{date:'2026-12-01',pickupTime:'19:00',origin:'A',destination:'B'},cookie)).status,400);
 const driverLogin=await post('/api/auth/session',{email:'driver@example.invalid',password:'isolated-password',role:'hq'});assert.equal(driverLogin.status,200);
 const driverCookie=cookies(driverLogin);const driverSession=await driverLogin.json();assert.equal(driverSession.session.role,'driver');assert.equal(driverSession.session.driverId,driverId);
 const own=await(await fetch(base+'/api/driver?vehicle_no=another-driver',{headers:{cookie:driverCookie}})).json();assert.equal(own.driver.id,driverId);
 assert.equal((await fetch(base+`/api/hq/drivers/${driverId}`,{headers:{cookie:driverCookie}})).status,403);
 assert.equal((await post('/api/auth/session',{action:'logout'},driverCookie)).status,200);
 assert.equal((await fetch(base+'/api/driver',{headers:{cookie:driverCookie}})).status,401);
 assert.equal((await fetch(base+'/api/auth/session',{headers:{cookie:driverCookie}})).status,401);
 // A short-lived access token is renewed using a rotated refresh token, without extending legacy tokens.
 const short=issue('hq_admin',undefined,60);
 const refresh=await fetch(base+'/api/auth/session',{headers:{cookie:`cockpit_session=${short.access_token}; cockpit_refresh=${short.refresh_token}`}});
 assert.equal(refresh.status,200);assert.ok(refresh.headers.getSetCookie().some(c=>c.startsWith('cockpit_refresh=')&&!c.includes(short.refresh_token)));
 for(let i=0;i<8;i++)assert.equal((await post('/api/auth/session',{email:'blocked@example.invalid',password:'incorrect'})).status,401);
 const blocked=await post('/api/auth/session',{email:'blocked@example.invalid',password:'incorrect'});assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'900');
 console.log('PASS production HTTP: personal login, secure cookies, UUID isolation, HQ authorization, refresh rotation, copied-token logout revocation, rate limiting, OCR and dispatch validation (isolated provider fixture)');
}finally{
 server.kill('SIGTERM');provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));
}
