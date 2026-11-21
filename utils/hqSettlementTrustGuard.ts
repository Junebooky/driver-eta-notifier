import type { EventSettlementReport } from '@/types/settlementHq';

/**
 * The five legacy preview fixtures shipped with the old local-only settlement screen.
 * They must not contribute to operational figures, even if someone previously saved
 * a modified copy to browser storage. Never remove the user's local data here.
 */
const LEGACY_PREVIEW_IDS = new Set([
  'rep-chanel-cruise-2026',
  'rep-bmw-m8-2026',
  'rep-ferrari-corsa-2026',
  'rep-samsung-forum-2026',
  'rep-shinsegae-unregistered',
]);

export function isHqSettlementPreviewFixture(
  report: Pick<EventSettlementReport, 'id' | 'isDemoScenario'>,
): boolean {
  return Boolean(report.isDemoScenario) || LEGACY_PREVIEW_IDS.has(report.id);
}

/**
 * Fail closed: current HQ settlement reports are browser working copies, not
 * signed/versioned server-ledger approvals. A status string ("approved" or
 * "invoiced") is NOT proof of permission to send an invoice to a customer.
 *
 * Do not change this to inspect only report.status: replace this guard only
 * when a server-issued organization-scoped approval and export endpoint exists.
 */
export function canPublishHqSettlementReport(
  _report: Pick<EventSettlementReport, 'id' | 'status'>,
): boolean {
  return false;
}

export const HQ_SETTLEMENT_UNVERIFIED_NOTICE =
  '이 화면의 정산은 브라우저 로컬 작업본이며 서버 정산원장과 연결되지 않았습니다. 표시 금액·승인 기록은 확정 매출이나 발행 승인으로 인정되지 않습니다.';
