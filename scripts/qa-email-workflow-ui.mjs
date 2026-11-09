/** Isolated UI fixture: real email workflow/components, synthetic mail and fleet, no real Auth/IMAP/TMAP/DB. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'cockpit-email-workflow-'));
const port = 34069;
const base = `http://127.0.0.1:${port}`;
const artifacts = join(root, '.qa-artifacts/email-workflow');
mkdirSync(artifacts, { recursive: true });
mkdirSync(join(dir, 'app/api/[...path]'), { recursive: true });
symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
symlinkSync(join(root, 'public'), join(dir, 'public'), 'dir');
symlinkSync(join(root, 'postcss.config.mjs'), join(dir, 'postcss.config.mjs'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name:'isolated-email-ui',private:true }));
writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions:{target:'ES2017',lib:['dom','esnext'],module:'esnext',moduleResolution:'bundler',jsx:'react-jsx',esModuleInterop:true,skipLibCheck:true,baseUrl:root,paths:{'@/*':['./*']}}}));
writeFileSync(join(dir, 'next.config.mjs'), 'export default {devIndicators:false};');
writeFileSync(join(dir, 'app/layout.tsx'), "import './globals.css'; export default function Layout({children}:{children:React.ReactNode}) {return <html lang='ko'><body>{children}</body></html>}");
writeFileSync(join(dir, 'app/globals.css'), readFileSync(join(root, 'app/globals.css'), 'utf8') + `\n@source "${root}/components";\n`);
writeFileSync(join(dir, "app/page.tsx"), " 'use client';\nimport {Suspense} from 'react';\nimport {HqEmailInboxView} from '@/components/hq/email/HqEmailInboxView';\nimport {REFERENCE_EMAILS} from '@/components/hq/email/emailReferenceData';\nconst sample=REFERENCE_EMAILS[0];\nsample.summary.subject='격리 검증용 예약 · 고객 제공 주소';\nsample.detail.bodyText='격리 검증용 메일입니다.\\n픽업 주소: 서울시 강남구 테헤란로 123\\n다음 장소는 호텔입니다.\\n반복 주소: 서울시 강남구 테헤란로 123';\nsample.extractedDraft={...sample.extractedDraft,id:'isolated-review',status:'draft',pickupDate:'2026-11-09',pickupTime:'09:00',pickupLocation:'테스트 호텔',dropoffLocation:'테스트 목적지',pickupProvidedAddress:'서울시 강남구 테헤란로 123',dropoffProvidedAddress:'원문에 없는 별도 첨부 주소',requestedVehicleClass:'카니발 1대',isPickupPoiConfirmed:false,isDropoffPoiConfirmed:false,waypoints:undefined,dayEndTimes:undefined};\nREFERENCE_EMAILS.splice(1);\nexport default function Page(){return <main className=\"mx-auto max-w-7xl p-4 bg-[#F7F9FC]\"><p>격리 UI 검증 · 실제 계정/메일/배차 없음</p><Suspense><HqEmailInboxView onCreateBooking={()=>{}}/></Suspense></main>}\n");
writeFileSync(join(dir, "app/api/[...path]/route.ts"), "import {VIP_REAL_VEHICLES,mapVehicleToUiCategory} from '@/utils/vehicleData';\nexport async function GET(req:Request){\nconst path=new URL(req.url).pathname;const vehicles=VIP_REAL_VEHICLES.slice(0,3);\nif(path==='/api/fleet/registry')return Response.json({ok:true,records:vehicles.map(v=>({vehicle_id:v.uuid,plate:v.plate,organization_id:'vip_limousine_korea',profile:v,archived:false}))});\nif(path==='/api/fleet/availability')return Response.json({ok:true,vehicles:vehicles.map((v,i)=>({...v,uiCategory:mapVehicleToUiCategory(v),isAvailable:i===0,currentStatus:i===1?'maintenance':'available',requestedIntervalStatus:i===0?'available':'booked',unavailabilityReason:i===1?'정비 중':i===2?'기존 배차와 충돌':undefined})),drivers:[]});\nif(path==='/api/hq/drivers')return Response.json({ok:true,drivers:[]});\nif(path==='/api/places')return Response.json({ok:true,pois:[],results:[]});\nreturn Response.json({ok:true,bookings:[],schedules:[],drivers:[],matches:[],requests:[]});\n}\n");

const server = spawn(process.execPath, [join(root,'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd:dir, stdio:['ignore','pipe','pipe'], env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',SUPABASE_URL:'https://supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'isolated-not-a-secret',GEMINI_API_KEY:'',TMAP_API_KEY:'',KAKAO_REST_API_KEY:''},
});
let logs='';const capture=chunk=>{logs+=chunk;writeFileSync(join(artifacts,'server.log'),logs);};server.stdout.on('data',capture);server.stderr.on('data',capture);
let browser;
try {
  let ready=false;
  for(let attempt=0;attempt<120;attempt++) {
    if(server.exitCode!==null)throw new Error('Fixture stopped: '+logs);
    try { if((await fetch(base,{signal:AbortSignal.timeout(10000)})).ok){ready=true;break;} }catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,logs);
  browser = await chromium.launch(process.env.EMAIL_UI_CHROMIUM_PATH ? {executablePath:process.env.EMAIL_UI_CHROMIUM_PATH} : {});
  for(const width of [1280,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    const page=await context.newPage(); const pageErrors=[]; page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(base+'/?demo=true');
    await page.locator('.hq-ui-badge[data-tone="warning"]').first().waitFor();
    assert.equal(await page.locator('.hq-ui-badge[data-tone="warning"]').first().evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 249, 241)','actual shared warning CSS must be loaded');
    const sourceButton=page.getByRole('button',{name:'고객 제공 주소 원문 확인: 서울시 강남구 테헤란로 123'});
    await sourceButton.click();
    await page.getByText('고객 제공 주소와 일치하는 원문 2곳을 표시했습니다.',{exact:false}).waitFor();
    assert.equal(await page.locator('mark.hq-ui-source-match').count(),2);
    assert.equal(await page.locator('mark.hq-ui-source-match').first().textContent(),'서울시 강남구 테헤란로 123');
    await page.screenshot({path:join(artifacts,`source-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'고객 제공 주소 원문 확인: 원문에 없는 별도 첨부 주소'}).click();
    await page.getByText('이메일 본문에서 일치하는 주소를 찾지 못했습니다.',{exact:false}).waitFor();
    assert.equal(await page.locator('mark.hq-ui-source-match').count(),0);
    assert.ok(await page.locator('.hq-ui-badge[data-tone="warning"]').count()>=3);
    await page.getByRole('button',{name:'예약 확정',exact:true}).click();
    await page.locator('[data-hq-reveal="first-visit"]').waitFor();
    assert.equal(await page.locator('.hq-ui-reveal-item').first().evaluate(element=>getComputedStyle(element).animationName),'hqRevealDown');
    const delays=await page.locator('.hq-ui-reveal-item').evaluateAll(items=>items.map(item=>parseFloat(item.style.animationDelay)));
    assert.ok(delays.length>=5);assert.ok(delays.every((delay,index)=>index===0||delay>delays[index-1]));
    await page.getByRole('button',{name:'예약 내용 다시 보기'}).click();
    await page.getByRole('button',{name:'예약 확정',exact:true}).click();
    await page.locator('[data-hq-reveal="static"]').waitFor();
    assert.equal(await page.locator('.hq-ui-reveal-item').count(),0);
    await page.screenshot({path:join(artifacts,`confirmation-revisit-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'기사님 배정하기'}).click();
    await page.getByRole('button',{name:'차량을 선택해 주세요',exact:false}).click();
    const dialog=page.getByRole('dialog',{name:'차량 선택'});
    await dialog.getByRole('button').filter({hasText:'실제 시작·종료 날짜와 시간을 확인해 주세요.'}).first().waitFor();
    assert.equal(await dialog.evaluate(element=>getComputedStyle(element.parentElement).position),'fixed','picker must be a styled overlay');
    const rows=dialog.locator('[aria-label="차량 목록"] > button');
    assert.equal(await rows.count(),3,'missing end time still displays all registered cars');
    assert.ok(await rows.evaluateAll(items=>items.every(item=>item.disabled)));
    await dialog.getByLabel('예약 가능한 차량만',{exact:true}).check();
    await dialog.getByRole('button',{name:'전체 차량 보기'}).click();
    assert.equal(await rows.count(),3);
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    await page.getByLabel('2026-11-09 실제 종료 시간',{exact:true}).fill('18:00');
    await page.getByRole('button',{name:'차량을 선택해 주세요',exact:false}).click();
    await dialog.getByRole('button').filter({hasText:'예약 가능'}).first().waitFor();
    const bookable=dialog.locator('[aria-label="차량 목록"] > button:not(:disabled)');
    assert.equal(await bookable.count(),1);
    await dialog.getByLabel('차량 검색').fill('zzzz');
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    assert.equal(await dialog.getByLabel('차량 검색').inputValue(),'zzzz');
    await dialog.getByRole('button',{name:'전체 차량 보기'}).click();
    await page.screenshot({path:join(artifacts,`vehicles-${width}.png`),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await bookable.click();
    assert.equal(await dialog.count(),0);
    assert.equal(pageErrors.length,0,pageErrors.join('\n'));
    await context.close();
    console.log(`PASS ${width}px: source match/missing evidence, shared badges, first-only reveal, missing-time inventory, unavailable selection guards, filters and selected card`);
  }
} finally {
  await browser?.close();server.kill('SIGTERM');writeFileSync(join(artifacts,'server.log'),logs);
  // Wait for the child to release its scratch project before removing it.
  await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));
  rmSync(dir,{recursive:true,force:true});
}
