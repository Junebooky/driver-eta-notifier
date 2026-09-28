'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { X, Check, Clock, User, Plane, FileText } from 'lucide-react';
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
  const [mounted, setMounted] = useState(false);
  const [passenger, setPassenger] = useState('');
  const [flight, setFlight] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (schedule) {
      setPassenger(schedule.passenger || '');
      setFlight(schedule.flight || '');
      setTimeDisplay(schedule.time_display || '');
      setNotes(schedule.notes || '');
    }
  }, [schedule]);

  // Body Scroll Lock
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, [isOpen]);

  if (!isOpen || !mounted || !schedule) return null;

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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none overscroll-contain animate-in fade-in duration-200"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      {/* Background Dimmed Overlay */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm -z-10" />

      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90dvh] relative z-10 animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
              스케줄 정보 수정
            </h3>
            <p className="text-sm font-semibold text-slate-500 mt-0.5">
              {schedule.dateLabel} • {schedule.origin_name} → {schedule.destination_name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[90dvh] flex-1 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Field 1: Time Display */}
          <div className="space-y-1.5">
            <label className="text-base sm:text-lg font-extrabold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#1E60F3]" />
              <span>픽업 시간</span>
            </label>
            <input
              type="text"
              value={timeDisplay}
              onChange={(e) => setTimeDisplay(e.target.value)}
              placeholder="예: 픽업 09:50, 픽업 09:00"
              className="w-full px-4 py-3 sm:py-3.5 rounded-xl border border-slate-200 text-base sm:text-lg font-semibold text-slate-800 placeholder:text-slate-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
            <p className="text-xs text-slate-400 font-medium">
              배차표 카드 상단에 노출되는 픽업 시간을 지정합니다.
            </p>
          </div>

          {/* Field 2: Passenger */}
          <div className="space-y-1.5">
            <label className="text-base sm:text-lg font-extrabold text-slate-700 flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#1E60F3]" />
              <span>승객명 및 인원</span>
            </label>
            <input
              type="text"
              value={passenger}
              onChange={(e) => setPassenger(e.target.value)}
              placeholder="예: DENZEL SOFYAN 외 1명 (TARA SOFYAN)"
              className="w-full px-4 py-3 sm:py-3.5 rounded-xl border border-slate-200 text-base sm:text-lg font-semibold text-slate-800 placeholder:text-slate-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
          </div>

          {/* Field 3: Flight Number */}
          <div className="space-y-1.5">
            <label className="text-base sm:text-lg font-extrabold text-slate-700 flex items-center gap-1.5">
              <Plane className="w-4 h-4 text-indigo-500" />
              <span>항공편명 (선택)</span>
            </label>
            <input
              type="text"
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
              placeholder="예: SQ 612 또는 SQ 601 (16:45 출국)"
              className="w-full px-4 py-3 sm:py-3.5 rounded-xl border border-slate-200 text-base sm:text-lg font-semibold text-slate-800 placeholder:text-slate-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all uppercase"
            />
            <p className="text-xs text-slate-400 font-medium">
              항공편명이 입력되면 카드 하단에 항공편 실시간 조회 버튼이 자동 활성화됩니다.
            </p>
          </div>

          {/* Field 4: Notes */}
          <div className="space-y-1.5">
            <label className="text-base sm:text-lg font-extrabold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-500" />
              <span>의전 메모 / 특이사항</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: CLUB CHALLENGE VIP 영접 • T1 입국장 피켓 대기"
              className="w-full px-4 py-3 sm:py-3.5 rounded-xl border border-slate-200 text-base sm:text-lg font-semibold text-slate-800 placeholder:text-slate-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-3">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-base sm:text-lg hover:bg-slate-100 transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-[2] py-4 rounded-2xl bg-[#1E60F3] hover:bg-[#1650D6] active:scale-[0.98] text-base sm:text-lg font-black text-white shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>수정 완료</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
