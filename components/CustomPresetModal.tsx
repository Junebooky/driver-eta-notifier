'use client';

import React, { useState } from 'react';
import { LocationPreset } from '@/types';
import { X, Plus, MapPin, Compass } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface CustomPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPreset: (preset: LocationPreset) => void;
}

export const CustomPresetModal: React.FC<CustomPresetModalProps> = ({
  isOpen,
  onClose,
  onAddPreset,
}) => {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [latStr, setLatStr] = useState('');
  const [lngStr, setLngStr] = useState('');
  const [address, setAddress] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !shortName.trim()) {
      alert('거점 명칭과 표기용 짧은 이름을 입력해 주세요.');
      return;
    }

    const lat = parseFloat(latStr) || 37.5665;
    const lng = parseFloat(lngStr) || 126.9780;

    const newPreset: LocationPreset = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      shortName: shortName.trim(),
      lat,
      lng,
      category: 'CUSTOM',
      address: address.trim() || '사용자 지정 거점',
    };

    haptics.successPulse();
    onAddPreset(newPreset);
    
    // Reset form
    setName('');
    setShortName('');
    setLatStr('');
    setLngStr('');
    setAddress('');
    onClose();
  };

  const fillCurrentCoords = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatStr(pos.coords.latitude.toFixed(6));
          setLngStr(pos.coords.longitude.toFixed(6));
          haptics.lightTap();
        },
        () => {
          alert('GPS 좌표를 불러올 수 없습니다.');
        }
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-zinc-100">VIP 커스텀 거점 추가</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1">
              거점 전체 명칭 (예: 비발디파크 소노펠리체)
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 클럽하우스 메인 로비"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-blue-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1">
              버튼 표기 명칭 (짧게 8자 이내)
            </label>
            <input
              type="text"
              required
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="예: 클럽하우스"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-blue-500 font-bold"
            />
          </div>

          {/* Coordinates Lat / Lng */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-zinc-400">
                위도 / 경도 좌표 (WGS84)
              </label>
              <button
                type="button"
                onClick={fillCurrentCoords}
                className="text-[11px] text-blue-400 font-bold flex items-center hover:underline"
              >
                <Compass className="w-3 h-3 mr-1" /> 현위치 GPS 좌표 입력
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                required
                value={latStr}
                onChange={(e) => setLatStr(e.target.value)}
                placeholder="위도 (Lat: 37.5042)"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-blue-500 font-mono"
              />
              <input
                type="number"
                step="any"
                required
                value={lngStr}
                onChange={(e) => setLngStr(e.target.value)}
                placeholder="경도 (Lng: 127.0425)"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1">
              상세 주소 (선택)
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예: 강원 홍천군 서면 한치골길"
              className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="w-2/3 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/40 transition-colors"
            >
              커스텀 거점 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
