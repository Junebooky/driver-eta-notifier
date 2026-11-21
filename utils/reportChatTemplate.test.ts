import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDriverReportTemplate} from './reportChatTemplate';
import {parseDriverReport} from './driverReportChat';

const expectedKeys=[
 '수행담당','차량번호','출근','고객명','탑승인원','출발지','최종도착지',
 '시작시간','종료시간','운행총시간','시작km','종료km','일일운행합',
 '운행일지','경비지출','통행료','세차비','주차비','주유비','교통비',
 '숙박비','식비','기타','합계','특이사항','퇴근시간'
];
test('Full template follows the provided company key order, leaves values empty and keeps auto date',()=>{
 const value=buildDriverReportTemplate('2026-11-04');
 assert.equal(value.split('\n')[0],'2026년 11월 4일');
 const keys=value.split('\n').slice(1).map(x=>x.includes(':')?x.split(':')[0].replace(/\s+/g,''):x.replace(/\s+/g,'')).filter(Boolean);
 assert.deepEqual(keys,expectedKeys);
 assert.equal(value.includes('김승준'),false);
 assert.equal(value.includes('73호2553'),false);
 assert.match(value,/\n운행일지\n\n\n경비지출\n/);
 assert.match(value,/\n특이사항\n\n\n퇴근시간 : $/);
});
test('When drivers fill the full template, only A-L Excel fields are populated; km and expenses are kept out',()=>{
 let value=buildDriverReportTemplate('2026-11-04');
 const replacements=new Map([
 ['수행담당','김승준'],['차량번호','73호2553'],['출근','06:40'],['고객명','인터코스'],
 ['탑승인원','9명'],['출발지','차고지'],['최종도착지','차고지'],
 ['시작시간','09:00'],['종료시간','21:50'],['운행총시간','12시간50분'],
 ['시작km','154,725 km'],['종료km','154,861 km'],['일일운행합','136 km'],
 ['통행료','1,000+1,000'],['세차비','0원'],['주차비','18,800원'],['주유비','0원'],
 ['교통비','0원'],['숙박비','0원'],['식비','9,500원(중) 10,000원(석)'],
 ['기타','0원'],['합계','40,300원'],['퇴근시간','22:30']
 ]);
 value=value.split('\n').map(line=>{
  const index=line.indexOf(':');
  if(index<0)return line;
  const name=line.slice(0,index).replace(/\s+/g,'');
  return replacements.has(name)?line.slice(0,index+1)+' '+replacements.get(name):line;
 }).join('\n');
 value=value.replace('\n\n경비지출','\n07:00 차고지 -> 08:50 메리어트 호텔 -> 09:50 판교 오피스 -> 21:50 한강 아파트 / 업무종료 -> 22:15 차고지\n경비지출');
 const parsed=parseDriverReport(value,undefined,new Date('2026-11-04T09:00:00+09:00'),{workbookYear:2026});
 assert.deepEqual(parsed.reviewReasons,[]);
 assert.equal(parsed.draft.date,'2026-11-04');
 assert.equal(parsed.draft.plate.replace(/\s/g,''),'73호2553');
 assert.equal(parsed.draft.customer,'인터코스');
 assert.equal(parsed.draft.driver,'김승준');
 assert.equal(parsed.draft.time,'09:00~21:50');
 assert.equal(parsed.draft.route,'차고지 - 메리어트 호텔 - 판교 오피스 - 한강 아파트 - 차고지');
 assert.equal(parsed.draft.overtime,'OT 2시간 50분');
 assert.equal(parsed.draft.amount,'');
 assert.equal(parsed.draft.payment,'');
 assert.equal(parsed.draft.totalWithVat,'');
 for(const excluded of ['154,725','154,861','136 km','18,800','40,300','22:30'])assert.equal(parsed.draft.route.includes(excluded),false);
});
