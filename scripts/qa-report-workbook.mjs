// Run only against the disposable local fixture and the rendered HQ component harness.
import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const api=process.env.REPORT_CHAT_QA_URL,ui=process.env.REPORT_QA_HQ_URL,source=process.env.REPORT_CHAT_QA_WORKBOOK,tokensFile=process.env.REPORT_CHAT_QA_TOKENS;
for(const url of [api,ui])if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Disposable loopback API and HQ harness URLs required');if(!source||!tokensFile)throw Error('Private workbook and local fixture session artifact required');
const tokens=JSON.parse(fs.readFileSync(tokensFile));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
try{
 const hq=await browser.newContext();await hq.addCookies([{name:'cockpit_session',value:tokens.hq,url:api}]);const driver=await browser.newContext();await driver.addCookies([{name:'cockpit_session',value:tokens.driver,url:api}]);
 const json=async r=>{const d=await r.json();assert.ok(r.ok(),d.error||'QA request failed');return d;};
 let meta=await json(await hq.request.get(api+'/api/hq/report-workbook'));if(!meta.workbook)await json(await hq.request.post(api+'/api/hq/report-workbook',{headers:{'Content-Type':'application/octet-stream','X-Workbook-Name':'company2026.xlsx'},data:fs.readFileSync(source)}));
 const report=(date,customer)=>`${date}\n수행담당 : 윤태준\n차량번호 : 700호 1458\n고객명 : ${customer}\n시작 시간 : 10:00\n종료 시간 : 24:00\n운행일지\n서울 → 공항 → 서울 → 차고지`;
 const lateRaw=report('11월 12일','QA 늦은 날짜'),earlyRaw=report('11월 5일','QA 이른 날짜');
 const previous=await json(await hq.request.get(api+'/api/hq/driver-reports'));const already=previous.submissions.some(s=>s.raw_message===earlyRaw);
 const late=await json(await driver.request.post(api+'/api/driver-reports',{data:{message:lateRaw,serviceType:'의전',requestKey:crypto.randomUUID()}}));
 let data=await json(await hq.request.get(api+'/api/hq/driver-reports'));const initial=data.submissions.find(s=>s.id===late.id);assert.equal(initial.excel_status,'applied');assert.equal(initial.excel_row_number,already?3:2);assert.equal(initial.parsed.draft.model,'스프린터 319');assert.equal(initial.parsed.draft.route,'서울 - 공항 - 서울 - 차고지');
 const early=await json(await driver.request.post(api+'/api/driver-reports',{data:{message:earlyRaw,serviceType:'의전',requestKey:crypto.randomUUID()}}));
 data=await json(await hq.request.get(api+'/api/hq/driver-reports'));assert.equal(data.submissions.find(s=>s.id===early.id).excel_row_number,2);assert.equal(data.submissions.find(s=>s.id===late.id).excel_row_number,3);
 const grid=()=>hq.request.get(api+'/api/hq/report-workbook?view=1&year=2026&month='+encodeURIComponent('11월')).then(json);let g=await grid();assert.equal(g.rows[0].cells[0],'2026-11-05');assert.equal(g.rows[1].cells[0],'2026-11-12');
 const original=await hq.request.get(api+'/api/hq/report-workbook?download=1&year=2026&version=original');assert.deepEqual(Buffer.from(await original.body()),fs.readFileSync(source));
 const {unzipSync}=require('fflate');const before=unzipSync(fs.readFileSync(source)),after=unzipSync(Buffer.from(await (await hq.request.get(api+'/api/hq/report-workbook?download=1&year=2026')).body()));
 for(const name of Object.keys(before))if(/^xl\/worksheets\/|printerSettings|vmlDrawing|comments/.test(name))assert.deepEqual(after[name],before[name]);
 // Inline time changes use the report correction engine: raw text survives; OT/night are recalculated.
 if(g.rows[1].cells[5]==='10:00~23:00'){await json(await hq.request.post(api+'/api/hq/report-workbook',{data:{action:'edit_cell',year:2026,month:'11월',row:3,column:'F',value:'10:00~24:00',expectedVersion:g.version}}));g=await grid();}
 await json(await hq.request.post(api+'/api/hq/report-workbook',{data:{action:'edit_cell',year:2026,month:'11월',row:3,column:'J',value:'10000',expectedVersion:g.version}}));g=await grid();
 const oldVersion=g.version;await json(await hq.request.post(api+'/api/hq/report-workbook',{data:{action:'edit_cell',year:2026,month:'11월',row:3,column:'F',value:'10:00~23:00',expectedVersion:g.version}}));g=await grid();assert.equal(g.rows[1].cells[5],'10:00~23:00');assert.equal(g.rows[1].cells[8],'OT 2시간 / 심야 1시간');assert.equal(g.rows[1].cells[9],'10000');
 const stale=await hq.request.post(api+'/api/hq/report-workbook',{data:{action:'edit_cell',year:2026,month:'11월',row:3,column:'D',value:'stale',expectedVersion:oldVersion}});assert.equal(stale.status(),409);
 data=await json(await hq.request.get(api+'/api/hq/driver-reports'));assert.equal(data.submissions.find(s=>s.id===late.id).raw_message,lateRaw);
 const formula=await hq.request.post(api+'/api/hq/report-workbook',{data:{action:'edit_cell',year:2026,month:'11월',row:3,column:'D',value:'=HYPERLINK()',expectedVersion:g.version}});assert.equal(formula.status(),400);
 assert.equal((await driver.request.get(api+'/api/hq/report-workbook?view=1')).status(),403);
 // Render the actual HQ components at desktop and mobile widths without blocked external SDKs.
 for(const width of [1440,390]){const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'cockpit_session',value:tokens.hq,url:ui}]);const page=await context.newPage();await page.goto(ui);await page.getByRole('button',{name:'Excel 보기·편집'}).click();await page.getByRole('tab',{name:'11월',exact:true}).click();await page.getByRole('button',{name:'QA 이른 날짜',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'링크 폐기',exact:true}).count(),0);assert.equal(await page.getByRole('combobox',{name:'기사별 보고'}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const cell=page.getByRole('button',{name:'QA 이른 날짜',exact:true});await cell.click();const input=page.getByRole('textbox',{name:'D2 편집'});await input.fill('QA 화면 편집 '+width);await page.getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('button',{name:'QA 화면 편집 '+width,exact:true}).waitFor();await page.getByText('저장 중...',{exact:true}).waitFor({state:'hidden'});await page.locator('table').evaluate(t=>{t.parentElement.scrollLeft=0;});await page.screenshot({path:`/tmp/report-workbook-${width}.png`,fullPage:true,mask:[page.getByRole('textbox',{name:'발급된 운행보고 주소'})]});await context.close();
  g=await grid();await json(await hq.request.post(api+'/api/hq/report-workbook',{data:{action:'edit_cell',year:2026,month:'11월',row:2,column:'D',value:'QA 이른 날짜',expectedVersion:g.version}}));
 }
 const link1=await json(await hq.request.post(api+'/api/hq/report-links',{data:{action:'issue'}})),link2=await json(await hq.request.post(api+'/api/hq/report-links',{data:{action:'issue'}}));assert.notEqual(link1.path,link2.path);const oldKey=link1.path.split('=')[1];assert.equal((await hq.request.post(api+'/api/public-report',{data:{token:oldKey,message:lateRaw,serviceType:'의전',requestKey:crypto.randomUUID()}})).status(),403);
 console.log('PASS workbook E2E: yearless November → row 2 → earlier-day insertion + stable UUIDs → actual source/print preservation → inline OT/night recalculation → immutable original → stale edit and formula rejection → HQ/driver isolation → desktop/mobile view/edit → shared-link rotation');
}finally{await browser.close();}
