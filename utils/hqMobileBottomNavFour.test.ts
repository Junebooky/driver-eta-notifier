import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const source=(file:string)=>readFileSync(join(process.cwd(),file),'utf8');

test('mobile bottom navigation has exactly four meaningful actions in the approved order',()=>{
 const nav=source('components/hq/HqMobileNav.tsx');
 const tabs=[...nav.matchAll(/\{id:'([^']+)',label:'([^']+)'/g)]
   .map(match=>[match[1],match[2]]);
 assert.deepEqual(tabs,[
   ['dispatch','배차'],
   ['operations','실시간'],
   ['quick','예약'],
   ['menu','전체메뉴'],
 ]);
 assert.match(nav,/grid-cols-4/);
 assert.doesNotMatch(nav,/grid-cols-5|id:'vehicles'/);
 assert.match(nav,/onQuickBooking/);
 assert.match(nav,/onMenu/);
 assert.match(nav,/<Icon className="size-5" aria-hidden="true"\/>/);
 assert.doesNotMatch(nav,/id==='quick'\s*\?\s*<span|rounded-full bg-\[#1E60F3\] text-white shadow-/);
 assert.match(nav,/active\?'bg-\[#F3F7FF\] text-\[#1E60F3\]'/);
 assert.match(nav,/actionCount>99\?'99\+'/);
});

test('mobile bottom nav follows navigation versus actions accessibility semantics',()=>{
 const nav=source('components/hq/HqMobileNav.tsx');
 assert.match(nav,/aria-current=\{!isAction&&active\?'page':undefined\}/);
 assert.match(nav,/aria-pressed=\{id==='quick'\?formOpen:undefined\}/);
 assert.match(nav,/aria-expanded=\{id==='menu'\?menuOpen:undefined\}/);
 assert.match(nav,/aria-label=\{id==='quick'\?'빠른 예약 등록'/);
 assert.match(nav,/focus-visible:outline/);
 assert.match(nav,/env\(safe-area-inset-bottom\)/);
});

test('HQ header no longer has a duplicate hamburger and the full drawer still includes vehicles and card finder',()=>{
 const header=source('components/hq/HqHeader.tsx');
 const sidebar=source('components/hq/HqSidebar.tsx');
 const dashboard=source('components/hq/HqDashboard.tsx');
 assert.doesNotMatch(header,/onOpenMobileMenu|전체 메뉴 열기|<Menu className=/);
 assert.doesNotMatch(dashboard,/onOpenMobileMenu=/);
 assert.match(dashboard,/menuOpen=\{isMobileSidebarOpen\}/);
 assert.match(dashboard,/onMenu=\{\(\) => setIsMobileSidebarOpen\(true\)\}/);
 assert.match(sidebar,/id: 'vehicles'/);
 assert.match(sidebar,/id: 'drivers'/);
 assert.match(sidebar,/id: 'customers'/);
 assert.match(sidebar,/배차카드 빠른 검색/);
 assert.match(dashboard,/onQuickBooking=\{handleOpenQuickPhoneBookingModal\}/);
 assert.match(dashboard,/pb-\[calc\(76px\+env\(safe-area-inset-bottom\)\)\]/);
});
