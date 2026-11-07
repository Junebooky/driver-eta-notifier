import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sidebar = readFileSync(new URL('../components/hq/HqSidebar.tsx', import.meta.url),'utf8');
const header = readFileSync(new URL('../components/hq/HqHeader.tsx', import.meta.url),'utf8');

test('all configured HQ navigation tabs share one quiet active state', () => {
  assert.match(sidebar,/const activeNavClass = 'bg-\[#F3F7FF\] text-\[#17233B\]/);
  assert.match(sidebar,/const idleNavClass = 'bg-transparent text-\[#61728A\]/);
  assert.doesNotMatch(sidebar,/const tabColorStyles/);
  assert.match(sidebar,/aria-current=\{isActive \? 'page' : undefined\}/);
  assert.match(sidebar,/onSelectTab\(item.id\)/);
  assert.match(sidebar,/onCloseMobile\?\.\(\)/);
  assert.match(sidebar,/localStorage\.setItem\('hq_sidebar_pinned'/);
});

test('settings and permissions remains intentionally unconfigured and untouched', () => {
  assert.match(sidebar,/id: 'settings'/);
  assert.match(sidebar,/const isSettings = item\.id === 'settings'/);
  assert.match(sidebar,/isSettings\s*\?\s*\(isActive \? 'bg-slate-100 text-slate-800'/);
  assert.match(sidebar,/icon_setting\.png/);
});

test('HQ header controls use light tooltips without removing their actions',()=>{
  assert.doesNotMatch(header,/bg-slate-900/);
  assert.match(header,/rounded-\[12px\] bg-white px-3 py-2/);
  assert.match(header,/onOpenNotifications\?\.\(\)/);
  assert.match(header,/onOpenQuoteModal\(\)/);
  assert.match(header,/onRefresh\(\)/);
  assert.match(header,/onOpenMobileMenu\(\)/);
  assert.match(header,/onOpenAdminLogin\(\)/);
});
