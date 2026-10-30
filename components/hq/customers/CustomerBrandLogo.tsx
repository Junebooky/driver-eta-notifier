'use client';

import React from 'react';

interface CustomerBrandLogoProps {
  name: string;
  logoType?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const CustomerBrandLogo: React.FC<CustomerBrandLogoProps> = ({
  name,
  logoType,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-9 h-9 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
  }[size];

  // 1. CHANEL (Interlocking C Monogram)
  if (logoType === 'chanel' || name.toLowerCase().includes('chanel')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-black text-white flex items-center justify-center p-2 shrink-0 shadow-xs ${className}`}
        title="CHANEL"
      >
        <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
          <path d="M 44,22 C 28,22 16,35 16,50 C 16,65 28,78 44,78 C 53,78 61,74 66,67 L 57,60 C 54,64 49,67 44,67 C 34,67 27,59 27,50 C 27,41 34,33 44,33 C 49,33 54,36 57,40 L 66,33 C 61,26 53,22 44,22 Z" />
          <path d="M 56,22 C 47,22 39,26 34,33 L 43,40 C 46,36 51,33 56,33 C 66,33 73,41 73,50 C 73,59 66,67 56,67 C 51,67 46,64 43,60 L 34,67 C 39,74 47,78 56,78 C 72,78 84,65 84,50 C 84,35 72,22 56,22 Z" />
        </svg>
      </div>
    );
  }

  // 2. Intercos (Cosmetics typography)
  if (logoType === 'intercos' || name.toLowerCase().includes('intercos')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center p-1 shrink-0 ${className}`}
        title="Intercos"
      >
        <span className="font-serif tracking-tighter text-slate-900 font-black text-[11px] scale-90">
          intercos
        </span>
      </div>
    );
  }

  // 3. BMW Korea (Bavarian Roundel)
  if (logoType === 'bmw' || name.toLowerCase().includes('bmw')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-black border-2 border-white flex items-center justify-center p-0.5 shrink-0 shadow-xs ${className}`}
        title="BMW Korea"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="48" fill="#000000" stroke="#CCCCCC" strokeWidth="2" />
          <text
            x="50"
            y="20"
            fill="#FFFFFF"
            fontSize="14"
            fontWeight="900"
            textAnchor="middle"
            fontFamily="sans-serif"
          >
            BMW
          </text>
          <g transform="translate(50,50)">
            <circle cx="0" cy="0" r="28" fill="#FFFFFF" />
            <path d="M 0,0 L 0,-28 A 28,28 0 0,1 28,0 Z" fill="#1C69D4" />
            <path d="M 0,0 L 0,28 A 28,28 0 0,1 -28,0 Z" fill="#1C69D4" />
            <circle cx="0" cy="0" r="28" fill="none" stroke="#CCCCCC" strokeWidth="1.5" />
          </g>
        </svg>
      </div>
    );
  }

  // 4. Netflix
  if (logoType === 'netflix' || name.toLowerCase().includes('netflix')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-black flex items-center justify-center p-1.5 shrink-0 shadow-xs ${className}`}
        title="Netflix"
      >
        <svg viewBox="0 0 100 100" className="w-3/5 h-3/5">
          <path d="M 22,10 L 38,10 L 38,90 L 22,90 Z" fill="#E50914" />
          <path d="M 62,10 L 78,10 L 78,90 L 62,90 Z" fill="#E50914" />
          <path d="M 22,10 L 38,10 L 78,90 L 62,90 Z" fill="#B20710" />
        </svg>
      </div>
    );
  }

  // 5. Ferrari (Prancing Horse Shield)
  if (logoType === 'ferrari' || name.toLowerCase().includes('ferrari')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-[#FFEE00] border-2 border-red-600 flex items-center justify-center p-1 shrink-0 shadow-xs ${className}`}
        title="Ferrari"
      >
        <svg viewBox="0 0 100 100" className="w-4/5 h-4/5" fill="#000000">
          <path d="M 52,20 C 54,23 57,25 61,24 C 60,28 57,30 54,31 C 56,36 58,41 57,46 C 53,44 50,44 47,46 C 45,41 42,39 37,39 C 39,44 42,48 45,52 C 43,58 41,65 39,72 C 37,70 34,70 31,72 C 34,75 38,76 42,75 C 44,70 47,64 49,58 C 52,60 55,62 57,65 C 56,70 55,75 54,80 C 58,79 61,77 64,74 C 62,70 60,65 60,61 C 63,58 66,54 67,50 C 64,48 61,48 59,50 C 60,45 61,40 61,35 C 64,34 66,31 65,27 C 62,28 59,26 57,23 Z" />
        </svg>
      </div>
    );
  }

  // 6. Shinsegae (Floral Rosette)
  if (logoType === 'shinsegae' || name.includes('신세계')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-white border border-red-100 flex items-center justify-center p-1.5 shrink-0 shadow-xs ${className}`}
        title="신세계그룹"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full text-red-600" fill="currentColor">
          <circle cx="50" cy="50" r="10" />
          <path d="M 50,15 C 45,26 45,34 50,40 C 55,34 55,26 50,15 Z" />
          <path d="M 50,85 C 45,74 45,66 50,60 C 55,66 55,74 50,85 Z" />
          <path d="M 15,50 C 26,45 34,45 40,50 C 34,55 26,55 15,50 Z" />
          <path d="M 85,50 C 74,45 66,45 60,50 C 66,55 74,55 85,50 Z" />
          <path d="M 25,25 C 33,35 40,38 43,43 C 38,40 35,33 25,25 Z" />
          <path d="M 75,75 C 67,65 60,62 57,57 C 62,60 65,67 75,75 Z" />
          <path d="M 75,25 C 65,33 62,40 57,43 C 60,38 67,35 75,25 Z" />
          <path d="M 25,75 C 35,67 40,60 43,57 C 38,62 35,69 25,75 Z" />
        </svg>
      </div>
    );
  }

  // 7. Samsung (Blue Oval)
  if (logoType === 'samsung' || name.toLowerCase().includes('samsung')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-[#0A40C4] text-white flex items-center justify-center p-1 shrink-0 shadow-xs ${className}`}
        title="Samsung"
      >
        <span className="font-black tracking-tighter text-[8px] uppercase scale-90">
          SAMSUNG
        </span>
      </div>
    );
  }

  // 8. Hyundai (Navy Oval with slanted H)
  if (logoType === 'hyundai' || name.toLowerCase().includes('hyundai')) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-[#002C5F] text-white flex items-center justify-center p-1.5 shrink-0 shadow-xs ${className}`}
        title="Hyundai"
      >
        <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
          <ellipse cx="50" cy="50" rx="42" ry="28" fill="none" stroke="currentColor" strokeWidth="6" />
          <path d="M 36,32 L 40,68 M 64,32 L 60,68 M 38,50 L 62,50" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // Default Luxury Initial Monogram
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br from-slate-800 to-slate-950 text-white font-black flex items-center justify-center shrink-0 border border-slate-700 shadow-xs ${className}`}
    >
      <span>{initials}</span>
    </div>
  );
};
