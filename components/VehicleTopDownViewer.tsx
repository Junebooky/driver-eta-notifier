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

// 9 Core Outer Damage Hotspots with independent Left/Right Doors
const HOTSPOTS: HotspotDef[] = [
  { id: 'front-bumper', part: '앞 범퍼', label: '앞 범퍼', top: '9%', left: '50%' },
  { id: 'windshield', part: '유리/윈드실드', label: '윈드실드', top: '32%', left: '50%' },
  { id: 'front-wheel-driver', part: '앞 휠 (운전석)', label: '앞 휠(L)', top: '24%', left: '16%' },
  { id: 'front-wheel-passenger', part: '앞 휠 (조수석)', label: '앞 휠(R)', top: '24%', left: '84%' },
  { id: 'door-driver', part: '도어 (운전석)', label: '도어(L)', top: '50%', left: '24%' },
  { id: 'door-passenger', part: '도어 (조수석)', label: '도어(R)', top: '50%', left: '76%' },
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
    <div className="relative w-full h-[168px] bg-slate-50/70 border border-slate-200/90 rounded-2xl p-2 select-none overflow-hidden touch-manipulation flex items-center justify-center shadow-2xs">
      {/* Unified Synchronized Pulse Keyframes for Cobalt Blue Glow (15% softer opacity) */}
      <style>{`
        @keyframes cobalt-blue-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.95;
            box-shadow: 0 0 5px rgba(30, 96, 243, 0.4);
          }
          50% {
            transform: scale(1.14);
            opacity: 1;
            box-shadow: 0 0 10px rgba(30, 96, 243, 0.6), 0 0 16px rgba(30, 96, 243, 0.25);
          }
        }
        @keyframes cobalt-blue-ring {
          0%, 100% {
            transform: scale(0.9);
            opacity: 0.25;
          }
          50% {
            transform: scale(1.48);
            opacity: 0.65;
          }
        }
        .sync-cobalt-pin {
          animation: cobalt-blue-pulse 2.2s ease-in-out infinite;
        }
        .sync-cobalt-ring {
          animation: cobalt-blue-ring 2.2s ease-in-out infinite;
        }
      `}</style>

      {/* Direction & Orientation Labels (Subtle Monotone) */}
      <span className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-wider text-slate-400 uppercase pointer-events-none">
        FRONT
      </span>
      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-wider text-slate-400 uppercase pointer-events-none">
        REAR
      </span>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400 pointer-events-none">
        L 운전석
      </span>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400 pointer-events-none">
        R 조수석
      </span>

      {/* Status Badge (Top-Right): Only displayed when there are damages, hidden when clean */}
      {!isClean && (
        <div className="absolute top-1.5 right-2.5 pointer-events-none animate-fade-in">
          <span className="text-[10px] text-white font-bold px-2 py-0.5 rounded-full bg-[#1E60F3]/85 shadow-2xs flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-pulse" />
            {selectedParts.length}개 흠집
          </span>
        </div>
      )}

      {/* 2D Top-down Silhouette Container (Compact aspect ratio) */}
      <div className="relative w-[86px] h-[148px] shrink-0">
        {/* Crisp Pure Inline SVG Sedan Silhouette in Light Mode */}
        <svg
          viewBox="0 0 160 280"
          className="w-full h-full drop-shadow-2xs pointer-events-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle blueprint grid lines */}
          <line x1="80" y1="12" x2="80" y2="268" stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />
          <line x1="20" y1="140" x2="140" y2="140" stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />

          {/* 4 Wheels (Tires & Rims in Light Mode) */}
          {/* Front-Left Wheel */}
          <rect x="20" y="52" width="12" height="30" rx="3" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1" />
          <line x1="26" y1="56" x2="26" y2="78" stroke="#CBD5E1" strokeWidth="1" />
          {/* Front-Right Wheel */}
          <rect x="128" y="52" width="12" height="30" rx="3" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1" />
          <line x1="134" y1="56" x2="134" y2="78" stroke="#CBD5E1" strokeWidth="1" />
          {/* Rear-Left Wheel */}
          <rect x="20" y="192" width="12" height="30" rx="3" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1" />
          <line x1="26" y1="196" x2="26" y2="218" stroke="#CBD5E1" strokeWidth="1" />
          {/* Rear-Right Wheel */}
          <rect x="128" y="192" width="12" height="30" rx="3" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1" />
          <line x1="134" y1="196" x2="134" y2="218" stroke="#CBD5E1" strokeWidth="1" />

          {/* Side Mirrors */}
          <path d="M 42 76 C 34 74, 32 80, 40 84 Z" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1" />
          <path d="M 118 76 C 126 74, 128 80, 120 84 Z" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1" />

          {/* Main Car Body Shell */}
          <path
            d="M 80 18 C 58 18, 48 30, 44 48 C 42 60, 40 85, 38 105 C 36 125, 36 155, 38 175 C 40 195, 42 220, 44 235 C 47 252, 58 262, 80 262 C 102 262, 113 252, 116 235 C 118 220, 120 195, 122 175 C 124 155, 124 125, 122 105 C 120 85, 118 60, 116 48 C 112 30, 102 18, 80 18 Z"
            fill="#FFFFFF"
            stroke="#94A3B8"
            strokeWidth="1.4"
          />

          {/* Front Bumper & Hood Feature Lines */}
          <path d="M 64 24 Q 80 22 96 24" stroke="#94A3B8" strokeWidth="1.2" />
          <line x1="52" y1="46" x2="56" y2="74" stroke="#CBD5E1" strokeWidth="1" />
          <line x1="108" y1="46" x2="104" y2="74" stroke="#CBD5E1" strokeWidth="1" />

          {/* Headlights (Cyan/Sky Accent) */}
          <path d="M 45 36 Q 56 31 68 30" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <path d="M 115 36 Q 104 31 92 30" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />

          {/* Front Windshield (Soft Sky Tint) */}
          <path
            d="M 47 78 Q 80 71 113 78 L 109 106 Q 80 101 51 106 Z"
            fill="#E0F2FE"
            stroke="#94A3B8"
            strokeWidth="1.2"
          />

          {/* Door Separation Seams (Driver and Passenger Door Cut Lines) */}
          <line x1="39" y1="140" x2="52" y2="140" stroke="#CBD5E1" strokeWidth="1" />
          <line x1="108" y1="140" x2="121" y2="140" stroke="#CBD5E1" strokeWidth="1" />

          {/* Sunroof / Panoramic Roof */}
          <path
            d="M 52 110 Q 80 106 108 110 L 106 158 Q 80 155 54 158 Z"
            fill="#F8FAFC"
            stroke="#CBD5E1"
            strokeWidth="1"
            strokeDasharray="3 2"
          />

          {/* Rear Windshield */}
          <path
            d="M 54 162 Q 80 159 106 162 L 110 188 Q 80 192 50 188 Z"
            fill="#E0F2FE"
            stroke="#94A3B8"
            strokeWidth="1.2"
          />

          {/* Rear Bumper & Trunk Line */}
          <path d="M 53 194 Q 80 198 107 194" stroke="#CBD5E1" strokeWidth="1" />

          {/* Taillights (Soft Red/Rose Accent) */}
          <path d="M 45 244 Q 58 250 70 251" stroke="#FB7185" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <path d="M 115 244 Q 102 250 90 251" stroke="#FB7185" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
        </svg>

        {/* Hotspots & Synchronized Cobalt Blue Glow Marker Layer (15% Softer Opacity) */}
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
              className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer group active:scale-90 transition-transform touch-manipulation z-10"
              title={`${spot.part} 선택/해제`}
              aria-label={`${spot.part} 점검`}
            >
              {isSelected ? (
                /* Selected State: Cobalt Blue Glow with Synchronized Pulse (15% Softer) */
                <span className="relative flex items-center justify-center">
                  <span className="absolute w-5 h-5 rounded-full bg-[#1E60F3]/30 sync-cobalt-ring pointer-events-none" />
                  <span className="relative w-3.5 h-3.5 rounded-full bg-[#1E60F3]/85 border-2 border-white sync-cobalt-pin shadow-xs" />
                </span>
              ) : (
                /* Inactive State: Clean Subtle Dot */
                <span className="flex items-center justify-center w-5 h-5 rounded-full group-hover:bg-slate-200/50 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-[#1E60F3]/60 group-hover:scale-125 transition-all shadow-2xs" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
