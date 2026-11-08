'use client';

import { HqInput, HqTextarea, HqButton } from '@/components/hq/ui';
import React, { useState } from 'react';
import { X, Building2, User, Plus, Loader2 } from 'lucide-react';
import { HqCustomer, CustomerTier } from '@/types/customerHq';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';
import { HqSearchSelect } from '@/components/hq/ui/HqSearchSelect';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { normalizeDateToIso } from '@/utils/dispatchConflictDetector';

interface HqCustomerRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterCustomer: (newCustomer: HqCustomer) => Promise<boolean> | void;
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
  const [nextEventDate, setNextEventDate] = useState('');
  const [preferencesInput, setPreferencesInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('고객사명을 입력해 주세요.');
      return;
    }

    if (nextEventTitle.trim() && !normalizeDateToIso(nextEventDate)) {
      setFormError('행사명을 입력한 경우 행사 예정 날짜를 정확히 입력해 주세요.');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
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
        nextEventDate: nextEventTitle.trim() ? normalizeDateToIso(nextEventDate) : undefined,
        mainPhone: contactPhone.trim(),
        mainEmail: contactEmail.trim(),
        department: department.trim() || '의전예약',
        preferences: prefList,
        notes: noteList,
        nextEvent: nextEventTitle.trim()
          ? {
              id: `ev-${Date.now()}`,
              title: nextEventTitle.trim(),
              date: normalizeDateToIso(nextEventDate),
              dDay: '',
              location: '미정',
              vehiclesRequired: '미정',
              passengerCount: 0,
              timeRange: '미정',
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

      const result = await onRegisterCustomer(newCust);
      if (result !== false) {
        haptics.success();
        onClose();
      } else {
        setFormError('고객사 등록에 실패했습니다. 상세 오류를 고객사 목록에서 확인하고 다시 시도해 주세요.');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '고객사 등록 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-3 backdrop-blur-[2px] animate-in fade-in duration-150 sm:p-6">
      <div className="hq-customer-modal-a flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-[26px] bg-[#FAFBFD] shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)]">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 bg-white px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[#EEF3FF] text-[#1E60F3]">
              <Building2 className="size-5 text-[#1E60F3]" />
            </div>
            <div>
              <h2 className="text-[19px] font-bold tracking-[-0.03em] text-[#17233B]">신규 고객사 등록</h2>
              <p className="mt-1 text-[12px] font-medium leading-relaxed text-[#73839D]">
                고객사와 담당자 정보를 입력해 주세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="고객사 등록 닫기"
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 text-[12px] font-medium text-[#4D607C] sm:p-6">
          {/* Row 1: Company Name & Tier */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                고객사명 (Company Name) *
              </label>
              <HqInput
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: DIOR Korea, Tiffany & Co."
                
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                고객사 등급 (Tier)
              </label>
              <HqSearchSelect
                label="신규 고객사 등급"
                size="sm"
                value={tier}
                onChange={next => setTier(next as CustomerTier)}
                placeholder="고객사 등급"
                options={[
                  { value: 'VIP', label: 'VIP' },
                  { value: '주요', label: '주요 고객' },
                  { value: '일반', label: '일반 고객' },
                ]}
              />
            </div>
          </div>

          {/* Row 2: Department */}
          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-1">
              주요 소관 부서
            </label>
            <HqInput
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="예: Global Events, 의전비서팀, 홍보마케팅실"
              
            />
          </div>

          {/* Section: Primary Contact */}
          <div className="space-y-4 rounded-[19px] bg-white p-5 shadow-[0_5px_16px_rgba(35,49,78,0.045)]">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#17233B]">
              <User className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>대표 담당자 (Primary Contact)</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">담당자명</label>
                <HqInput
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="예: Marie Dupont"
                  
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">직책/역할</label>
                <HqInput
                  type="text"
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  placeholder="예: Global Events Director"
                  
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">연락처</label>
                <HqInput
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(formatPhoneNumber(e.target.value))}
                  placeholder="예: 010-1234-5678 또는 +33 6 12 34 56 78"
                  
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">이메일</label>
                <HqInput
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="예: contact@company.com"
                  
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
              <HqInput
                type="text"
                value={nextEventTitle}
                onChange={(e) => setNextEventTitle(e.target.value)}
                placeholder="예: 신제품 런칭 행사"
                
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                행사 예정 일자
              </label>
              <HqInput
                type="text"
                value={nextEventDate}
                onChange={(e) => setNextEventDate(e.target.value)}
                placeholder="예: 2026-11-30"
                
              />
            </div>
          </div>

          {/* Preferences */}
          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-1">
              주요 선호사항 (쉼표로 구분)
            </label>
            <HqInput
              type="text"
              value={preferencesInput}
              onChange={(e) => setPreferencesInput(e.target.value)}
              placeholder="예: S클래스 선호, 영어 가능 기사, 정시 출발 필수"
              
            />
          </div>

          {/* Internal Notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-800 mb-1">
              관리자 내부 메모 (의전 가이드라인)
            </label>
            <HqTextarea
              rows={3}
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="행사 시 주의점 및 기사 배차 유의사항을 줄바꿈하여 입력하세요..."
              
            />
          </div>

          <HqInlineFeedback message={formError} onDismiss={() => setFormError(null)} />
          {actionHead}
          <div className="flex items-center justify-end gap-2 pt-3">
            <HqButton variant="subtle"
              type="button"
              onClick={onClose}
              
            >
              취소
            </HqButton>
            <HqButton variant="primary"
              type="submit"
              disabled={isSubmitting}
              
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>등록 중...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>고객사 등록 완료</span>
                </>
              )}
            </HqButton>
          </div>
        </form>
      </div>
    </div>
  );
};
