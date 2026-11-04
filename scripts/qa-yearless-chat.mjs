// Run against a disposable localhost Next + PostgREST + Postgres fixture only.
// Tokens JSON contains isolated fixture sessions {driver,hq}; never production credentials.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const base=process.env.REPORT_CHAT_QA_URL,tokenFile=process.env.REPORT_CHAT_QA_TOKENS,file=process.env.REPORT_CHAT_QA_WORKBOOK;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!tokenFile||!file)throw new Error('Provide localhost REPORT_CHAT_QA_URL, REPORT_CHAT_QA_TOKENS and REPORT_CHAT_QA_WORKBOOK (2026 annual workbook with approved 10월 sheet).');
(async()=>{const tokens=JSON.parse(fs.readFileSync(tokenFile));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'cockpit_session',value:tokens.driver,url:base}]);
 const hq=await browser.newContext();await hq.addCookies([{name:'cockpit_session',value:tokens.hq,url:base}]);
 const registration=await hq.request.post(base+'/api/hq/report-workbook',{headers:{'Content-Type':'application/octet-stream','X-Workbook-Name':'company2026.xlsx'},data:fs.readFileSync(file)});assert.equal(registration.status(),200,await registration.text());
 const raw='10월 24일(토)\n수행담당 : 윤태준\n차량번호 : 700호 1458\n고객명 : 샤넬\n시작 시간 : 09:15\n종료 시간 : 17:20\n운행총시간 : 8시간 05분\n운행일지\n안다즈 호텔 → 09:15 서울 옥션 → 16:00 김포공항 → 14:30 안다즈 호텔 → 17:20 김포공항 / 업무종료 → 16:00 차고지\n경비지출\n합계 : 50,900원';
 const page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(base+'/driver/reports');await page.getByRole('textbox',{name:'메시지 입력'}).fill(raw);await page.getByRole('button',{name:'메시지 보내기'}).click();await page.getByText('Excel 10월 시트에 반영되었습니다.',{exact:true}).waitFor();
 await page.reload();await page.getByText('Excel 10월 시트에 반영되었습니다.',{exact:true}).waitFor();assert.equal(await page.getByText(raw,{exact:true}).count(),1);
 const overtime=raw.replace('09:15\n종료 시간 : 17:20','10:00\n종료 시간 : 24:00').replace('8시간 05분','14시간 00분');
 await page.getByRole('textbox',{name:'메시지 입력'}).fill(overtime);await page.getByRole('button',{name:'메시지 보내기'}).click();await page.getByText('Excel 10월 시트에 반영되었습니다.',{exact:true}).nth(1).waitFor();
 const records=await (await hq.request.get(base+'/api/hq/driver-reports')).json();assert.equal(records.submissions.length,2);
 for(const s of records.submissions){assert.equal(s.excel_status,'applied');assert.equal(s.parsed.draft.date,'2026-10-24');assert.equal(s.parsed.draft.model,'스프린터 319');assert.equal(s.parsed.draft.route,'안다즈 호텔 - 서울 옥션 - 김포공항 - 안다즈 호텔 - 김포공항 - 차고지');assert.deepEqual(s.parsed.reviewReasons,[]);}
 assert.equal(records.submissions.find(s=>s.raw_message===overtime).parsed.draft.overtime,'OT 2시간 / 심야 2시간');
 const before=await (await context.request.get(base+'/api/driver-reports')).json();await context.request.post(base+'/api/driver-reports',{data:{message:raw,requestKey:crypto.randomUUID()}});assert.equal((await (await context.request.get(base+'/api/driver-reports')).json()).messages.length,before.messages.length);
 const output=await hq.request.get(base+'/api/hq/report-workbook?download=1');assert.equal(output.status(),200);fs.writeFileSync(process.env.REPORT_CHAT_QA_OUTPUT||'/tmp/yearless-chat-output.xlsx',await output.body());
 await page.reload();await page.getByText('Excel 10월 시트에 반영되었습니다.',{exact:true}).nth(1).waitFor();
 console.log('PASS yearless real Kakao sample: active 2026 ledger → exact vehicle/model, all ordered stops, OT/night, two 10월 rows, completion replies, duplicate protection and reload history.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
