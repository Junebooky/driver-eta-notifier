type HqExcelSectionIconProps={
 src:'/images/icons/excel/icon_kakao.png'|'/images/icons/excel/icon_link.png';
 label:string;
};

/** Shared HQ Excel module icon: gentle elevation, hover scaling and top-right speech-bubble label. */
export function HqExcelSectionIcon({src,label}:HqExcelSectionIconProps){
 return <span role="img" aria-label={label}
  className="group relative flex h-14 w-14 shrink-0 cursor-default items-center justify-center rounded-[18px] border border-[#EAF0F8] bg-[#F3F6FC] shadow-[0_2px_8px_rgba(54,78,115,0.04)] sm:h-16 sm:w-16">
  <img src={src} alt="" draggable={false}
   className="h-11 w-11 select-none object-contain drop-shadow-sm transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-95 sm:h-12 sm:w-12"/>
  <span aria-hidden="true" className="pointer-events-none absolute -top-1.5 left-[calc(100%-4px)] z-30 flex translate-x-0 items-center whitespace-nowrap rounded-full bg-[#435674] px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-[0_5px_16px_rgba(54,78,115,0.16)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100">
   {label}
   <span className="absolute -bottom-1 left-2.5 h-2 w-2 rotate-45 bg-[#435674]" />
  </span>
 </span>;
}
