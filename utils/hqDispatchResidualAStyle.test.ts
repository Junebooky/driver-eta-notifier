import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const table=r('components/hq/HqDispatchTable.tsx');
const detail=r('components/hq/HqBookingDetailModal.tsx');
const alerts=r('components/hq/dispatch/HqDispatchAlertDrawer.tsx');
const css=r('app/globals.css');

test('booking list updates only display, preserving filters/search/calendar/add',()=>{
  assert.match(table,/onSelectTab\('all'\)/);
  assert.match(table,/onSelectTab\('today'\)/);
  assert.match(table,/onSelectTab\('past'\)/);
  assert.match(table,/onOpenNewBooking\(\)/);
  assert.match(table,/setSearchQuery\(e\.target\.value\)/);
  assert.match(table,/setIsFilterModalOpen\(true\)/);
  assert.doesNotMatch(table,/bg-\[#0050FF\] text-white font-bold shadow-sm/);
});

test('booking detail keeps conflict guard and safe dispatch publishing',()=>{
  assert.match(detail,/hq-booking-residual-a/);
  assert.match(detail,/handleSaveOrPublish\('published'\)/);
  assert.match(detail,/modalConflicts\.length > 0/);
  assert.match(detail,/revisionChanged/);
  assert.match(detail,/fleet\.data\?\.drivers\.map/);
  assert.match(detail,/fleet\.data\?\.vehicles\.map/);
  assert.doesNotMatch(detail,/shadow-2xl|bg-slate-900 border border-slate-700/);
  assert.match(css,/HQ booking detail A-plan/);
});

test('dispatch alert drawer keeps action and booking routing while adopting A-plan dialog',()=>{
  assert.match(alerts,/aria-modal="true"/);
  assert.match(alerts,/onOpenBookingDetail=\{onOpenBookingDetail\}/);
  assert.match(alerts,/onOpenCustomerMessage=\{onOpenCustomerMessage\}/);
  assert.match(alerts,/onRemind=\{handleRemindClick\}/);
  assert.match(alerts,/setActiveTab\(tab\.id\)/);
  assert.doesNotMatch(alerts,/shadow-2xl/);
});
