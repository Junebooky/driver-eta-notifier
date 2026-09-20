'use client';

import React, { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { X, User, Car, Users, Navigation, Check } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  onSave: (updated: Partial<DriverProfile>) => void;
}

const NAVI_OPTIONS: {
  key: NaviProvider;
  name: string;
  symbol: string;
  bgColor: string;
  textColor: string;
  activeRing: string;
}[] = [
  {
    key: 'tmap',
    name: '티맵 (TMAP)',
    symbol: 'T',
    bgColor: 'bg-[#EF4444]',
    textColor: 'text-white',
    activeRing: 'ring-2 ring-offset-2 ring-red-500 shadow-md shadow-red-500/20',
  },
  {
    key: 'kakao',
    name: '카카오내비',
    symbol: 'K',
    bgColor: 'bg-[#FEE500]',
    textColor: 'text-[#3C1E1E]',
    activeRing: 'ring-2 ring-offset-2 ring-amber-400 shadow-md shadow-amber-500/20',
  },
  {
    key: 'naver',
    name: '네이버지도',
    symbol: 'N',
    bgColor: 'bg-[#03C75A]',
    textColor: 'text-white',
    activeRing: 'ring-2 ring-offset-2 ring-emerald-500 shadow-md shadow-emerald-500/20',
  },
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
}) => {
  const [vehicleNo, setVehicleNo] = useState(profile.vehicleNo);
  const [driverName, setDriverName] = useState(profile.driverName);
  const [passengerName, setPassengerName] = useState(profile.passengerName);
  const [defaultNavi, setDefaultNavi] = useState<NaviProvider>(profile.defaultNavi);

  useEffect(() => {
    if (isOpen) {
      setVehicleNo(profile.vehicleNo);
      setDriverName(profile.driverName);
      setPassengerName(profile.passengerName);
      setDefaultNavi(profile.defaultNavi);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    haptics.successPulse();
    onSave({
      vehicleNo: vehicleNo.trim() || '4호차',
      driverName: driverName.trim() || '윤태준',
      passengerName: passengerName.trim() || 'SOFYAN 외 1명',
      defaultNavi,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden text-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <User className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-black text-slate-900 tracking-tight">
              드라이버 & 내비 프로필 설정
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-transform duration-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
              <Car className="w-3.5 h-3.5 mr-1 text-blue-600" /> 호차 번호
            </label>
            <input
              type="text"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="예: 4호차"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
              <User className="w-3.5 h-3.5 mr-1 text-blue-600" /> 기사 성명
            </label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="예: 윤태준"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
              <Users className="w-3.5 h-3.5 mr-1 text-blue-600" /> 담당 승객명
            </label>
            <input
              type="text"
              value={passengerName}
              onChange={(e) => setPassengerName(e.target.value)}
              placeholder="예: SOFYAN 외 1명"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center">
              <Navigation className="w-3.5 h-3.5 mr-1 text-blue-600" /> 주력 내비게이션 앱
            </label>
            <div className="grid grid-cols-3 gap-2">
              {NAVI_OPTIONS.map((item) => {
                const isSelected = defaultNavi === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setDefaultNavi(item.key);
                    }}
                    className={`py-3 px-2 rounded-2xl border transition-all duration-100 flex flex-col items-center justify-center space-y-1.5 active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-2xs ${item.bgColor} ${item.textColor}`}
                    >
                      {item.symbol}
                    </div>
                    <span className="text-[11px] font-extrabold">{item.name.split(' ')[0]}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-95 transition-transform duration-100"
            >
              취소
            </button>
            <button
              type="submit"
              className="w-2/3 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md shadow-blue-500/20 active:scale-95 transition-transform duration-100"
            >
              설정 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
