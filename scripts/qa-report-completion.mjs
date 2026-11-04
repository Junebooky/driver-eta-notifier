// Isolated browser E2E; never point this at production. Tokens and company workbooks stay outside Git.
import {createRequire} from 'node:module';
import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.REPORT_CHAT_QA_URL,sessionFile=process.env.REPORT_CHAT_QA_TOKENS,workbook=process.env.REPORT_CHAT_QA_WORKBOOK,outage=process.env.REPORT_QA_STORAGE_OUTAGE_FILE,cronSecret=process.env.REPORT_QA_CRON_SECRET;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!sessionFile||!workbook||!outage||!cronSecret)throw new Error('Fresh isolated localhost fixture required: REPORT_CHAT_QA_URL/TOKENS/WORKBOOK, REPORT_QA_STORAGE_OUTAGE_FILE, REPORT_QA_CRON_SECRET');
const tokens=JSON.parse(fs.readFileSync(sessionFile)),driver=process.env.REPORT_QA_DRIVER_ID||'c0000000-0000-4000-8000-000000000001';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
try{const hq=await browser.newContext();await hq.addCookies([{name:'cockpit_session',value:tokens.hq,url:base}]);
let upload=await hq.request.post(base+'/api/hq/report-workbook',{headers:{'Content-Type':'application/octet-stream','X-Workbook-Name':'company2026.xlsx'},data:fs.readFileSync(workbook),timeout:90000});if(upload.status()!==200){const existing=await (await hq.request.get(base+'/api/hq/report-workbook')).json();assert.equal(existing.workbook?.year,2026);}
const issue=await hq.request.post(base+'/api/hq/report-invites',{data:{action:'issue',driverId:driver}});assert.equal(issue.status(),200,await issue.text());const link=(await issue.json()).path;
const phone=await browser.newContext({viewport:{width:390,height:844}});const page=await phone.newPage();page.setDefaultTimeout(60000);await page.goto(base+link);await page.getByRole('button',{name:'내 대화방 연결하기'}).click();await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();assert.ok(!page.url().includes('#'));
const cookie=(await phone.cookies()).find(c=>c.name==='cockpit_session');assert.ok(cookie.httpOnly);assert.ok(cookie.value.startsWith('cockpit_d1.'));
const reused=await phone.request.post(base+'/api/auth/report-invite',{data:{token:link.split('=')[1]}});assert.equal(reused.status(),403);
await page.getByRole('textbox',{name:'메시지 입력'}).fill('작성 중 임시 보고');await page.reload();await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();await page.waitForTimeout(500);assert.equal(await page.getByRole('textbox',{name:'메시지 입력'}).inputValue(),'작성 중 임시 보고');
const raw='10월 24일(토)\n수행담당 : 윤태준\n차량번호 : 700호 1458\n고객명 : 격리검증 거래처\n시작 시간 : 10:00\n종료 시간 : 24:00\n운행일지\n서울 → 공항 → 서울 → 차고지';
await page.getByRole('textbox',{name:'메시지 입력'}).fill(raw);await page.getByRole('button',{name:'메시지 보내기'}).click();await page.getByText('보고는 접수됐어요. Excel 연결을 자동으로 다시 시도하고 있어요.',{exact:true}).waitFor();
const template=await hq.request.post(base+'/api/hq/report-workbook',{data:{action:'template',year:2026,month:10,source:'4월'}});assert.equal(template.status(),200,await template.text());await page.reload();await page.getByText('Excel 10월 시트에 반영되었습니다.',{exact:true}).waitFor();
let report=(await (await hq.request.get(base+'/api/hq/driver-reports')).json()).submissions.find(s=>s.raw_message===raw);assert.equal(report.excel_status,'applied');const originalRow=report.excel_row_number;
const corrected=raw.replace('24:00','23:00');const edit=await hq.request.post(base+'/api/hq/driver-reports',{data:{action:'review',id:report.id,revision:report.revision,correctedMessage:corrected,note:'종료시간 확인'}});assert.equal(edit.status(),200,await edit.text());
report=(await (await hq.request.get(base+'/api/hq/driver-reports')).json()).submissions.find(s=>s.id===report.id);assert.equal(report.excel_status,'applied');assert.equal(report.excel_row_number,originalRow);assert.equal(report.parsed.draft.overtime,'OT 2시간 / 심야 1시간');assert.equal(report.raw_message,raw);
// Real Object Storage fixture outage: acceptance succeeds, cron retries after recovery exactly once.
fs.writeFileSync(outage,'1');const second=raw.replace('10월 24일','10월 26일');const accepted=await phone.request.post(base+'/api/driver-reports',{data:{message:second,requestKey:crypto.randomUUID(),driverId:driver}});assert.equal(accepted.status(),201);const secondId=(await accepted.json()).id;
fs.unlinkSync(outage);await new Promise(r=>setTimeout(r,31000));const tick=await phone.request.get(base+'/api/internal/report-worker',{headers:{authorization:'Bearer '+cronSecret}});assert.equal(tick.status(),200,await tick.text());
const secondReport=(await (await hq.request.get(base+'/api/hq/driver-reports')).json()).submissions.find(s=>s.id===secondId);assert.equal(secondReport.excel_status,'applied');
await page.reload();await page.getByRole('textbox',{name:'메시지 입력'}).waitFor();assert.ok((await (await phone.request.get(base+'/api/driver-reports')).json()).messages.length>3);
await page.addStyleTag({content:'nextjs-portal{display:none!important}'});await page.screenshot({path:process.env.REPORT_QA_SCREENSHOT||'/tmp/report-completion-mobile.png'});
const revoke=await hq.request.post(base+'/api/hq/report-invites',{data:{action:'revoke',driverId:driver}});assert.equal(revoke.status(),200);assert.equal((await phone.request.get(base+'/api/driver-reports')).status(),401);
console.log('PASS actual browser: invite → one-use device session → no-password reconnect → draft reload → missing-month durable hold → approved blank month → auto apply → same-row correction → object-storage outage/recovery cron → revoke');
}finally{await browser.close();}})().catch(e=>{console.error('Completion browser E2E failed:',e.name,String(e.message).split('Call log:')[0].replace(/[A-Za-z0-9_-]{43}/g,'[redacted]'));process.exitCode=1;});
