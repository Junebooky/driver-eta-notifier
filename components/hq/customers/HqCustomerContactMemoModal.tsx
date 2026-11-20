'use client';

import {useEffect,useState} from 'react';
import {HqButton,HqTextarea} from '@/components/hq/ui';
import {HqModal} from '@/components/hq/ui/HqModal';
import {HqInlineFeedback} from '@/components/hq/ui/HqInlineFeedback';

interface Props{
  customerName:string; contactName:string; contactId:string;
  initialMemo:string; isOpen:boolean;
  onClose:()=>void; onSave:(contactId:string,memo:string)=>Promise<string|null>;
}
export function HqCustomerContactMemoModal({
  customerName,contactName,contactId,initialMemo,isOpen,onClose,onSave,
}:Props){
  const [memo,setMemo]=useState(initialMemo);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(!isOpen)return;
    setMemo(initialMemo);
    setError(null);
  },[isOpen,contactId,initialMemo]);
  const submit=async()=>{
    if(saving)return;
    if(memo.length>3000){setError('메모는 3,000자 이내로 입력해 주세요.');return;}
    setSaving(true);setError(null);
    try{
      const failure=await onSave(contactId,memo);
      if(failure){setError(failure);return;}
      onClose();
    }catch(e){
      setError(e instanceof Error?e.message:'메모를 저장하지 못했습니다.');
    }finally{setSaving(false);}
  };
  return <HqModal isOpen={isOpen} onClose={()=>{if(!saving)onClose();}}
    title={contactName+' · 개인 메모'} subtitle={customerName}
    className="max-w-[520px]"
    footer={<>
      <HqButton variant="secondary" disabled={saving} onClick={onClose}>취소</HqButton>
      <HqButton variant="primary" loading={saving} disabled={memo.length>3000}
        onClick={()=>{void submit();}}>저장</HqButton>
    </>}>
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-[#73849C]">
        주소, 방문 팁 등 이 담당자에게만 해당하는 내용을 기록하세요.
        고객사 공통 메모와 별도로 보관됩니다.
      </p>
      <label className="block space-y-1.5 text-[12px] font-semibold text-[#526680]">
        담당자 메모
        <HqTextarea rows={6} autoFocus maxLength={3000} value={memo}
          onChange={e=>setMemo(e.target.value)}
          placeholder="예: 자택 주소, 미팅 장소, 연락 시 참고사항"/>
      </label>
      <p className="text-right text-[11px] text-[#8B98AB]">{memo.length.toLocaleString()} / 3,000자</p>
      {error&&<HqInlineFeedback tone="error" message={error}/>}
    </div>
  </HqModal>;
}
