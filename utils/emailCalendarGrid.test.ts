import test from 'node:test';
import assert from 'node:assert/strict';
import { utils, write } from 'xlsx';
import { analyzeScheduleAttachments } from '@/services/emailAttachmentIntake';
import {
  applyExcelVehicleScheduleToDraft,
  buildExcelVehicleSchedules,
  datedExcelCalendarBlocks,
  excelCalendarClock,
  parseExcelWaypointNotes,
  reconcileSingleExcelCalendar,
  syncActiveVehicleScheduleWaypoints,
} from './emailCalendarGrid';
import { createEmptyDraft, extractBookingFromEmail, isExplicitBaselineExcelEmail } from '@/services/emailBookingGeminiService';
import { verifyAttachmentCoverage } from './emailAttachmentCoverage';

function calendar(filename = 'Car One.xlsx', altered = false) {
  const rows: (string | number)[][] = Array.from({ length: 15 }, () => Array.from({ length: 8 }, () => ''));
  rows[2] = ['Date', 'Sunday, Nov. 8', 'Monday, Nov. 9', 'Tuesday, Nov. 10', 'Wednesday, Nov. 11', 'Thursday, Nov. 12', 'Friday, Nov. 13', 'Saturday, Nov. 14'];
  for (const [r, time] of [[4, 0.375], [5, 10 / 24], [7, 0.5], [9, 14 / 24], [13, 0.75]] as [number, number][]) rows[r][0] = time;
  rows[4][4] = 'Leave Hotel at 9:15 am';
  rows[5][4] = 'Meeting with Company A at 10:00 am\n* accompanied by Staff\n종로구 종로1길 50, Sample Building 2층';
  rows[7][4] = 'Lunch with Director\n* lunch venue address?';
  rows[9][4] = 'Biz Meeting with Company B at 2:00 pm\n* Address: 15F, Office Tower A\n중구 우정국로 26';
  rows[13][4] = altered ? 'Dinner with a different guest at 6:00 pm\n* address?' : 'Dinner with Owner at 6:00 pm\n* dinner venue address?';
  rows[5][3] = 'Meeting with another company at 10:00 am';
  rows[5][5] = 'Meeting at Hotel';
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet(rows);
  sheet['!merges'] = [utils.decode_range('E10:E11')];
  utils.book_append_sheet(book, sheet, '일정표');
  return { filename, contentType: 'application/octet-stream', content: Buffer.from(write(book, { type: 'buffer', bookType: 'xlsx' })) };
}

test('calendar time is explicit text first, then the original time grid', () => {
  assert.equal(excelCalendarClock('Leave Hotel at 9:15 am'), '09:15');
  assert.equal(excelCalendarClock('Lunch from 12:00 pm to 1:00 pm'), '12:00');
  assert.equal(excelCalendarClock('Meeting at 2:00 pm'), '14:00');
  assert.equal(excelCalendarClock('Meeting at 14:30'), '14:30');
  assert.equal(excelCalendarClock(String(0.75)), '18:00');
  assert.equal(excelCalendarClock('Meeting at Hotel'), undefined);
});

test('Wednesday Nov 11 contains five separate appointments including two client-unknown addresses', () => {
  const file = analyzeScheduleAttachments([calendar()]).analyzed[0];
  const rows = datedExcelCalendarBlocks([file], 2026).filter(item => item.date === '2026-11-11');
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(x => x.cell), ['E5', 'E6', 'E8', 'E10', 'E14']);
  assert.deepEqual(rows.map(x => x.time), ['09:15', '10:00', '12:00', '14:00', '18:00']);
  assert.match(rows[1].originalText, /Sample Building 2층/);
  assert.match(rows[1].clientAddress || '', /종로1길 50/);
  assert.match(rows[3].clientAddress || '', /우정국로 26/);
  assert.equal(rows[2].clientAddress, undefined);
  assert.equal(rows[4].clientAddress, undefined);
  assert.equal(rows[2].clockSource, 'grid');
  assert.equal(rows[0].clockSource, 'text');
});

test('Gemini one-waypoint summary is expanded to ALL five original appointment cells, never invented TMAP locations', () => {
  const file = analyzeScheduleAttachments([calendar()]).analyzed[0];
  const records = datedExcelCalendarBlocks([file], 2026);
  const draft = createEmptyDraft({ emailId: 'test', subject: 'Itinerary', sender: 'sender@example.invalid', bodyText: '' });
  draft.pickupDate = '2026-11-11';
  draft.waypoints = [{ id: 'ai-only-one', order: 1, date: '2026-11-11', time: '10:00', location: 'Sample Building' }];
  const completed = reconcileSingleExcelCalendar(draft, records);
  const wed = completed.waypoints!.filter(x => x.date === '2026-11-11');
  assert.equal(wed.length, 5);
  assert.equal(new Set(wed.map(x => x.id)).size, 5);
  assert.ok(wed.every(x => x.isPoiConfirmed === false));
  assert.ok(wed.every(x => x.lat === undefined && x.lng === undefined));
  assert.ok(wed.every(x => x.notes?.includes('원본 Excel')));
  assert.ok(wed.every(x => x.notes?.includes('일정표!E')));
  assert.match(wed[1].location, /Sample Building/);
  assert.ok(wed[2].clientAddress === undefined);
  assert.ok(wed[4].clientAddress === undefined);
  const coverage = verifyAttachmentCoverage([file], [{ sourceId: 'attachment-1', reviewedSheets: ['일정표'], scheduleDates: ['2026-11-11'] }], completed, 2026);
  assert.equal(coverage[0].missingDates?.length || 0, 4, 'blank date columns still need review; do not manufacture ground service');
});

test('same filename but different bytes is a separate vehicle/revision: no merged driving route', () => {
  const files = analyzeScheduleAttachments([calendar('Car 1.xlsx'), calendar('Car 1.xlsx', true)]).analyzed;
  assert.notEqual(files[0].sha256, files[1].sha256);
  const records = datedExcelCalendarBlocks(files, 2026);
  const draft = createEmptyDraft({ emailId: 'test2', subject: 'Two versions', sender: 'sender@example.invalid', bodyText: '' });
  draft.waypoints = [{ id: 'existing', order: 1, date: '2026-11-11', time: '10:00', location: 'Client' }];
  const result = reconcileSingleExcelCalendar(draft, records);
  assert.deepEqual(result.waypoints, draft.waypoints);
  assert.ok(result.warnings.some(x => x.includes('자동 합치지 않았')));
});

test('real service response with only Company A still includes every Excel appointment', async t => {
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-not-a-real-key';
  t.after(() => { if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; });
  const files = analyzeScheduleAttachments([calendar()]).analyzed;
  t.mock.method(globalThis, 'fetch', async () => {
    const result = {
      pickupDate: '2026-11-11', pickupTime: '10:00', pickupLocation: 'Sample Building',
      dropoffLocation: 'Sample Building', tripType: 'single',
      documentCoverage: [{ sourceId: 'attachment-1', reviewedSheets: ['일정표'], scheduleDates: ['2026-11-11'] }],
      waypoints: [{ date: '2026-11-11', time: '10:00', location: 'Sample Building' }],
      warnings: [],
    };
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(result) }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const result = await extractBookingFromEmail({
    emailId: 'coverage', subject: 'Car 1 calendar', sender: 'sender@example.invalid',
    sourceSentAt: '2026-11-09T04:00:00Z', bodyText: 'Attached full schedule', attachments: files,
  });
  assert.equal(result.ok, true, result.error);
  const wed = result.draft.waypoints?.filter(x => x.date === '2026-11-11') || [];
  assert.equal(wed.length, 5);
  assert.deepEqual(wed.map(x => x.time), ['09:15', '10:00', '12:00', '14:00', '18:00']);
  assert.equal(result.draft.documentAnalysis?.[0].calendarItems?.filter(x => x.date === '2026-11-11').length, 5);
  assert.ok(wed.every(x => x.isPoiConfirmed === false));
});

function headerlessVehicleCalendar(filename = 'Car Two.xlsx') {
  const rows: (string | number)[][] = Array.from({ length: 24 }, () => Array.from({ length: 7 }, () => ''));
  // Blank A2 header cell, abbreviated weekday names in row 2
  rows[1] = ['', 'Sunday Nov. 8', 'Monday Nov. 9', 'Tuesday Nov. 10', 'Wednesday Nov. 11', 'Thursday Nov. 12', 'Friday Nov. 13'];
  rows[5][0] = '9:00 AM';
  rows[19][0] = '4:00 PM';
  rows[22][0] = '5:30 PM';
  rows[5][1] = 'Arrive to Airport';
  rows[22][2] = '5:35:00 PM (D+1)';
  rows[19][3] = '4:00 ~5:30 pm Meeting with Partner Adderss : 107 Sample-ro, Seocho-gu\n서울 서초구 샘플로 107';
  rows[9][4] = '10:00 am ~ 11:00 am Site Visit Address: 종로구 샘플1길 50, Tower 2층';
  rows[5][6] = 'Check Out Hotel';
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet(rows);
  sheet['!merges'] = [utils.decode_range('D20:D22')];
  utils.book_append_sheet(book, sheet, '일정표');
  return { filename, contentType: 'application/octet-stream', content: Buffer.from(write(book, { type: 'buffer', bookType: 'xlsx' })) };
}

test('headerless time column, seconds PM clock, time ranges, inline address and dangling title lines parse accurately', () => {
  assert.equal(excelCalendarClock('5:35:00 PM (D+1)'), '17:35');
  assert.equal(excelCalendarClock('4:00 ~5:30 pm Meeting'), '16:00');
  assert.equal(excelCalendarClock('11:00 ~ 12:00 pm Meeting'), '11:00');
  assert.equal(excelCalendarClock('12:00 ~ 1:30 pm Lunch'), '12:00');
  assert.equal(excelCalendarClock('11:15 am ~ 12:00 pm Free Time'), '11:15');

  const analyzed = analyzeScheduleAttachments([headerlessVehicleCalendar()]).analyzed[0];
  assert.equal(analyzed.sheets?.[0].dateLabels.length, 6);
  const blocks = datedExcelCalendarBlocks([analyzed], 2026);
  assert.equal(blocks.length, 5);
  assert.deepEqual([...new Set(blocks.map(b => b.date))].sort(), [
    '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-13',
  ]);
  const nov9 = blocks.find(b => b.date === '2026-11-09');
  assert.equal(nov9?.time, '17:35');
  const nov10 = blocks.find(b => b.date === '2026-11-10');
  assert.equal(nov10?.time, '16:00');
  assert.match(nov10?.clientAddress || '', /서초구 샘플로 107/);
  const nov11 = blocks.find(b => b.date === '2026-11-11');
  assert.match(nov11?.clientAddress || '', /종로구 샘플1길 50/);

  // Wrapped title lines ending in a connector join cleanly without pulling bullet address lines,
  // time-range-only first lines pick line 1 without trailing Address:, and secondary return lines keep grid time
  const rows: (string | number)[][] = [
    ['Date', 'Sunday, Nov. 8', 'Monday, Nov. 9'],
    ['8:00 PM', 'VIP Guest arriving into\nICN at 10:00 pm (AB 123)', 'Dinner with\n* Address: 강남구 봉은사로 100'],
    ['9:00 PM', '10:00 am ~ 11:00 am\nSite Visit Address: 종로구 샘플1길 50, Tower 2층', 'Visit Lounge (TBD)\n(10:30 pm) Return to Hotel'],
  ];
  const wrapped = analyzeScheduleAttachments([{
    filename: 'Wrapped.xlsx',
    contentType: 'application/octet-stream',
    content: Buffer.from(write((() => {
      const b = utils.book_new();
      utils.book_append_sheet(b, utils.aoa_to_sheet(rows), '일정표');
      return b;
    })(), { type: 'buffer', bookType: 'xlsx' })),
  }]).analyzed[0];
  const wrappedBlocks = datedExcelCalendarBlocks([wrapped], 2026);
  assert.equal(wrappedBlocks[0].title, 'VIP Guest arriving into ICN at 10:00 pm (AB 123)');
  assert.equal(wrappedBlocks[0].time, '22:00');
  assert.equal(wrappedBlocks[1].title, 'Dinner with');
  assert.equal(wrappedBlocks[2].title, 'Site Visit');
  assert.equal(wrappedBlocks[2].time, '10:00');
  assert.match(wrappedBlocks[2].clientAddress || '', /종로구 샘플1길 50/);
  assert.equal(wrappedBlocks[3].title, 'Visit Lounge (TBD)');
  assert.equal(wrappedBlocks[3].time, '21:00');
  assert.equal(wrappedBlocks[3].clockSource, 'grid');
});

test('multi-vehicle Excel schedules preserve independent routes and per-tab POI edits without auto-merging', () => {
  const files = analyzeScheduleAttachments([calendar('Car One.xlsx'), headerlessVehicleCalendar('Car Two.xlsx')]).analyzed;
  const blocks = datedExcelCalendarBlocks(files, 2026);
  const schedules = buildExcelVehicleSchedules(blocks);
  assert.equal(schedules.length, 2);
  assert.equal(schedules[0].filename, 'Car One.xlsx');
  assert.deepEqual(schedules[0].dates, ['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.equal(schedules[1].filename, 'Car Two.xlsx');
  assert.deepEqual(schedules[1].dates, ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-13']);

  const draft = createEmptyDraft({ emailId: 'multi', subject: 'Two cars', sender: 'sender@example.invalid', bodyText: '' });
  draft.excelVehicleSchedules = schedules;
  draft.documentAnalysis = [
    { filename: 'Car One.xlsx', kind: 'excel', reviewedSheets: ['일정표'], missingDates: ['2026-11-11'] },
    { filename: 'Car Two.xlsx', kind: 'excel', reviewedSheets: ['일정표'], missingDates: ['2026-11-09', '2026-11-14'] },
  ];

  const appliedOne = applyExcelVehicleScheduleToDraft(draft, schedules[0].id);
  assert.equal(appliedOne.activeVehicleScheduleId, schedules[0].id);
  assert.equal(appliedOne.pickupDate, '2026-11-10');
  // 2026-11-11 is now covered by Car One; 2026-11-09 & 2026-11-14 remain for review
  assert.equal(appliedOne.documentAnalysis?.[0].missingDates, undefined);
  assert.deepEqual(appliedOne.documentAnalysis?.[1].missingDates, ['2026-11-09', '2026-11-14']);

  // Edit first stop POI on Car One, switch to Car Two, then back to Car One: edits survive
  const editedWaypoints = appliedOne.waypoints!.map((wp, idx) =>
    idx === 0 ? { ...wp, isPoiConfirmed: true, address: '서울 강남구 테스트로 1', lat: 37.5, lng: 127.0 } : wp
  );
  const syncedOne = syncActiveVehicleScheduleWaypoints({ ...appliedOne, waypoints: editedWaypoints }, editedWaypoints);
  const switchedTwo = applyExcelVehicleScheduleToDraft(syncedOne, schedules[1].id);
  assert.equal(switchedTwo.pickupDate, '2026-11-08');
  assert.equal(switchedTwo.isPickupPoiConfirmed, false);
  const backToOne = applyExcelVehicleScheduleToDraft(switchedTwo, schedules[0].id);
  assert.equal(backToOne.waypoints?.[0].address, '서울 강남구 테스트로 1');
  assert.equal(backToOne.isPickupPoiConfirmed, true);
});

test('explicit baseline multi-day Excel attachments reconcile despite partial modification classification and default to 3.8 Flash', async t => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_BOOKING_MODEL;
  const originalAttModel = process.env.GEMINI_BOOKING_ATTACHMENT_MODEL;
  process.env.GEMINI_API_KEY = 'test-not-a-real-key';
  // Even when GEMINI_BOOKING_MODEL is set to flash-lite, attachment analysis escalates to 3.8 Flash
  process.env.GEMINI_BOOKING_MODEL = 'gemini-3.5-flash-lite';
  delete process.env.GEMINI_BOOKING_ATTACHMENT_MODEL;
  t.after(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_BOOKING_MODEL;
    else process.env.GEMINI_BOOKING_MODEL = originalModel;
    if (originalAttModel === undefined) delete process.env.GEMINI_BOOKING_ATTACHMENT_MODEL;
    else process.env.GEMINI_BOOKING_ATTACHMENT_MODEL = originalAttModel;
  });

  const singleFile = analyzeScheduleAttachments([calendar('Car One.xlsx')]).analyzed;
  const twoFiles = analyzeScheduleAttachments([calendar('Car One.xlsx'), headerlessVehicleCalendar('Car Two.xlsx')]).analyzed;
  const blocks = datedExcelCalendarBlocks(singleFile, 2026);
  assert.equal(isExplicitBaselineExcelEmail('우선 붙임 파일을 현재까지 최종본으로 봐 주세요.', blocks), true);
  assert.equal(isExplicitBaselineExcelEmail('11일 오후 2시만 변경 부탁드립니다.', blocks), false);

  const requestedUrls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    requestedUrls.push(String(input));
    const singleAttachment = requestedUrls.length === 1;
    const result = {
      pickupDate: '2026-11-10', pickupTime: '10:00', pickupLocation: 'Sample Building',
      dropoffLocation: 'Sample Building', tripType: 'modification', revisionScope: 'partial',
      documentCoverage: (singleAttachment ? singleFile : twoFiles).map((file, i) => ({
        sourceId: `attachment-${i + 1}`,
        reviewedSheets: ['일정표'],
        scheduleDates: ['2026-11-10', '2026-11-11'],
      })),
      waypoints: [{ date: '2026-11-10', time: '10:00', location: 'Sample Building' }],
      warnings: [],
    };
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(result) }] }, finishReason: 'STOP' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const singleRes = await extractBookingFromEmail({
    emailId: 'baseline-single', subject: '견적서 재송부', sender: 'sender@example.invalid',
    sourceSentAt: '2026-11-07T01:45:00Z',
    bodyText: '일부 일정이 아직 미정이지만 우선 붙임 파일을 현재까지 최종본으로 봐 주세요.',
    attachments: singleFile,
  });
  assert.equal(singleRes.ok, true, singleRes.error);
  assert.equal(singleRes.metrics?.modelUsed, 'gemini-3.8-flash');
  assert.match(requestedUrls[0], /gemini-3\.8-flash/);
  assert.equal(singleRes.draft.excelVehicleSchedules?.length, 1);
  assert.equal(singleRes.draft.waypoints?.filter(w => w.id.startsWith('excel-')).length, 7);

  const twoRes = await extractBookingFromEmail({
    emailId: 'baseline-two', subject: 'Car 1 & Car 2 견적', sender: 'sender@example.invalid',
    sourceSentAt: '2026-11-07T01:45:00Z',
    bodyText: '우선 붙임 파일을 현재까지 최종본으로 봐 주세요.',
    attachments: twoFiles,
  });
  assert.equal(twoRes.ok, true, twoRes.error);
  assert.equal(twoRes.draft.excelVehicleSchedules?.length, 2);
  assert.equal(twoRes.draft.excelVehicleSchedules?.[0].waypoints.length, 7);
  assert.equal(twoRes.draft.excelVehicleSchedules?.[1].waypoints.length, 5);
  assert.equal(twoRes.draft.documentAnalysis?.[1].calendarItems?.length, 5);

  process.env.GEMINI_BOOKING_ATTACHMENT_MODEL = 'gemini-3.8-flash-custom';
  const customRes = await extractBookingFromEmail({
    emailId: 'baseline-custom', subject: 'Custom model', sender: 'sender@example.invalid',
    sourceSentAt: '2026-11-07T01:45:00Z',
    bodyText: '우선 붙임 파일을 현재까지 최종본으로 봐 주세요.',
    attachments: singleFile,
  });
  assert.equal(customRes.ok, true, customRes.error);
  assert.equal(customRes.metrics?.modelUsed, 'gemini-3.8-flash-custom');
});

test('parseExcelWaypointNotes separates Excel cell provenance from plain notes', () => {
  const gridNote = [
    '원본 Excel Car 1 일정표_v2.xlsx / 일정표!C14',
    '시간표 행 기준 · 실제 출발 시각 미확정',
    'Dinner with HNW client at 6:00 pm',
    '강남구 봉은사로 418',
  ].join('\n');

  const parsedGrid = parseExcelWaypointNotes(gridNote);
  assert.deepEqual(parsedGrid, {
    excelSource: {
      filename: 'Car 1 일정표_v2.xlsx',
      sheetName: '일정표',
      cell: 'C14',
      isGridClock: true,
      rawText: 'Dinner with HNW client at 6:00 pm\n강남구 봉은사로 418',
    },
  });

  const parsedCellOnly = parseExcelWaypointNotes('원본 Excel schedule.xlsx / Sheet1!B5\nFlight to Seoul');
  assert.deepEqual(parsedCellOnly, {
    excelSource: {
      filename: 'schedule.xlsx',
      sheetName: 'Sheet1',
      cell: 'B5',
      rawText: 'Flight to Seoul',
    },
  });

  assert.deepEqual(parseExcelWaypointNotes('16:30 고객 요청으로 대기'), {
    plainNotes: '16:30 고객 요청으로 대기',
  });
  assert.deepEqual(parseExcelWaypointNotes('   '), {});
  assert.deepEqual(parseExcelWaypointNotes(undefined), {});
});
