'use client';

import { useEffect,useState } from 'react';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqButton } from '@/components/hq/ui';
import {HqContactChannelFields} from './HqContactChannelFields';
import {normalizeContactChannels,type ContactChannelDraft} from '@/lib/customers/contactChannels';

export interface NewCustomerContact extends ContactChannelDraft {
  phone:string;email:string;
}

const blank=():ContactChannelDraft=>({
  name:'',role:'예약 담당자',department:'의전예약',phones:[''],emails:[''],
});

export function HqCustomerAddContactModal({isOpen,companyName,onClose,onSave}:{
  isOpen:boolean;companyName:string;onClose:()=>void;
  onSave:(contact:NewCustomerContact)=>Promise<string|null>;
}){
  const [draft,setDraft]=useState<ContactChannelDraft>(blank);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(isOpen)return;
    setDraft(blank());
    setError(null);
  },[isOpen]);
  const close=()=>{if(!busy)onClose();};
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const checked=normalizeContactChannels(draft);
    if(!checked.ok){setError(checked.error);return;}
    setBusy(true);setError(null);
    try{
      const value=checked.value;
      const reason=await onSave({...value,phone:value.phones[0]||'',email:value.emails[0]||''});
      if(reason)setError(reason);
      else onClose();
    }catch(err){
      setError(err instanceof Error?err.message:'담당자 저장에 실패했습니다.');
    }finally{setBusy(false);}
  };
  return <HqModal isOpen={isOpen} title="담당자 추가" subtitle={companyName}
    icon={<img src="/images/icons/clients/icon_clients.png" alt=""
      draggable={false} className="size-11 shrink-0 object-contain"/>}
    onClose={close} className="max-w-[580px]">
    <form onSubmit={event=>{void submit(event);}} className="space-y-4" id="hq-customer-contact-add">
      <HqContactChannelFields value={draft} onChange={setDraft} autoFocusName disabled={busy}/>
      <p className="text-[11px] text-[#8190A5]">연락처·이메일은 여러 개 등록할 수 있으며, 나중에 수정도 가능해요.</p>
      {error&&<p role="alert" className="rounded-[13px] bg-[#FFF4F2] px-3 py-2.5 text-[12px] text-[#A34E45]">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <HqButton variant="secondary" disabled={busy} onClick={close}>취소</HqButton>
        <HqButton type="submit" variant="primary" loading={busy} disabled={!draft.name.trim()}>
          {busy?'저장 중…':'담당자 저장'}
        </HqButton>
      </div>
    </form>
  </HqModal>;
}
