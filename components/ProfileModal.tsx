'use client';

import React, { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { X, User, Car, Users, Navigation, Check } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  onSave: (updated: Partial<DriverProfile>) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, profile, onSave }) => {
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
    onSave({
      vehicleNo: vehicleNo.trim() || '4호차',
      driverName: driverName.trim() || '윤태준',
      passengerName: passengerName.trim() || 'SOFYAN 외 1명',
      defaultNavi,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-zinc-100">드라이버 & 내비 프로필 설정</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center">
              <Car className="w-3.5 h-3.5 mr-1 text-blue-400" /> 호차 번호
            </label>
            <input
              type="text"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="예: 4호차"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-blue-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center">
              <User className="w-3.5 h-3.5 mr-1 text-blue-400" /> 기사 성명
            </label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="예: 윤태준"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-blue-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center">
              <Users className="w-3.5 h-3.5 mr-1 text-blue-400" /> 담당 승객명
            </label>
            <input
              type="text"
              value={passengerName}
              onChange={(e) => setPassengerName(e.target.value)}
              placeholder="예: SOFYAN 외 1명"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-blue-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 flex items-center">
              <Navigation className="w-3.5 h-3.5 mr-1 text-blue-400" /> 주력 내비게이션 앱
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'tmap', name: 'TMAP', desc: '티맵' },
                { key: 'kakao', name: '카카오내비', desc: '카카오' },
                { key: 'naver', name: '네이버지도', desc: '네이버' },
              ].map((item) => {
                const isSelected = defaultNavi === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDefaultNavi(item.key as NaviProvider)}
                    className={`py-3 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center justify-center space-y-1 ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span>{item.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
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
              className="w-1/3 py-3 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-bold transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="w-2/3 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/40 transition-colors"
            >
              설정 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
