'use client';

import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqButton, HqInput } from '@/components/hq/ui';

export interface NewCustomerContact {
  name: string;
  role: string;
  department: string;
  phone: string;
  email: string;
}

export function HqCustomerAddContactModal({
  isOpen, companyName, onClose, onSave,
}: {
  isOpen: boolean;
  companyName: string;
  onClose: () => void;
  onSave: (contact: NewCustomerContact) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<NewCustomerContact>({
    name: '', role: '예약 담당자', department: '', phone: '', email: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraft({ name: '', role: '예약 담당자', department: '', phone: '', email: '' });
      setError(null);
    }
  }, [isOpen]);

  const close = () => { if (!busy) onClose(); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim()) { setError('담당자 이름을 입력해 주세요.'); return; }
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      setError('이메일 주소를 확인해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const failure = await onSave(draft);
      if (failure) setError(failure);
      else onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '담당자 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <HqModal isOpen={isOpen} title="담당자 추가" subtitle={companyName}
      icon={<div className="flex size-11 items-center justify-center rounded-[15px] bg-[#F2F6FD] text-[#526D99]"><UserPlus size={20} /></div>}
      onClose={close} className="max-w-[470px]">
      <form onSubmit={submit} className="space-y-4" id="hq-customer-contact-add">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 block text-[12px] font-semibold text-[#52647A]">
            담당자 이름 <span className="text-[#1E60F3]">*</span>
            <HqInput autoFocus required value={draft.name} maxLength={120} placeholder="이름"
              onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-1.5" />
          </label>
          <label className="block text-[12px] font-semibold text-[#52647A]">
            직책
            <HqInput value={draft.role} maxLength={120} placeholder="예약 담당자"
              onChange={event => setDraft(current => ({ ...current, role: event.target.value }))} className="mt-1.5" />
          </label>
          <label className="block text-[12px] font-semibold text-[#52647A]">
            부서
            <HqInput value={draft.department} maxLength={120} placeholder="의전예약"
              onChange={event => setDraft(current => ({ ...current, department: event.target.value }))} className="mt-1.5" />
          </label>
          <label className="block text-[12px] font-semibold text-[#52647A]">
            연락처
            <HqInput type="tel" value={draft.phone} maxLength={30} placeholder="010-0000-0000"
              onChange={event => setDraft(current => ({ ...current, phone: event.target.value }))} className="mt-1.5" />
          </label>
          <label className="block text-[12px] font-semibold text-[#52647A]">
            이메일
            <HqInput type="email" value={draft.email} maxLength={254} placeholder="name@company.com"
              onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} className="mt-1.5" />
          </label>
        </div>
        <p className="text-[11px] text-[#8190A5]">담당자 정보는 고객사 DB에 저장되며 모든 HQ 기기에 반영됩니다.</p>
        {error && <p role="alert" className="rounded-[13px] bg-[#FFF4F2] px-3 py-2.5 text-[12px] font-medium text-[#A34E45]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <HqButton type="button" variant="secondary" disabled={busy} onClick={close}>취소</HqButton>
          <HqButton type="submit" variant="primary" loading={busy} disabled={!draft.name.trim()}>
            {busy ? '저장 중...' : '담당자 저장'}
          </HqButton>
        </div>
      </form>
    </HqModal>
  );
}
