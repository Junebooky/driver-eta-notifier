'use client';
import { ArrowRight, CalendarDays, Car, ClipboardList, Receipt, Users } from 'lucide-react';
import type { HqBooking } from '@/types/hq';
import { getKstTodayDateStr } from '@/utils/dispatchConflictDetector';
import { HqReportingOverview } from './HqReportingOverview';

export function HqDashboardOverview({ bookings, loading, error, representative, onNavigate, onAssign }: {
  bookings: HqBooking[]; loading: boolean; error: string | null; representative: boolean;
  onNavigate: (tab: string, filter?: string) => void; onAssign: (booking: HqBooking) => void;
}) {
  const active = bookings.filter(row => !['취소', '운행 완료'].includes(row.dispatchStatus));
  const waiting = active.filter(row => row.dispatchStatus === '미배정');
  const today = bookings.filter(row => row.dispatchStatus !== '취소').filter(row => row.pickupDate === getKstTodayDateStr() || row.isToday);
  const metrics = [
    { label: '배차 대기', count: waiting.length, filter: 'kpi_unassigned' },
    { label: '오늘 일정', count: today.length, filter: 'today' },
    { label: '기사 미확인', count: active.filter(row => row.driverAck === '미확인').length, filter: 'kpi_sent_unacknowledged' },
    { label: '재확인 필요', count: active.filter(row => row.driverAck === '재확인 필요' || row.dispatchStatus === '재확인 필요').length, filter: 'kpi_reconfirm_needed' },
  ];
  return <div className="space-y-5">
    <section className="rounded-3xl bg-[#0B1E48] p-5 text-white">
      <p className="text-xs text-blue-200">{representative ? '대표 모바일 관제' : 'VIP 운영 현황'}</p>
      <h2 className="mt-2 text-2xl font-black">오늘의 운행을 한눈에</h2>
      <p className="mt-2 text-sm text-blue-100">일정 확인 · 차량과 기사 배정 · 기사 확인 상태</p>
      <button type="button" onClick={() => onNavigate('dispatch', 'kpi_unassigned')} className="mt-5 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 font-bold text-[#0B1E48]">
        <span>배차 대기 일정 확인</span><ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
      </button>
    </section>
    {error && <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{error} · 새로고침으로 다시 확인해 주세요.</p>}
    <section aria-label="실시간 배차 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map(metric => <button key={metric.label} type="button" onClick={() => onNavigate('dispatch', metric.filter)} className="min-h-24 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs">
        <span className="text-sm text-slate-500">{metric.label}</span><strong className="mt-2 block text-3xl text-[#1E60F3]">{loading || error ? '—' : metric.count}<span className="ml-1 text-sm">건</span></strong>
      </button>)}
    </section>
    <section aria-label="우선 배정 일정" className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-bold">우선 배정 일정</h3><button type="button" onClick={() => onNavigate('dispatch')} className="min-h-11 px-2 text-sm font-bold text-[#1E60F3]">전체 일정</button></div>
      {loading ? <p role="status" className="text-sm text-slate-500">일정을 확인하고 있습니다.</p> : !error && waiting.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">현재 배차 대기 일정이 없습니다.</p> : null}
      {!error && waiting.slice().sort((a,b) => `${a.pickupDate} ${a.pickupTime}`.localeCompare(`${b.pickupDate} ${b.pickupTime}`)).slice(0,3).map(row => <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-bold text-[#1E60F3]">{row.pickupDate} · {row.pickupTime}</p><h4 className="mt-2 break-words font-bold">{row.customerName}</h4>
        <p className="mt-2 break-words text-sm text-slate-600">{row.pickupLocation} → {row.destination}</p>
        <button type="button" onClick={() => onAssign(row)} className="mt-4 min-h-12 w-full rounded-xl bg-[#1E60F3] px-4 py-3 text-sm font-bold text-white">차량·기사 배정</button>
      </article>)}
    </section>
    <section aria-label="운영 바로가기" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[{tab:'vehicles',label:'차량 관리',icon:Car},{tab:'drivers',label:'기사 관리',icon:Users},{tab:'driving_logs',label:'운행일지',icon:ClipboardList},{tab:'expenses',label:'경비·영수증',icon:Receipt}].map(({tab,label,icon:Icon}) => <button key={tab} type="button" onClick={() => onNavigate(tab)} className="flex min-h-16 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold"><Icon className="h-5 w-5 text-[#1E60F3]" aria-hidden="true" />{label}</button>)}
    </section>
    <HqReportingOverview />
    <button type="button" onClick={() => onNavigate('dispatch', 'today')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-50 p-4 font-bold text-[#1E60F3]"><CalendarDays className="h-5 w-5" aria-hidden="true" />오늘의 전체 일정 보기</button>
  </div>;
}
