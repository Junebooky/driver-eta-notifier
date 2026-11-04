import {Client} from 'pg';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {newDeviceSecret,tokenHash} from '../lib/driverDevices/tokens';
import {kakaoWorkbookFixture} from '../utils/kakaoExcelFixture';
import {parseDriverReport} from '../utils/driverReportChat';
import {appendKakaoExcelReport,workbookFromFile} from '../utils/kakaoExcelWorkbook';
import {amendReportRow,addApprovedMonth} from '../utils/reportWorkbookOperations';
import {unzipSync,strToU8,strFromU8,zipSync} from 'fflate';
const storage=(b:Uint8Array)=>({hex:Buffer.from(b).toString('hex'),size:b.length});
export async function verifyReportCompletion(c:Client,url:string){
 for(const f of ['20261104060000_driver_device_invites.sql','20261104061000_report_operations.sql','20261104140000_shared_report_rate_limit.sql','20261104150000_shared_report_links.sql'])await c.query(readFileSync('supabase/migrations/'+f,'utf8'));
 const call=async(db:Client,name:string,args:unknown[])=>{const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');if(name==='claim_report_jobs')return (await db.query(`SELECT * FROM cockpit.${name}(${placeholders})`,args)).rows;const r=await db.query(`SELECT cockpit.${name}(${placeholders}) AS value`,args.map(v=>Array.isArray(v)?JSON.stringify(v):v));return r.rows[0].value;};
 const driver=randomUUID(),actor=randomUUID();await c.query("INSERT INTO cockpit.drivers(id,driver_name,driver_meta) VALUES($1,'격리 기사','{\"status\":\"active\"}')",[driver]);
 const token=newDeviceSecret(),device=newDeviceSecret();await call(c,'issue_report_invite',['vip_limousine_korea',driver,actor,tokenHash(token)]);
 const a=new Client({connectionString:url}),b=new Client({connectionString:url});await a.connect();await b.connect();
 try{
 const redeemed=await Promise.all([a,b].map(db=>call(db,'redeem_report_invite',[tokenHash(token),tokenHash(newDeviceSecret()),'test phone'])));assert.equal(redeemed.filter(Boolean).length,1);
 const next=newDeviceSecret();await call(c,'issue_report_invite',['vip_limousine_korea',driver,actor,tokenHash(next)]);
 assert.ok(await call(c,'redeem_report_invite',[tokenHash(next),tokenHash(device),'휴대전화']));
 const identity=await call(c,'verify_report_device',[tokenHash(device)]);assert.equal(identity.driverId,driver);assert.equal(identity.role,'driver');assert.equal(identity.reportDevice,true);
 await call(c,'revoke_report_devices',['vip_limousine_korea',driver,actor,identity.sessionId]);assert.equal(await call(c,'verify_report_device',[tokenHash(device)]),null);
 const expired=newDeviceSecret();await call(c,'issue_report_invite',['vip_limousine_korea',driver,actor,tokenHash(expired)]);await c.query('UPDATE cockpit.report_driver_invites SET expires_at=now()-interval \'1 second\' WHERE token_hash=$1',[tokenHash(expired)]);assert.equal(await call(c,'redeem_report_invite',[tokenHash(expired),tokenHash(newDeviceSecret()),'phone']),null);
 const inactive=newDeviceSecret();await call(c,'issue_report_invite',['vip_limousine_korea',driver,actor,tokenHash(inactive)]);await c.query("UPDATE cockpit.drivers SET driver_meta='{\"status\":\"inactive\"}' WHERE id=$1",[driver]);assert.equal(await call(c,'redeem_report_invite',[tokenHash(inactive),tokenHash(newDeviceSecret()),'phone']),null);
 await assert.rejects(call(c,'issue_report_invite',['other-org',driver,actor,tokenHash(newDeviceSecret())]),{code:'42501'});
 }finally{await a.end();await b.end();}
 await c.query('CREATE SCHEMA IF NOT EXISTS auth;CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb)');
 await c.query("UPDATE cockpit.drivers SET driver_meta='{\"status\":\"active\"}' WHERE id=$1",[driver]);
 const authUser=randomUUID();await c.query('INSERT INTO auth.users VALUES($1,$2)',[authUser,{driver_id:driver,org:'vip_limousine_korea',cockpit_role:'driver'}]);
 const bound=newDeviceSecret(),boundDevice=newDeviceSecret();await call(c,'issue_report_invite',['vip_limousine_korea',driver,actor,tokenHash(bound)]);assert.ok(await call(c,'redeem_report_invite',[tokenHash(bound),tokenHash(boundDevice),'bound']));
 await c.query("UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data||'{\"disabled\":true}' WHERE id=$1",[authUser]);assert.equal(await call(c,'verify_report_device',[tokenHash(boundDevice)]),null);
 await c.query('DELETE FROM auth.users WHERE id=$1',[authUser]);assert.equal(await call(c,'verify_report_device',[tokenHash(boundDevice)]),null);
 const budget=tokenHash(newDeviceSecret());for(let i=0;i<60;i++)assert.equal(await call(c,'allow_report_link_attempt',[budget]),true);assert.equal(await call(c,'allow_report_link_attempt',[budget]),false);
 console.log('PASS device auth: single-use concurrent redemption, existing master UUID, isolated role, revoke, expired and inactive links');
 const org='completion_'+randomUUID(),source=kakaoWorkbookFixture();await call(c,'register_report_ledger',[org,2026,actor,'company2026.xlsx',storage(source)]);
 const raw=(i:number)=>`4월 5일\n수행담당 : 기사${i}\n차량번호 : 700호 1458\n고객명 : 거래처${i}\n시작 시간 : 10:00\n종료 시간 : 24:00\n운행일지\n서울 → 인천 → 서울`;
 const ids:string[]=[];for(let i=0;i<35;i++){const p=parseDriverReport(raw(i),undefined,new Date(),{workbookYear:2026});assert.deepEqual(p.reviewReasons,[]);ids.push((await call(c,'submit_report',[org,randomUUID(),randomUUID(),'message'+i,raw(i),p,'accepted'])).id);}
 const claim1=await call(c,'claim_report_jobs',[20,org,null]),claim2=await call(c,'claim_report_jobs',[20,org,null]);const jobs=[...claim1,...claim2];assert.equal(jobs.length,35);assert.equal(new Set(jobs.map(j=>j.submission_id)).size,35);
 assert.equal((await call(c,'claim_report_jobs',[20,org,null])).length,0);
 const crashed=jobs[0];await c.query("UPDATE cockpit.report_jobs SET lease_until=now()-interval '1 second' WHERE submission_id=$1",[crashed.submission_id]);
 const recovered=(await call(c,'claim_report_jobs',[1,org,crashed.submission_id]))[0];assert.notEqual(recovered.lease_token,crashed.lease_token);jobs[0]=recovered;
 await call(c,'finish_report_failure',[org,recovered.submission_id,recovered.lease_token,'isolated file failure']);
 const failure=(await c.query('SELECT * FROM cockpit.report_jobs WHERE submission_id=$1',[recovered.submission_id])).rows[0];assert.ok(new Date(failure.next_attempt_at).getTime()>Date.now());assert.equal(failure.last_error,'isolated file failure');
 await call(c,'retry_report_job',[org,recovered.submission_id]);jobs[0]=(await call(c,'claim_report_jobs',[1,org,recovered.submission_id]))[0];
 const write=async(db:Client,job:{submission_id:string;lease_token:string})=>{
  for(let attempt=0;attempt<100;attempt++){
   const s=(await db.query('SELECT * FROM cockpit.report_submissions WHERE id=$1',[job.submission_id])).rows[0];
   const w=(await db.query('SELECT v.* FROM cockpit.report_ledgers l JOIN cockpit.report_workbook_versions v ON l.active_version=v.id WHERE l.org_id=$1 AND l.year=2026',[org])).rows[0];
   const loc=w.manifest[s.id];const out=loc?amendReportRow(new Uint8Array(w.bytes),loc.sheet,loc.row,s.parsed.draft):appendKakaoExcelReport(new Uint8Array(w.bytes),s.parsed.draft);
   if(await call(db,'commit_report_plan',[org,s.id,s.revision,job.lease_token,actor,[{year:2026,expected:w.id,storage:storage(out.bytes)}],out.sheetName,out.rowNumber]))return;
  }throw new Error('test CAS retry exhausted');
 };
 const writers=await Promise.all(Array.from({length:5},async()=>{const d=new Client({connectionString:url});await d.connect();return d;}));
 try{await Promise.all(writers.map(async(d,index)=>{for(let n=index;n<jobs.length;n+=5)await write(d,jobs[n]);}));}finally{await Promise.all(writers.map(d=>d.end()));}
 assert.equal(Number((await c.query("SELECT count(*) FROM cockpit.report_submissions WHERE org_id=$1 AND excel_status='applied'",[org])).rows[0].count),35);
 assert.equal(Number((await c.query("SELECT count(*) FROM cockpit.report_messages WHERE org_id=$1 AND body LIKE 'Excel %'",[org])).rows[0].count),35);
 const first=(await c.query('SELECT * FROM cockpit.report_submissions WHERE id=$1',[ids[0]])).rows[0],location=first.excel_row_number;
 const correction=parseDriverReport(raw(0).replace('24:00','23:00'),undefined,new Date(),{workbookYear:2026});assert.equal(correction.draft.overtime,'OT 2시간 / 심야 1시간');
 assert.equal(await call(c,'review_report',[org,actor,first.id,first.revision,correction,'종료시간 정정']),true);
 const correctionJob=(await call(c,'claim_report_jobs',[1,org,first.id]))[0];await write(c,correctionJob);
 const fixed=(await c.query('SELECT * FROM cockpit.report_submissions WHERE id=$1',[first.id])).rows[0];assert.equal(fixed.excel_row_number,location);assert.equal(fixed.raw_message,raw(0));
 const latest=(await c.query('SELECT v.* FROM cockpit.report_ledgers l JOIN cockpit.report_workbook_versions v ON l.active_version=v.id WHERE l.org_id=$1 AND l.year=2026',[org])).rows[0];
 assert.equal(workbookFromFile(new Uint8Array(latest.bytes)).Sheets['4월'].ref.e.r+1,279);
 const withMonth=addApprovedMonth(new Uint8Array(latest.bytes),'4월',10);assert.equal(await call(c,'commit_report_template',[org,2026,10,'4월',actor,latest.id,storage(withMonth)]),true);
 assert.ok(workbookFromFile(withMonth).Sheets['10월']);
 const entries=unzipSync(kakaoWorkbookFixture());entries['xl/worksheets/sheet1.xml']=strToU8(strFromU8(entries['xl/worksheets/sheet1.xml']).replace('<v>46113</v>','<v>46478</v>'));
 const nextYear=zipSync(entries);await call(c,'register_report_ledger',[org,2027,actor,'company2027.xlsx',storage(nextYear)]);
 assert.equal(Number((await c.query('SELECT count(*) FROM cockpit.report_ledgers WHERE org_id=$1',[org])).rows[0].count),2);
 assert.equal(await call(c,'activate_report_ledger',[org,2026,actor]),true);
 const original=(await c.query("SELECT bytes FROM cockpit.report_workbook_versions WHERE org_id=$1 AND ledger_year=2026 AND kind='original'",[org])).rows[0].bytes;assert.deepEqual(original,Buffer.from(source));
 for(const role of ['anon','authenticated']){await c.query('SET ROLE '+role);await assert.rejects(c.query('SELECT * FROM cockpit.report_jobs'),{code:'42501'});await assert.rejects(call(c,'claim_report_jobs',[1,org,null]),{code:'42501'});await c.query('RESET ROLE');}
 const sharedOrg='shared_'+randomUUID(),sharedHash=tokenHash(newDeviceSecret()),secondHash=tokenHash(newDeviceSecret());
 const expiry=new Date(Date.now()+86400000).toISOString();
 await call(c,'manage_report_shared_link',[sharedOrg,actor,'issue',sharedHash,expiry]);
 let sharedRow=(await c.query('SELECT * FROM cockpit.report_shared_links WHERE org_id=$1',[sharedOrg])).rows[0];
 assert.equal(sharedRow.token_hash,sharedHash);assert.equal(sharedRow.revoked_at,null);
 await call(c,'manage_report_shared_link',[sharedOrg,actor,'issue',secondHash,expiry]);
 sharedRow=(await c.query('SELECT * FROM cockpit.report_shared_links WHERE org_id=$1',[sharedOrg])).rows[0];
 assert.equal(sharedRow.token_hash,secondHash);assert.notEqual(sharedRow.token_hash,sharedHash);
 const guestSource='a18a0000-0000-4000-8000-000000000001';
 const guestRaw=raw(987),guestParsed=parseDriverReport(guestRaw,undefined,new Date(),{workbookYear:2026});
 assert.deepEqual(guestParsed.reviewReasons,[]);
 const guestId=(await call(c,'submit_report',[sharedOrg,guestSource,randomUUID(),'shared-test-987',guestRaw,guestParsed,'accepted'])).id;
 assert.equal((await c.query('SELECT driver_id FROM cockpit.report_submissions WHERE id=$1',[guestId])).rows[0].driver_id,guestSource);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM cockpit.report_messages WHERE linked_submission_id=$1',[guestId])).rows[0].n,2);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM cockpit.report_jobs WHERE submission_id=$1',[guestId])).rows[0].n,1);
 await call(c,'manage_report_shared_link',[sharedOrg,actor,'revoke',null,null]);
 sharedRow=(await c.query('SELECT * FROM cockpit.report_shared_links WHERE org_id=$1',[sharedOrg])).rows[0];
 assert.ok(sharedRow.revoked_at);
 await c.query('SET ROLE anon');
 await assert.rejects(c.query('SELECT * FROM cockpit.report_shared_links'),{code:'42501'});
 await c.query('RESET ROLE');
 console.log('PASS shared report link: token rotation/revoke, no public DB access, unbound intake submission and durable queue');
 console.log('PASS completion: 35 reports, 5 writers, lease crash recovery, bounded retry, same-row correction, automatic recalculation, approved blank month, annual switch and immutable backup');
}
