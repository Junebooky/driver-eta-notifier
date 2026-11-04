'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { MapPin, FilePlus } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface NaviDrivingLogConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  originName?: string;
  destinationName: string;
  destinationAddress?: string;
  departureTime?: string;
  etaText?: string;
  isLoadingFreshEta?: boolean;
  naviProvider?: 'tmap' | 'kakao' | 'naver';
  onConfirm: (addToLog: boolean) => void;
}

export const NaviDrivingLogConfirmModal: React.FC<NaviDrivingLogConfirmModalProps> = ({
  isOpen,
  onClose,
  originName,
  destinationName,
  destinationAddress,
  departureTime,
  etaText,
  isLoadingFreshEta = false,
  naviProvider = 'tmap',
  onConfirm,
}) => {
  // ESC key listener to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        haptics.lightTap();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format departure time for display, defaulting to current KST time if not provided
  const displayDepartureTime =
    departureTime ||
    (() => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-[390px] bg-white rounded-[28px] shadow-2xl p-5 sm:p-6 text-slate-900 border border-slate-100/80 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Top Section: Header & 3D Calendar Illustration */}
        <div className="flex items-start justify-between gap-2 relative">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Blue Navigation Arrow Icon */}
            <div className="w-10 h-10 rounded-2xl bg-[#1E60F3] shadow-md shadow-blue-500/20 flex items-center justify-center text-white shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-white fill-white" viewBox="0 0 24 24">
                <polygon points="3 11 22 2 13 21 11 13 3 11" fill="currentColor" />
              </svg>
            </div>

            {/* Title & Explanatory Subtitle */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-500 tracking-tight">
                운행일지 연동
              </p>
              <h3 className="text-[19px] sm:text-[20px] font-extrabold text-slate-900 tracking-tight leading-[1.3] mt-1">
                이 경로를 운행일지에<br />추가할까요?
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5">
                내비게이션으로 안내를 시작하면<br />
                해당 경로가 운행일지에 기록됩니다.
              </p>
            </div>
          </div>

          {/* 3D Calendar Graphic with Checkmark Badge */}
          <div className="shrink-0 w-24 h-24 relative flex items-center justify-center -mr-1 -mt-1">
            <Image
              src="/images/calendar_3d_badge.png"
              alt="운행일지 연동 캘린더"
              width={96}
              height={96}
              className="object-contain drop-shadow-sm pointer-events-none select-none"
              priority
            />
          </div>
        </div>

        {/* 2. Route Preview Card */}
        <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-4 my-4 shadow-2xs">
          <div className="flex items-center gap-3.5">
            {/* Visual Timeline (Concentric GPS Dot -> Solid Line -> MapPin) */}
            <div className="flex flex-col items-center shrink-0 self-stretch justify-between py-1">
              {/* Origin GPS Point: Concentric Circle */}
              <div className="w-5 h-5 rounded-full bg-[#1E60F3] flex items-center justify-center shadow-2xs">
                <div className="w-2.5 h-2.5 rounded-full bg-white flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                </div>
              </div>

              {/* Connecting Vertical Line */}
              <div className="w-[1.5px] bg-slate-300 flex-1 my-1" />

              {/* Destination Point: Slate Circle with Location Pin */}
              <div className="w-5 h-5 rounded-full bg-slate-200/90 flex items-center justify-center">
                <MapPin className="w-3 h-3 fill-slate-600 text-slate-600" />
              </div>
            </div>

            {/* Route Stop Names & Timing */}
            <div className="flex-1 min-w-0 space-y-2.5">
              {/* Origin */}
              <div>
                <p className="text-[11px] font-medium text-slate-400">
                  출발지 ({displayDepartureTime} 출발)
                </p>
                <p className="text-sm font-bold text-slate-900 truncate mt-0.5">
                  {originName || '현위치'}
                </p>
              </div>

              {/* Destination */}
              <div>
                <p className="text-[11px] font-medium text-slate-400">
                  도착지
                </p>
                <p className="text-sm font-bold text-slate-900 truncate mt-0.5">
                  {destinationName}
                </p>
                {destinationAddress && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {destinationAddress}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onConfirm(false);
            }}
            className="w-full py-3.5 px-4 rounded-2xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition-all active:scale-[0.98] cursor-pointer text-center shadow-2xs"
          >
            아니요
          </button>
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              onConfirm(true);
            }}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#1E60F3] hover:bg-blue-600 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 text-center"
          >
            <FilePlus className="w-4 h-4 stroke-[2.2]" />
            <span>추가하기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
