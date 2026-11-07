import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(file:string)=>readFileSync(new URL('../components/'+file,import.meta.url),'utf8');

test('shared chat hides service picker after accepted report and waits for explicit + to start another',()=>{
 const s=source('public-reports/SharedReportPage.tsx');
 assert.match(s,/if\(data\.accepted\)\{\s*setServiceType\(null\);\s*setReportActive\(false\)/);
 assert.match(s,/ready&&token&&reportActive&&!busy&&<ReportServicePicker/);
 assert.match(s,/reportActive\?setTemplates\(v=>!v\):startNextReport\(\)/);
 assert.match(s,/sessionStorage\.getItem\(COMPLETED_KEY\)/);
 assert.match(s,/다음 보고는 \+ 버튼을 눌러주세요/);
 assert.match(s,/placeholder:text-\[12px\]/);
 assert.match(s,/placeholder:whitespace-nowrap/);
 assert.match(s,/text-\[16px\]/);
});
test('signed-in driver chat follows same next-report behavior, preserving unsent drafts',()=>{
 const s=source('driver-reports/DriverReportChat.tsx');
 assert.match(s,/if\(data\.accepted\)\{\s*setServiceType\(null\);setReportActive\(false\)/);
 assert.match(s,/draftLoaded&&reportActive&&!sending&&<div/);
 assert.match(s,/reportActive\?setTemplates\(v=>!v\):startNextReport\(\)/);
 assert.match(s,/sessionStorage\.getItem\('vip_driver_report_completed_v1:'/);
 assert.match(s,/if\(!d\?\.text&&!d\?\.outgoing\?\.length&&!d\?\.serviceType/);
 assert.match(s,/다음 보고는 \+ 버튼을 눌러주세요/);
 assert.match(s,/placeholder:text-\[12px\]/);
 assert.match(s,/placeholder:whitespace-nowrap/);
 assert.match(s,/text-\[16px\]/);
});
