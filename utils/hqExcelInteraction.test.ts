import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {HqExcelSectionIcon} from '../components/hq/HqExcelSectionIcon';

const render=(src:'/images/icons/excel/icon_kakao.png'|'/images/icons/excel/icon_link.png',count:number)=>renderToStaticMarkup(createElement(HqExcelSectionIcon,{src,label:'운행보고',count}));

test('Kakao icon shows unread count, but has no hover growth or tooltip',()=>{
 const marked=render('/images/icons/excel/icon_kakao.png',2);
 assert.match(marked,/hq-report-unread-wiggle/);
 assert.match(marked,/>2<\/span>/);
 assert.doesNotMatch(marked,/group-hover|pointer-events-none/);
 const empty=render('/images/icons/excel/icon_kakao.png',0);
 assert.doesNotMatch(empty,/hq-report-unread-wiggle/);
 assert.doesNotMatch(empty,/>0<\/span>/);
});

test('Link icon preserves its existing hover treatment and caption',()=>{
 const html=render('/images/icons/excel/icon_link.png',0);
 assert.match(html,/group-hover:scale-110/);
 assert.match(html,/pointer-events-none/);
});

test('HQ has a real manual refresh with feedback and only the latest Excel download button',()=>{
 const ui=readFileSync(new URL('../components/hq/HqDriverReportInbox.tsx',import.meta.url),'utf8');
 assert.match(ui,/async function manualRefresh\(\)/);
 assert.match(ui,/await refresh\(\)/);
 assert.match(ui,/setRefreshComplete\(true\)/);
 assert.match(ui,/onClick=\{\(\)=>void manualRefresh\(\)\}/);
 assert.match(ui,/hq-excel-download-lift/);
 assert.doesNotMatch(ui,/원본 백업<\/a>/);
 const styles=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(styles,/hq-report-unread-shake 30s/);
 assert.match(styles,/prefers-reduced-motion: no-preference/);
 assert.match(styles,/hover: hover/);
});
