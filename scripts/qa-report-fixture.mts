/** Disposable localhost fixture. No production credentials or account mutations. */
import {Client} from 'pg';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';import {spawn} from 'node:child_process';
const database=process.env.REPORT_QA_DATABASE_URL;
if(!database||!['localhost','127.0.0.1'].includes(new URL(database).hostname))throw new Error('Disposable localhost REPORT_QA_DATABASE_URL required');
const dir=process.env.REPORT_QA_DIR||'/tmp/report-completion-qa';fs.mkdirSync(dir,{recursive:true,mode:0o700});
const c=new Client({connectionString:database});await c.connect();
if((await c.query("SELECT to_regnamespace('cockpit') AS existing")).rows[0].existing)throw new Error('Refusing to reuse an existing cockpit schema; create a fresh QA database');
await c.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon')THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated')THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role')THEN CREATE ROLE service_role BYPASSRLS;END IF;END $$;
CREATE SCHEMA cockpit;GRANT USAGE ON SCHEMA cockpit TO anon,authenticated,service_role;
CREATE TABLE cockpit.drivers(id uuid PRIMARY KEY,driver_name text,driver_meta jsonb,vehicle_no text);
INSERT INTO cockpit.drivers VALUES('c0000000-0000-4000-8000-000000000001','윤태준','{"status":"active"}',NULL),('c0000000-0000-4000-8000-000000000002','다른 기사','{"status":"active"}',NULL);`);
for(const name of ['20261104030000_driver_report_chat.sql','20261104060000_driver_device_invites.sql','20261104061000_report_operations.sql','20261104140000_shared_report_rate_limit.sql','20261104150000_shared_report_links.sql','20261104182000_hq_seen_secure_links.sql','20261104190000_hq_excel_cell_edit.sql','20261104193000_report_row_order.sql','20261104210000_report_invite_auth_hardening.sql'])await c.query(fs.readFileSync(path.join('supabase/migrations',name),'utf8'));
await c.query("NOTIFY pgrst,'reload schema'");await c.end();
const fixtureKey='isolated-report-fixture-jwt-secret-for-local-tests';
function jwt(role:string){const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+7200})).toString('base64url'),text=h+'.'+b;return text+'.'+createHmac('sha256',fixtureKey).update(text).digest('base64url');}
function serviceRole(header:string){try{const [h,b,s]=header.slice(7).split('.'),expected=createHmac('sha256',fixtureKey).update(h+'.'+b).digest('base64url'),claims=JSON.parse(Buffer.from(b,'base64url').toString());return s.length===expected.length&&timingSafeEqual(Buffer.from(s),Buffer.from(expected))&&claims.role==='service_role'&&claims.exp>Date.now()/1000;}catch{return false;}}
const objects=new Map<string,Buffer>();
const proxy=http.createServer(async(req,res)=>{
 if(!req.url?.startsWith('/storage/')){const upstream=http.request({host:'127.0.0.1',port:Number(process.env.REPORT_QA_REST_PORT||35433),path:req.url?.replace(/^\/rest\/v1/,'')||'/',method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode||500,r.headers);r.pipe(res);});upstream.on('error',()=>res.writeHead(503).end());req.pipe(upstream);return;}
 const json=(body:unknown,status=200)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(body));
 if(!serviceRole(req.headers.authorization||'')){json({message:'private'},403);return;}
 if(fs.existsSync(path.join(dir,'storage-fail'))){json({statusCode:'503',message:'isolated storage outage'},503);return;}
 if(req.url==='/storage/v1/bucket/report-workbooks'){json({id:'report-workbooks',name:'report-workbooks',public:false});return;}
 const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));const body=Buffer.concat(chunks);
 if(req.url==='/storage/v1/object/list/report-workbooks'){const prefix=JSON.parse(body.toString()).prefix||'';json([...objects].filter(([p])=>p.startsWith(prefix+'/')).slice(0,1000).map(([p,b])=>({name:p.split('/').pop(),id:p,metadata:{size:b.length}})));return;}
 const key=decodeURIComponent(req.url).replace(/^\/storage\/v1\/object\/(?:authenticated\/)?report-workbooks\//,'');
 if(req.method==='POST'){if(objects.has(key)){json({message:'exists'},409);return;}objects.set(key,body);json({Id:key,Key:'report-workbooks/'+key});return;}
 if(req.method==='GET'&&objects.has(key)){res.writeHead(200,{'Content-Type':'application/octet-stream'}).end(objects.get(key));return;}json({message:'missing'},404);
});proxy.listen(Number(process.env.REPORT_QA_PROXY_PORT||35435),'127.0.0.1');
Object.assign(process.env,{NODE_ENV:'development'});process.env.DEV_AUTH_ENABLED='true';process.env.COCKPIT_AUTH_SECRET='isolated-chat-local-session-key-only';
const {signCockpitSession}=await import('../lib/auth/serverAuth');
const tokens=Object.fromEntries(['driver','other','hq'].map((name,i)=>[name,signCockpitSession({userId:`c0000000-0000-4000-8000-00000000000${i+1}`,org:'vip_limousine_korea',role:name==='hq'?'hq_admin':'driver',driverId:name==='hq'?undefined:`c0000000-0000-4000-8000-00000000000${i+1}`,driverName:name==='other'?'다른 기사':'윤태준'})]));
fs.writeFileSync(path.join(dir,'tokens.json'),JSON.stringify(tokens),{mode:0o600});
const log=fs.openSync(path.join(dir,'next.log'),'w');const port=process.env.REPORT_QA_PORT||'35434';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p',port],{stdio:['ignore',log,log],env:{...process.env,SUPABASE_URL:'http://127.0.0.1:'+(process.env.REPORT_QA_PROXY_PORT||35435),SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:'+(process.env.REPORT_QA_PROXY_PORT||35435),NEXT_PUBLIC_SUPABASE_ANON_KEY:jwt('anon'),REPORT_STORAGE_MODE:'object',REPORT_STORAGE_BUCKET:'report-workbooks',NEXT_TELEMETRY_DISABLED:'1',CRON_SECRET:'isolated-report-cron-secret-for-qa-only-32chars'}});
console.log('QA fixture starting on loopback port '+port+'; session artifact and log saved in '+dir);
const stop=()=>{child.kill('SIGTERM');proxy.close();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
