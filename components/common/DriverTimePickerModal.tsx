'use client';

import React, { useState, useEffect, useId } from 'react';
import { Clock, X } from 'lucide-react';
import { clampTimeComponent, isValidTimeHHMM } from '@/utils/drivingLog';
import { haptics } from '@/utils/haptics';

export interface DriverTimePickerModalProps {
  isOpen: boolean;
  title?: string;
  value: string; // 'HH:mm'
  onClose: () => void;
  onConfirm: (formattedTime: string) => void;
}

export const DriverTimePickerModal: React.FC<DriverTimePickerModalProps> = ({
  isOpen,
  title = '시각 설정',
  value,
  onClose,
  onConfirm,
}) => {
  const uid = useId();
  const [pickerHour, setPickerHour] = useState('09');
  const [pickerMinute, setPickerMinute] = useState('00');

  useEffect(() => {
    if (!isOpen) return;
    let initH = '09';
    let initM = '00';
    const match = (value || '').match(/(\d{1,2}):(\d{2})/);
    if (match && isValidTimeHHMM(`${match[1].padStart(2, '0')}:${match[2]}`)) {
      initH = match[1].padStart(2, '0');
      initM = match[2];
    } else {
      const now = new Date();
      initH = String(now.getHours()).padStart(2, '0');
      initM = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
    }
    setPickerHour(initH);
    setPickerMinute(initM);

    const timer = setTimeout(() => {
      document.getElementById(`${uid}-wheel-hour-${initH}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      document.getElementById(`${uid}-wheel-min-${initM}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 40);
    return () => clearTimeout(timer);
  }, [isOpen, value, uid]);

  if (!isOpen) return null;

  const applyTimePicker = () => {
    haptics.selection();
    const cleanH = clampTimeComponent(pickerHour || '00', 23);
    const cleanM = clampTimeComponent(pickerMinute || '00', 59);
    onConfirm(`${cleanH}:${cleanM}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="bg-[#F6F8FC] border border-slate-100/90 rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-[#EDF1F7] hover:bg-slate-200/80 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* 직접 타이핑 가능한 시간 입력 바 + 원터치 '지금' 버튼 */}
        <div className="flex items-center justify-between bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <input
              id={`${uid}-picker-hour-input`}
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={pickerHour}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                if (digits === '') {
                  setPickerHour('');
                  return;
                }
                const num = Math.min(23, parseInt(digits, 10));
                const nextVal = digits.length === 2 ? String(num).padStart(2, '0') : digits;
                setPickerHour(nextVal);
                const padded = String(num).padStart(2, '0');
                document
                  .getElementById(`${uid}-wheel-hour-${padded}`)
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                if (digits.length === 2) {
                  const minInput = document.getElementById(
                    `${uid}-picker-min-input`
                  ) as HTMLInputElement | null;
                  minInput?.focus();
                  minInput?.select();
                }
              }}
              onBlur={() => setPickerHour(clampTimeComponent(pickerHour || '00', 23))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyTimePicker();
                }
              }}
              aria-label="시 입력"
              className="w-12 h-9 rounded-xl bg-[#F4F7FC] border border-transparent focus:bg-white focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 text-center text-lg font-black text-[#0055FF] tabular-nums outline-none transition-all"
            />
            <span className="text-lg font-black text-[#0055FF] select-none">:</span>
            <input
              id={`${uid}-picker-min-input`}
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={pickerMinute}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                if (digits === '') {
                  setPickerMinute('');
                  return;
                }
                const num = Math.min(59, parseInt(digits, 10));
                const nextVal = digits.length === 2 ? String(num).padStart(2, '0') : digits;
                setPickerMinute(nextVal);
                const padded = String(num).padStart(2, '0');
                document
                  .getElementById(`${uid}-wheel-min-${padded}`)
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }}
              onBlur={() => setPickerMinute(clampTimeComponent(pickerMinute || '00', 59))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyTimePicker();
                }
              }}
              aria-label="분 입력"
              className="w-12 h-9 rounded-xl bg-[#F4F7FC] border border-transparent focus:bg-white focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 text-center text-lg font-black text-[#0055FF] tabular-nums outline-none transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              const now = new Date();
              const hh = String(now.getHours()).padStart(2, '0');
              const mm = String(now.getMinutes()).padStart(2, '0');
              setPickerHour(hh);
              setPickerMinute(mm);
              setTimeout(() => {
                document.getElementById(`${uid}-wheel-hour-${hh}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                document.getElementById(`${uid}-wheel-min-${mm}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }, 30);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-[#EBF3FF] hover:bg-blue-100/80 text-xs font-extrabold text-[#0055FF] active:scale-95 transition-all cursor-pointer flex items-center gap-1"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>지금</span>
          </button>
        </div>

        {/* iOS 스타일 상하 스와이프 휠 피커 */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl p-2.5">
          {/* Hour Wheel (00 ~ 23) */}
          <div className="h-36 overflow-y-auto snap-y snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-1 px-1">
            {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((hh) => {
              const selected = clampTimeComponent(pickerHour || '00', 23) === hh;
              return (
                <button
                  id={`${uid}-wheel-hour-${hh}`}
                  key={hh}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setPickerHour(hh);
                  }}
                  className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${
                    selected
                      ? 'bg-[#0055FF] text-white text-base font-black shadow-[0_3px_10px_rgba(0,85,255,0.25)]'
                      : 'text-sm font-semibold text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {hh}시
                </button>
              );
            })}
          </div>

          <span className="text-xl font-black text-slate-300 select-none">:</span>

          {/* Minute Wheel (00 ~ 59) */}
          <div className="h-36 overflow-y-auto snap-y snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-1 px-1">
            {Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0')).map((mm) => {
              const selected = clampTimeComponent(pickerMinute || '00', 59) === mm;
              return (
                <button
                  id={`${uid}-wheel-min-${mm}`}
                  key={mm}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setPickerMinute(mm);
                  }}
                  className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${
                    selected
                      ? 'bg-[#0055FF] text-white text-base font-black shadow-[0_3px_10px_rgba(0,85,255,0.25)]'
                      : 'text-sm font-semibold text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {mm}분
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="flex-1 py-3 bg-[#EEF2F7] hover:bg-slate-200/80 text-xs sm:text-sm font-extrabold text-slate-700 rounded-2xl cursor-pointer transition-all active:scale-98"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={applyTimePicker}
            className="flex-1 py-3 bg-[#0055FF] hover:bg-[#0046D5] text-white text-xs sm:text-sm font-extrabold rounded-2xl shadow-[0_6px_16px_rgba(0,85,255,0.28)] cursor-pointer transition-all active:scale-98"
          >
            설정 완료
          </button>
        </div>
      </div>
    </div>
  );
};
