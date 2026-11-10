'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Phone, MapPin, FileText, Check, Loader2 } from 'lucide-react';
import { HqDriverSummary } from '@/types/driverHq';
import { formatPhoneNumber } from '@/utils/formatters';
import { haptics } from '@/utils/haptics';

export interface HqDriverEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: HqDriverSummary | null;
  onSave: (id: string, updates: Record<string, any>) => Promise<boolean>;
}

export const HqDriverEditModal: React.FC<HqDriverEditModalProps> = ({
  isOpen,
  onClose,
  driver,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [affiliationType, setAffiliationType] = useState<'employed' | 'freelance'>('freelance');
  const [residence, setResidence] = useState('');
  const [englishAvailable, setEnglishAvailable] = useState(false);
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (driver && isOpen) {
      setName(driver.name || '');
      setPhone(driver.phone || '');
      setAffiliationType(driver.affiliationType || 'freelance');
      setResidence(driver.residence || '');
      setEnglishAvailable(Boolean(driver.englishAvailable));
      setMemo(driver.memo || '');
      setErrorMessage(null);
    }
  }, [driver, isOpen]);

  if (!isOpen || !driver) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('기사명을 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const ok = await onSave(driver.id, {
        name: name.trim(),
        phone: phone.trim(),
        affiliationType,
        residence: residence.trim(),
        englishAvailable,
        memo: memo.trim(),
      });

      if (ok) {
        haptics.success();
        onClose();
      } else {
        setErrorMessage('기사 정보 수정에 실패했습니다. 다시 시도해 주세요.');
        haptics.errorAlert();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || '네트워크 오류가 발생했습니다.');
      haptics.errorAlert();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-3 backdrop-blur-[2px] sm:p-6 animate-in fade-in duration-150">
      <div className="hq-driver-form-a w-full max-w-md overflow-hidden rounded-[25px] bg-[#FAFBFD] shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)] animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-white px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex size-11 items-center justify-center rounded-[15px] bg-[#EEF3FF] text-[#1E60F3]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[18px] font-bold tracking-[-0.025em] text-[#17233B]">기사 정보 수정</h3>
              <p className="text-[11px] text-slate-500 font-medium">소속 구분 및 프로필 정보를 변경할 수 있어요</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 text-[12px] font-medium text-[#4D607C]">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Affiliation Type - Core requirement */}
          <div className="space-y-3 rounded-[18px] bg-white p-4 shadow-[0_4px_14px_rgba(35,49,78,0.045)]">
            <label className="block text-xs font-black text-slate-900">
              소속 구분 <span className="text-[#1E60F3]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setAffiliationType('employed');
                }}
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[13px] px-3 text-[12px] font-semibold transition-colors ${affiliationType === 'employed'
                    ? 'bg-[#EEF3FF] text-[#1E60F3] font-semibold'
                    : 'bg-white text-[#73839D] shadow-[0_3px_10px_rgba(35,49,78,0.045)] hover:bg-[#F7F9FC]'
                  }`}
              >
                {affiliationType === 'employed' && <Check className="w-3.5 h-3.5" />}
                <span>본사 소속</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setAffiliationType('freelance');
                }}
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[13px] px-3 text-[12px] font-semibold transition-colors ${affiliationType === 'freelance'
                    ? 'bg-[#EEF3FF] text-[#1E60F3] font-semibold'
                    : 'bg-white text-[#73839D] shadow-[0_3px_10px_rgba(35,49,78,0.045)] hover:bg-[#F7F9FC]'
                  }`}
              >
                {affiliationType === 'freelance' && <Check className="w-3.5 h-3.5" />}
                <span>프리랜서</span>
              </button>
            </div>
            <p className="text-[10.5px] text-slate-400 font-normal">
              {affiliationType === 'employed'
                ? '본사 소속 기사는 기사 관리 탭 최상단에 우선 정렬되며 소속 뱃지가 표시됩니다.'
                : '프리랜서 기사는 소속 기사 뒤에 정렬되며 표에서 뱃지 없이 깔끔하게 표시됩니다.'}
            </p>
          </div>

          {/* Name & Phone */}
          <div className="space-y-3">
            <div>
              <label className="block text-slate-600 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>기사명 *</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="기사 이름"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>연락처</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                placeholder="010-0000-0000"
                maxLength={13}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all font-mono font-bold"
              />
            </div>
          </div>

          {/* Residence & English */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-slate-600 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>거주 지역</span>
              </label>
              <input
                type="text"
                value={residence}
                onChange={(e) => setResidence(e.target.value)}
                placeholder="예: 서울 (강남)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all"
              />
            </div>

            <div>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-2 rounded-[15px] bg-white p-3 transition-colors hover:bg-[#FAFBFD]">
                <input
                  type="checkbox"
                  checked={englishAvailable}
                  onChange={(e) => setEnglishAvailable(e.target.checked)}
                  className="rounded text-[#1E60F3] focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>영어 가능 🇺🇸</span>
                </span>
              </label>
            </div>
          </div>

          {/* Admin Memo */}
          <div>
            <label className="block text-slate-600 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>관리자 메모</span>
            </label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="의전 경력, 특이사항 등 메모"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#1E60F3] transition-all text-xs resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-11 cursor-pointer rounded-[14px] bg-[#F7F9FC] px-4 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EDF1F6]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[14px] bg-[#1E60F3] px-5 text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-colors hover:bg-[#1757DC] disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>저장하기</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
