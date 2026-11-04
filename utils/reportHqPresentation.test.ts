import test from 'node:test';
import assert from 'node:assert/strict';
import {reportDisplayStatus,reportMatchesFilter,visibleHqReportMessages,type ReportHqFilter} from './reportHqPresentation';
import type {ReportExcelStatus,ReportChatMessage} from '@/types/driverReportChat';

test('HQ status dropdown has only the two business states plus All; backend states remain unchanged',()=>{
 const statuses:ReportExcelStatus[]=['pending','applied','review','error'];
 const expected=['확인 필요','반영 완료','확인 필요','확인 필요'];
 assert.deepEqual(statuses.map(reportDisplayStatus),expected);
 for(const status of statuses){
  assert.equal(reportMatchesFilter(status,'all'),true);
  assert.equal(reportMatchesFilter(status,'applied'),status==='applied');
  assert.equal(reportMatchesFilter(status,'review'),status!=='applied');
 }
 const selected:ReportHqFilter='review';
 assert.ok(reportMatchesFilter('error',selected));
});
test('HQ hides automatic long-form review acknowledgements but keeps driver report and manual HQ reply',()=>{
 const mock=(sender_type:ReportChatMessage['sender_type'],body:string,seq:number):ReportChatMessage=>({
  id:String(seq),seq,sender_type,message_type:'text',body,linked_submission_id:'any',created_at:'2026-11-04T01:00:00Z'
 });
 const messages=[
  mock('driver','수행담당 : 이동호\n운행일지\n차고지 -> 호텔',1),
  mock('system','운행보고가 접수되었습니다. 관리자 확인이 필요한 항목이 있어 Excel 반영을 기다리고 있어요.',2),
  mock('hq','차량번호 확인 부탁드립니다.',3)
 ];
 const visible=visibleHqReportMessages(messages);
 assert.deepEqual(visible.map(message=>message.id),['1','3']);
 assert.equal(messages.length,3);
});
