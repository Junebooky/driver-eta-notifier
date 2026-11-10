'use client';

import type { HqScheduleDeleteInspection, HqScheduleDeleteMode } from '@/utils/hqScheduleHardDelete';

export function HqScheduleDeleteChoices({
  inspection, mode, onModeChange,
}: {
  inspection: HqScheduleDeleteInspection | null;
  mode: HqScheduleDeleteMode;
  onModeChange: (next: HqScheduleDeleteMode) => void;
}) {
  if (!inspection) {
    return <p role="status" className="rounded-[13px] bg-[#F7F9FC] px-3.5 py-3 text-[12px] text-[#6E809B]">
      연결된 업무 기록을 확인하고 있어요…
    </p>;
  }

  if (!inspection.hasRecords) {
    return <p className="rounded-[13px] bg-[#F7F9FC] px-3.5 py-3 text-[12px] leading-relaxed text-[#61728A]">
      연결된 운행·정산 기록이 없어서 이 배차 {inspection.count}건은 데이터베이스에서도 완전히 삭제돼요.
    </p>;
  }

  const counts = inspection.counts;
  const total = counts.drivingLogs + counts.expenses + counts.settlements +
    counts.linkAudits + counts.custodies + counts.custodyRequests;

  return <div className="space-y-2.5" role="radiogroup" aria-label="배차 삭제 범위">
    <p className="text-[12px] leading-relaxed text-[#61728A]">
      연결 기록 {total}건이 있어요. 삭제할 범위를 선택해 주세요.
      {counts.settlements > 0 && ` 정산 ${counts.settlements}건`}
      {counts.custodies + counts.custodyRequests > 0 && ` · 차량 인수 ${counts.custodies + counts.custodyRequests}건`}
    </p>
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-[13px] px-3.5 py-3 transition-colors ${mode === 'schedule_only' ? 'bg-[#F1F5FE]' : 'bg-[#F7F9FC]'}`}>
      <input type="radio" name="hq-delete-scope" value="schedule_only"
        checked={mode === 'schedule_only'} onChange={() => onModeChange('schedule_only')}
        className="mt-0.5 accent-[#1E60F3]" />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-[#17233B]">배차만 삭제</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-[#6E809B]">
          달력과 기사 스케줄에서 제거하고, 연결된 업무 기록은 그대로 보존해요.
        </span>
      </span>
    </label>
    <label className={`flex items-start gap-2.5 rounded-[13px] px-3.5 py-3 transition-colors ${!inspection.canIncludeDrafts ? 'cursor-not-allowed opacity-60 bg-[#F7F9FC]' : mode === 'include_drafts' ? 'cursor-pointer bg-[#F1F5FE]' : 'cursor-pointer bg-[#F7F9FC]'}`}>
      <input type="radio" name="hq-delete-scope" value="include_drafts"
        checked={mode === 'include_drafts'} disabled={!inspection.canIncludeDrafts}
        onChange={() => onModeChange('include_drafts')}
        className="mt-0.5 accent-[#1E60F3]" />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-[#17233B]">배차와 미제출 초안까지 삭제</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-[#6E809B]">
          {inspection.canIncludeDrafts
            ? '해당 배차에 연결된 미제출 운행일지·경비 초안도 함께 삭제해요. 되돌릴 수 없어요.'
            : '제출·승인·정산·영수증 또는 차량 인수 이력이 있어 전체 삭제할 수 없어요.'}
        </span>
      </span>
    </label>
  </div>;
}
