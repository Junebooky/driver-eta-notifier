'use client';

import React, { useState,useEffect } from 'react';
import { CheckCircle2, Copy, Edit, MoreHorizontal, Star, RefreshCw, MessageSquare } from 'lucide-react';
import { VehicleSlotAssignment } from './HqStep2BookingDetailView';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft } from '@/types/emailHq';
import Link from 'next/link';
import type { ScheduleItem } from '@/data/ferrariSchedules';
import { emailDispatchProgress } from '@/utils/emailDispatchPlan';

export interface HqStep4DispatchDoneViewProps {
  emailSummary: HqEmailSummary;
  emailDetail?: HqEmailDetail | null;
  extractedDraft?: HqEmailExtractedDraft | null;
  vehicleSlots: VehicleSlotAssignment[];
  onOpenDriverModal: (slotIndex: number) => void;
  onResetToNewBooking: () => void;
  onOpenCustomerMessage?: () => void;
  dispatchedSchedule?: ScheduleItem|null;
  // Backward compatibility
  emailItem?: any;
}

export const HqStep4DispatchDoneView: React.FC<HqStep4DispatchDoneViewProps> = ({
  emailSummary,
  emailDetail,
  extractedDraft,
  vehicleSlots,
  onResetToNewBooking,
  onOpenCustomerMessage,
  dispatchedSchedule,
}) => {
  const [savedSchedules,setSavedSchedules]=useState<ScheduleItem[]>([]);
  const [syncError,setSyncError]=useState('');
  const identity=Object.values(extractedDraft?.savedScheduleIds || {}).sort().join('|') || dispatchedSchedule?.id || '';
  useEffect(()=>{
    const abort=new AbortController();let running=false;
    const refresh=async()=>{
      if(running || !identity)return;running=true;
      try{const response=await fetch('/api/schedules?role=hq',{cache:'no-store',signal:abort.signal});const data=await response.json();if(!response.ok)throw new Error(data.error || '일정을 조회하지 못했습니다.');if(abort.signal.aborted)return;
        const ids=new Set(identity.split('|'));const rows:ScheduleItem[]=data.schedules.filter((row:ScheduleItem)=>ids.has(row.id));
        setSavedSchedules(rows);setSyncError(rows.length===ids.size?'':'일부 저장 일정을 조회하지 못했습니다. 예약 목록을 확인해 주세요.');
      }catch(error){if(!abort.signal.aborted)setSyncError(error instanceof Error?error.message:'서버 확인 실패');}finally{running=false;}
    };
    void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},8000);
    window.addEventListener('focus',refresh);return()=>{abort.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[identity]);
  const progress=emailDispatchProgress(identity?identity.split('|'):[],savedSchedules);
  const driverAccepted=progress.complete;
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-5">
      {/* 1. Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <h2 className="text-base font-black text-slate-900">예약 상세</h2>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>배차 완료</span>
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>복사</span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>수정</span>
          </button>
          <button
            type="button"
            className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center cursor-pointer"
            aria-label="더보기"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* Left Sub-Column: 배차 정보 타임라인 + 배정 차량/기사 리스트 */}
        {/* ========================================================= */}
        <div className="lg:col-span-6 space-y-4">
          {/* Card 1: 배차 정보 타임라인 */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900">배차 정보</h3>

            {/* Stepper / Timeline */}
            <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-blue-200">
              {/* Step 1: 예약 접수 */}
              <div className="relative">
                <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shadow-xs">
                  ✓
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-900">예약 접수</span>
                  <span className="text-slate-400 font-medium">{emailSummary.receivedAt || '접수 완료'}</span>
                </div>
              </div>

              {/* Step 2: 배차 완료 */}
              <div className="relative">
                <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shadow-xs">
                  ✓
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-900">배차 완료</span>
                  <span className="text-slate-400 font-medium">관리자 배차 확정</span>
                </div>
              </div>

              {/* Step 3: 기사 확인 */}
              <div className="relative">
                <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shadow-xs">
                  ✓
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-900">기사 Cockpit 알림</span>
                  <span className="text-emerald-600 font-bold">{syncError?'조회 실패':driverAccepted?'전체 기사 확인 완료':'기사 확인 대기'}</span>
                </div>
              </div>

              {/* Step 4: 운행 대기 */}
              <div className="relative">
                <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 border-blue-500 bg-white text-blue-600 flex items-center justify-center text-[10px]">
                  •
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">운행 대기</span>
                  <span className="text-blue-600 font-bold text-[11px]">배차 상태 정상</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: 배정 차량 및 기사 */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900">배정 차량 및 기사</h3>

            <div className="space-y-2.5">
              {vehicleSlots.map((slot, idx) => (
                <div
                  key={slot.slotIndex}
                  className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1E60F3] text-[10px] font-black shrink-0">
                      {idx + 1}호차
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 truncate">
                        {slot.vehicleModel}
                      </div>
                      {slot.driver ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <img
                            src={slot.driver.avatarUrl}
                            alt={slot.driver.name}
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                          <span className="text-xs font-bold text-slate-700">
                            {slot.driver.name}
                          </span>
                          <div className="flex items-center text-amber-500 text-[10px] font-bold">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            <span>{slot.driver.rating}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">기사 미배정</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 text-right">
                      배차 저장됨
                    </span>
                    <button
                      type="button"
                      onClick={() => window.location.assign('/hq?tab=dispatch')}
                      className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-bold cursor-pointer"
                    >
                      변경
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onResetToNewBooking}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>새 예약 처리 (메일함 복귀)</span>
            </button>

            {onOpenCustomerMessage && (
              <button
                type="button"
                onClick={onOpenCustomerMessage}
                className="py-2.5 px-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border border-blue-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>고객 안내 메시지 발송</span>
              </button>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        <section className="lg:col-span-6 space-y-3" aria-label="날짜별 실제 기사 확인 상태">
          <h3 className="text-sm font-bold text-slate-900">전체 일정 · 기사 확인 {progress.confirmed}/{progress.expected}건</h3>
          <p className="text-xs text-slate-500">실제 기사 계정에서 확인한 최신 배차 버전만 반영합니다. 이 화면에서 대신 수락하지 않습니다.</p>
          {syncError && <p role="alert" className="text-sm text-rose-600">{syncError}</p>}
          {!savedSchedules.length && !syncError && <p role="status">서버 확인 상태를 조회하고 있습니다.</p>}
          {[...savedSchedules].sort((a,b)=>`${a.date} ${a.pickup_time}`.localeCompare(`${b.date} ${b.pickup_time}`)).map(row=><article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <p className="text-sm font-bold">{row.date} · {row.pickup_time}</p><p className="text-xs">{row.origin_name} → {(row.adminWaypoints || []).map(point=>point.name+' → ')}{row.destination_name}</p>
            <p className="text-xs">{row.vehicle_plate || '차량 미배정'} · {row.driver_name || '기사 미배정'}</p>
            <p className="text-xs font-bold text-[#1E60F3]">{row.dispatch_status==='cancelled'?'취소됨':row.isAcknowledged && row.last_ack_version===row.version?'기사 확인 완료':'기사 확인 대기'}{row.last_ack_at?` · ${new Date(row.last_ack_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`:''}</p>
          </article>)}
          <Link href="/hq?tab=dispatch" className="inline-block rounded-xl bg-[#1E60F3] px-4 py-3 text-sm font-bold text-white">저장된 예약에서 배정·변경 확인</Link>
        </section>
      </div>
    </div>
  );
};
