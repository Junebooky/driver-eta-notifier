import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const port = process.env.TEST_HTTP_PORT || '34063';
const base = `http://127.0.0.1:${port}`;
const secret = randomBytes(24).toString('hex');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',port], {
  stdio: ['ignore','pipe','pipe'], env: { ...process.env, NODE_ENV:'production', DEV_AUTH_ENABLED:'true',
    COCKPIT_AUTH_SECRET:randomBytes(32).toString('hex'), HQ_ADMIN_SECRET:secret,
    NEXT_PUBLIC_SUPABASE_URL:'https://supabase.invalid', SUPABASE_SERVICE_ROLE_KEY:'isolated-smoke-key', GEMINI_API_KEY:'' },
});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
try {
  let ready=false;
  for(let i=0;i<100;i++) {
    try {const r=await fetch(base+'/login');if(r.ok){ready=true;break;}} catch {}
    if(server.exitCode !== null) throw new Error(`Next server exited: ${logs}`);
    await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,`Next server did not start: ${logs}`);
  const html=await(await fetch(base+'/login')).text();
  assert.ok(html.includes('기사 로그인')&&html.includes('관리자 로그인'));
  assert.equal((await fetch(base+'/api/driver')).status,401);
  assert.equal((await fetch(base+'/api/schedules')).status,401);
  const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}: {})},body:JSON.stringify(body)});
  assert.equal((await post('/api/auth/session',{action:'dev_switch',target:'admin'})).status,403);
  assert.equal((await post('/api/auth/session',{role:'hq',secret:'incorrect'})).status,403);
  const login=await post('/api/auth/session',{role:'hq',secret});assert.equal(login.status,200);
  const setCookie=login.headers.get('set-cookie');assert.ok(/HttpOnly/i.test(setCookie)&&/Secure/i.test(setCookie));
  const cookie=setCookie.split(';')[0];
  const session=await(await fetch(base+'/api/auth/session',{headers:{cookie}})).json();assert.equal(session.authenticated,true);
  assert.equal((await post('/api/receipt/scan',{image:'/../../.env'},cookie)).status,400);
  const noEnd=await post('/api/schedules/dispatch',{date:'2026-12-01',pickupTime:'19:00',origin:'A',destination:'B'},cookie);
  assert.equal(noEnd.status,400);
  console.log('PASS production HTTP: login rendering, 401 isolation, production dev-switch denial, credentials, secure cookie, OCR path rejection, missing-end validation');
} finally { server.kill('SIGTERM'); }
