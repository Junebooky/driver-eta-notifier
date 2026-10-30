'use client';

import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Clock, Navigation } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { copyTextSafely } from '@/utils/freshEtaActionPipeline';

export interface FreshEtaActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  reportText: string;
  originName: string;
  destinationName: string;
  departureTimeText?: string;
  etaFormatted?: string;
  durationMinutes?: number;
  isKakaoAction?: boolean;
}

export const FreshEtaActionSheet: React.FC<FreshEtaActionSheetProps> = ({
  isOpen,
  onClose,
  title = '최신 ETA 단톡방 보고',
  reportText,
  originName,
  destinationName,
  departureTimeText,
  etaFormatted,
  durationMinutes,
  isKakaoAction = false,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  if (!isOpen) return null;

  const handleActionClick = async () => {
    haptics.success();
    const success = await copyTextSafely(reportText);
    if (success) {
      setCopyStatus('copied');
      if (isKakaoAction) {
        setTimeout(() => {
          try {
            window.location.href = 'kakaotalk://';
          } catch (e) {
            console.warn('Failed to launch kakaotalk URL scheme:', e);
          }
        }, 150);
      }
      setTimeout(() => {
        onClose();
        setCopyStatus('idle');
      }, 1200);
    } else {
      setCopyStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-100 shadow-2xl overflow-hidden p-5 space-y-4 animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isKakaoAction ? 'bg-[#FEE500] text-[#191919]' : 'bg-[#1E60F3] text-white'}`}>
              {isKakaoAction ? (
                <svg className="w-4.5 h-4.5 fill-[#191919]" viewBox="0 0 24 24">
                  <path d="M12 3c-5.523 0-10 3.582-10 8 0 2.853 1.879 5.364 4.707 6.744l-.961 3.541c-.085.312.246.577.525.418l4.24-2.42c.484.06 1.002.097 1.489.097 5.523 0 10-3.582 10-8s-4.477-8-10-8z" />
                </svg>
              ) : (
                <Navigation className="w-4 h-4 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
              <p className="text-[11px] text-slate-500 font-medium">최신 교통정보가 재계산되었습니다</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Route & Fresh ETA Summary */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 truncate max-w-[200px]">{originName} ➔ {destinationName}</span>
            {etaFormatted && (
              <span className="inline-flex items-center gap-1 font-bold text-[#1E60F3] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200/60">
                <Clock className="w-3 h-3 stroke-[2.5]" />
                {etaFormatted} 도착 {durationMinutes ? `(${durationMinutes}분)` : ''}
              </span>
            )}
          </div>
          {departureTimeText && (
            <p className="text-[11px] text-slate-500">
              출발 시각: <strong className="text-slate-800">{departureTimeText}</strong>
            </p>
          )}
        </div>

        {/* Text Area Preview */}
        <div className="text-xs font-medium text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200/80 select-all whitespace-pre-line font-sans max-h-36 overflow-y-auto">
          {reportText}
        </div>

        {/* Action Button: Direct User-Gesture Synchronous Execution */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleActionClick}
            className={`w-full py-4 px-4 rounded-2xl font-bold text-base tracking-tight shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 ${
              isKakaoAction
                ? 'bg-[#FEE500] hover:bg-[#FDD835] text-[#191919]'
                : 'bg-[#1E60F3] hover:bg-[#1346D8] text-white shadow-blue-500/25'
            }`}
          >
            {copyStatus === 'copied' ? (
              <>
                <Check className="w-5 h-5 text-emerald-600" />
                <span>복사 완료! {isKakaoAction ? '카카오톡을 실행합니다...' : ''}</span>
              </>
            ) : isKakaoAction ? (
              <>
                <ExternalLink className="w-4.5 h-4.5" />
                <span>복사하고 카카오톡 열기</span>
              </>
            ) : (
              <>
                <Copy className="w-4.5 h-4.5" />
                <span>보고 양식 복사하기</span>
              </>
            )}
          </button>
          {copyStatus === 'error' && (
            <p className="text-center text-xs text-rose-500 font-semibold mt-2">
              클립보드 권한이 차단되었습니다. 상단 텍스트를 길게 눌러 직접 복사해주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

