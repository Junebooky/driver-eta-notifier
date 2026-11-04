import {Client} from 'pg';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parseDriverReport,reportReply} from '../utils/driverReportChat';
import {appendKakaoExcelReport,workbookFromFile} from '../utils/kakaoExcelWorkbook';
import {kakaoWorkbookFixture} from '../utils/kakaoExcelFixture';
export async function verifyDriverReportChat(admin:Client,connectionString:string) {
 await admin.query(readFileSync('supabase/migrations/20261104030000_driver_report_chat.sql','utf8'));
 const org='isolated_report_org',actor=randomUUID(),drivers=Array.from({length:5},()=>randomUUID());
 const source=kakaoWorkbookFixture();
 const rpc=async(c:Client,name:string,args:unknown[])=>{const r=await c.query(`SELECT cockpit.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS value`,args);return r.rows[0].value;};
 const raw=(i:number)=>`2026년 4월 5일\n수행담당 : 검증 기사 ${i}\n차량번호 : 700호 1458\n고객명 : 검증 거래처 ${i}\n시작 시간 : 09:15\n종료 시간 : 17:20\n운행일지\n서울 → 인천`;
 const parsed=drivers.map((_,i)=>parseDriverReport(raw(i)));
 const ids:string[]=[];const requests=drivers.map(()=>randomUUID());
 for(let i=0;i<5;i++)ids.push((await rpc(admin,'submit_report',[org,drivers[i],requests[i],'fingerprint-'+i,raw(i),parsed[i],reportReply(parsed[i])])).id);
 const history=await admin.query('SELECT * FROM cockpit.report_messages WHERE org_id=$1 ORDER BY seq',[org]);assert.equal(history.rowCount,10);
 const replay=await rpc(admin,'submit_report',[org,drivers[0],randomUUID(),'fingerprint-0',raw(0),parsed[0],'unused']);assert.equal(replay.id,ids[0]);assert.equal(replay.duplicate,true);
 await assert.rejects(rpc(admin,'submit_report',[org,drivers[0],requests[0],'different','changed',parsed[0],'unused']),{code:'40001'});
 const orig=await rpc(admin,'commit_report_workbook',[org,actor,null,Buffer.from(source),'company.xlsx',null,null,null,null]);assert.equal(orig,true);
 const first=(await admin.query('SELECT active_version FROM cockpit.report_workbooks WHERE org_id=$1',[org])).rows[0].active_version;
 const clients=await Promise.all(drivers.map(async()=>{const c=new Client({connectionString});await c.connect();return c;}));let conflicts=0;
 try{
  // All five initial reads see the same version; four must lose the CAS and retry.
  let arrived=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await Promise.all(clients.map(async(c,i)=>{
   for(let attempt=0;attempt<12;attempt++){
    const w=(await c.query('SELECT v.id,v.bytes FROM cockpit.report_workbooks w JOIN cockpit.report_workbook_versions v ON w.active_version=v.id WHERE w.org_id=$1',[org])).rows[0];
    if(attempt===0){arrived++;if(arrived===5)release();await gate;}
    const out=appendKakaoExcelReport(new Uint8Array(w.bytes),parsed[i].draft);
    const done=await rpc(c,'commit_report_workbook',[org,actor,w.id,Buffer.from(out.bytes),'company.xlsx',ids[i],1,out.sheetName,out.rowNumber]);
    if(done)return;conflicts++;
   }
   throw new Error('CAS retries exhausted');
  }));
 }finally{await Promise.all(clients.map(c=>c.end()));}
 assert.ok(conflicts>=4);
 const records=(await admin.query('SELECT * FROM cockpit.report_submissions WHERE org_id=$1',[org])).rows;assert.ok(records.every(r=>r.excel_status==='applied'));assert.equal(new Set(records.map(r=>r.excel_row_number)).size,5);
 const latest=(await admin.query('SELECT v.* FROM cockpit.report_workbooks w JOIN cockpit.report_workbook_versions v ON w.active_version=v.id WHERE w.org_id=$1',[org])).rows[0];
 const wb=workbookFromFile(new Uint8Array(latest.bytes));assert.equal(wb.Sheets['4월'].ref.e.r+1,249);assert.equal(Object.keys(latest.manifest).length,5);
 assert.deepEqual((await admin.query('SELECT bytes FROM cockpit.report_workbook_versions WHERE id=$1',[first])).rows[0].bytes,Buffer.from(source));
 assert.equal(await rpc(admin,'commit_report_workbook',[org,actor,latest.id,Buffer.from(source),'company.xlsx',ids[0],1,'4월',250]),false);
 // Restore initial backup, then replay one, then restore the five-report snapshot: manifest repairs statuses.
 assert.equal(await rpc(admin,'restore_report_workbook',[org,actor,first,latest.id]),true);
 let state=(await admin.query('SELECT * FROM cockpit.report_submissions WHERE org_id=$1',[org])).rows;assert.ok(state.every(r=>r.excel_status==='pending'));
 const active=(await admin.query('SELECT active_version FROM cockpit.report_workbooks WHERE org_id=$1',[org])).rows[0].active_version;
 assert.equal(await rpc(admin,'restore_report_workbook',[org,actor,latest.id,active]),true);
 state=(await admin.query('SELECT * FROM cockpit.report_submissions WHERE org_id=$1',[org])).rows;assert.ok(state.every(r=>r.excel_status==='applied'&&r.excel_row_number));
 assert.equal(await rpc(admin,'restore_report_workbook',['other_org',actor,first,active]),false);
 // Failed Excel work does not delete accepted messages or raw submission; retry remains possible.
 const failed=await rpc(admin,'submit_report',[org,drivers[0],randomUUID(),'pending_failure','raw failure',parsed[0],'accepted']);
 assert.equal(await rpc(admin,'fail_report',[org,failed.id,1,'missing approved month']),true);
 const saved=(await admin.query('SELECT * FROM cockpit.report_submissions WHERE id=$1',[failed.id])).rows[0];assert.equal(saved.raw_message,'raw failure');assert.equal(saved.excel_status,'error');
 for(const role of ['anon','authenticated']){
  await admin.query('SET ROLE '+role);
  await assert.rejects(admin.query('SELECT * FROM cockpit.report_messages'),{code:'42501'});
  await assert.rejects(rpc(admin,'restore_report_workbook',[org,actor,first,active]),{code:'42501'});
  await admin.query('RESET ROLE');
 }
 console.log('PASS driver reports: persisted history, duplicates/replay, 5 concurrent CAS writers, backups, restore manifests, failure durability and browser-role denial');
}
