import test from 'node:test';
import assert from 'node:assert/strict';
import { utils, write } from 'xlsx';
import { analyzeScheduleAttachments } from '@/services/emailAttachmentIntake';
import { attachmentManifest, scheduleHeaderDate, verifyAttachmentCoverage, assertAttachmentDatesReviewed } from './emailAttachmentCoverage';
import { buildEmailDispatchPlan } from './emailDispatchPlan';
import { buildEmailBatchRevisionApproval } from './emailBatchRevision';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { selectUserEmailAttachments } from '@/services/naverImapService';
import { extractBookingFromEmail } from '@/services/emailBookingGeminiService';

function calendarFile(filename = 'Car A.xlsx') {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([
    ['Date', 'Sunday, Nov. 8', 'Monday, Nov. 9', 'Tuesday, Nov. 10'],
    ['9:00 AM', '', '', 'Leave Hotel at 9:30 am'],
    ['10:00 AM', '', '', 'Meeting · Address: 테스트로 100'],
    ['11:00 AM', '', '', ''],
    ['10:00 PM', 'Airport pickup', '', ''],
    ['3:00 PM', '', 'Airport pickup', ''],
  ]);
  sheet['!merges'] = [utils.decode_range('D3:D4')];
  utils.book_append_sheet(book, sheet, '일정표');
  utils.book_append_sheet(book, utils.aoa_to_sheet([['Notes'], ['Signage requested']]), '안내');
  return {filename, contentType:'application/octet-stream', content:Buffer.from(write(book, {type:'buffer',bookType:'xlsx'}))};
}

test('calendar grid preserves all columns, original coordinates, merged blocks and both sheets', () => {
  const file = analyzeScheduleAttachments([calendarFile()]).analyzed[0];
  assert.match(file.text!, /\[D3\]/);
  assert.match(file.text!, /병합 셀: D3:D4/);
  assert.match(file.text!, /Address: 테스트로 100/);
  assert.deepEqual(attachmentManifest([file],2026)[0].sheets, [
    {name:'일정표',datesToReview:['2026-11-08','2026-11-09','2026-11-10']},
    {name:'안내',datesToReview:[]},
  ]);
});

test('two source files cannot be satisfied by first-day-only or by reviewing only one file/sheet', () => {
  const files = analyzeScheduleAttachments([calendarFile(),calendarFile('Car B.xlsx')]).analyzed;
  const dates = ['2026-11-08','2026-11-09','2026-11-10'];
  const reports = files.map((_,i)=>({sourceId:`attachment-${i+1}`,reviewedSheets:['일정표','안내'],scheduleDates:dates}));
  const firstDay = {pickupDate:dates[0],waypoints:[{id:'a',order:1,date:dates[0],location:'Airport'}]};
  assert.deepEqual(verifyAttachmentCoverage(files,reports,firstDay,2026)[0].missingDates,['2026-11-09','2026-11-10']);
  const complete = {pickupDate:dates[0],waypoints:dates.map((date,i)=>({id:String(i),order:i+1,date,location:'Source venue'}))};
  assert.throws(()=>verifyAttachmentCoverage(files,reports.slice(0,1),complete,2026), /Car B.*누락/);
  assert.throws(()=>verifyAttachmentCoverage(files,[{...reports[0],reviewedSheets:['일정표']},reports[1]],complete,2026), /안내.*누락/);
  assert.equal(verifyAttachmentCoverage(files,reports,complete,2026).length,2);
  assert.throws(()=>verifyAttachmentCoverage(files,undefined,complete,2026), /분석 내역.*누락/);
});

test('original PDF is retained and its declared dates must reach the result too', () => {
  const content = Buffer.from('%PDF-1.4\n%%EOF');
  const files = analyzeScheduleAttachments([{filename:'Schedule.pdf',contentType:'application/pdf',content}]).analyzed;
  assert.deepEqual(Buffer.from(files[0].pdfBase64!,'base64'),content);
  assert.deepEqual(verifyAttachmentCoverage(files,[{sourceId:'attachment-1',reviewedSheets:[],scheduleDates:['2026-11-10']}],{pickupDate:'2026-11-08'},2026)[0].missingDates,['2026-11-10']);
});

test('header date parsing avoids inventing days from ranges, invalid dates, time and ordinary text', () => {
  assert.equal(scheduleHeaderDate('2026-11-10',2025),'2026-11-10');
  assert.equal(scheduleHeaderDate('11/10',2026),'2026-11-10');
  for (const label of ['2026-02-30','11/8~13','9:00 AM','Flight to Seoul','']) assert.equal(scheduleHeaderDate(label,2026),undefined);
});

test('equal file names and byte sizes keep distinct revisions; identical bytes deduplicate', () => {
  const a = {filename:'Schedule.xlsx',contentType:'application/octet-stream',content:Buffer.from('1111')};
  const b = {...a,content:Buffer.from('2222')};
  assert.equal(selectUserEmailAttachments([a,b,a]).length,2);
});

test('blank workbooks and long cells fail explicitly instead of sending misleading sheet labels/truncated text', () => {
  const book = utils.book_new();
  utils.book_append_sheet(book,utils.aoa_to_sheet([]),'Empty');
  const file = {filename:'Empty.xlsx',contentType:'application/octet-stream',content:Buffer.from(write(book,{type:'buffer',bookType:'xlsx'}))};
  assert.throws(()=>analyzeScheduleAttachments([file]),/읽을 수 있는 셀/);
  book.Sheets.Empty = utils.aoa_to_sheet([['x'.repeat(4001)]]);
  assert.throws(()=>analyzeScheduleAttachments([{...file,content:Buffer.from(write(book,{type:'buffer',bookType:'xlsx'}))}]),/셀 내용이 너무 깁니다/);
});

test('real Gemini service keeps a partial draft for explicit review and marks complete output without missing dates', async t => {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  t.after(() => { if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey; });
  const files = analyzeScheduleAttachments([
    calendarFile(), calendarFile('Car B.xlsx'),
    {filename:'Instructions.pdf',contentType:'application/pdf',content:Buffer.from('%PDF-1.4\n%%EOF')},
  ]).analyzed;
  const dates = ['2026-11-08','2026-11-09','2026-11-10'];
  let allDays = false;
  const requests: any[] = [];
  // Intercept the SDK transport; never call an external model or use real mail.
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const result = {
      pickupDate:dates[0], pickupLocation:'Airport', dropoffLocation:'Hotel',
      tripType:'single', warnings:[],
      documentCoverage:files.map((_,i)=>({sourceId:`attachment-${i+1}`,reviewedSheets:i<2?['일정표','안내']:[],scheduleDates:dates,
        ...(i===2 ? {pdfEvidence:[
          {pageNumber:2,originalText:'2026-11-09 09:00 Airport pickup'},
          {pageNumber:2,originalText:'2026-11-09 09:00 Airport pickup'},
          {pageNumber:0,originalText:'Invalid page'},
          {pageNumber:3,originalText:' '},
        ]} : {}),
      })),
      waypoints:(allDays?dates:dates.slice(0,1)).flatMap(date=>[
        {date,time:'09:00',location:'Airport'},{date,time:'10:00',location:'Hotel'},
      ]),
    };
    return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(result)}]},finishReason:'STOP'}]}),{status:200,headers:{'content-type':'application/json'}});
  });
  const params = {emailId:'test-source',subject:'Forwarded itinerary',sender:'test@example.invalid',sourceSentAt:'2026-11-07T01:45:00Z',bodyText:'See current attached schedules. Older proposal: 11/14.',attachments:files};
  const partial = await extractBookingFromEmail(params);
  assert.equal(partial.ok,true,partial.error);
  assert.deepEqual(partial.draft.documentAnalysis?.[0].missingDates,['2026-11-09','2026-11-10']);
  assert.throws(()=>assertAttachmentDatesReviewed(partial.draft),/검토 완료/);
  allDays = true;
  const complete = await extractBookingFromEmail(params);
  assert.equal(complete.ok,true,complete.error);
  assert.equal(complete.draft.documentAnalysis?.length,3);
  assert.deepEqual(complete.draft.documentAnalysis?.[2].pdfEvidence, [
    {pageNumber:2,originalText:'2026-11-09 09:00 Airport pickup'},
  ]);
  assert.equal(complete.draft.documentAnalysis?.[0].pdfEvidence,undefined);
  assert.doesNotThrow(()=>assertAttachmentDatesReviewed(complete.draft));
  assert.deepEqual([...new Set(complete.draft.waypoints?.map(point=>point.date))],dates);
  const parts = requests[0].contents[0].parts;
  assert.match(parts[0].text,/Car A.xlsx/);
  assert.match(parts[0].text,/Car B.xlsx/);
  assert.match(parts[0].text,/D3:D4/);
  assert.match(parts[0].text,/selected message date is 2026-11-07/);
  assert.equal(parts[1].inlineData.mimeType,'application/pdf');
  assert.equal(parts[1].inlineData.data,files[2].pdfBase64);
});

test('Nov 14 absent from route is a review issue; confirmation/dispatch require explicit acknowledgement', () => {
  const file = analyzeScheduleAttachments([calendarFile()]).analyzed[0];
  const reports = [{sourceId:'attachment-1',reviewedSheets:['일정표','안내'],scheduleDates:['2026-11-08','2026-11-09','2026-11-10','2026-11-14']}];
  const coverage = verifyAttachmentCoverage([file],reports,{pickupDate:'2026-11-08',waypoints:['2026-11-09','2026-11-10'].map((date,i)=>({id:String(i),order:i,date,location:'Hotel'}))},2026);
  assert.deepEqual(coverage[0].missingDates,['2026-11-14']);
  const draft = {documentAnalysis:[{filename:'Car A.xlsx',kind:'excel',reviewedSheets:['일정표','안내'],missingDates:coverage[0].missingDates}]} as HqEmailExtractedDraft;
  assert.throws(()=>buildEmailDispatchPlan(draft,[],'unassigned'),/검토 완료/);
  assert.throws(()=>buildEmailBatchRevisionApproval(draft,[],[],{},[],{},{},'unassigned'),/검토 완료/);
  draft.documentAnalysis![0].dateReviewAcknowledged = true;
  assert.doesNotThrow(()=>assertAttachmentDatesReviewed(draft));
  draft.documentAnalysis![0].dateReviewAcknowledged = false;
  assert.throws(()=>assertAttachmentDatesReviewed(draft),/검토 완료/);
});
