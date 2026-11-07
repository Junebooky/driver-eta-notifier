'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { X, Download, Share2, Smartphone, Monitor, Check, Award, Phone, Car } from 'lucide-react';

interface VipChauffeurCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverName?: string;
  driverPhone?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
}

export const VipChauffeurCardModal: React.FC<VipChauffeurCardModalProps> = ({
  isOpen,
  onClose,
  driverName = '윤태준 (Tae-jun Yun)',
  driverPhone = '+82.10.6348.8726',
  vehicleModel = 'Mercedes-Benz Sprinter 519 CDI',
  vehiclePlate = '73호 2553',
}) => {
  const [format, setFormat] = useState<'vertical' | 'horizontal'>('vertical');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Combination matching check: Sample asset is specifically for Yoon Tae-jun & Sprinter 519 CDI (73호 2553)
  const isSampleMatch =
    driverName.includes('윤태준') &&
    (vehicleModel.includes('519') || vehiclePlate.includes('2553'));

  const handleShareOrCopy = () => {
    const cardUrl =
      format === 'vertical'
        ? '/images/chauffeur_card_vertical.png'
        : '/images/chauffeur_card_horizontal.png';

    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.origin + cardUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-950 border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-amber-500/20 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-bold text-amber-200">
                  VIP LIMOUSINE KOREA
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
                  의전 배차 소개서 [TEST/DEMO]
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {driverName} 실장 • {vehicleModel} ({vehiclePlate})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Disclaimer Banner when looking at a different vehicle or driver */}
        {!isSampleMatch && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-xs flex items-center justify-between">
            <span>
              ℹ️ 아래 카드는 <strong>윤태준 실장 • Sprinter 519 CDI (73호 2553)</strong> 테스트 샘플 양식입니다. ({driverName} 기사님 및 {vehicleModel} 전용 카드는 추후 자동 생성됩니다)
            </span>
          </div>
        )}

        {/* View Mode Switcher */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-900/40 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setFormat('vertical')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                format === 'vertical'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              모바일 세로형 (9:16)
            </button>
            <button
              onClick={() => setFormat('horizontal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                format === 'horizontal'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              와이드 / 가로형 (인쇄용)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareOrCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">링크 복사됨</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  소개서 링크
                </>
              )}
            </button>

            <a
              href={format === 'vertical' ? '/images/chauffeur_card_vertical.png' : '/images/chauffeur_card_horizontal.png'}
              download={`VIP_Limousine_Card_${format}.png`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow transition"
            >
              <Download className="w-3.5 h-3.5" />
              카드 다운로드
            </a>
          </div>
        </div>

        {/* Card Canvas Area */}
        <div className="flex-1 overflow-auto p-4 md:p-6 flex items-center justify-center bg-slate-950/80">
          {format === 'vertical' ? (
            <div className="relative max-w-sm w-full rounded-2xl overflow-hidden shadow-2xl border border-amber-500/40">
              <img
                src="/images/chauffeur_card_vertical.png"
                alt="VIP Limousine Korea Chauffeur Card Vertical"
                className="w-full h-auto object-contain block"
              />
            </div>
          ) : (
            <div className="relative max-w-3xl w-full rounded-2xl overflow-hidden shadow-2xl border border-amber-500/40">
              <img
                src="/images/chauffeur_card_horizontal.png"
                alt="VIP Limousine Korea Chauffeur Card Horizontal"
                className="w-full h-auto object-contain block"
              />
            </div>
          )}
        </div>

        {/* Quick Driver Profile Footer Info */}
        <div className="px-5 py-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-2 shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Car className="w-4 h-4 text-amber-400" />
              {vehicleModel} ({vehiclePlate})
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-amber-400" />
              {driverPhone}
            </span>
          </div>
          <span className="text-slate-400 text-[11px]">
            VIP Limousine Korea • 공식 배차 인증
          </span>
        </div>
      </div>
    </div>
  );
};

