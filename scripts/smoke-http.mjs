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
 const representative=role==='representative',hq=role==='hq_admin'||representative;
 const id=oldSession || randomUUID(),userId=hq?'b0000000-0000-4000-8000-000000000001':'c0000000-0000-4000-8000-000000000001';
 const user={id:userId,aud:'authenticated',role:'authenticated',email:representative?'representative@example.invalid':hq?'hq@example.invalid':'driver@example.invalid',app_metadata:{org:'vip_limousine_korea',cockpit_role:hq?'hq_admin':'driver',...(representative?{cockpit_position:'representative'}:{}),...(role==='driver'?{driver_id:driverId}:{})},user_metadata:{cockpit_role:'hq_admin',cockpit_position:'representative',isRepresentative:true,driver_name:'spoofed'},created_at:new Date().toISOString()};
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
  if(!['hq@example.invalid','driver@example.invalid','representative@example.invalid'].includes(body.email)||body.password!=='isolated-password')return json(400,{error:'invalid_grant',msg:'Invalid login credentials'});
  return json(200,issue(body.email.startsWith('representative')?'representative':body.email.startsWith('hq')?'hq_admin':'driver'));
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
async function assertPageRedirect(path,cookie,target){
 const response=await fetch(base+path,{headers:cookie?{cookie}:{},redirect:'manual'});
 const html=await response.text();
 const location=response.headers.get('location');
 assert.ok((response.status===307 && location && new URL(location,base).href===new URL(target,base).href) ||
   (response.status===200 && (html.includes(`url=${target}`) || html.includes(`NEXT_REDIRECT;replace;${target};307;`))),`expected ${path} to redirect to ${target}; received status=${response.status}, location=${location}`);
 return response;
}
const assertRepresentativeRedirect=(cookie,target='/hq/login')=>assertPageRedirect('/representative',cookie,target);

try{
 let ready=false;for(let i=0;i<100;i++){
  try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}
  if(server.exitCode!==null)throw new Error(`Next server exited: ${logs}`);
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,`Next server did not start: ${logs}`);
 const html=await(await fetch(base+'/login')).text();assert.ok(html.includes('Driver Cockpit')&&html.includes('본사 관리자 로그인')&&html.includes('계정 이메일'));
 const hqHtml=await(await fetch(base+'/hq/login')).text();assert.ok(hqHtml.includes('본사 관리자 로그인')&&hqHtml.includes('계정 이메일'));
 assert.equal((await fetch(base+'/api/driver-reports')).status,401);assert.equal((await fetch(base+'/api/hq/report-workbook?download=1')).status,401);
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
 await assertRepresentativeRedirect();
 await assertPageRedirect('/representative/login',undefined,'/hq/login');
 await assertRepresentativeRedirect(cookie,'/hq?tab=dashboard');
 const forged=await post('/api/auth/session',{email:'hq@example.invalid',password:'isolated-password',portal:'driver'});assert.equal(forged.status,403);assert.ok(forged.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
 const repLogin=await post('/api/auth/session',{email:'representative@example.invalid',password:'isolated-password',portal:'representative'});assert.equal(repLogin.status,200);
 const repCookie=cookies(repLogin),rep=await repLogin.json();assert.equal(rep.session.role,'hq_admin');assert.equal(rep.session.isRepresentative,true);
 await assertRepresentativeRedirect(repCookie,'/hq?tab=dashboard');
 assert.equal((await(await fetch(base+'/api/auth/session',{headers:{cookie:repCookie}})).json()).session.isRepresentative,true);

 const expiredRep=issue('representative',undefined,-1);
 const expiredRepCookie=`cockpit_session=${expiredRep.access_token}; cockpit_refresh=${expiredRep.refresh_token}`;
 await assertRepresentativeRedirect(expiredRepCookie,'/api/auth/representative-session');
 const renewedRep=await fetch(base+'/api/auth/representative-session',{redirect:'manual',headers:{cookie:`cockpit_session=${expiredRep.access_token}; cockpit_refresh=${expiredRep.refresh_token}`}});
 assert.equal(renewedRep.status,307);assert.equal(new URL(renewedRep.headers.get('location'),base).href,base+'/hq?tab=dashboard');assert.ok(renewedRep.headers.getSetCookie().some(value=>value.startsWith('cockpit_refresh=')&&!value.includes(expiredRep.refresh_token)));
 assert.equal((await fetch(base+'/hq?tab=dashboard',{redirect:'manual',headers:{cookie:cookies(renewedRep)}})).status,200);

 // Existing and newly installed PWA icons all launch the same root URL.
 const manifest=await(await fetch(base+'/manifest.json')).json();assert.equal(manifest.start_url,'/');
 await assertPageRedirect('/',undefined,'/login');
 await assertPageRedirect('/',cookie,'/hq?tab=dashboard');
 const representativeRoot=await assertPageRedirect('/',repCookie,'/hq?tab=dashboard');
 assert.match(representativeRoot.headers.get('cache-control') || '',/private|no-store/);
 assert.equal(new URL((await fetch(base+'/api/auth/launch?next=https://other.invalid',{headers:{cookie:repCookie},redirect:'manual'})).headers.get('location'),base).href,base+'/hq?tab=dashboard');
 for(const role of ['representative','hq_admin','driver']){
   const expired=issue(role,undefined,-1),expiredCookie=`cockpit_session=${expired.access_token}; cockpit_refresh=${expired.refresh_token}`;
   await assertPageRedirect('/',expiredCookie,'/api/auth/launch');
   const resumed=await fetch(base+'/api/auth/launch',{headers:{cookie:expiredCookie},redirect:'manual'});
   const home=role==='driver'?'/':'/hq?tab=dashboard';
   assert.equal(resumed.status,307);assert.equal(new URL(resumed.headers.get('location'),base).href,base+home);
   assert.ok(resumed.headers.getSetCookie().some(value=>value.startsWith('cockpit_refresh=')&&!value.includes(expired.refresh_token)));
   const resumedPage=await fetch(base+home,{headers:{cookie:cookies(resumed)},redirect:'manual'});assert.equal(resumedPage.status,200);
 }
 const revokedLaunch=issue('representative');revoked.add(verify(revokedLaunch.access_token).claims.session_id);
 const revokedCookie=`cockpit_session=${revokedLaunch.access_token}; cockpit_refresh=${revokedLaunch.refresh_token}`;
 await assertRepresentativeRedirect(revokedCookie,'/api/auth/representative-session');
 const deniedRepresentative=await fetch(base+'/api/auth/representative-session',{headers:{cookie:revokedCookie},redirect:'manual'});
 assert.equal(deniedRepresentative.status,307);assert.equal(new URL(deniedRepresentative.headers.get('location'),base).href,base+'/hq/login');
 assert.ok(deniedRepresentative.headers.getSetCookie().length>0);
 assert.ok(deniedRepresentative.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
 const deniedLaunch=await fetch(base+'/api/auth/launch',{headers:{cookie:`cockpit_session=${revokedLaunch.access_token}; cockpit_refresh=${revokedLaunch.refresh_token}`},redirect:'manual'});
 assert.equal(new URL(deniedLaunch.headers.get('location'),base).href,base+'/login');assert.ok(deniedLaunch.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
 console.log('PASS PWA HTTP: root → HQ/driver by trusted role, expired access → rotated cookies → correct home, revoked session → login, private responses and unchanged manifest start URL');
 console.log('PASS representative HTTP: unified HQ portal redirect, driver cross-portal access denied, valid sessions launch dashboard');

 assert.equal((await post('/api/receipt/scan',{image:'/../../.env'},cookie)).status,400);
 assert.equal((await post('/api/schedules/dispatch',{date:'2026-12-01',pickupTime:'19:00',origin:'A',destination:'B'},cookie)).status,400);
 const driverLogin=await post('/api/auth/session',{email:'driver@example.invalid',password:'isolated-password',role:'hq'});assert.equal(driverLogin.status,200);
 const driverCookie=cookies(driverLogin);const driverSession=await driverLogin.json();assert.equal(driverSession.session.role,'driver');assert.equal(driverSession.session.driverId,driverId);
 assert.equal((await fetch(base+'/',{headers:{cookie:driverCookie},redirect:'manual'})).status,200,'driver launch remains the existing cockpit');
 assert.equal((await fetch(base+'/api/hq/report-workbook?download=1',{headers:{cookie:driverCookie}})).status,403);
 assert.equal((await fetch(base+'/api/driver-reports?driverId=b0000000-0000-4000-8000-000000000002',{headers:{cookie:driverCookie}})).status,403);
 assert.equal((await fetch(base+'/driver/reports',{headers:{cookie:driverCookie}})).status,200);
 await assertRepresentativeRedirect(driverCookie);
 await assertRepresentativeRedirect('cockpit_session=invalid-token');
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
