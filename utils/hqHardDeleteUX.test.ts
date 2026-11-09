import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file=(path:string)=>readFileSync(new URL('../'+path, import.meta.url),'utf8');
const api=file('app/api/schedules/hard-delete/route.ts');
const quick=file('components/hq/HqQuickDispatch.tsx');
const ops=file('components/hq/operations/HqOperationsBoard.tsx');
const cal=file('components/hq/HqDispatchCalendar.tsx');

test('dashboard calendar has no desktop hover peek, and excludes cancelled rows',()=>{
  assert.doesNotMatch(cal,/onMouseEnter=/);
  assert.match(cal,/if \(window\.innerWidth < 1024 && rows\.length\)/);
  assert.match(cal,/booking\.dispatchStatus !== '취소'/);
  assert.match(cal,/onViewBooking\(booking\)/);
});

test('the dispatch delete action removes the saved booking rather than marking it cancelled',()=>{
  assert.match(quick,/hardDeleteHqSchedule\(targetId, 'booking'\)/);
  assert.match(quick,/배차 완전 삭제/);
  assert.match(quick,/onSavedBookings\?\.\(\)/);
  assert.match(quick,/onClose\?\.\(\)/);
  assert.doesNotMatch(quick,/cancelHqQuickDispatchSchedule\(targetId/);
});

test('real operations events are deletable and never replaced by fake fixtures after clearing',()=>{
  assert.match(ops,/useState<EventGroup\[\]>\(\[\]\)/);
  assert.match(ops,/setEventGroups\(newGroups\)/);
  assert.match(ops,/hardDeleteHqSchedule\(target\.schedules\[0\]\.id, 'event'\)/);
  assert.match(ops,/행사 완전 삭제/);
  assert.match(ops,/item\.groupId \|\| item\.eventId \|\| item\.id/);
});

test('hard delete requires HQ role, explicit confirmation and protects work records',()=>{
  assert.match(api,/requireHqAdmin\(req\)/);
  assert.match(api,/payload\?\.confirm !== true/);
  assert.match(api,/scope === 'event' && anchor\.group_id/);
  for(const name of ['driving_logs','expenses','settlement_documents','driving_log_booking_link_audit','vehicle_custodies','vehicle_custody_requests']){
    assert.ok(api.includes(name),name);
  }
  assert.match(api,/\.delete\(\)\.in\('id', ids\)\.select\('id'\)/);
  assert.match(api,/assignmentsReleased: true/);
});
