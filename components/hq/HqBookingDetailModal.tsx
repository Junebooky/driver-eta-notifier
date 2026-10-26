'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Mail,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { AVAILABLE_DRIVERS, AVAILABLE_VEHICLES } from '@/utils/hqData';
import { haptics } from '@/utils/haptics';

export interface HqBookingDetailModalProps {
  booking: HqBooking | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateBooking: (updated: HqBooking) => void;
}

export const HqBookingDetailModal: React.FC<HqBookingDetailModalProps> = ({
  booking,
  isOpen,
  onClose,
  onUpdateBooking,
}) => {
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (!isOpen || !booking) return null;

  const handleAssignDriver = () => {
    const drv = AVAILABLE_DRIVERS.find((d) => d.id === selectedDriverId);
    const veh = AVAILABLE_VEHICLES.find((v) => v.id === selectedVehicleId);

    if (!drv) {
      alert('배정할 기사를 선택해주세요.');
      return;
    }

    const updated: HqBooking = {
      ...booking,
      driverName: drv.name,
      driverPhone: drv.phone,
      vehicleModel: veh ? veh.class : booking.vehicleModel,
      vehiclePlate: veh ? veh.name.match(/\((.*?)\)/)?.[1] || '7789' : '7789',
      dispatchStatus: '배차 완료',
      driverAck: '미확인',
      driverAckTime: undefined,
      customerBrochure: '재발송 필요', // Changing driver marks profile as re-send needed per spec!
    };

    haptics.successPulse();
    onUpdateBooking(updated);
    setNotice(`기사 ${drv.name} 님이 배정되었습니다. Cockpit으로 알림이 전송되었습니다.`);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleResendDispatch = () => {
    haptics.lightTap();
    setNotice('기사 Cockpit으로 배차서 재알림을 전송했습니다.');
    setTimeout(() => setNotice(null), 3000);
  };

  const handleSendCustomerBrochure = () => {
    haptics.successPulse();
    const updated: HqBooking = {
      ...booking,
      customerBrochure: '발송됨',
    };
    onUpdateBooking(updated);
    setNotice('고객 안내자료(기사·차량 프로필)가 고객 이메일로 발송되었습니다.');
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 text-[#1E60F3]">
              {booking.bookingNo}
            </span>
            <h3 className="text-lg font-black text-slate-900">
              {booking.customerName} 예약 상세
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice Toast */}
        {notice && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-[#1E60F3] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#1E60F3] shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Modal Body: Split 2-Column Layout */}
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Itinerary & Passenger Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                운행 및 탑승 정보
              </h4>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">픽업 일시</span>
                  <span className="font-bold text-slate-800">
                    {booking.pickupDate} ({booking.pickupTime})
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 shrink-0">출발지</span>
                  <span className="font-bold text-slate-900 text-right">
                    {booking.pickupLocation}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 shrink-0">도착지</span>
                  <span className="font-bold text-[#1E60F3] text-right">
                    {booking.destination}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-slate-400">탑승 인원</span>
                  <span className="font-bold text-slate-800">
                    {booking.passengerName || 'VIP 1인'} ({booking.passengerCount || 1}명)
                  </span>
                </div>

                {booking.notes && (
                  <div className="pt-2 border-t border-slate-200/60">
                    <span className="text-slate-400 block text-[11px] mb-1">배차 특이사항</span>
                    <p className="text-slate-700 font-medium leading-relaxed bg-white p-2.5 rounded-xl border border-slate-200/60 text-[11px]">
                      {booking.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Independent Communication Progress (Spec Requirement!) */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                통신 & 안내 진행 상태
              </h4>

              {/* 1. 기사 배차 / 확인 상태 */}
              <div className="p-4 rounded-2xl border border-slate-200/90 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#1E60F3]" />
                    <span className="text-xs font-black text-slate-900">
                      기사 배차 및 확인
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      booking.driverAck === '확인완료'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : booking.dispatchStatus === '미배정'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {booking.driverAck === '확인완료'
                      ? `확인 완료 (${booking.driverAckTime || '시간 기록됨'})`
                      : booking.dispatchStatus === '미배정'
                      ? '미배정'
                      : '발송 · 미확인'}
                  </span>
                </div>

                <div className="text-xs space-y-1 text-slate-600">
                  <div>
                    담당 기사: <strong className="text-slate-900 font-bold">{booking.driverName}</strong>
                    {booking.driverPhone && (
                      <span className="text-slate-400 text-[11px] ml-1.5">({booking.driverPhone})</span>
                    )}
                  </div>
                  <div>
                    배정 차량: <strong className="text-slate-900 font-bold">{booking.vehicleModel}</strong> ({booking.vehiclePlate})
                  </div>
                </div>

                {/* Driver Assignment Selectors (if unassigned or changing) */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold"
                    >
                      <option value="">👤 기사 변경/배정</option>
                      {AVAILABLE_DRIVERS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.vehicle})
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold"
                    >
                      <option value="">🚗 차량 변경</option>
                      {AVAILABLE_VEHICLES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAssignDriver}
                      className="flex-1 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E60F3] text-xs font-bold transition-all"
                    >
                      기사/차량 배정 확정
                    </button>
                    {booking.dispatchStatus === '배차 완료' && (
                      <button
                        type="button"
                        onClick={handleResendDispatch}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all"
                      >
                        재알림
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. 고객 안내자료 (기사·차량 프로필) */}
              <div className="p-4 rounded-2xl border border-slate-200/90 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-[#1E60F3]" />
                    <span className="text-xs font-black text-slate-900">
                      고객 안내자료 (블랙&골드 프로필)
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      booking.customerBrochure === '발송됨'
                        ? 'bg-blue-50 text-[#1E60F3] border border-blue-200'
                        : booking.customerBrochure === '재발송 필요'
                        ? 'bg-rose-50 text-rose-600 border border-rose-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {booking.customerBrochure}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  배정된 기사 프로필 사진, 직책, 차량 외관 및 실내 2컷이 포함된 VIP 리무진 고객용 안내 브로슈어입니다.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSendCustomerBrochure}
                    className="flex-1 py-2 rounded-xl bg-[#1E60F3] hover:bg-[#1346D8] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>고객에게 안내자료 발송</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>기사 배차와 고객 안내자료는 독립적으로 이력이 관리됩니다.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
