'use client';

import {useEffect,useState} from 'react';
import type {CustomerContact} from '@/types/customerHq';
import {draftFromContact,normalizeContactChannels,type ContactChannelDraft} from '@/lib/customers/contactChannels';
import {HqButton} from '@/components/hq/ui';
import {HqModal} from '@/components/hq/ui/HqModal';
import {HqContactChannelFields} from './HqContactChannelFields';

interface Props{
  isOpen:boolean;
  companyName:string;
  contact:CustomerContact;
  onClose:()=>void;
  onSave:(contactId:string,value:ContactChannelDraft)=>Promise<string|null>;
}
export function HqCustomerEditContactModal({isOpen,companyName,contact,onClose,onSave}:Props){
  const [draft,setDraft]=useState<ContactChannelDraft>(()=>draftFromContact(contact));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!isOpen)return;
    setDraft(draftFromContact(contact));
    setError('');
  // Opening another contact resets the draft, but server refetch of an open
  // contact must not discard the user's unsaved edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isOpen,contact.id]);
  const close=()=>{if(!saving)onClose();};
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const parsed=normalizeContactChannels(draft);
    if(!parsed.ok){setError(parsed.error);return;}
    setSaving(true);setError('');
    try{
      const failure=await onSave(contact.id,parsed.value);
      if(failure){setError(failure);return;}
      onClose();
    }catch(error){
      setError(error instanceof Error?error.message:'담당자 정보를 저장할 수 없습니다.');
    }finally{setSaving(false);}
  };
  return <HqModal isOpen={isOpen} onClose={close} title="담당자 정보 수정"
    subtitle={companyName+' · '+contact.name}
    className="max-w-[580px]"
    icon={<img src="/images/icons/clients/icon_clients.png" alt=""
      className="size-11 shrink-0 object-contain" draggable={false}/>}>
    <form onSubmit={event=>{void submit(event);}} className="space-y-4"
      id="hq-customer-contact-edit">
      <HqContactChannelFields value={draft} onChange={setDraft} disabled={saving} autoFocusName/>
      <p className="text-[11px] leading-relaxed text-[#8190A5]">
        비어 있던 이메일도 나중에 추가할 수 있어요. 저장하면 이 담당자의 정보만 바뀌며
        개인 메모와 다른 담당자의 연락처는 그대로 유지돼요.
      </p>
      {error&&<p role="alert" className="rounded-[13px] bg-[#FFF4F2] p-3 text-[12px] text-[#A34E45]">{error}</p>}
      <div className="flex justify-end gap-2">
        <HqButton variant="secondary" disabled={saving} onClick={close}>취소</HqButton>
        <HqButton variant="primary" type="submit" disabled={!draft.name.trim()} loading={saving}>
          {saving?'저장 중…':'변경사항 저장'}
        </HqButton>
      </div>
    </form>
  </HqModal>;
}
