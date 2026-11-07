import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {reportWorkbookYear} from './reportWorkbookYear';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
test('active annual filename supplies year; mixed filename is not silently guessed',()=>{
 assert.equal(reportWorkbookYear(kakaoWorkbookFixture(),'회사2026년.xlsx'),2026);
 assert.equal(reportWorkbookYear(kakaoWorkbookFixture(),'회사2025-2026.xlsx'),null);
});
test('unnamed ledger requires one data year and ignores legacy A1 numeric header',()=>{
 assert.equal(reportWorkbookYear(kakaoWorkbookFixture(),'company-copy.xlsx'),2026);
 const e=unzipSync(kakaoWorkbookFixture());e['xl/worksheets/sheet1.xml']=strToU8(strFromU8(e['xl/worksheets/sheet1.xml']).replace('<v>46113</v>','<v>45184</v>'));
 assert.equal(reportWorkbookYear(zipSync(e),'company-copy.xlsx'),2023);
});
