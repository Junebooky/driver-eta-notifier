'use client';

import React, { useState, useEffect } from 'react';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { X, Check, Clock, User, Plane, FileText, Calendar } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface EditScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: ScheduleItem | null;
  onSave: (updated: ScheduleItem) => void;
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({
  isOpen,
  onClose,
  schedule,
  onSave,
}) => {
  const [passenger, setPassenger] = useState('');
  const [flight, setFlight] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (schedule) {
      setPassenger(schedule.passenger || '');
      setFlight(schedule.flight || '');
      setTimeDisplay(schedule.time_display || '');
      setNotes(schedule.notes || '');
    }
  }, [schedule]);

  if (!isOpen || !schedule) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Extract pickup_time if timeDisplay starts with HH:mm
    const timeMatch = timeDisplay.match(/(\d{1,2}:\d{2})/);
    const updatedPickupTime = timeMatch ? timeMatch[1].padStart(5, '0') : schedule.pickup_time;

    const updated: ScheduleItem = {
      ...schedule,
      passenger: passenger.trim() || schedule.passenger,
      flight: flight.trim() || undefined,
      time_display: timeDisplay.trim() || schedule.time_display,
      pickup_time: updatedPickupTime,
      notes: notes.trim() || undefined,
    };

    haptics.success();
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90dvh] animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              스케줄 정보 수정
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {schedule.dateLabel} • {schedule.origin_name} → {schedule.destination_name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Field 1: Time Display */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>픽업/착륙 시간 표기</span>
            </label>
            <input
              type="text"
              value={timeDisplay}
              onChange={(e) => setTimeDisplay(e.target.value)}
              placeholder="예: 09:50 착륙 (영접), 09:00 픽업"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
            <p className="text-[11px] text-slate-400">
              배차표 카드 상단에 노출되는 시간과 운행 성격을 지정합니다.
            </p>
          </div>

          {/* Field 2: Passenger */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>승객명 및 인원</span>
            </label>
            <input
              type="text"
              value={passenger}
              onChange={(e) => setPassenger(e.target.value)}
              placeholder="예: DENZEL SOFYAN 외 1명 (TARA SOFYAN)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
          </div>

          {/* Field 3: Flight Number */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-indigo-500" />
              <span>항공편명 (선택)</span>
            </label>
            <input
              type="text"
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
              placeholder="예: SQ 612 또는 SQ 601 (16:45 출국)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all uppercase"
            />
            <p className="text-[11px] text-slate-400">
              항공편명이 입력되면 카드 하단에 항공편 실시간 조회 버튼이 자동 활성화됩니다.
            </p>
          </div>

          {/* Field 4: Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>의전 메모 / 특이사항</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: CLUB CHALLENGE VIP 영접 • T1 입국장 피켓 대기"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-[#1E60F3] hover:bg-[#1650D6] active:scale-95 text-xs font-bold text-white shadow-md shadow-blue-500/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>수정 완료</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
