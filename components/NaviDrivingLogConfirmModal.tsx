'use client';

import React from 'react';
import { Compass, BookOpen, ArrowRight, Clock, MapPin, X } from 'lucide-react';

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
  if (!isOpen) return null;

  const providerLabel =
    naviProvider === 'tmap' ? '티맵' : naviProvider === 'kakao' ? '카카오내비' : '네이버지도';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-5 text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">{providerLabel} 안내 시작</h3>
              <p className="text-xs text-slate-400">운행일지 자동 연동 확인</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Question Prompt */}
        <div className="my-4 text-center">
          <p className="text-lg font-bold text-amber-300">이 경로를 운행일지에 추가할까요?</p>
          <p className="text-xs text-slate-400 mt-1">
            출발 시각({departureTime || '지금'})과 목적지가 오늘자 운행일지 경유지 목록에 기록됩니다.
          </p>
        </div>

        {/* Route Preview Box */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5 my-3 text-sm">
          <div className="flex items-start gap-2.5">
            <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-xs text-slate-400">출발지 {departureTime ? `(${departureTime} 출발)` : ''}</span>
              <p className="font-medium text-slate-200 truncate">{originName || '현재 위치'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-1">
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            {isLoadingFreshEta ? (
              <span className="inline-flex items-center gap-1 text-xs text-blue-400 font-semibold bg-blue-500/10 px-2 py-0.5 rounded animate-pulse">
                <Clock className="w-3 h-3" />
                최신 교통정보 조회 중...
              </span>
            ) : etaText ? (
              <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-semibold bg-amber-400/10 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3" />
                {etaText}
              </span>
            ) : null}
          </div>

          <div className="flex items-start gap-2.5">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-xs text-slate-400">도착지</span>
              <p className="font-bold text-blue-300 truncate">{destinationName}</p>
              {destinationAddress && (
                <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {destinationAddress}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="w-full py-3 px-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-semibold text-sm transition text-center cursor-pointer active:scale-98"
          >
            아니요 (내비만 실행)
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="w-full py-3 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition text-center flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
          >
            <BookOpen className="w-4 h-4" />
            추가하기
          </button>
        </div>
      </div>
    </div>
  );
};

