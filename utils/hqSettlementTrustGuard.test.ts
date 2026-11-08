import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canPublishHqSettlementReport,
  isHqSettlementPreviewFixture,
  HQ_SETTLEMENT_UNVERIFIED_NOTICE,
} from './hqSettlementTrustGuard';

const load = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('all five legacy seed reports and explicit demos are excluded from operating KPIs', () => {
  for (const id of [
    'rep-chanel-cruise-2026',
    'rep-bmw-m8-2026',
    'rep-ferrari-corsa-2026',
    'rep-samsung-forum-2026',
    'rep-shinsegae-unregistered',
  ]) {
    assert.equal(isHqSettlementPreviewFixture({ id }), true, id);
  }
  assert.equal(isHqSettlementPreviewFixture({ id: 'user-created', isDemoScenario: true }), true);
  assert.equal(isHqSettlementPreviewFixture({ id: 'user-created' }), false);
});

test('legacy local approval and invoiced status never authorize client publication', () => {
  for (const status of ['draft', 'reviewing', 'approved', 'invoiced'] as const) {
    assert.equal(canPublishHqSettlementReport({ id: 'local-working-copy', status }), false);
  }
  assert.match(HQ_SETTLEMENT_UNVERIFIED_NOTICE, /로컬 작업본/);
});

test('reports view hides preview fixtures and blocks external csv, print, approval', () => {
  const view = load('components/hq/reports/HqReportsView.tsx');
  assert.match(view, /reports\.filter\(r => !isHqSettlementPreviewFixture\(r\)\)/);
  assert.match(view, /HQ_SETTLEMENT_UNVERIFIED_NOTICE/);
  assert.match(view, /handleDownloadClientCsv[\s\S]*?canPublishHqSettlementReport\(selectedReport\)/);
  assert.match(view, /handlePrintPdf[\s\S]*?canPublishHqSettlementReport\(selectedReport\)/);
  assert.match(view, /disabled=\{!canPublishHqSettlementReport\(selectedReport\)\}/);
  const storage = load('utils/settlementStorage.ts');
  assert.match(storage, /typeof window !== 'undefined' && \(newStatus === 'approved' \|\| newStatus === 'invoiced'\)/);
});
