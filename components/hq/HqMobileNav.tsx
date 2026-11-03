'use client';
import { CalendarCheck, Activity, Car, Plus, Menu } from 'lucide-react';

export function HqMobileNav({ activeTab, formOpen, actionCount, onNavigate, onQuickBooking, onMenu }: {
  activeTab: string; formOpen: boolean; actionCount: number; onNavigate: (tab: string) => void; onQuickBooking: () => void; onMenu: () => void;
}) {
  const tabs = [
    {id:'dispatch',label:'배차',icon:CalendarCheck,action:()=>onNavigate('dispatch')},
    {id:'operations',label:'실시간',icon:Activity,action:()=>onNavigate('operations')},
    {id:'vehicles',label:'차량',icon:Car,action:()=>onNavigate('vehicles')},
    {id:'quick',label:'빠른예약',icon:Plus,action:onQuickBooking},
    {id:'menu',label:'전체메뉴',icon:Menu,action:onMenu},
  ];
  return <nav aria-label="모바일 하단 빠른 메뉴" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-1 border-t border-slate-200 bg-white px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] lg:hidden">
    {tabs.map(({id,label,icon:Icon,action}) => {
      const active = id === 'quick' ? activeTab === 'dispatch' && formOpen : id === activeTab && !(id === 'dispatch' && formOpen);
      return <button type="button" key={id} onClick={action} aria-current={active ? 'page' : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${active ? 'bg-blue-50 text-[#1E60F3]' : 'text-slate-500'}`}>
        <Icon className="h-5 w-5" aria-hidden="true" /><span>{label}</span>
        {id==='dispatch' && actionCount>0 && <span className="absolute right-1 top-0 rounded-full bg-[#1E60F3] px-1.5 text-[10px] text-white">{actionCount>99?'99+':actionCount}</span>}
      </button>;
    })}
  </nav>;
}
