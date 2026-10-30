'use client';

import React, { useState } from 'react';
import {
  Car,
  CheckCircle2,
  Copy,
  Edit,
  MoreHorizontal,
  Clock,
  Compass,
  User,
  ArrowRight,
  Star,
  RefreshCw,
  MessageSquare,
  ChevronLeft,
} from 'lucide-react';
import { VehicleSlotAssignment } from './HqStep2BookingDetailView';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft } from '@/types/emailHq';
import { haptics } from '@/utils/haptics';

export interface HqStep4DispatchDoneViewProps {
  emailSummary: HqEmailSummary;
  emailDetail?: HqEmailDetail | null;
  extractedDraft?: HqEmailExtractedDraft | null;
  vehicleSlots: VehicleSlotAssignment[];
  onOpenDriverModal: (slotIndex: number) => void;
  onResetToNewBooking: () => void;
  onOpenCustomerMessage?: () => void;
  dispatchedSchedule?: any;
  // Backward compatibility
  emailItem?: any;
}

export const HqStep4DispatchDoneView: React.FC<HqStep4DispatchDoneViewProps> = ({
  emailSummary,
  emailDetail,
  extractedDraft,
  vehicleSlots,
  onOpenDriverModal,
  onResetToNewBooking,
  onOpenCustomerMessage,
  dispatchedSchedule,
}) => {
  const [driverAccepted, setDriverAccepted] = useState(false);
  const [driverRejected, setDriverRejected] = useState(false);

  const handleDriverAccept = () => {
    haptics.success();
    setDriverAccepted(true);
    setDriverRejected(false);
  };

  const handleDriverReject = () => {
    haptics.selection();
    setDriverRejected(true);
    setDriverAccepted(false);
  };

  const handleOpenNavi = () => {
    haptics.lightTap();
    const dest = extractedDraft?.dropoffLocation || '조선팰리스서울';
    const url = `https://apis.openapi.sk.com/tmap/app/routes?appKey=live&name=${encodeURIComponent(dest)}`;
    window.open(url, '_blank');
  };

  const bookingDate = extractedDraft?.pickupDate || '오늘';
  const bookingTime = extractedDraft?.pickupTime || '09:00';
  const pickupLocation = extractedDraft?.pickupLocation || '출발지';
  const dropoffLocation = extractedDraft?.dropoffLocation || '도착지';
  const passengerName = extractedDraft?.passengerName || 'VIP 고객';
  const passengerCount = extractedDraft?.passengerCount ?? 1;
  const flightNumber = extractedDraft?.flightNumber;

  const primarySlot = vehicleSlots[0] || {
    vehicleModel: '의전 차량',
    driver: null,
  };

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
                  <span className="text-emerald-600 font-bold">실시간 발송 완료</span>
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
                      알림 전송됨
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenDriverModal(slot.slotIndex)}
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
        {/* Right Sub-Column: 기사 앱 알림 화면 (Smartphone Mockup)     */}
        {/* ========================================================= */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full text-left mb-2 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span>기사 앱 알림 화면</span>
              <span className="text-[10px] text-slate-400 font-normal">
                (기사 스마트폰 Cockpit 화면)
              </span>
            </h3>
          </div>

          {/* Smartphone Mockup */}
          <div className="w-full max-w-[340px] bg-slate-900 p-3 rounded-[38px] shadow-2xl border-4 border-slate-800">
            {/* Screen bezel */}
            <div className="bg-slate-50 rounded-[30px] overflow-hidden flex flex-col min-h-[500px]">
              {/* Dynamic Island / Speaker Notch */}
              <div className="pt-2.5 pb-1 flex justify-center bg-white">
                <div className="w-20 h-4 bg-slate-900 rounded-full" />
              </div>

              {/* Mobile App Header */}
              <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1 text-slate-800 font-black text-xs">
                  <ChevronLeft className="w-4 h-4" />
                  <span>배차 상세</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                  배차완료
                </span>
              </div>

              {/* Mobile Card Content */}
              <div className="p-4 flex-1 space-y-3.5 overflow-y-auto font-sans">
                {/* Date & Flight Banner */}
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-900">
                  <span>{bookingDate}</span>
                  <div className="flex items-center gap-1 text-blue-600">
                    {flightNumber && <span>✈ {flightNumber}</span>}
                    {flightNumber && <span className="text-slate-400 font-normal">|</span>}
                    <span>{bookingTime}</span>
                  </div>
                </div>

                {/* Route Card */}
                <div className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-slate-900 truncate">
                        {pickupLocation}
                      </div>
                      <div className="text-[9px] text-slate-400">출발 픽업지</div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />

                    <div className="min-w-0 text-right">
                      <div className="text-[11px] font-bold text-slate-900 truncate">
                        {dropoffLocation}
                      </div>
                      <div className="text-[9px] text-slate-400">도착지</div>
                    </div>
                  </div>
                </div>

                {/* Passenger Row */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded-full bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-slate-800 truncate">
                    {passengerName} ({passengerCount}명)
                  </span>
                </div>

                {/* Vehicle Row */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src="/images/car_phone_carnival.png"
                      alt="배정 차량"
                      className="w-10 h-7 object-contain shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-black text-slate-900 leading-tight truncate">
                        {primarySlot.vehicleModel}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium truncate">
                        {primarySlot.driver?.plate || '차량 배정'} · {primarySlot.driver?.name || '담당기사'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation Button */}
                <button
                  type="button"
                  onClick={handleOpenNavi}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-[#1E60F3]" />
                  <span>내비게이션 열기</span>
                </button>

                {/* Acceptance Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleDriverReject}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      driverRejected
                        ? 'bg-rose-50 text-rose-600 border border-rose-300'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {driverRejected ? '거절됨' : '거절'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDriverAccept}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      driverAccepted
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-[#1E60F3] text-white hover:bg-blue-600 shadow-xs'
                    }`}
                  >
                    {driverAccepted ? '수락 완료 ✓' : '수락'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
