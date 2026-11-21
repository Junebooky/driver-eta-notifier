import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { EventSettlementReport } from '@/types/settlementHq';
import { exportSettlementSummaryCsv } from './settlementSummaryCsv';
import { buildHqSettlementProfitTrend } from './hqSettlementProfitTrend';
import { matchesHqDateRange } from './hqDateRange';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const report = (id: string, day: string, profit: number, name = '테스트 고객'): EventSettlementReport => ({
  id, reportNo: `TEST-${id}`, customerName: name, eventName: `행사 ${id}`,
  eventDate: day.replace(/-/g, '. '), rawDate: day,
  totalVehiclesCount: 2, supplyAmount: 1000000,
  totalDriverLaborCost: 250000, totalVehicleDirectCost: 110000, totalOtherDirectCost: 40000,
  totalDirectProfit: profit, averageDirectMarginPercent: profit / 10000,
  status: 'approved', profitConfirmStatus: 'pending',
} as unknown as EventSettlementReport);

test('selected calendar range is inclusive and filters dates in dotted Korean settlement records', () => {
  const rows = [
    report('a', '2026-11-01', 220000),
    report('b', '2026-11-05', -40000),
    report('c', '2026-12-01', 120000),
  ];
  const range = { mode: 'custom' as const, from: '2026-11-01', to: '2026-11-05' };
  assert.deepEqual(rows.filter(r => matchesHqDateRange(r.rawDate || r.eventDate, range)).map(r => r.id), ['a', 'b']);
  assert.equal(matchesHqDateRange('2026. 11. 05 (목)', range), true);
});

test('comprehensive CSV includes every period report and not just the selected item', () => {
  const a = report('a', '2026-11-01', 220000);
  const b = report('b', '2026-11-05', -40000, '본사 "가맹점"');
  const csv = exportSettlementSummaryCsv([a, b]);
  assert.match(csv, /TEST-a/);
  assert.match(csv, /TEST-b/);
  assert.match(csv, /"본사 ""가맹점"""/);
  assert.match(csv, /220000/);
  assert.match(csv, /-40000/);
  assert.equal(csv.split('TEST-').length - 1, 2);
});

test('CSV guards customer spreadsheet formulas and keeps negative numeric profit', () => {
  const csv = exportSettlementSummaryCsv([
    report('x', '2026-11-03', -5000, '=HYPERLINK("https://bad.example")'),
    report('y', '2026-11-03', 0, '+SUM(1,1)'),
  ]);
  assert.match(csv, /"'=HYPERLINK/);
  assert.ok(csv.includes('"\'+SUM(1,1)'), 'A leading plus formula is neutralized as text.');
  assert.match(csv, /"-5000"/);
});

test('real profit timeline groups reports by event date and includes losses and zero days', () => {
  const rows = [
    report('a', '2026-11-01', 100000),
    report('b', '2026-11-05', -30000),
    report('c', '2026-11-05', 15000),
    report('future', '2026-11-09', 500000),
  ];
  const data = buildHqSettlementProfitTrend(rows, '2026-11-07');
  assert.equal(data.length, 7);
  assert.equal(data[0].date, '2026-11-01');
  assert.equal(data[0].directProfit, 100000);
  assert.equal(data[4].date, '2026-11-05');
  assert.equal(data[4].reportCount, 2);
  assert.equal(data[4].directProfit, -15000);
  assert.equal(data[6].reportCount, 0);
  assert.equal(data.reduce((sum, day) => sum + day.reportCount, 0), 3);
});

test('HQ reports period filters list, detail selection, KPIs, ledger and full export', () => {
  const view = source('components/hq/reports/HqReportsView.tsx');
  assert.match(view, /<HqDateRangePicker/);
  assert.match(view, /matchesHqDateRange\(r\.rawDate \|\| r\.eventDate, dateRange\)/);
  assert.match(view, /filteredReports\.find\(\(r\) => r\.id === selectedReportId\)/);
  assert.doesNotMatch(view, /reports\.find\(\(r\) => r\.id === selectedReportId\)/);
  assert.match(view, /return periodReports\.filter/);
  assert.match(view, /periodReports\.reduce/);
  assert.match(view, /periodReports\.map\(\(r\) => \(/);
  assert.match(view, /onClick=\{handleDownloadAllSummaryCsv\}/);
  assert.match(view, /exportSettlementSummaryCsv\(periodReports\)/);
  assert.match(view, /buildHqSettlementProfitTrend\(periodReports, periodEnd\)/);
  assert.doesNotMatch(view, /M 15 105 C 80 100/); // Old fabricated trend.
});

test('the HQ report screen cannot create or erase local demo data', () => {
  const view = source('components/hq/reports/HqReportsView.tsx');
  assert.doesNotMatch(view, /runDemoPipelineScenario/);
  assert.doesNotMatch(view, /resetDemoPipelineData/);
  assert.doesNotMatch(view, /showDevConsole/);
  assert.doesNotMatch(view, /테스트 콘솔 열기/);
  assert.doesNotMatch(view, /DEV TEST CONSOLE/);
});

test('receipt review uses shared A-plan form controls while retaining server review safeguards', () => {
  const view = source('components/hq/expenses/HqReceiptReviewWorkspace.tsx');
  assert.match(view, /<TossDatePicker/);
  assert.match(view, /<HqDispatchTimeField/);
  assert.equal((view.match(/<HqSearchSelect/g) || []).length, 3);
  assert.doesNotMatch(view, /<select\b|type="time"|type="date"/);
  assert.match(view, /normalizeExpenseCorrections\(draft\)/);
  assert.match(view, /const canApprove = !busy && !dirty && !stale/);
  assert.match(view, /updateHqExpenseReviewDb\(saved\.id, patch, saved\.updatedAt\)/);
  assert.match(view, /disabled=\{!canApprove\}/);
  assert.match(view, /eligibleBookings\.some/);
  assert.match(view, /onChange=\{next => setFields\(previous => \(\{ \.\.\.previous, bookingId: next \|\| null \}\)\)\}/);
});
