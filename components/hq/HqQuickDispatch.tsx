'use client';

import React, { useState } from 'react';
import {
  Car,
  Calendar,
  Send,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqQuickDispatchProps {
  onCreateBooking: (booking: Partial<HqBooking>, isDraft: boolean) => void;
  onOpenGroupDispatchModal?: () => void;
  onOpenLoadBookingModal?: () => void;
}

const DRIVER_OPTIONS = [
  { id: '김기사', name: '김기사', vehicle: 'G90 (8920)' },
  { id: '이기사', name: '이기사', vehicle: 'Staria 9 (4102)' },
  { id: '박기사', name: '박기사', vehicle: 'Sprinter (9011)' },
  { id: '최기사', name: '최기사', vehicle: 'G90 LWB (2290)' },
  { id: '정기사', name: '정기사', vehicle: 'Carnival HL (3190)' },
];

const VEHICLE_OPTIONS = [
  { id: 'G90', name: 'G90' },
  { id: 'Staria 9', name: 'Staria 9' },
  { id: 'Sprinter', name: 'Sprinter' },
  { id: 'G90 LWB', name: 'G90 LWB' },
  { id: 'Carnival HL', name: 'Carnival HL' },
  { id: 'Staria 10', name: 'Staria 10' },
];

export const HqQuickDispatch: React.FC<HqQuickDispatchProps> = ({
  onCreateBooking,
  onOpenGroupDispatchModal,
}) => {
  const [dispatchType, setDispatchType] = useState<'single' | 'group'>('single');
  const [customerName, setCustomerName] = useState('');
  const [pickupTime, setPickupTime] = useState('2026.10.26 14:00');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [memo, setMemo] = useState('');
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  const handleSubmit = (isDraft: boolean) => {
    if (!customerName.trim() && !isDraft) {
      alert('고객명을 입력해주세요.');
      return;
    }

    const newBooking: Partial<HqBooking> = {
      customerName: customerName.trim() || '신규 고객 예약 (가칭)',
      pickupTime: pickupTime.slice(-5) || '14:00',
      pickupDate: '2026. 10. 26',
      pickupLocation: pickupLocation || '서울 강남',
      destination: destination || '인천공항 T1',
      driverName: selectedDriver || '-',
      vehicleModel: selectedVehicle || '-',
      vehiclePlate: selectedDriver ? '배정완료' : '미배정',
      dispatchStatus: isDraft || !selectedDriver ? '작성 중' : '배차 완료',
      driverAck: isDraft || !selectedDriver ? '-' : '미확인',
      customerBrochure: '미발송',
      notes: memo,
      isToday: true,
      isDispatchTarget: true,
    };

    haptics.successPulse();
    onCreateBooking(newBooking, isDraft);

    if (isDraft) {
      setNotificationMsg('배차 초안이 임시저장되었습니다.');
    } else {
      setNotificationMsg(`배차가 발송되었습니다. ${selectedDriver || '기사'} Cockpit으로 알림이 전송되었습니다.`);
    }

    setTimeout(() => {
      setNotificationMsg(null);
      setCustomerName('');
      setPickupLocation('');
      setDestination('');
      setSelectedDriver('');
      setSelectedVehicle('');
      setMemo('');
    }, 2800);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      {/* 1. Header: Icon + Title */}
      <div>
        <div className="flex items-center gap-2 pb-3.5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 border border-blue-100/60">
            <Car className="w-4 h-4" />
          </div>
          <h2 className="text-base font-black text-slate-900 tracking-tight">
            빠른 배차 생성
          </h2>
        </div>

        {/* 2. Tabs: 단일 배차 / 그룹 배차 */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/80 rounded-xl my-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setDispatchType('single');
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer text-center ${
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
            className={`py-2 rounded-lg transition-all cursor-pointer text-center ${
              dispatchType === 'group'
                ? 'bg-[#1E60F3] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            그룹 배차
          </button>
        </div>

        {/* 3. Two-Column Form Layout */}
        <div className="space-y-3 text-xs">
          {/* Row 1: 고객명 * | 픽업 시간 * */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                고객명 <span className="text-[#1E60F3]">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="고객사 검색"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                픽업 시간 <span className="text-[#1E60F3]">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Row 2: 픽업 위치 * | 목적지 * */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                픽업 위치 <span className="text-[#1E60F3]">*</span>
              </label>
              <input
                type="text"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="출발 위치 입력"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                목적지 <span className="text-[#1E60F3]">*</span>
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="도착 위치 입력"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Row 3: 기사 선택 * | 차량 선택 * */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                기사 선택 <span className="text-[#1E60F3]">*</span>
              </label>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">기사 선택</option>
                {DRIVER_OPTIONS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name} ({d.vehicle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                차량 선택 <span className="text-[#1E60F3]">*</span>
              </label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">차량 선택</option>
                {VEHICLE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: 메모 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700">메모</label>
              <span className="text-[10px] text-slate-400 font-medium">{memo.length}/200</span>
            </div>
            <textarea
              rows={3}
              maxLength={200}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="요청 사항 또는 특이사항을 입력하세요. (선택)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium text-xs resize-none focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Info Notice Box */}
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p>
              배차 발송 시 선택한 기사에게 Cockpit 배차 알림이 전달됩니다. 고객 안내자료는 예약 상세에서 별도로 생성·발송합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Success Notification Feedback */}
      {notificationMsg && (
        <div className="my-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2 text-xs font-bold text-blue-800 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-[#1E60F3] shrink-0" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* 4. Action Buttons: 임시저장 | 배차 발송 */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            handleSubmit(true);
          }}
          className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer text-center"
        >
          임시저장
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.selection();
            handleSubmit(false);
          }}
          className="py-2.5 px-4 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          <span>배차 발송</span>
        </button>
      </div>
    </div>
  );
};
