import test from 'node:test';
import assert from 'node:assert/strict';
import { utils, write } from 'xlsx';
import { analyzeScheduleAttachments } from '@/services/emailAttachmentIntake';
import { createEmptyDraft } from '@/services/emailBookingGeminiService';
import { datedExcelCalendarBlocks, reconcileSingleExcelCalendar } from './emailCalendarGrid';

const CALENDAR_COLUMNS = [
  'Sunday, Nov. 8','Monday, Nov. 9','Tuesday, Nov. 10',
  'Wednesday, Nov. 11','Thursday, Nov. 12','Friday, Nov. 13','Saturday, Nov. 14',
];
const CELLS = [
  'B16','C5','C14','D5','D6','D8','D10','D14','E5','E6','E8','E10','E14',
  'F6','F8','F10','F14','G5','G7','G9','G10','G14','H5','H10',
];
const COUNTS:Record<string,number>={
  '2026-11-08':1,'2026-11-09':2,'2026-11-10':5,'2026-11-11':5,
  '2026-11-12':4,'2026-11-13':5,'2026-11-14':2,
};

function fullCalendarFixture() {
  const rows:(string|number)[][]=Array.from({length:17},()=>Array.from({length:8},()=>''));
  rows[2]=['Date',...CALENDAR_COLUMNS];
  for(const [row,time] of [[4,9/24],[5,10/24],[6,11/24],[7,12/24],[8,13/24],[9,14/24],[13,18/24],[15,20/24]] as [number,number][])rows[row][0]=time;
  for(const cell of CELLS){
    const column=cell.charCodeAt(0)-65;
    const row=Number(cell.slice(1))-1;
    rows[row][column]='Source appointment '+cell;
  }
  // Displaced text times must win over the Excel row's grid time.
  rows[4][2]='Flight into GMP 3pm (AB1234) · Test Guest';
  rows[13][2]='Dinner with Test Client at 6:00 pm\n* Location: Sample Dining, 123 Sample Street';
  rows[4][4]='Leave Hotel at 9:15 am';
  rows[5][4]='10:00 am Meeting at Sample Building\n* address: 종로구 종로1길 50';
  rows[7][4]='Lunch with Client\n* 점심 장소 주소?';
  rows[9][4]='Biz meeting at 2:00 pm\n* address: 중구 우정국로 26';
  rows[13][4]='Dinner with Client at 6:00 pm\n* 저녁 장소 주소?';
  const book=utils.book_new();
  utils.book_append_sheet(book,utils.aoa_to_sheet(rows),'일정표');
  return {filename:'QA Sanitized Car 1.xlsx',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content:Buffer.from(write(book,{type:'buffer',bookType:'xlsx'}))};
}

test('a seven-day Excel grid preserves all 24 occupied original appointment cells',()=>{
  const [source]=analyzeScheduleAttachments([fullCalendarFixture()]).analyzed;
  const items=datedExcelCalendarBlocks([source],2026);
  assert.equal(items.length,24);
  assert.equal(new Set(items.map(x=>x.cell)).size,24);
  assert.deepEqual(items.map(x=>x.cell).sort(),[...CELLS].sort());
  for(const [date,count] of Object.entries(COUNTS))
    assert.equal(items.filter(item=>item.date===date).length,count,date);
  const monday=items.filter(x=>x.date==='2026-11-09');
  assert.deepEqual(monday.map(x=>x.cell),['C5','C14']);
  assert.deepEqual(monday.map(x=>x.time),['15:00','18:00']);
  const wed=items.filter(x=>x.date==='2026-11-11');
  assert.deepEqual(wed.map(x=>x.cell),['E5','E6','E8','E10','E14']);
  assert.deepEqual(wed.map(x=>x.time),['09:15','10:00','12:00','14:00','18:00']);
  assert.equal(wed[2].clientAddress,undefined);
  assert.equal(wed[4].clientAddress,undefined);
});

test('a one-stop Gemini summary does not erase any of the 24 original Excel cells',()=>{
  const [source]=analyzeScheduleAttachments([fullCalendarFixture()]).analyzed;
  const items=datedExcelCalendarBlocks([source],2026);
  const draft=createEmptyDraft({emailId:'qa-24',subject:'Calendar verification',
    sender:'source@example.invalid',bodyText:''});
  draft.pickupDate='2026-11-11';
  draft.waypoints=[{id:'ai-one-only',order:1,date:'2026-11-11',time:'10:00',
    location:'Sample Building'}];
  const merged=reconcileSingleExcelCalendar(draft,items);
  const sourceWaypoints=(merged.waypoints||[]).filter(x=>x.id.startsWith('excel-'));
  assert.equal(sourceWaypoints.length,24);
  assert.equal(new Set(sourceWaypoints.map(x=>x.id)).size,24);
  assert.ok(sourceWaypoints.every(x=>x.isPoiConfirmed===false && x.lat===undefined && x.lng===undefined));
  assert.equal(sourceWaypoints.filter(x=>x.date==='2026-11-09').length,2);
  assert.equal(sourceWaypoints.filter(x=>x.date==='2026-11-11').length,5);
  const unknown=sourceWaypoints.filter(x=>x.notes?.includes('주소?'));
  assert.ok(unknown.every(x=>!x.clientAddress), 'a client question is not a verified address');
});
