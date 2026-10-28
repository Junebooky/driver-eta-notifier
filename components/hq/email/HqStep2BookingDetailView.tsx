'use client';

import React, { useState } from 'react';
import {
  Car,
  Copy,
  Edit,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  ChevronDown,
  Info,
  CheckCircle2,
  ArrowLeft,
  User,
  Plus,
  Layers,
  Star,
} from 'lucide-react';
import { AvailableDriverItem } from './HqDriverSelectModal';
import { ReferenceEmailItem } from './emailReferenceData';
import { haptics } from '@/utils/haptics';

export interface VehicleSlotAssignment {
  slotIndex: number;
  vehicleModel: string;
  driver: AvailableDriverItem | null;
  status: 'unassigned' | 'assigned';
}

interface HqStep2BookingDetailViewProps {
  emailItem: ReferenceEmailItem;
  vehicleSlots: VehicleSlotAssignment[];
  onOpenDriverModal: (slotIndex: number) => void;
  onConfirmDispatch: () => void;
  onBackToStep1: () => void;
}

export const HqStep2BookingDetailView: React.FC<HqStep2BookingDetailViewProps> = ({
  emailItem,
  vehicleSlots,
  onOpenDriverModal,
  onConfirmDispatch,
  onBackToStep1,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'assign' | 'schedule' | 'history'>('assign');
  const [selectedLanguage, setSelectedLanguage] = useState<'any' | 'english'>('any');

  const handleConfirm = () => {
    haptics.success();
    onConfirmDispatch();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-5">
      {/* 1. Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToStep1}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-all active:scale-95"
            title="이메일 메일함으로 돌아가기"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center">
              <Car className="w-4 h-4" />
            </div>
            <h2 className="text-base font-black text-slate-900">예약 상세</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
              신규
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              배차 필요
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>복사</span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>수정</span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>삭제</span>
          </button>
        </div>
      </div>

      {/* 2. Navigation Sub-Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveSubTab('assign')}
          className={`pb-2.5 transition-all relative cursor-pointer ${
            activeSubTab === 'assign'
              ? 'text-[#1E60F3] font-black'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          차량·기사 배정
          {activeSubTab === 'assign' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('schedule')}
          className={`pb-2.5 transition-all relative cursor-pointer ${
            activeSubTab === 'schedule'
              ? 'text-[#1E60F3] font-black'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          운행 일정
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`pb-2.5 transition-all relative cursor-pointer ${
            activeSubTab === 'history'
              ? 'text-[#1E60F3] font-black'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          히스토리
        </button>
      </div>

      {/* 3. Main 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* Left Sub-Column: 기본 정보 + 추가 정보                    */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: 기본 정보 */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900">기본 정보</h3>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">예약 번호</span>
                <span className="font-bold text-slate-800">20261028-001</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">고객사</span>
                <span className="font-extrabold text-slate-900">Global Events</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">담당자</span>
                <span className="font-bold text-slate-800">Sarah Kim (+82 10-1234-5678)</span>
              </div>
            </div>

            <div className="h-px bg-slate-200 my-2" />

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">운행 날짜</span>
                <span className="font-bold text-slate-900">2026. 10. 28. (수)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">픽업 시간</span>
                <span className="font-bold text-slate-900">09:00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">픽업 위치</span>
                <span className="font-bold text-[#1E60F3]">인천공항 T2</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">목적지</span>
                <span className="font-bold text-slate-900">신라호텔</span>
              </div>
            </div>

            <div className="h-px bg-slate-200 my-2" />

            <div className="text-xs">
              <span className="text-slate-400 font-medium block mb-1">요청 사항</span>
              <p className="font-bold text-slate-800 leading-snug">
                VIP 게스트 3인, 미팅보드 요청
              </p>
            </div>
          </div>

          {/* Card 2: 추가 정보 */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900">추가 정보</h3>

            {/* 기사 언어 조건 */}
            <div>
              <span className="text-slate-400 font-medium text-xs block mb-1.5">
                기사 언어 조건
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLanguage('any')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedLanguage === 'any'
                      ? 'border-[#1E60F3] bg-blue-50/80 text-[#1E60F3] shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>🇰🇷</span>
                  <span>무관</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLanguage('english')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedLanguage === 'english'
                      ? 'border-[#1E60F3] bg-blue-50/80 text-[#1E60F3] shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>🇺🇸</span>
                  <span>영어 가능</span>
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs pt-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객 수</span>
                <span className="font-bold text-slate-800">3명</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객명</span>
                <span className="font-bold text-slate-800">
                  Mr. Laurent / Ms. Emma / Mr. David
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객 연락처</span>
                <span className="font-bold text-slate-800">+33 6 12 34 56 78</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">항공편명</span>
                <span className="font-bold text-blue-600">KE082 (선택)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* Right Sub-Column: 요청 차량 (2대)                         */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">요청 차량 (2대)</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold shadow-2xs hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Layers className="w-3 h-3" />
                <span>차등 배정</span>
              </button>
              <button
                type="button"
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>차량 추가</span>
              </button>
            </div>
          </div>

          {/* Vehicle Slots List */}
          <div className="space-y-3.5">
            {vehicleSlots.map((slot, idx) => {
              const isAssigned = Boolean(slot.driver);
              const vehicleImg =
                idx === 0 ? '/images/car_sprinter.png' : '/images/car_g90.png';

              return (
                <div
                  key={slot.slotIndex}
                  className={`rounded-2xl border p-4 transition-all ${
                    isAssigned
                      ? 'border-blue-300 bg-blue-50/20 shadow-xs'
                      : 'border-slate-200/90 bg-white shadow-2xs'
                  }`}
                >
                  {/* Top Bar inside Slot */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex items-center gap-1.5 cursor-pointer">
                        <span className="text-xs font-black text-slate-900">
                          {slot.vehicleModel}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isAssigned
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isAssigned ? '배차됨' : '미배정'}
                    </span>
                  </div>

                  {/* Body: Vehicle Image + Driver Selector */}
                  <div className="mt-3.5 flex items-center justify-between gap-4">
                    {/* Left: Vehicle Image */}
                    <div className="w-28 sm:w-36 h-20 bg-slate-50 rounded-xl flex items-center justify-center p-2 shrink-0 border border-slate-100">
                      <img
                        src={vehicleImg}
                        alt={slot.vehicleModel}
                        className="max-h-full max-w-full object-contain drop-shadow-sm"
                      />
                    </div>

                    {/* Right: Driver Slot Button or Profile */}
                    <div className="flex-1 min-w-0">
                      {isAssigned && slot.driver ? (
                        <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={slot.driver.avatarUrl}
                              alt={slot.driver.name}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-extrabold text-slate-900 truncate">
                                  {slot.driver.name}
                                </span>
                                <div className="flex items-center text-amber-500 text-[11px] font-bold">
                                  <Star className="w-3 h-3 fill-amber-400" />
                                  <span>{slot.driver.rating}</span>
                                </div>
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {slot.driver.plate || '차량 등록됨'} · {slot.driver.residence}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenDriverModal(slot.slotIndex)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer shrink-0"
                          >
                            변경
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenDriverModal(slot.slotIndex)}
                            className="w-full py-2.5 px-3 rounded-xl border border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 text-slate-700 hover:text-[#1E60F3] text-xs font-bold transition-all flex items-center justify-between cursor-pointer active:scale-98 shadow-2xs"
                          >
                            <span className="text-slate-500">기사 선택</span>
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          </button>
                          <p className="text-[10px] text-slate-400">
                            가용 기사 목록에서 전담 기사를 지정하세요.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footnote */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>배정 시 기사에게 실시간 모바일 Cockpit 알림이 전송됩니다.</span>
          </div>

          {/* Big Confirm Dispatch Button */}
          <div className="pt-3">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-3.5 px-4 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-98 text-white text-sm font-black shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>배차 확정</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

