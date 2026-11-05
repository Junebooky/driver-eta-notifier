'use client';

import React, { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { DriverTimePickerModal } from './common/DriverTimePickerModal';
import { X, Check } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface EditScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: ScheduleItem | null;
  onSave: (updated: ScheduleItem) => void | Promise<void>;
}

function formatEditHeaderDate(schedule: ScheduleItem): string {
  const parts = (schedule.date || '').split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    if (!isNaN(dt.getTime())) {
      const dow = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
      return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${dow})`;
    }
  }
  return schedule.dateLabel;
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({
  isOpen,
  onClose,
  schedule,
  onSave,
}) => {
  const formId = useId();
  const [mounted, setMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [passenger, setPassenger] = useState('');
  const [flight, setFlight] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('');
  const [notes, setNotes] = useState('');
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (schedule) {
      setPassenger(schedule.passenger || '');
      setFlight(schedule.flight || '');
      setTimeDisplay(schedule.time_display || '');
      setNotes(schedule.notes || '');
      setIsTimePickerOpen(false);
      setSaveError('');
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

  const extractedHHMM =
    timeDisplay.match(/(\d{1,2}:\d{2})/)?.[1]?.padStart(5, '0') ||
    (schedule.pickup_time ? schedule.pickup_time.slice(0, 5) : '09:00');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    // Extract pickup_time if timeDisplay contains HH:mm
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

    setIsSaving(true);
    setSaveError('');
    try {
      await onSave(updated);
      haptics.success();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const pickupTimeId = `${formId}-pickup-time`;
  const pickupTimeHelpId = `${formId}-pickup-time-help`;
  const passengerId = `${formId}-passenger`;
  const flightId = `${formId}-flight`;
  const flightHelpId = `${formId}-flight-help`;
  const notesId = `${formId}-notes`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none overscroll-contain animate-in fade-in duration-200"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      {/* Background Dimmed Overlay */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs -z-10" />

      <div
        className="w-full max-w-md bg-[#F6F8FC] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100/90 overflow-hidden flex flex-col max-h-[92dvh] relative z-10 animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-2">
          <div className="min-w-0">
            <h3 className="text-xl font-extrabold text-[#0F172A] tracking-tight leading-snug">
              스케줄 정보 수정
            </h3>
            <p className="text-xs sm:text-[13px] font-medium text-slate-400 mt-1 truncate">
              {formatEditHeaderDate(schedule)} • {schedule.origin_name} → {schedule.destination_name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isSaving) return;
              haptics.lightTap();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-[#EBEEF5] hover:bg-slate-200/80 text-slate-500 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="닫기"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="px-5 sm:px-6 pt-3 pb-5 space-y-4 overflow-y-auto max-h-[90dvh] flex-1 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {saveError && (
            <p role="alert" aria-live="polite" className="text-xs font-bold text-rose-600">
              {saveError}
            </p>
          )}

          {/* Field 1: Pickup Time (No icon in label per user instruction; opens unified time picker on click) */}
          <div>
            <label
              htmlFor={pickupTimeId}
              className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5"
            >
              픽업 시간
            </label>
            <input
              id={pickupTimeId}
              name="time_display"
              type="text"
              readOnly
              value={timeDisplay}
              onClick={() => {
                haptics.lightTap();
                setIsTimePickerOpen(true);
              }}
              aria-describedby={pickupTimeHelpId}
              placeholder="예: 픽업 09:00"
              className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-100/90 hover:border-blue-200 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-sm sm:text-[15px] font-bold text-[#0F172A] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/10 outline-none transition-all cursor-pointer tabular-nums"
            />
            <p id={pickupTimeHelpId} className="text-xs text-slate-400 font-medium mt-1.5">
              배차표 카드 상단에 노출되는 픽업 시간을 지정합니다.
            </p>
          </div>

          {/* Field 2: Passenger (No icon in label) */}
          <div>
            <label
              htmlFor={passengerId}
              className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5"
            >
              승객명 및 인원
            </label>
            <input
              id={passengerId}
              name="passenger_name"
              type="text"
              value={passenger}
              onChange={(e) => setPassenger(e.target.value)}
              placeholder="예: Anndy"
              className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-sm sm:text-[15px] font-bold text-[#0F172A] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/10 outline-none transition-all"
            />
          </div>

          {/* Field 3: Flight Number (No icon in label) */}
          <div>
            <label
              htmlFor={flightId}
              className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5"
            >
              항공편명 (선택)
            </label>
            <input
              id={flightId}
              name="flight_number"
              type="text"
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
              aria-describedby={flightHelpId}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="예: SQ612"
              className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-sm sm:text-[15px] font-bold text-[#0F172A] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/10 outline-none transition-all uppercase"
            />
            <p id={flightHelpId} className="text-xs text-slate-400 font-medium mt-1.5">
              항공편명이 입력되면 카드 하단에 항공편 실시간 조회 버튼이 자동 활성화됩니다.
            </p>
          </div>

          {/* Field 4: Notes (No icon in label) */}
          <div>
            <label
              htmlFor={notesId}
              className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5"
            >
              의전 메모 / 특이사항
            </label>
            <textarea
              id={notesId}
              name="protocol_notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: 공항 피켓 영접 요청"
              className="w-full p-4 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-sm sm:text-[15px] font-bold text-[#0F172A] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/10 outline-none transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (isSaving) return;
                haptics.lightTap();
                onClose();
              }}
              className="flex-1 h-13 rounded-2xl bg-white border border-slate-100/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] text-slate-600 font-extrabold text-sm sm:text-[15px] hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              disabled={isSaving}
              type="submit"
              className="flex-[2] h-13 rounded-2xl bg-[#0055FF] hover:bg-[#0046D5] active:scale-[0.98] text-sm sm:text-[15px] font-extrabold text-white shadow-[0_6px_18px_rgba(0,85,255,0.28)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4.5 h-4.5 stroke-[2.5]" />
              <span>{isSaving ? '저장 중…' : '수정 완료'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Unified Driver Time Picker Modal (피커 타임 UI) */}
      <DriverTimePickerModal
        isOpen={isTimePickerOpen}
        title="픽업 시각 설정"
        value={extractedHHMM}
        onClose={() => setIsTimePickerOpen(false)}
        onConfirm={(nextTime) => {
          setTimeDisplay(`픽업 ${nextTime}`);
        }}
      />
    </div>,
    document.body
  );
};
