'use client';
import {CalendarCheck,Activity,Plus,Menu} from 'lucide-react';

interface Props {
  activeTab:string;
  formOpen:boolean;
  menuOpen:boolean;
  actionCount:number;
  onNavigate:(tab:string)=>void;
  onQuickBooking:()=>void;
  onMenu:()=>void;
}

/** Persistent four-item HQ mobile nav. Vehicle/driver management stays in the full menu. */
export function HqMobileNav({activeTab,formOpen,menuOpen,actionCount,onNavigate,onQuickBooking,onMenu}:Props){
  const tabs=[
    {id:'dispatch',label:'배차',icon:CalendarCheck,action:()=>onNavigate('dispatch')},
    {id:'operations',label:'실시간',icon:Activity,action:()=>onNavigate('operations')},
    {id:'quick',label:'예약',icon:Plus,action:onQuickBooking},
    {id:'menu',label:'전체메뉴',icon:Menu,action:onMenu},
  ] as const;

  return <nav aria-label="모바일 하단 빠른 메뉴"
    className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-[#E9EDF3] bg-white px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] lg:hidden">
    {tabs.map(({id,label,icon:Icon,action})=>{
      const isAction=id==='quick'||id==='menu';
      const active=id==='quick'?formOpen:id==='menu'?menuOpen:activeTab===id;
      return <button type="button" key={id} onClick={action}
        aria-current={!isAction&&active?'page':undefined}
        aria-pressed={id==='quick'?formOpen:undefined}
        aria-expanded={id==='menu'?menuOpen:undefined}
        aria-label={id==='quick'?'빠른 예약 등록':id==='menu'?'전체 메뉴 열기':undefined}
        className={'relative flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#1E60F3] '+
          (active?'bg-[#F3F7FF] text-[#1E60F3]':'text-[#73839D] hover:bg-[#F7F9FC]')}>
        <Icon className="size-5" aria-hidden="true"/>
        <span>{label}</span>
        {id==='dispatch'&&actionCount>0&&
          <span aria-label={'확인 필요 '+actionCount+'건'}
            className="absolute right-1 top-0 rounded-full bg-[#1E60F3] px-1.5 text-[10px] text-white">
            {actionCount>99?'99+':actionCount}
          </span>}
      </button>;
    })}
  </nav>;
}
