'use client';

import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MapPin,
  Car,
  Receipt,
  History,
  Check,
  Edit3,
  X,
  ChevronRight,
} from 'lucide-react';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { haptics } from '@/utils/haptics';

export interface HqDrivingLogDetailPanelProps {
  log: HqDrivingLog | null;
  onApprove: (logId: string) => void;
  onRequestRevision: (logId: string, reason: string) => void;
  onReject: (logId: string, reason: string) => void;
}

export const HqDrivingLogDetailPanel: React.FC<HqDrivingLogDetailPanelProps> = ({
  log,
  onApprove,
  onRequestRevision,
  onReject,
}) => {
  const [modalAction, setModalAction] = useState<'revision' | 'reject' | null>(null);
  const [reasonText, setReasonText] = useState('');

  if (!log) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-400 space-y-2 shadow-2xs">
        <FileText className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-sm font-semibold">선택된 운행일지가 없습니다.</p>
        <p className="text-xs text-slate-400">목록에서 확인하고자 하는 운행일지를 클릭해주세요.</p>
      </div>
    );
  }

  // Handle modal submit
  const handleConfirmAction = () => {
    if (!modalAction) return;
    haptics.success();

    if (modalAction === 'revision') {
      onRequestRevision(log.id, reasonText.trim() || '추가 확인이 필요하여 보완 요청을 보냈습니다.');
    } else if (modalAction === 'reject') {
      onReject(log.id, reasonText.trim() || '사유 미기재 반려');
    }

    setModalAction(null);
    setReasonText('');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col space-y-4 p-5">
      {/* 1. Header with Title & Status Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center">
            <Car className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
              선택된 운행일지 상세 정보
            </h3>
            <span className="text-[10px] text-slate-400 font-medium">No. {log.no} (ID: {log.id})</span>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {log.status === '검토 대기' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-300 bg-amber-50 text-amber-700">
              <Clock className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>검토 대기</span>
            </span>
          )}
          {log.status === '검토 중' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-sky-300 bg-sky-50 text-sky-700">
              <Clock className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>검토 중</span>
            </span>
          )}
          {log.status === '승인 완료' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-300 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>승인 완료</span>
            </span>
          )}
          {log.status === '보완 필요' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-rose-300 bg-rose-50 text-rose-600">
              <AlertTriangle className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>보완 필요</span>
            </span>
          )}
          {log.status === '반려' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-red-300 bg-red-50 text-red-600">
              <XCircle className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>반려</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. 운행 요약 (Summary Card) */}
      <section className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <FileText className="w-3.5 h-3.5 text-[#1E60F3]" />
          <span>운행 요약</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Left Column */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium w-12 shrink-0">운행일</span>
              <span className="font-bold text-slate-800">{log.submittedDate || log.drivingDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium w-12 shrink-0">제출일</span>
              <span className="font-bold text-slate-700">{log.submittedAt}</span>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium w-12 shrink-0">기사명</span>
              <span className="font-bold text-slate-900">{log.driverName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium w-12 shrink-0">고객명</span>
              <span className="font-bold text-slate-800">{log.customerName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium w-12 shrink-0">차량</span>
              <span className="font-bold text-slate-700 truncate" title={`${log.vehicleModel} (${log.vehiclePlate})`}>
                {log.vehicleModel} ({log.vehiclePlate})
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 운행 경로 (N건) Timeline -> CRITICAL COMPONENT */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <MapPin className="w-3.5 h-3.5 text-[#1E60F3]" />
            <span>운행 경로</span>
            <span className="text-[#1E60F3] font-black">({log.stops.length}건)</span>
          </div>
        </div>

        {log.stops.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            등록된 운행 경로 일정이 없습니다.
          </div>
        ) : (
          <div className="relative flex flex-col py-0.5">
            {log.stops.map((stop, index) => {
              const isFirst = index === 0;
              const isLast = index === log.stops.length - 1;

              return (
                <div
                  key={stop.id || index}
                  className="relative flex items-center gap-2.5 text-xs py-1.5 group min-h-[30px]"
                >
                  {/* Dedicated Timeline Axis: vertical line & circle on the exact same axis */}
                  <div className="relative flex flex-col items-center justify-center w-4 self-stretch shrink-0">
                    {/* Top line segment */}
                    {index > 0 && (
                      <div className="absolute top-0 bottom-1/2 left-1/2 -translate-x-1/2 w-[2px] bg-blue-200 pointer-events-none" />
                    )}
                    {/* Bottom line segment */}
                    {index < log.stops.length - 1 && (
                      <div className="absolute top-1/2 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-blue-200 pointer-events-none" />
                    )}

                    {/* Circle Node placed directly on the line */}
                    {isFirst || isLast ? (
                      <div className="relative z-10 w-3 h-3 rounded-full bg-blue-100 ring-2 ring-white flex items-center justify-center shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                      </div>
                    ) : (
                      <div className="relative z-10 w-2.5 h-2.5 rounded-full bg-white border-2 border-[#1E60F3] ring-2 ring-white shrink-0" />
                    )}
                  </div>

                  {/* Stop Information */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2.5 min-w-0">
                        <span className="font-bold text-slate-800 shrink-0 tabular-nums w-11">
                          {stop.time}
                        </span>
                        <span className="font-semibold text-slate-800 truncate" title={stop.place}>
                          {stop.place}
                        </span>
                      </div>

                      {/* Tag / Note */}
                      {stop.note && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                          {stop.note}
                        </span>
                      )}
                    </div>

                    {stop.address && (
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate pl-13.5">
                        {stop.address}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. 주행 거리 정보 & 경비지출 정보 (2 Column Cards) */}
      <section className="grid grid-cols-2 gap-3">
        {/* 주행 거리 정보 */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
            <span>주행 거리 정보</span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-center pt-1">
            <div>
              <div className="text-[10px] text-slate-400 font-medium">시작 km</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">{log.startKm}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium">종료 km</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">{log.endKm}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#1E60F3] font-semibold">운행합</div>
              <div className="text-xs font-black text-[#1E60F3] mt-0.5">{log.distanceKm}</div>
            </div>
          </div>
        </div>

        {/* 경비지출 정보 */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>경비지출 정보</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </div>

          <div className="grid grid-cols-2 gap-1 text-center pt-1">
            <div>
              <div className="text-[10px] text-slate-400 font-medium">지출 건수</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">{log.expenseCount}건</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium">지출 합계</div>
              <div className="text-xs font-black text-slate-900 mt-0.5">
                {log.expenseAmount > 0 ? `${log.expenseAmount.toLocaleString()}원` : '0원'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 특이사항 Section */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <FileText className="w-3.5 h-3.5 text-[#1E60F3]" />
          <span>특이사항</span>
        </div>
        <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 text-xs text-slate-700 whitespace-pre-line leading-relaxed min-h-[60px]">
          {log.notes || '기재된 특이사항이 없습니다.'}
        </div>
      </section>

      {/* 6. Action Buttons (승인 / 보완 요청 / 반려) */}
      <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2">
        {/* 승인 Button (Cobalt Blue Solid) */}
        <button
          type="button"
          onClick={() => {
            haptics.success();
            onApprove(log.id);
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[#1E60F3] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_12px_rgba(30,96,243,0.3)] transition-all cursor-pointer active:scale-98"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>승인</span>
        </button>

        {/* 보완 요청 Button (Cobalt Blue Outline) */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setModalAction('revision');
            setReasonText('');
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white border border-[#1E60F3] text-[#1E60F3] hover:bg-blue-50/70 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-98"
        >
          <Edit3 className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>보완 요청</span>
        </button>

        {/* 반려 Button (Red Outline) */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setModalAction('reject');
            setReasonText('');
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-white border border-rose-300 text-rose-600 hover:bg-rose-50/70 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-98"
        >
          <X className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>반려</span>
        </button>
      </div>

      {/* 7. 최근 검토 이력 (Review History) */}
      <section className="pt-2 border-t border-slate-100 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#1E60F3]" />
            <span>최근 검토 이력</span>
            <span className="text-slate-400 font-normal">총 {log.reviewHistory.length}건</span>
          </div>
          <span className="text-[11px] text-[#1E60F3] font-semibold flex items-center gap-0.5 cursor-pointer hover:underline">
            <span>전체보기</span>
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>

        <div className="space-y-1.5">
          {log.reviewHistory.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between text-xs text-slate-600 bg-slate-50/60 p-2 rounded-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3] shrink-0" />
                <span className="text-[11px] text-slate-400 shrink-0">{item.time}</span>
                <span className="truncate text-slate-700 text-[11px]">{item.message}</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200/70 text-slate-600 rounded shrink-0">
                {item.actor}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Action Reason Input Modal (for 보완 요청 / 반려) */}
      {modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {modalAction === 'revision' ? '운행일지 보완 요청' : '운행일지 반려 처리'}
              </h3>
              <button
                type="button"
                onClick={() => setModalAction(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {modalAction === 'revision'
                ? '기사에게 전달할 보완 요청 사유를 입력해주세요. (예: 주유 영수증 사진 재첨부, 통행료 내역 확인 등)'
                : '운행일지 반려 사유를 입력해주세요.'}
            </p>

            <textarea
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="사유를 상세히 기재해주세요..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 resize-none"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalAction(null)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`flex-1 py-2.5 text-white rounded-xl text-xs font-bold shadow-xs ${
                  modalAction === 'revision'
                    ? 'bg-[#1E60F3] hover:bg-blue-600'
                    : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {modalAction === 'revision' ? '보완 요청 전송' : '반려 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
