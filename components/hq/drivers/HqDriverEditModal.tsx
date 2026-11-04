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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center font-bold">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">기사 정보 수정</h3>
              <p className="text-[11px] text-slate-500 font-medium">소속 구분 및 프로필 정보를 변경할 수 있어요</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-bold text-slate-700 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Affiliation Type - Core requirement */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
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
                className={`p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${affiliationType === 'employed'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
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
                className={`p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${affiliationType === 'freelance'
                    ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
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
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100/70 transition-colors">
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
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 disabled:opacity-50 text-white font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
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
