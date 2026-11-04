import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(file:string)=>readFileSync(new URL('../components/'+file,import.meta.url),'utf8');

test('shared chat hides service picker after accepted report and waits for explicit + to start another',()=>{
 const s=source('public-reports/SharedReportPage.tsx');
 assert.match(s,/if\(data\.accepted\)\{\s*setServiceType\(null\);\s*setReportActive\(false\)/);
 assert.match(s,/ready&&token&&reportActive&&<ReportServicePicker/);
 assert.match(s,/reportActive\?setTemplates\(v=>!v\):startNextReport\(\)/);
 assert.match(s,/sessionStorage\.getItem\(COMPLETED_KEY\)/);
 assert.match(s,/다음 보고는 \+ 버튼으로 시작해 주세요/);
});
test('signed-in driver chat follows same next-report behavior, preserving unsent drafts',()=>{
 const s=source('driver-reports/DriverReportChat.tsx');
 assert.match(s,/if\(data\.accepted\)\{\s*setServiceType\(null\);setReportActive\(false\)/);
 assert.match(s,/draftLoaded&&reportActive&&<div/);
 assert.match(s,/reportActive\?setTemplates\(v=>!v\):startNextReport\(\)/);
 assert.match(s,/sessionStorage\.getItem\('vip_driver_report_completed_v1:'/);
 assert.match(s,/if\(!d\?\.text&&!d\?\.outgoing\?\.length&&!d\?\.serviceType/);
 assert.match(s,/다음 보고는 \+ 버튼으로 시작해 주세요/);
});
