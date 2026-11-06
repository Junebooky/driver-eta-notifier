import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import type {Client} from 'pg';
import {kakaoWorkbookFixture} from '../utils/kakaoExcelFixture';
import {appendKakaoExcelReport,workbookFromFile} from '../utils/kakaoExcelWorkbook';
import {blankKakaoExcelDraft} from '../utils/kakaoExcelImport';

const storage=(bytes:Uint8Array)=>({
 hex:Buffer.from(bytes).toString('hex'),
 size:bytes.byteLength,
 sha256:createHash('sha256').update(bytes).digest('hex'),
});
const parsed=(date:string,customer:string)=>({
 reviewReasons:[],warnings:[],totalWorkMinutes:480,otMinutes:0,nightMinutes:0,
 draft:{date,customer,driver:'DB 테스트 기사',plate:'700호 1458',model:'스프린터 319',
 time:'10:00~18:00',route:'차고지 - 호텔',serviceType:'의전',
 overtime:'',amount:'',payment:'',totalWithVat:''},
});
export async function verifyReportLedgerReplacement(admin:Client,a:Client,b:Client){
 // Migrations are intentionally applied to disposable CI Postgres, never an actual
 // VIP company database or a live workbook.
 await admin.query(readFileSync('supabase/migrations/20261104061000_report_operations.sql','utf8'));
 await admin.query(readFileSync('supabase/migrations/20261104193000_report_row_order.sql','utf8'));
 const upgrade=readFileSync('supabase/migrations/20261106150000_replace_report_ledger.sql','utf8');
 await admin.query(upgrade);await admin.query(upgrade);

 const org='isolated_replace_'+randomUUID(),actor=randomUUID(),driver=randomUUID();
 const base=kakaoWorkbookFixture();
 const legacyDraft={...blankKakaoExcelDraft(),...parsed('2026-04-05','이전 원본 고객').draft};
 const legacy=appendKakaoExcelReport(base,legacyDraft);
 const registration=(await a.query(
  'SELECT cockpit.register_report_ledger($1,$2,$3,$4,$5::jsonb) version',
  [org,2026,actor,'이전 원본2026년.xlsx',JSON.stringify(storage(legacy.bytes))]
 )).rows[0].version as string;
 await admin.query("INSERT INTO cockpit.report_month_templates(org_id,year,month,source_month,approved_by) VALUES($1,2026,11,'4월',$2)",[org,actor]);
 const oldId=randomUUID();
 await admin.query(`INSERT INTO cockpit.report_submissions(
   id,org_id,driver_id,request_key,fingerprint,raw_message,parsed,excel_status,
   excel_sheet_name,excel_row_number,applied_version,ledger_year
  ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'applied',$8,$9,$10,2026)`,
  [oldId,org,driver,randomUUID(),'old-fingerprint','과거 채팅 운행보고',
   JSON.stringify(parsed('2026-04-05','이전 원본 고객')),legacy.sheetName,legacy.rowNumber,registration]);
 await admin.query('UPDATE cockpit.report_workbook_versions SET manifest=$2::jsonb WHERE id=$1',
  [registration,JSON.stringify({[oldId]:{sheet:legacy.sheetName,row:legacy.rowNumber}})]);

 const fresh=kakaoWorkbookFixture(),args=[
   org,2026,actor,registration,'사모님 원본2026년.xlsx',JSON.stringify(storage(fresh)),
 ];
 const run=(client:Client)=>client.query(
  'SELECT cockpit.replace_report_ledger($1,$2,$3,$4,$5,$6::jsonb) result',args
 ).then(x=>x.rows[0].result as {version:string;archivedReports:number;previousVersion:string}|null);
 const [first,second]=await Promise.all([run(a),run(b)]);
 const successes=[first,second].filter(Boolean);
 assert.equal(successes.length,1,'exactly one manager may replace the expected workbook');
 assert.equal(successes[0]?.archivedReports,1);
 assert.equal(successes[0]?.previousVersion,registration);
 const newer=successes[0]!.version;
 const archive=(await admin.query(
  'SELECT excel_status,excel_sheet_name,excel_row_number,applied_version,revision FROM cockpit.report_submissions WHERE id=$1',[oldId]
 )).rows[0];
 assert.equal(archive.excel_status,'archived');
 assert.equal(archive.excel_sheet_name,null);
 assert.equal(archive.excel_row_number,null);
 assert.equal(archive.applied_version,null);
 assert.equal(archive.revision,2);
 const record=(await admin.query('SELECT active_version,filename FROM cockpit.report_ledgers WHERE org_id=$1 AND year=2026',[org])).rows[0];
 assert.equal(record.active_version,newer);
 assert.equal(record.filename,'사모님 원본2026년.xlsx');
 assert.equal((await admin.query('SELECT active_version FROM cockpit.report_workbooks WHERE org_id=$1',[org])).rows[0].active_version,newer);
 assert.deepEqual((await admin.query('SELECT bytes FROM cockpit.report_workbook_versions WHERE id=$1',[registration])).rows[0].bytes,Buffer.from(legacy.bytes));
 assert.deepEqual((await admin.query('SELECT bytes FROM cockpit.report_workbook_versions WHERE id=$1',[newer])).rows[0].bytes,Buffer.from(fresh));
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM cockpit.report_workbook_versions WHERE org_id=$1',[org])).rows[0].n,2);
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM cockpit.report_month_templates WHERE org_id=$1 AND year=2026',[org])).rows[0].n,0,'old owner month templates must not leak into the new owner file');
 assert.equal(await run(a),null,'stale expected version cannot replace again');
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM cockpit.report_workbook_versions WHERE org_id=$1',[org])).rows[0].n,2);

 // A newly submitted report must append to the *new* owner original, while the
 // archived report remains only in the old immutable workbook snapshot.
 const newId=randomUUID(),newDraft={...blankKakaoExcelDraft(),...parsed('2026-04-11','교체 후 채팅 고객').draft};
 await admin.query(`INSERT INTO cockpit.report_submissions
  (id,org_id,driver_id,request_key,fingerprint,raw_message,parsed,excel_status)
  VALUES($1,$2,$3,$4,$5,'교체 후 채팅 운행보고',$6::jsonb,'pending')`,
  [newId,org,driver,randomUUID(),'new-fingerprint',JSON.stringify(parsed('2026-04-11','교체 후 채팅 고객'))]);
 const claimed=(await a.query('SELECT lease_token FROM cockpit.claim_report_jobs(1,$1,$2)',[org,newId])).rows[0];
 assert.ok(claimed?.lease_token,'the accepted report is available for background processing');
 const added=appendKakaoExcelReport(fresh,newDraft);
 const plans=[{year:2026,expected:newer,storage:storage(added.bytes)}];
 const commit=(await a.query(
  'SELECT cockpit.commit_report_plan($1,$2,$3,$4,$5,$6::jsonb,$7,$8) applied',
  [org,newId,1,claimed.lease_token,actor,JSON.stringify(plans),added.sheetName,added.rowNumber]
 )).rows[0].applied;
 assert.equal(commit,true);
 const active=(await admin.query(`SELECT v.bytes,v.manifest,v.id FROM cockpit.report_ledgers w
  JOIN cockpit.report_workbook_versions v ON v.id=w.active_version
  WHERE w.org_id=$1 AND w.year=2026`,[org])).rows[0];
 const model=workbookFromFile(new Uint8Array(active.bytes));
 assert.equal(model.Sheets['4월'].cells['D'+added.rowNumber].v,'교체 후 채팅 고객');
 assert.equal(active.manifest[newId].row,added.rowNumber);
 assert.equal(active.manifest[oldId],undefined,'old UUID must not point into new owner file');
 assert.equal((await admin.query('SELECT excel_status FROM cockpit.report_submissions WHERE id=$1',[oldId])).rows[0].excel_status,'archived');
 assert.equal((await admin.query('SELECT excel_status FROM cockpit.report_submissions WHERE id=$1',[newId])).rows[0].excel_status,'applied');

 await admin.query('SET ROLE authenticated');
 try{
  await assert.rejects(
   admin.query('SELECT cockpit.replace_report_ledger($1,$2,$3,$4,$5,$6::jsonb)',args),
   {code:'42501'},
  );
 }finally{await admin.query('RESET ROLE');}
 console.log('PASS replace workbook: immutable backup + new original + archived links + one concurrent winner + future report append + denied public RPC');
}
