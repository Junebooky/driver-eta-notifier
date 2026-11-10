import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Excel grid shows source buttons only for rows the active workbook manifest links', () => {
  const api = source('app/api/hq/report-workbook/route.ts');
  const view = source('components/hq/HqExcelWorkbookView.tsx');
  assert.match(api, /Object\.values\(w\.manifest\|\|\{\}\)/);
  assert.match(api, /linkedRows:view\.rows\.filter\(row=>linked\.has\(row\.row\)\)/);
  assert.match(view, /grid\.linkedRows\?\.includes\(row\.row\)/);
  assert.match(view, /onMouseEnter=/);
  assert.match(view, /aria-label=\{row\.row\+'행 기사 운행보고 원문 보기'\}/);
  assert.match(view, /\/api\/hq\/report-row-source/);
  assert.match(view, /aria-label="연결된 기사 운행보고 원문"/);
  assert.match(view, /rawMessage/);
  assert.match(view, /기사 제출 당시 원문/);
  assert.match(view, /currentVersion|version:grid\.version/);
});

test('read-only source endpoint binds year, month, row, and workbook version before exposing raw text', () => {
  const api = source('app/api/hq/report-row-source/route.ts');
  assert.match(api, /requireHqAdmin\(req\)/);
  assert.match(api, /currentWorkbook\(auth\.session\.org, year\)/);
  assert.match(api, /w\.id !== version/);
  assert.match(api, /Object\.entries\(w\.manifest \|\| \{\}\)/);
  assert.match(api, /where\.sheet === month && where\.row === row/);
  assert.match(api, /matches\.length !== 1/);
  assert.match(api, /\.eq\('org_id', auth\.session\.org\)/);
  assert.match(api, /\.eq\('id', submissionId\)/);
  assert.match(api, /report\.excel_status !== 'applied'/);
  assert.match(api, /Number\(report\.ledger_year\) !== year/);
  assert.match(api, /report\.excel_sheet_name !== month/);
  assert.match(api, /Number\(report\.excel_row_number\) !== row/);
  assert.match(api, /rawMessage: report\.raw_message/);
  assert.doesNotMatch(api, /rawMessage:.*parsed/);
  assert.doesNotMatch(api, /export async function POST/);
});

test('original message pane is an overlay, not a workbook column or an edited worksheet cell', () => {
  const view = source('components/hq/HqExcelWorkbookView.tsx');
  const grid = source('utils/reportWorkbookGrid.ts');
  assert.match(view, /fixed inset-x-3 bottom-3/);
  assert.match(view, /sm:right-5 sm:top-24/);
  assert.match(view, /sourceCache/);
  assert.match(view, /controller\.abort\(\)/);
  assert.match(view, /Escape/);
  assert.match(view, /onClick=\{dismissSource\}/);
  assert.doesNotMatch(grid, /rawMessage|linkedRows/);
});
