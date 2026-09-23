'use client';

import React from 'react';
import { haptics } from '@/utils/haptics';

interface VehicleTopDownViewerProps {
  selectedParts: string[];
  onTogglePart: (part: string) => void;
  existingParts?: string[];
  mode?: 'receipt' | 'pickup' | 'daily' | 'return';
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
  existingParts = [],
  mode = 'receipt',
}) => {
  const isClean = selectedParts.length === 0;
  const isMultiLayer = mode === 'return' || mode === 'daily';

  const existingCount = isMultiLayer
    ? selectedParts.filter((p) => existingParts.includes(p)).length
    : selectedParts.length;

  const newCount = isMultiLayer
    ? selectedParts.filter((p) => !existingParts.includes(p)).length
    : 0;

  return (
    <div className="relative w-full h-[182px] bg-slate-50/70 border border-slate-200/90 rounded-2xl p-2 select-none overflow-hidden touch-manipulation flex items-center justify-center shadow-xs">
      {/* Synchronized Ethereal Cobalt & Red Halo Keyframes */}
      <style>{`
        @keyframes cobalt-halo-breathe {
          0%, 100% {
            transform: scale(0.92);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.38);
            opacity: 0.85;
          }
        }
        @keyframes cobalt-core-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 8px 1px rgba(30, 96, 243, 0.45);
          }
          50% {
            transform: scale(1.12);
            box-shadow: 0 0 14px 3px rgba(30, 96, 243, 0.75), 0 0 22px 6px rgba(30, 96, 243, 0.25);
          }
        }
        @keyframes red-halo-breathe {
          0%, 100% {
            transform: scale(0.92);
            opacity: 0.55;
          }
          50% {
            transform: scale(1.38);
            opacity: 0.9;
          }
        }
        @keyframes red-core-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 8px 1px rgba(239, 68, 68, 0.5);
          }
          50% {
            transform: scale(1.12);
            box-shadow: 0 0 14px 3px rgba(239, 68, 68, 0.8), 0 0 22px 6px rgba(239, 68, 68, 0.3);
          }
        }
        .sync-cobalt-halo {
          animation: cobalt-halo-breathe 2.4s ease-in-out infinite;
        }
        .sync-cobalt-core {
          animation: cobalt-core-pulse 2.4s ease-in-out infinite;
        }
        .sync-red-halo {
          animation: red-halo-breathe 2.4s ease-in-out infinite;
        }
        .sync-red-core {
          animation: red-core-pulse 2.4s ease-in-out infinite;
        }
      `}</style>

      {/* Direction & Orientation Labels (Subtle Monotone) */}
      <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase pointer-events-none">
        FRONT
      </span>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase pointer-events-none">
        REAR
      </span>
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400 pointer-events-none">
        L 운전석
      </span>
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400 pointer-events-none">
        R 조수석
      </span>

      {/* Status Badge (Top-Right): Displayed only when damages exist */}
      {!isClean && (
        <div className="absolute top-2 right-3 pointer-events-none animate-fade-in flex items-center gap-1.5">
          {isMultiLayer ? (
            <>
              {existingCount > 0 && (
                <span className="text-[10px] text-white font-bold px-2 py-0.5 rounded-full bg-[#1E60F3]/90 shadow-2xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  기존 {existingCount}
                </span>
              )}
              {newCount > 0 && (
                <span className="text-[10px] text-white font-bold px-2 py-0.5 rounded-full bg-red-500 shadow-2xs flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  신규 {newCount}
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-white font-bold px-3 py-1 rounded-full bg-[#1E60F3]/90 shadow-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 animate-pulse" />
              {selectedParts.length}개 흠집
            </span>
          )}
        </div>
      )}

      {/* 2D Top-down Silhouette Container with 3D Depth */}
      <div className="relative w-[92px] h-[158px] shrink-0">
        {/* Photorealistic 3D Metallic Sedan Silhouette SVG */}
        <svg
          viewBox="0 0 160 280"
          className="w-full h-full pointer-events-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Soft Ambient Ground Occlusion Shadow */}
            <filter id="car-ambient-shadow" x="-25%" y="-20%" width="150%" height="150%">
              <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#0F172A" floodOpacity="0.22" />
            </filter>

            {/* Subtle Wheel Drop Shadow */}
            <filter id="wheel-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.3" />
            </filter>

            {/* 3D Metallic Paint - Transverse Curvature (Left-to-Right Shading) */}
            <linearGradient id="body-paint-transverse" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#CBD5E1" />
              <stop offset="7%" stopColor="#E2E8F0" />
              <stop offset="18%" stopColor="#F8FAFC" />
              <stop offset="32%" stopColor="#FFFFFF" />
              <stop offset="50%" stopColor="#F1F5F9" />
              <stop offset="68%" stopColor="#FFFFFF" />
              <stop offset="82%" stopColor="#F8FAFC" />
              <stop offset="93%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>

            {/* 3D Longitudinal Highlights (Front-to-Rear Shading) */}
            <linearGradient id="body-paint-longitudinal" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#CBD5E1" />
              <stop offset="6%" stopColor="#F8FAFC" />
              <stop offset="16%" stopColor="#FFFFFF" />
              <stop offset="35%" stopColor="#E2E8F0" />
              <stop offset="55%" stopColor="#F1F5F9" />
              <stop offset="82%" stopColor="#FFFFFF" />
              <stop offset="95%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#94A3B8" />
            </linearGradient>

            {/* Dark Glossy Tinted Glass Gradient */}
            <linearGradient id="cabin-glass" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1E293B" />
              <stop offset="25%" stopColor="#0F172A" />
              <stop offset="75%" stopColor="#0F172A" />
              <stop offset="100%" stopColor="#1E293B" />
            </linearGradient>

            {/* Windshield Diagonal Light Glare Reflection */}
            <linearGradient id="windshield-glare" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
              <stop offset="35%" stopColor="#BAE6FD" stopOpacity="0.22" />
              <stop offset="70%" stopColor="#38BDF8" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>

            {/* Rear Glass Defroster Glare */}
            <linearGradient id="rear-glass-glare" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#94A3B8" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
            </linearGradient>

            {/* High-End LED Taillight Bar Gradient */}
            <linearGradient id="led-taillight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#B91C1C" />
              <stop offset="20%" stopColor="#EF4444" />
              <stop offset="50%" stopColor="#FCA5A5" />
              <stop offset="80%" stopColor="#EF4444" />
              <stop offset="100%" stopColor="#B91C1C" />
            </linearGradient>

            {/* Jewel LED Headlight Gradient */}
            <linearGradient id="jewel-headlight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="50%" stopColor="#E0F2FE" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>
          </defs>

          {/* 1. Underlying Wheels (Tires & Rims tucked under body) */}
          <g filter="url(#wheel-shadow)">
            {/* Front-Left Wheel */}
            <rect x="22" y="52" width="13" height="30" rx="3.5" fill="#0F172A" stroke="#334155" strokeWidth="0.8" />
            <line x1="28.5" y1="56" x2="28.5" y2="78" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
            {/* Front-Right Wheel */}
            <rect x="125" y="52" width="13" height="30" rx="3.5" fill="#0F172A" stroke="#334155" strokeWidth="0.8" />
            <line x1="131.5" y1="56" x2="131.5" y2="78" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
            {/* Rear-Left Wheel */}
            <rect x="21" y="190" width="13" height="32" rx="3.5" fill="#0F172A" stroke="#334155" strokeWidth="0.8" />
            <line x1="27.5" y1="194" x2="27.5" y2="218" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
            {/* Rear-Right Wheel */}
            <rect x="126" y="190" width="13" height="32" rx="3.5" fill="#0F172A" stroke="#334155" strokeWidth="0.8" />
            <line x1="132.5" y1="194" x2="132.5" y2="218" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
          </g>

          {/* 2. Main Aerodynamic Car Body with Realistic Ambient Shadow */}
          <path
            d="M 80 16 
               C 56 16, 46 27, 43 45 
               C 40 58, 38 85, 36 106 
               C 35 125, 35 155, 36 175 
               C 38 198, 40 222, 43 236 
               C 46 253, 56 264, 80 264 
               C 104 264, 114 253, 117 236 
               C 120 222, 122 198, 124 175 
               C 125 155, 125 125, 124 106 
               C 122 85, 120 58, 117 45 
               C 114 27, 104 16, 80 16 Z"
            fill="url(#body-paint-transverse)"
            filter="url(#car-ambient-shadow)"
          />

          {/* Longitudinal Light Overlay for 3D Surface Curvature */}
          <path
            d="M 80 16 
               C 56 16, 46 27, 43 45 
               C 40 58, 38 85, 36 106 
               C 35 125, 35 155, 36 175 
               C 38 198, 40 222, 43 236 
               C 46 253, 56 264, 80 264 
               C 104 264, 114 253, 117 236 
               C 120 222, 122 198, 124 175 
               C 125 155, 125 125, 124 106 
               C 122 85, 120 58, 117 45 
               C 114 27, 104 16, 80 16 Z"
            fill="url(#body-paint-longitudinal)"
            opacity="0.65"
            stroke="#94A3B8"
            strokeWidth="1.2"
          />

          {/* 3. Sculpted Hood Creases & Front Fender Flairs */}
          {/* Front Bumper Sculpted Contour */}
          <path d="M 60 21 Q 80 18 100 21" stroke="#94A3B8" strokeWidth="1.2" opacity="0.85" />
          {/* Hood Power Bulges (Left & Right Character Lines) */}
          <path d="M 64 22 C 60 42, 54 62, 52 74" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M 63 22 C 59 42, 53 62, 51 74" stroke="#FFFFFF" strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />
          <path d="M 96 22 C 100 42, 106 62, 108 74" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M 97 22 C 101 42, 107 62, 109 74" stroke="#FFFFFF" strokeWidth="0.8" strokeLinecap="round" opacity="0.9" />

          {/* Jewel LED Headlights with Subtle Blue Glare */}
          <path d="M 44 32 Q 54 27 66 26" stroke="url(#jewel-headlight)" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M 116 32 Q 106 27 94 26" stroke="url(#jewel-headlight)" strokeWidth="2.8" strokeLinecap="round" />

          {/* 4. Streamlined Side Mirrors */}
          {/* Left Mirror */}
          <path d="M 39 76 C 30 73 28 82 38 86 Z" fill="url(#body-paint-transverse)" stroke="#64748B" strokeWidth="1" />
          <line x1="33" y1="78" x2="38" y2="84" stroke="#0F172A" strokeWidth="1.2" />
          {/* Right Mirror */}
          <path d="M 121 76 C 130 73 132 82 122 86 Z" fill="url(#body-paint-transverse)" stroke="#64748B" strokeWidth="1" />
          <line x1="127" y1="78" x2="122" y2="84" stroke="#0F172A" strokeWidth="1.2" />

          {/* 5. Passenger Greenhouse (A/B/C Pillars & Dark Tinted Cabin Glass) */}
          {/* Windshield Cowl & Roof Pillar Surround */}
          <path
            d="M 48 76 Q 80 69 112 76 
               L 108 202 Q 80 206 52 202 Z"
            fill="#0F172A"
          />

          {/* Front Curved Windshield */}
          <path
            d="M 48 76 Q 80 69 112 76 
               L 106 112 Q 80 107 54 112 Z"
            fill="url(#cabin-glass)"
            stroke="#475569"
            strokeWidth="0.8"
          />
          {/* Windshield Reflection Sheen */}
          <path
            d="M 50 78 Q 72 73 88 75 L 76 110 Q 60 108 55 111 Z"
            fill="url(#windshield-glare)"
          />
          {/* Rearview Mirror Sensor Mount */}
          <rect x="76" y="75" width="8" height="6" rx="2" fill="#0F172A" stroke="#334155" strokeWidth="0.6" />

          {/* Panoramic Sunroof / Glass Roof Panel */}
          <path
            d="M 54 115 Q 80 110 106 115 
               L 104 165 Q 80 160 56 165 Z"
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="0.8"
          />
          {/* Roof Crossbar Divider */}
          <line x1="55" y1="138" x2="105" y2="138" stroke="#1E293B" strokeWidth="1.2" />

          {/* Rear Windshield with Curved Glass Reflections */}
          <path
            d="M 56 168 Q 80 163 104 168 
               L 108 200 Q 80 204 52 200 Z"
            fill="url(#cabin-glass)"
            stroke="#475569"
            strokeWidth="0.8"
          />
          {/* Rear Glass Highlight Reflection */}
          <path
            d="M 103 169 Q 88 165 78 167 L 86 199 Q 98 201 106 198 Z"
            fill="url(#rear-glass-glare)"
          />

          {/* Chrome / Metal Window Surrounds (Left & Right Window Frames) */}
          <path d="M 44 78 Q 38 135 48 201" stroke="#94A3B8" strokeWidth="1.4" opacity="0.85" />
          <path d="M 116 78 Q 122 135 112 201" stroke="#94A3B8" strokeWidth="1.4" opacity="0.85" />

          {/* Door Separation Cut Lines (Driver / Passenger Seams) */}
          <line x1="36" y1="138" x2="45" y2="138" stroke="#94A3B8" strokeWidth="1.2" />
          <line x1="115" y1="138" x2="124" y2="138" stroke="#94A3B8" strokeWidth="1.2" />

          {/* 6. Sculpted Trunk Lid & Rear Spoiler Feature Line */}
          <path d="M 52 204 Q 80 208 108 204" stroke="#94A3B8" strokeWidth="1.2" />
          <path d="M 54 228 Q 80 233 106 228" stroke="#E2E8F0" strokeWidth="1.4" />
          <path d="M 54 229 Q 80 234 106 229" stroke="#CBD5E1" strokeWidth="0.8" />

          {/* Continuous Red LED Taillight Bar with Soft Glow */}
          <path
            d="M 44 246 Q 80 252 116 246"
            stroke="url(#led-taillight)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {/* Inner Lightbar Core Highlight */}
          <path
            d="M 46 246 Q 80 251.5 114 246"
            stroke="#FCA5A5"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Rear Lower Diffuser Accents */}
          <path d="M 56 257 L 66 257" stroke="#64748B" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M 94 257 L 104 257" stroke="#64748B" strokeWidth="1.4" strokeLinecap="round" />
        </svg>

        {/* Hotspots & Ethereal Halo Marker Layer (Cobalt for Existing / Red for New) */}
        {HOTSPOTS.map((spot) => {
          const isSelected = selectedParts.includes(spot.part);
          const isExisting = isMultiLayer ? existingParts.includes(spot.part) : true;
          const isNew = isMultiLayer && isSelected && !isExisting;

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
                isNew ? (
                  /* Return Mode - New Scratch: Red Halo & Red Core Pin */
                  <span className="relative flex items-center justify-center">
                    <span className="absolute w-7 h-7 rounded-full bg-red-500/35 sync-red-halo pointer-events-none blur-[0.5px]" />
                    <span className="relative w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white sync-red-core shadow-sm" />
                  </span>
                ) : (
                  /* Receipt / Existing Damage: Cobalt Blue Halo & Blue Core Pin */
                  <span className="relative flex items-center justify-center">
                    <span className="absolute w-7 h-7 rounded-full bg-[#1E60F3]/30 sync-cobalt-halo pointer-events-none blur-[0.5px]" />
                    <span className="relative w-3.5 h-3.5 rounded-full bg-[#1E60F3] border-2 border-white sync-cobalt-core shadow-sm" />
                  </span>
                )
              ) : (
                /* Inactive State: Subtle Dot */
                <span className="flex items-center justify-center w-5 h-5 rounded-full group-hover:bg-slate-200/50 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400/60 group-hover:bg-[#1E60F3]/70 group-hover:scale-125 transition-all shadow-2xs" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
