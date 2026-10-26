'use client';

import React, { useState } from 'react';
import {
  Car,
  Calendar,
  Search,
  Send,
  RotateCcw,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { AVAILABLE_DRIVERS, AVAILABLE_VEHICLES } from '@/utils/hqData';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqQuickDispatchProps {
  onCreateBooking: (booking: Partial<HqBooking>, isDraft: boolean) => void;
  onOpenGroupDispatchModal?: () => void;
  onOpenLoadBookingModal?: () => void;
}

export const HqQuickDispatch: React.FC<HqQuickDispatchProps> = ({
  onCreateBooking,
  onOpenGroupDispatchModal,
  onOpenLoadBookingModal,
}) => {
  const [dispatchType, setDispatchType] = useState<'single' | 'group'>('single');
  const [customerName, setCustomerName] = useState('');
  const [pickupTime, setPickupTime] = useState('2024. 10. 24. (목) 14:00');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  const handleSubmit = (isDraft: boolean) => {
    if (!customerName.trim() && !isDraft) {
      alert('고객명을 입력해주세요.');
      return;
    }

    const driverObj = AVAILABLE_DRIVERS.find((d) => d.id === selectedDriverId);
    const vehicleObj = AVAILABLE_VEHICLES.find((v) => v.id === selectedVehicleId);

    const newBooking: Partial<HqBooking> = {
      customerName: customerName.trim() || '신규 고객 예약 (가칭)',
      pickupTime: pickupTime.slice(-5) || '14:00',
      pickupDate: '2024. 10. 24',
      pickupLocation: pickupLocation || '서울 강남',
      destination: destination || '인천공항 T1',
      driverName: driverObj ? driverObj.name : '-',
      driverPhone: driverObj?.phone,
      vehicleModel: vehicleObj ? vehicleObj.class : '차량 미지정',
      vehiclePlate: vehicleObj ? vehicleObj.name.match(/\((.*?)\)/)?.[1] || '미배정' : '미배정',
      dispatchStatus: isDraft || !driverObj ? '미배정' : '배차 완료',
      driverAck: isDraft || !driverObj ? '-' : '미확인',
      customerBrochure: '미발송',
    };

    haptics.successPulse();
    onCreateBooking(newBooking, isDraft);

    if (isDraft) {
      setNotificationMsg('배차 초안이 임시저장되었습니다. 기사에게 알림이 전송되지 않습니다.');
    } else {
      setNotificationMsg(`배차가 발송되었습니다. ${driverObj ? driverObj.name : '기사'} Cockpit으로 알림이 전송되었습니다.`);
    }

    setTimeout(() => {
      setNotificationMsg(null);
      setCustomerName('');
      setPickupLocation('');
      setDestination('');
      setSelectedDriverId('');
      setSelectedVehicleId('');
    }, 2800);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      {/* Panel Header */}
      <div>
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              빠른 배차 생성
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onOpenLoadBookingModal?.();
            }}
            className="text-[11px] font-bold text-[#1E60F3] hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>예약에서 불러오기</span>
          </button>
        </div>

        {/* Single / Group Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/70 rounded-xl mt-3.5">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setDispatchType('single');
            }}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dispatchType === 'single'
                ? 'bg-[#1E60F3] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            단일 배차
          </button>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setDispatchType('group');
              onOpenGroupDispatchModal?.();
            }}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              dispatchType === 'group'
                ? 'bg-[#1E60F3] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            그룹 배차
          </button>
        </div>

        {/* Notification Toast */}
        {notificationMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-[#1E60F3] flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#1E60F3]" />
            <span>{notificationMsg}</span>
          </div>
        )}

        {/* Input Form Fields */}
        <div className="mt-3.5 space-y-3">
          {/* 고객명 & 픽업 시간 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                고객명 <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="고객명 검색"
                  className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                픽업 시간 <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  placeholder="2024. 10. 24. (목) 14:00"
                  className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
                />
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 픽업 위치 & 목적지 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                픽업 위치 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="픽업 위치를 입력하세요"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                목적지 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="목적지를 입력하세요"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          {/* 기사 선택 & 차량 선택 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                기사 선택
              </label>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-[#1E60F3] focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
              >
                <option value="">👤 기사 선택</option>
                {AVAILABLE_DRIVERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.vehicle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                차량 선택
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-[#1E60F3] focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
              >
                <option value="">🚗 차량 선택</option>
                {AVAILABLE_VEHICLES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} - {v.capacity}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* IMPORTANT SPEC HELPER COPY (Corrected per design spec) */}
          <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
            <Info className="w-4 h-4 text-[#1E60F3] shrink-0 mt-0.5" />
            <p>
              배차 발송 시 선택한 기사에게 Cockpit 배차 알림이 전달됩니다. 고객 안내자료는 예약 상세에서 별도로 생성·발송합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons: 임시저장 & 배차 발송 */}
      <div className="pt-4 mt-3 border-t border-slate-100 flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleSubmit(true)}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-98 text-center"
        >
          임시저장
        </button>

        <button
          type="button"
          onClick={() => handleSubmit(false)}
          className="flex-1 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-[#1346D8] text-white text-xs font-bold transition-all shadow-sm shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
        >
          <Send className="w-3.5 h-3.5" />
          <span>배차 발송</span>
        </button>
      </div>
    </div>
  );
};
