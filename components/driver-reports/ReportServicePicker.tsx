'use client';
import {VipChatAvatar} from './VipChatAvatar';
import {REPORT_SERVICE_TYPES,type ReportServiceType} from '@/utils/reportServiceTypes';

/** The dispatcher offers service category before every new report. */
export function ReportServicePicker({value,onChange}:{value:ReportServiceType|null;onChange:(value:ReportServiceType|null)=>void}){
 return <div aria-label="운행 유형 선택" className="flex items-start gap-2.5 px-0 py-1">
  <VipChatAvatar/>
  <div className="flex min-w-0 max-w-[88%] flex-1 flex-col items-start">
   <span className="mb-1 ml-0.5 text-[12px] font-medium text-[#3E4B57]">VIP리무진코리아</span>
   <div className="w-full space-y-3 rounded-[12px] rounded-tl-[3px] bg-white p-3 text-[#30353A] shadow-[0_1px_3px_rgba(39,62,92,0.06)]">
    <p className="text-[14px] font-semibold leading-6">{value?'선택한 운행 유형':'어떤 운행을 보고하시나요?'}</p>
    {value?<div className="flex min-w-0 items-center justify-between gap-2">
      <span className="min-w-0 text-[14px] font-semibold text-[#1E60F3]">{value}</span>
      <button type="button" className="shrink-0 rounded-xl border border-[#DDE5EF] bg-[#F7F9FC] px-3 py-2 text-[13px] text-[#66748A] hover:bg-[#EDF2F8]" onClick={()=>onChange(null)} aria-label="운행 유형 변경">변경</button>
     </div>:<div className="space-y-2">
      <p className="text-[12px] leading-5 text-[#7E8A9C]">먼저 아래 세 가지 중 하나를 선택해 주세요.</p>
      {REPORT_SERVICE_TYPES.map(type=><button key={type} type="button" onClick={()=>onChange(type)}
       className="block min-h-12 w-full rounded-xl border border-[#DCE5F1] bg-[#F9FBFF] px-4 py-3 text-left text-[15px] font-semibold text-[#465775] transition-all duration-150 hover:border-[#91B3FF] hover:bg-[#EFF4FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]">{type}</button>)}
     </div>}
   </div>
  </div>
 </div>;
}
