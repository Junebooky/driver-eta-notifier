'use client';

import {Plus,Trash2} from 'lucide-react';
import {HqButton,HqInput} from '@/components/hq/ui';
import type {ContactChannelDraft} from '@/lib/customers/contactChannels';

interface Props{
  value:ContactChannelDraft;
  onChange:(next:ContactChannelDraft)=>void;
  disabled?:boolean;
  autoFocusName?:boolean;
}
export function HqContactChannelFields({value,onChange,disabled=false,autoFocusName=false}:Props){
  const setText=(key:'name'|'role'|'department',text:string)=>onChange({...value,[key]:text});
  const setItem=(key:'phones'|'emails',index:number,text:string)=>
    onChange({...value,[key]:value[key].map((v,i)=>i===index?text:v)});
  const removeItem=(key:'phones'|'emails',index:number)=>{
    const items=value[key].filter((_,i)=>i!==index);
    onChange({...value,[key]:items.length?items:['']});
  };
  const addItem=(key:'phones'|'emails')=>{
    if(value[key].length<10)onChange({...value,[key]:[...value[key],'']});
  };
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-[12px] font-semibold text-[#526680] sm:col-span-2">
        담당자 이름 <span className="text-[#1E60F3]">*</span>
        <HqInput required autoFocus={autoFocusName} disabled={disabled}
          maxLength={120} value={value.name} placeholder="담당자 이름"
          onChange={event=>setText('name',event.target.value)} className="mt-1.5"/>
      </label>
      <label className="block text-[12px] font-semibold text-[#526680]">
        직책
        <HqInput disabled={disabled} maxLength={120} value={value.role}
          placeholder="예약 담당자" onChange={event=>setText('role',event.target.value)} className="mt-1.5"/>
      </label>
      <label className="block text-[12px] font-semibold text-[#526680]">
        부서
        <HqInput disabled={disabled} maxLength={120} value={value.department}
          placeholder="의전예약" onChange={event=>setText('department',event.target.value)} className="mt-1.5"/>
      </label>
    </div>
    {(['phones','emails'] as const).map(key=>{
      const isPhone=key==='phones',label=isPhone?'전화번호':'이메일';
      return <div key={key} className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold text-[#526680]">{label}</p>
            <p className="mt-0.5 text-[11px] text-[#8190A5]">
              첫 번째 {label}가 기본 연락처로 사용돼요.
            </p>
          </div>
          <HqButton variant="subtle" size="sm" disabled={disabled||value[key].length>=10}
            onClick={()=>addItem(key)}>
            <Plus className="size-4"/> {label} 추가
          </HqButton>
        </div>
        {value[key].map((text,index)=><div key={index} className="flex min-w-0 items-center gap-2">
          <label className="min-w-0 flex-1 text-[11px] text-[#8291A5]">
            {index===0?'기본 '+label:label+' '+(index+1)}
            <HqInput disabled={disabled} type={isPhone?'tel':'email'}
              inputMode={isPhone?'tel':'email'}
              autoComplete={index===0?(isPhone?'tel':'email'):'off'}
              maxLength={isPhone?40:254} value={text}
              placeholder={isPhone?'010-0000-0000':'name@company.com'}
              onChange={event=>setItem(key,index,event.target.value)}
              className="mt-1.5"/>
          </label>
          <HqButton variant="subtle" size="sm" disabled={disabled}
            aria-label={label+' '+(index+1)+' 삭제'}
            title={label+' 삭제'} onClick={()=>removeItem(key,index)}>
            <Trash2 className="size-4"/>
          </HqButton>
        </div>)}
      </div>;
    })}
  </div>;
}
