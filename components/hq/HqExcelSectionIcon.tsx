type HqExcelSectionIconProps={
 src:'/images/icons/excel/icon_kakao.png'|'/images/icons/excel/icon_link.png';
 label:string;
 count?:number;
};
/** Link icon keeps its tooltip; Kakao icon quietly shakes every 30s when unread. */
export function HqExcelSectionIcon({src,label,count=0}:HqExcelSectionIconProps){
 const kakao=src==='/images/icons/excel/icon_kakao.png';
 return <span role="img" aria-label={count>0?label+' · 읽지 않은 반영 완료 '+count+'건':label}
  className={(kakao?'':'group ')+'relative inline-flex h-14 w-14 shrink-0 items-center justify-center sm:h-16 sm:w-16'}>
  <img src={src} alt="" draggable={false}
   className={'h-full w-full select-none object-contain drop-shadow-sm '+(kakao?(count>0?'hq-report-unread-wiggle':''):'transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-95')}/>
  {count>0&&<span aria-hidden="true" className="absolute -right-1.5 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#E85A5A] px-1 text-[12px] font-bold leading-none text-white shadow-[0_2px_7px_rgba(155,76,76,0.22)] sm:h-7 sm:min-w-7 sm:text-[13px]">{count>99?'99+':count}</span>}
  {!kakao&&<span aria-hidden="true" className="pointer-events-none absolute -top-2 left-[calc(100%-2px)] z-30 flex translate-x-0 items-center whitespace-nowrap rounded-full bg-[#435674] px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-[0_5px_16px_rgba(54,78,115,0.16)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100">
   {label}
   <span className="absolute -bottom-1 left-2.5 h-2 w-2 rotate-45 bg-[#435674]"/>
  </span>}
 </span>;
}
