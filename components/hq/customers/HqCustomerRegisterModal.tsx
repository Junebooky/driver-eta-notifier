'use client';

import React, { useState } from 'react';
import { X, Building2, User, Plus } from 'lucide-react';
import { HqCustomer, CustomerTier } from '@/types/customerHq';
import { haptics } from '@/utils/haptics';

interface HqCustomerRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterCustomer: (newCustomer: HqCustomer) => void;
}

export const HqCustomerRegisterModal: React.FC<HqCustomerRegisterModalProps> = ({
  isOpen,
  onClose,
  onRegisterCustomer,
}) => {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<CustomerTier>('주요');
  const [department, setDepartment] = useState('의전 및 VIP 이벤트');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('행사 총괄');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [nextEventTitle, setNextEventTitle] = useState('');
  const [nextEventDate, setNextEventDate] = useState('2024. 11. 30');
  const [preferencesInput, setPreferencesInput] = useState('S클래스 선호, 영어 가능 기사, 정시 출발 필수');
  const [notesInput, setNotesInput] = useState('VIP 동선 보안 민감\n행사 전담 차량 사전 점검 필수');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('고객사명을 입력해주세요.');
      return;
    }

    const prefList = preferencesInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const noteList = notesInput
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);

    const newCust: HqCustomer = {
      id: `cust-${Date.now()}`,
      name: name.trim(),
      tier,
      isFavorite: false,
      logoType: 'default',
      primaryContactName: contactName.trim() || '담당자',
      contactCountExtra: 0,
      recentSnippet: nextEventTitle.trim() || '신규 고객사 등록',
      nextEventDate: nextEventDate.trim() || '2024. 11. 30',
      mainPhone: contactPhone.trim() || '010-0000-0000',
      mainEmail: contactEmail.trim() || 'vip@company.com',
      department: department.trim() || 'VIP 의전팀',
      preferences: prefList.length > 0 ? prefList : ['정시 출발 필수', '금연 차량'],
      notes: noteList.length > 0 ? noteList : ['신규 등록 고객사'],
      nextEvent: nextEventTitle.trim()
        ? {
            id: `ev-${Date.now()}`,
            title: nextEventTitle.trim(),
            date: nextEventDate.trim(),
            dDay: 'D-30',
            location: '서울 시내 주요 호텔',
            vehiclesRequired: 'S클래스 1대',
            passengerCount: 2,
            timeRange: '09:00 - 18:00',
            status: 'upcoming',
          }
        : undefined,
      recentRequests: [],
      contacts: contactName.trim()
        ? [
            {
              id: `c-${Date.now()}`,
              name: contactName.trim(),
              role: contactRole.trim(),
              phone: contactPhone.trim(),
              email: contactEmail.trim(),
              isPrimary: true,
            },
          ]
        : [],
      eventsHistory: [],
      tripsHistory: [],
      communications: [],
    };

    haptics.success();
    onRegisterCustomer(newCust);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0B1E48] to-[#123485] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">신규 고객사 등록</h2>
              <p className="text-[11px] text-blue-200/80 font-medium">
                VIP Limousine Korea 주요 고객사 기본 정보 및 전담 의전 프로토콜 등록
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-medium text-slate-700">
          {/* Row 1: Company Name & Tier */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                고객사명 (Company Name) *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: DIOR Korea, Tiffany & Co."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                고객사 등급 (Tier)
              </label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as CustomerTier)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900 font-bold"
              >
                <option value="VIP">VIP</option>
                <option value="주요">주요 고객</option>
                <option value="일반">일반 고객</option>
              </select>
            </div>
          </div>

          {/* Row 2: Department */}
          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-1">
              주요 소관 부서
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="예: Global Events, 의전비서팀, 홍보마케팅실"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900"
            />
          </div>

          {/* Section: Primary Contact */}
          <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-black text-blue-900">
              <User className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>대표 담당자 (Primary Contact)</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">담당자명</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="예: Marie Dupont"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">직책/역할</label>
                <input
                  type="text"
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  placeholder="예: Global Events Director"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">연락처</label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="예: +33 6 12 34 56 78"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">이메일</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="예: contact@company.com"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section: Next Event */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                다음 예정 행사명
              </label>
              <input
                type="text"
                value={nextEventTitle}
                onChange={(e) => setNextEventTitle(e.target.value)}
                placeholder="예: 2024 Collection Preview"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                행사 예정 일자
              </label>
              <input
                type="text"
                value={nextEventDate}
                onChange={(e) => setNextEventDate(e.target.value)}
                placeholder="예: 2024. 11. 30"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900"
              />
            </div>
          </div>

          {/* Preferences */}
          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-1">
              주요 선호사항 (쉼표로 구분)
            </label>
            <input
              type="text"
              value={preferencesInput}
              onChange={(e) => setPreferencesInput(e.target.value)}
              placeholder="예: S클래스 선호, 영어 가능 기사, 정시 출발 필수"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900"
            />
          </div>

          {/* Internal Notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-1">
              관리자 내부 메모 (의전 가이드라인)
            </label>
            <textarea
              rows={3}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="행사 시 주의점 및 기사 배차 유의사항을 줄바꿈하여 입력하세요..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900 font-medium"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>고객사 등록 완료</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
