import test from 'node:test';
import assert from 'node:assert/strict';
import { utils, write } from 'xlsx';
import { analyzeScheduleAttachments } from '@/services/emailAttachmentIntake';
import { createEmptyDraft, extractBookingFromEmail } from '@/services/emailBookingGeminiService';
import { datedExcelCalendarBlocks, excelCalendarClock, reconcileSingleExcelCalendar } from './emailCalendarGrid';
import { verifyAttachmentCoverage } from './emailAttachmentCoverage';

function calendar(filename = 'Car One.xlsx', altered = false) {
  const rows: (string | number)[][] = Array.from({ length: 15 }, () => Array.from({ length: 8 }, () => ''));
  rows[2] = ['Date','Sunday, Nov. 8','Monday, Nov. 9','Tuesday, Nov. 10','Wednesday, Nov. 11','Thursday, Nov. 12','Friday, Nov. 13','Saturday, Nov. 14'];
  for (const [r,time] of [[4,0.375],[5,10/24],[7,0.5],[9,14/24],[13,0.75]] as [number,number][]) rows[r][0] = time;
  rows[4][4] = 'Leave Hotel at 9:15 am';
  rows[5][4] = 'Meeting with Company A at 10:00 am\n* accompanied by Staff\n종로구 종로1길 50, Sample Building 2층';
  rows[7][4] = 'Lunch with Director\n* lunch venue address?';
  rows[9][4] = 'Biz Meeting with Company B at 2:00 pm\n* Address: 15F, Office Tower A\n중구 우정국로 26';
  rows[13][4] = altered ? 'Dinner with a different guest at 6:00 pm\n* address?' : 'Dinner with Owner at 6:00 pm\n* dinner venue address?';
  rows[5][3] = 'Meeting with another company at 10:00 am';
  rows[5][5] = 'Meeting at Hotel';
  const book=utils.book_new();
  const sheet=utils.aoa_to_sheet(rows);
  sheet['!merges']=[utils.decode_range('E10:E11')];
  utils.book_append_sheet(book,sheet,'일정표');
  return {filename,contentType:'application/octet-stream',content:Buffer.from(write(book,{type:'buffer',bookType:'xlsx'}))};
}

test('calendar time is explicit text first, then the original time grid', () => {
  assert.equal(excelCalendarClock('Leave Hotel at 9:15 am'), '09:15');
  assert.equal(excelCalendarClock('Lunch from 12:00 pm to 1:00 pm'), '12:00');
  assert.equal(excelCalendarClock('Meeting at 2:00 pm'), '14:00');
  assert.equal(excelCalendarClock(String(0.75)), '18:00');
  assert.equal(excelCalendarClock('Meeting at Hotel'), undefined);
});

test('Wednesday Nov 11 contains five separate appointments including two client-unknown addresses', () => {
  const file=analyzeScheduleAttachments([calendar()]).analyzed[0];
  const rows=datedExcelCalendarBlocks([file],2026).filter(item=>item.date==='2026-11-11');
  assert.equal(rows.length,5);
  assert.deepEqual(rows.map(x=>x.cell),['E5','E6','E8','E10','E14']);
  assert.deepEqual(rows.map(x=>x.time),['09:15','10:00','12:00','14:00','18:00']);
  assert.match(rows[1].originalText,/Sample Building 2층/);
  assert.match(rows[1].clientAddress || '',/종로1길 50/);
  assert.match(rows[3].clientAddress || '',/우정국로 26/);
  assert.equal(rows[2].clientAddress,undefined);
  assert.equal(rows[4].clientAddress,undefined);
  assert.equal(rows[2].clockSource,'grid');
  assert.equal(rows[0].clockSource,'text');
});

test('Gemini one-waypoint summary is expanded to ALL five original appointment cells, never invented TMAP locations', () => {
  const file=analyzeScheduleAttachments([calendar()]).analyzed[0];
  const records=datedExcelCalendarBlocks([file],2026);
  const draft = createEmptyDraft({emailId:'test',subject:'Itinerary',sender:'sender@example.invalid',bodyText:''});
  draft.pickupDate='2026-11-11';
  draft.waypoints=[{id:'ai-only-one',order:1,date:'2026-11-11',time:'10:00',location:'Sample Building'}];
  const completed=reconcileSingleExcelCalendar(draft,records);
  const wed=completed.waypoints!.filter(x=>x.date==='2026-11-11');
  assert.equal(wed.length,5);
  assert.equal(new Set(wed.map(x=>x.id)).size,5);
  assert.ok(wed.every(x=>x.isPoiConfirmed===false));
  assert.ok(wed.every(x=>x.lat===undefined && x.lng===undefined));
  assert.ok(wed.every(x=>x.notes?.includes('원본 Excel')));
  assert.ok(wed.every(x=>x.notes?.includes('일정표!E')));
  assert.match(wed[1].location,/Sample Building/);
  assert.ok(wed[2].clientAddress===undefined);
  assert.ok(wed[4].clientAddress===undefined);
  const coverage=verifyAttachmentCoverage([file],[{sourceId:'attachment-1',reviewedSheets:['일정표'],scheduleDates:['2026-11-11']}],completed,2026);
  assert.equal(coverage[0].missingDates?.length || 0,4, 'blank date columns still need review; do not manufacture ground service');
});

test('same filename but different bytes is a separate vehicle/revision: no merged driving route', () => {
  const files=analyzeScheduleAttachments([calendar('Car 1.xlsx'),calendar('Car 1.xlsx',true)]).analyzed;
  assert.notEqual(files[0].sha256,files[1].sha256);
  const records=datedExcelCalendarBlocks(files,2026);
  const draft=createEmptyDraft({emailId:'test2',subject:'Two versions',sender:'sender@example.invalid',bodyText:''});
  draft.waypoints=[{id:'existing',order:1,date:'2026-11-11',time:'10:00',location:'Client'}];
  const result=reconcileSingleExcelCalendar(draft,records);
  assert.deepEqual(result.waypoints,draft.waypoints);
  assert.ok(result.warnings.some(x=>x.includes('자동 합치지 않았')));
});

test('real service response with only Company A still includes every Excel appointment', async t => {
  const key=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-not-a-real-key';
  t.after(()=>{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;});
  const files=analyzeScheduleAttachments([calendar()]).analyzed;
  t.mock.method(globalThis,'fetch',async()=>{
    const result={
      pickupDate:'2026-11-11',pickupTime:'10:00',pickupLocation:'Sample Building',
      dropoffLocation:'Sample Building',tripType:'single',
      documentCoverage:[{sourceId:'attachment-1',reviewedSheets:['일정표'],scheduleDates:['2026-11-11']}],
      waypoints:[{date:'2026-11-11',time:'10:00',location:'Sample Building'}],
      warnings:[],
    };
    return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(result)}]},finishReason:'STOP'}]}),{status:200,headers:{'content-type':'application/json'}});
  });
  const result=await extractBookingFromEmail({
    emailId:'coverage',subject:'Car 1 calendar',sender:'sender@example.invalid',
    sourceSentAt:'2026-11-09T04:00:00Z',bodyText:'Attached full schedule',attachments:files,
  });
  assert.equal(result.ok,true,result.error);
  const wed=result.draft.waypoints?.filter(x=>x.date==='2026-11-11')||[];
  assert.equal(wed.length,5);
  assert.deepEqual(wed.map(x=>x.time),['09:15','10:00','12:00','14:00','18:00']);
  assert.equal(result.draft.documentAnalysis?.[0].calendarItems?.filter(x=>x.date==='2026-11-11').length,5);
  assert.ok(wed.every(x=>x.isPoiConfirmed===false));
});
