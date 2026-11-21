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
  assert.match(quick,/hardDeleteHqSchedule\(targetId, 'booking', undefined, deleteMode\)/);
  assert.match(quick,/배차 완전 삭제/);
  assert.match(quick,/onSavedBookings\?\.\(\)/);
  assert.match(quick,/onClose\?\.\(\)/);
  assert.doesNotMatch(quick,/cancelHqQuickDispatchSchedule\(targetId/);
});

test('real operations events are deletable and never replaced by fake fixtures after clearing',()=>{
  assert.match(ops,/useState<EventGroup\[\]>\(\[\]\)/);
  assert.match(ops,/setEventGroups\(newGroups\)/);
  assert.match(ops,/hardDeleteHqSchedule\(/);
  assert.match(ops,/target\.customerScoped \? 'customer' : 'event'/);
  assert.match(ops,/target\.schedules\.map\(item => item\.id\)/);
  assert.match(ops,/행사 완전 삭제/);
  assert.match(ops,/groupOperationsByCustomer\(serverMapped\)/);
  assert.match(ops,/sameEvent \? first\.eventName : '전체 배차 현황'/);
});

test('admin deletion requires HQ confirmation and preserves linked records',()=>{
  assert.match(api,/requireHqAdmin\(req\)/);
  assert.match(api,/payload\?\.confirm !== true/);
  assert.match(api,/scope === 'event' && anchor\.group_id/);
  assert.match(api,/scope === 'customer'/);
  assert.match(api,/normalizeOperationalCustomerName\(item\.customer_name\) === normalized/);
  assert.match(api, /supabaseAdmin\.rpc\('admin_schedule_delete'/);
  assert.match(api, /export async function POST/);
  assert.match(api, /export async function DELETE/);
  assert.match(api, /payload\?\.mode/);
  const migration = file('supabase/migrations/20261110090000_hq_admin_schedule_deletion.sql');
  assert.match(migration,/IF p_action = 'schedule_only' AND v_has_records/);
  assert.match(migration,/DELETE FROM cockpit\.schedules/);
  assert.match(migration,/DELETE FROM cockpit\.expenses/);
  assert.match(migration,/DELETE FROM cockpit\.driving_logs/);
  assert.match(migration,/v_retain/);
  assert.match(migration,/schedule_deletion_audit/);
  const store = file('lib/dispatch/scheduleServerStore.ts');
  assert.match(store,/r\.status !== 'deleted'/);
  assert.match(store,/ex\.status === 'deleted'/);
  const choices = file('components/hq/ui/HqScheduleDeleteChoices.tsx');
  assert.match(choices,/배차만 삭제/);
  assert.match(choices,/배차와 미제출 초안까지 삭제/);
  assert.match(quick,/inspectHqScheduleDeletion\(id, 'booking'\)/);
  assert.match(ops,/inspectHqScheduleDeletion\(/);
});
