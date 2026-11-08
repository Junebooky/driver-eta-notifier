import type { EventSettlementReport } from '@/types/settlementHq';
import { normalizeDateToIso } from './dispatchConflictDetector';

/**
 * Export precisely the records visible in the HQ comprehensive ledger.
 * This is an INTERNAL profitability export, never a customer-facing invoice.
 */
export function exportSettlementSummaryCsv(reports: readonly EventSettlementReport[]): string {
  const safeCell = (value: string | number): string => {
    const raw = String(value);
    // Prevent spreadsheet formula execution when customer/event names are opened.
    const neutral = /^[\s\u0000-\u001f]*[=+@\-]/.test(raw) && typeof value === 'string'
      ? `'${raw}` : raw;
    return `"${neutral.replace(/"/g, '""')}"`;
  };
  const status: Record<string, string> = {
    draft: '청구 대기', reviewing: '검토 중', approved: '승인 완료', invoiced: '청구 완료',
  };
  const headings = ['정산 번호', '고객사', '행사명', '행사 일자', '차량 수', '공급가액(원)', '기사 인건비(원)',
    '직접경비(원)', '배차 직접이익(원)', '직접이익률(%)', '수익 확정 여부', '정산 상태'];
  const lines = [
    '# VIP LIMOUSINE KOREA - 본사 내부용 행사 정산 총괄표 (대외비)',
    '# 공급가액/직접이익은 계약·검수 상태에 따라 잠정 금액일 수 있으며 순이익이 아닙니다.',
    headings.map(safeCell).join(','),
    ...reports.map(r => [
      r.reportNo, r.customerName, r.eventName, normalizeDateToIso(r.rawDate || r.eventDate) || r.eventDate,
      r.totalVehiclesCount, r.supplyAmount, r.totalDriverLaborCost, r.totalVehicleDirectCost + r.totalOtherDirectCost,
      r.totalDirectProfit, r.averageDirectMarginPercent,
      r.profitConfirmStatus === 'confirmed' ? '확정' : '잠정', status[r.status] || r.status,
    ].map(safeCell).join(',')),
  ];
  return lines.join('\r\n');
}
