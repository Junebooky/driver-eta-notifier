'use client';

import React from 'react';
import { haptics } from '@/utils/haptics';

interface VehicleTopDownViewerProps {
  selectedParts: string[];
  onTogglePart: (part: string) => void;
}

interface HotspotDef {
  id: string;
  part: string;
  label: string;
  top: string;
  left: string;
}

// 8 Core Outer Damage Hotspots matching the exact percentage requirements
const HOTSPOTS: HotspotDef[] = [
  { id: 'front-bumper', part: '앞 범퍼', label: '앞 범퍼', top: '9%', left: '50%' },
  { id: 'windshield', part: '유리/윈드실드', label: '윈드실드', top: '32%', left: '50%' },
  { id: 'front-wheel-driver', part: '앞 휠 (운전석)', label: '앞 휠(L)', top: '24%', left: '16%' },
  { id: 'front-wheel-passenger', part: '앞 휠 (조수석)', label: '앞 휠(R)', top: '24%', left: '84%' },
  { id: 'door-driver', part: '도어/측면', label: '도어(L)', top: '49%', left: '18%' },
  { id: 'door-passenger', part: '도어/측면', label: '도어(R)', top: '49%', left: '82%' },
  { id: 'rear-wheel-driver', part: '뒷 휠 (운전석)', label: '뒷 휠(L)', top: '74%', left: '16%' },
  { id: 'rear-wheel-passenger', part: '뒷 휠 (조수석)', label: '뒷 휠(R)', top: '74%', left: '84%' },
  { id: 'rear-bumper', part: '뒷 범퍼', label: '뒷 범퍼', top: '91%', left: '50%' },
];

export const VehicleTopDownViewer: React.FC<VehicleTopDownViewerProps> = ({
  selectedParts,
  onTogglePart,
}) => {
  const isClean = selectedParts.length === 0;

  return (
    <div className="relative w-full bg-slate-900 border border-slate-800 rounded-2xl p-2.5 select-none overflow-hidden touch-manipulation flex flex-col items-center shadow-inner">
      {/* Top Labels: Driver / Passenger Orientation & Front Indicator */}
      <div className="w-full flex items-center justify-between px-2 pt-0.5 pb-1 text-slate-400">
        <span className="text-[10px] font-semibold tracking-tight px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300">
          L 운전석
        </span>
        <span className="text-[9px] font-medium tracking-wider text-slate-500 uppercase">
          ▲ 전면 (Front)
        </span>
        <span className="text-[10px] font-semibold tracking-tight px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300">
          R 조수석
        </span>
      </div>

      {/* 2D Top-down Silhouette Container with exact aspect ratio */}
      <div className="relative w-[130px] sm:w-[140px] h-[220px] sm:h-[235px] my-1 shrink-0">
        {/* Crisp Pure Inline SVG Sedan Silhouette */}
        <svg
          viewBox="0 0 160 280"
          className="w-full h-full drop-shadow-md pointer-events-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle blueprint grid lines */}
          <line x1="80" y1="10" x2="80" y2="270" stroke="#334155" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
          <line x1="20" y1="140" x2="140" y2="140" stroke="#334155" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />

          {/* 4 Wheels (Tires & Rims) */}
          {/* Front-Left Wheel */}
          <rect x="20" y="52" width="12" height="30" rx="3" fill="#0F172A" stroke="#475569" strokeWidth="1.2" />
          <line x1="26" y1="56" x2="26" y2="78" stroke="#64748B" strokeWidth="1" />
          {/* Front-Right Wheel */}
          <rect x="128" y="52" width="12" height="30" rx="3" fill="#0F172A" stroke="#475569" strokeWidth="1.2" />
          <line x1="134" y1="56" x2="134" y2="78" stroke="#64748B" strokeWidth="1" />
          {/* Rear-Left Wheel */}
          <rect x="20" y="192" width="12" height="30" rx="3" fill="#0F172A" stroke="#475569" strokeWidth="1.2" />
          <line x1="26" y1="196" x2="26" y2="218" stroke="#64748B" strokeWidth="1" />
          {/* Rear-Right Wheel */}
          <rect x="128" y="192" width="12" height="30" rx="3" fill="#0F172A" stroke="#475569" strokeWidth="1.2" />
          <line x1="134" y1="196" x2="134" y2="218" stroke="#64748B" strokeWidth="1" />

          {/* Side Mirrors */}
          <path d="M 42 76 C 34 74, 32 80, 40 84 Z" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
          <path d="M 118 76 C 126 74, 128 80, 120 84 Z" fill="#1E293B" stroke="#64748B" strokeWidth="1" />

          {/* Main Car Body Shell */}
          <path
            d="M 80 18 C 58 18, 48 30, 44 48 C 42 60, 40 85, 38 105 C 36 125, 36 155, 38 175 C 40 195, 42 220, 44 235 C 47 252, 58 262, 80 262 C 102 262, 113 252, 116 235 C 118 220, 120 195, 122 175 C 124 155, 124 125, 122 105 C 120 85, 118 60, 116 48 C 112 30, 102 18, 80 18 Z"
            fill="#1E293B"
            stroke="#64748B"
            strokeWidth="1.6"
          />

          {/* Front Bumper & Hood Feature Lines */}
          <path d="M 64 24 Q 80 22 96 24" stroke="#38BDF8" strokeWidth="1.4" opacity="0.7" />
          <line x1="52" y1="46" x2="56" y2="74" stroke="#334155" strokeWidth="1.2" />
          <line x1="108" y1="46" x2="104" y2="74" stroke="#334155" strokeWidth="1.2" />

          {/* Headlights (Cyan Accent Glow) */}
          <path d="M 45 36 Q 56 31 68 30" stroke="#38BDF8" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
          <path d="M 115 36 Q 104 31 92 30" stroke="#38BDF8" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />

          {/* Windshield */}
          <path
            d="M 47 78 Q 80 71 113 78 L 109 106 Q 80 101 51 106 Z"
            fill="#0F172A"
            stroke="#94A3B8"
            strokeWidth="1.3"
          />

          {/* Sunroof / Panoramic Roof */}
          <path
            d="M 52 110 Q 80 106 108 110 L 106 158 Q 80 155 54 158 Z"
            fill="#0F172A"
            stroke="#475569"
            strokeWidth="1"
            strokeDasharray="3 2"
          />

          {/* Rear Windshield */}
          <path
            d="M 54 162 Q 80 159 106 162 L 110 188 Q 80 192 50 188 Z"
            fill="#0F172A"
            stroke="#94A3B8"
            strokeWidth="1.3"
          />

          {/* Rear Bumper & Trunk Lines */}
          <path d="M 53 194 Q 80 198 107 194" stroke="#334155" strokeWidth="1.2" />

          {/* Taillights (Red Accent Glow) */}
          <path d="M 45 244 Q 58 250 70 251" stroke="#EF4444" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
          <path d="M 115 244 Q 102 250 90 251" stroke="#EF4444" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
        </svg>

        {/* Hotspots & Red Dot Marker Layer */}
        {HOTSPOTS.map((spot) => {
          const isSelected = selectedParts.includes(spot.part);

          return (
            <button
              key={spot.id}
              type="button"
              onClick={() => {
                haptics.lightTap();
                onTogglePart(spot.part);
              }}
              style={{
                top: spot.top,
                left: spot.left,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer group active:scale-90 transition-transform touch-manipulation z-10"
              title={`${spot.part} 선택/해제`}
              aria-label={`${spot.part} 점검`}
            >
              {isSelected ? (
                /* Selected State: Prominent Red Pin with Smooth Pulse Ring */
                <span className="relative flex items-center justify-center">
                  <span className="absolute w-5 h-5 rounded-full bg-red-400 opacity-75 animate-ping" />
                  <span className="relative w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                </span>
              ) : (
                /* Inactive State: Subtle Faint Hotspot Indicator */
                <span className="flex items-center justify-center w-5 h-5 rounded-full group-hover:bg-white/10 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500/70 group-hover:bg-blue-400 group-hover:scale-125 transition-all shadow-2xs" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Labels: Status & Rear Indicator */}
      <div className="w-full flex items-center justify-between px-2 pt-1 text-slate-400">
        <div className="flex items-center gap-1.5">
          {isClean ? (
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              이상 없음 (무)
            </span>
          ) : (
            <span className="text-[10px] text-rose-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
              {selectedParts.length}개 부위 흠집 감지
            </span>
          )}
        </div>

        <span className="text-[9px] font-medium tracking-wider text-slate-500 uppercase">
          ▼ 후면 (Rear)
        </span>

        <span className="text-[9px] text-slate-400 font-medium">
          부위 터치 연동 ⚡
        </span>
      </div>
    </div>
  );
};
