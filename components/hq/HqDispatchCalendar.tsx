'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, MapPin, X } from 'lucide-react';
import type { HqBooking } from '@/types/hq';
import { getCustomerDotColor } from '@/utils/customerDotColor';
import { getKstTodayDateStr, normalizeDateToIso } from '@/utils/dispatchConflictDetector';
import {
  getHqCalendarDays,
  isHqBookingScheduledOn,
  shiftHqCalendarMonth,
  sortHqCalendarBookings,
  getHqCalendarContinuity,
} from '@/utils/hqDispatchCalendar';

interface Props {
  bookings: HqBooking[];
  onViewBooking: (booking: HqBooking) => void;
  onOpenNewBooking: () => void;
}

const WHITE_SHADOW = 'shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)]';
const HOVER_SHADOW = 'hover:shadow-[0_6px_18px_rgba(35,49,78,0.075)]';

function vehiclePlate(booking: HqBooking) {
  const plate = booking.vehiclePlate?.trim() || booking.vehicleNoKey?.trim();
  return plate && !['-', '미배정', '배정 대기'].includes(plate) ? plate : '차량 미배정';
}
function chauffeur(booking: HqBooking) {
  const name = booking.driverName?.trim();
  return name && !['-', '미지정', '미배정'].includes(name) ? name : '기사 미배정';
}
function status(booking: HqBooking) {
  if (booking.hasConflict) return '일정 충돌';
  if (booking.dispatchStatus === '취소') return '취소';
  if (['미배정', '작성 중', '재확인 필요'].includes(booking.dispatchStatus)) return booking.dispatchStatus;
  return null;
}
function calendarTitle(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year}년 ${month}월`;
}
function selectedTitle(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

function DesktopEvent({ booking, onClick }: { booking: HqBooking; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${booking.customerName}, 차량 ${vehiclePlate(booking)}, 기사 ${chauffeur(booking)} 상세 보기`}
      className="w-full min-w-0 rounded-lg bg-[#F7F9FC] px-2 py-2 text-left transition-colors hover:bg-[#EDF1F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E60F3]"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: getCustomerDotColor(booking.customerId, booking.customerName) }}
        />
        <span className={`min-w-0 truncate text-[11px] font-semibold text-[#17233B] ${booking.dispatchStatus === '취소' ? 'line-through opacity-50' : ''}`}>
          {booking.customerName}
        </span>
      </span>
      <span className="mt-0.5 block truncate pl-3.5 text-[10px] text-[#73839D]">
        {vehiclePlate(booking)} · {chauffeur(booking)}
      </span>
    </button>
  );
}

function DayBooking({ booking, onClick, viewingDate }: { booking: HqBooking; onClick: () => void; viewingDate: string }) {
  const state = status(booking);
  const isStartDay = normalizeDateToIso(booking.pickupDate) === viewingDate;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[18px] bg-white p-4 text-left transition-shadow ${WHITE_SHADOW} ${HOVER_SHADOW} focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E60F3]`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: getCustomerDotColor(booking.customerId, booking.customerName) }}
          />
          <span className={`min-w-0 break-words text-sm font-semibold text-[#17233B] ${booking.dispatchStatus === '취소' ? 'line-through opacity-50' : ''}`}>
            {booking.customerName}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-[#73839D]">{isStartDay ? booking.pickupTime : '연속 운행'}</span>
      </span>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 pl-4">
        <p className="min-w-0">
          <span className="block text-[11px] text-[#95A3B9]">차량번호</span>
          <span className="mt-0.5 block break-words text-[13px] font-medium text-[#17233B]">{vehiclePlate(booking)}</span>
        </p>
        <p className="min-w-0">
          <span className="block text-[11px] text-[#95A3B9]">담당 기사</span>
          <span className="mt-0.5 block break-words text-[13px] font-medium text-[#17233B]">{chauffeur(booking)}</span>
        </p>
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-[11px] text-[#73839D]">
        <span className="inline-flex min-w-0 items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0 text-[#95A3B9]" strokeWidth={1.7} />
          <span className="truncate">{booking.pickupLocation} → {booking.destination}</span>
        </span>
        {booking.routeWaypoints && booking.routeWaypoints.length > 2 && (
          <span>중간 경유 {booking.routeWaypoints.length - 2}곳</span>
        )}
        {state && <span className="rounded-md bg-[#F7F9FC] px-2 py-0.5 text-[#73839D]">{state}</span>}
      </div>
    </button>
  );
}

/** Read-only monthly view over the same Supabase-backed HqBooking records as the legacy list. */
export function HqDispatchCalendar({ bookings, onViewBooking, onOpenNewBooking }: Props) {
  const today = getKstTodayDateStr();
  const [monthKey, setMonthKey] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [peek, setPeek] = useState<{date:string;top:number;left:number} | null>(null);
  const visibleBookings = useMemo(() => bookings.filter(booking => booking.dispatchStatus !== '취소'), [bookings]);

  // The mobile click-only peek remains useful; desktop no longer creates
  // floating tooltips that obscure the wide calendar grid.
  const showDayPeek = (iso: string, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 24);
    setPeek({
      date: iso,
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 345)),
    });
  };
  useEffect(() => {
    if (!peek) return;
    const dismiss = (event: PointerEvent) => {
      const element = event.target as Element | null;
      if (!element?.closest('[data-calendar-peek-trigger], [data-calendar-peek-panel]')) {
        setPeek(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPeek(null);
    };
    const close = () => setPeek(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [peek?.date]);


  const days = useMemo(() => getHqCalendarDays(monthKey), [monthKey]);
  const dayBookings = useMemo(() => {
    const result = new Map<string, HqBooking[]>();
    for (const day of days) {
      const rows = visibleBookings.filter((booking) => isHqBookingScheduledOn(booking, day.iso));
      result.set(day.iso, sortHqCalendarBookings(rows));
    }
    return result;
  }, [days, visibleBookings]);

  const selectedBookings = dayBookings.get(selectedDate) || [];
  const peekBookings = peek ? dayBookings.get(peek.date) || [] : [];
  const continuityByDate = useMemo(() => new Map(days.map(day =>
    [day.iso, getHqCalendarContinuity(visibleBookings, day.iso)]
  )), [days, visibleBookings]);
  const monthlyBookings = visibleBookings.filter((booking) =>
    days.some((day) => day.inMonth && isHqBookingScheduledOn(booking, day.iso))
  );
  const openDay = (iso: string) => {
    setSelectedDate(iso);
    if (iso.slice(0, 7) !== monthKey) setMonthKey(iso.slice(0, 7));
  };
  const moveMonth = (delta: number) => {
    setPeek(null);
    const next = shiftHqCalendarMonth(monthKey, delta);
    setMonthKey(next);
    setSelectedDate(`${next}-01`);
  };
  const backToToday = () => {
    setPeek(null);
    const next = getKstTodayDateStr();
    setMonthKey(next.slice(0, 7));
    setSelectedDate(next);
  };

  return (
    <section aria-label="예약·배차 월간 달력" className="mt-3 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label="이전 달"
            className={`flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#73839D] transition-colors hover:bg-[#F7F9FC] sm:h-10 sm:w-10 ${WHITE_SHADOW}`}
          >
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
          <h3 className="min-w-[125px] text-center text-[17px] font-semibold tracking-tight text-[#17233B] sm:min-w-[150px] sm:text-xl" aria-live="polite">
            {calendarTitle(monthKey)}
          </h3>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="다음 달"
            className={`flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#73839D] transition-colors hover:bg-[#F7F9FC] sm:h-10 sm:w-10 ${WHITE_SHADOW}`}
          >
            <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-[#95A3B9] sm:inline">이번 달 {monthlyBookings.length}건</span>
          <button
            type="button"
            onClick={backToToday}
            className={`rounded-full bg-white px-4 py-2 text-xs font-medium text-[#73839D] transition-colors hover:bg-[#F7F9FC] ${WHITE_SHADOW}`}
          >
            오늘
          </button>
        </div>
      </div>

      <div className={`overflow-hidden rounded-[22px] bg-white ${WHITE_SHADOW}`}>
        <div className="grid grid-cols-7 border-b border-[#EDF1F6] bg-[#FAFBFD]">
          {['일', '월', '화', '수', '목', '금', '토'].map((name, index) => (
            <div key={name} className={`py-3 text-center text-xs font-medium ${index === 0 ? 'text-[#A47F86]' : index === 6 ? 'text-[#7188A6]' : 'text-[#73839D]'}`}>
              {name}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-[#EDF1F6]">
          {days.map((day) => {
            const rows = dayBookings.get(day.iso) || [];
            const selected = day.iso === selectedDate;
            const isToday = day.iso === today;
            const continuation = continuityByDate.get(day.iso);
            return (
              <div
                key={day.iso}
                className={`min-w-0 bg-white p-1.5 sm:min-h-[132px] sm:p-2.5 lg:min-h-[150px] ${!day.inMonth ? 'bg-[#FAFBFD]' : ''}`}
              >
                <button
                  type="button"
                  data-calendar-peek-trigger
                  onClick={(event) => {
                    openDay(day.iso);
                    if (window.innerWidth < 1024 && rows.length) showDayPeek(day.iso, event.currentTarget);
                    else setPeek(null);
                  }}
                  aria-haspopup={rows.length > 0 ? 'dialog' : undefined}
                  aria-expanded={peek?.date === day.iso}
                  aria-label={`${day.iso} 배차 ${rows.length}건 미리보기`}
                  aria-pressed={selected}
                  aria-current={isToday ? 'date' : undefined}
                  className={`flex h-[66px] w-full flex-col items-center justify-start gap-1 rounded-lg pt-1.5 text-left transition-colors hover:bg-[#F7F9FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E60F3] sm:h-auto sm:min-h-8 sm:flex-row sm:justify-between sm:pt-0 sm:px-1.5 ${selected ? 'bg-[#EEF3FF]' : ''}`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:h-7 sm:w-7 sm:text-[13px] ${isToday ? 'bg-[#1E60F3] text-white' : !day.inMonth ? 'text-[#B9C2D0]' : selected ? 'text-[#1E60F3]' : 'text-[#17233B]'}`}>
                    {day.day}
                  </span>
                  {rows.length > 0 && (
                    <>
                      <span className="sm:hidden flex max-w-full gap-[3px]" aria-hidden="true">
                        {rows.slice(0, 3).map((booking) => (
                          <span key={booking.id} className="h-[5px] w-[5px] rounded-full"
                            style={{ backgroundColor: getCustomerDotColor(booking.customerId, booking.customerName) }} />
                        ))}
                      </span>
                      <span className="text-[10px] text-[#95A3B9] sm:text-[11px]">{rows.length}건</span>
                    </>
                  )}
                </button>
                {continuation && (
                  <div
                    title={`같은 차량의 연속 일정 ${continuation.days}일`}
                    aria-label={`연결된 배차 ${continuation.days}일, ${continuation.previous ? '이전 날짜에서 계속' : '첫 날짜'}`}
                    className={`mt-1 h-[3px] sm:mt-2 ${continuation.previous ? '-ml-1.5 sm:-ml-2.5' : 'ml-1.5 rounded-l-full'} ${continuation.next ? '-mr-1.5 sm:-mr-2.5' : 'mr-1.5 rounded-r-full'}`}
                    style={{ backgroundColor: getCustomerDotColor(continuation.colorBooking.customerId, continuation.colorBooking.customerName) }}
                  />
                )}
                <div className="hidden space-y-1.5 pt-1.5 sm:block">
                  {rows.slice(0, 2).map((booking) => (
                    <DesktopEvent
                      key={booking.id}
                      booking={booking}
                      onClick={() => { setSelectedDate(day.iso); onViewBooking(booking); }}
                    />
                  ))}
                  {rows.length > 2 && (
                    <button type="button" onClick={() => openDay(day.iso)}
                      className="w-full rounded-lg px-2 py-1 text-left text-[11px] font-medium text-[#73839D] hover:bg-[#F7F9FC]">
                      + {rows.length - 2}건 더 보기
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section aria-label={`${selectedTitle(selectedDate)} 상세 일정`} className={`rounded-[22px] bg-[#FAFBFD] p-4 sm:p-5 ${WHITE_SHADOW}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-[15px] font-semibold tracking-tight text-[#17233B]">
              {selectedTitle(selectedDate)}
            </h4>
            <p className="mt-1 text-xs text-[#73839D]">날짜를 누르면 해당 날짜의 배차를 확인할 수 있어요.</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-[#73839D]">
            {selectedBookings.length}건
          </span>
        </div>
        {selectedBookings.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {selectedBookings.map((booking) => (
              <DayBooking key={booking.id} booking={booking} viewingDate={selectedDate} onClick={() => onViewBooking(booking)} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
            <CalendarDays className="h-7 w-7 text-[#B9C2D0]" strokeWidth={1.5} />
            <p className="text-sm font-medium text-[#73839D]">이 날짜에 등록된 배차가 없어요.</p>
            <button type="button" onClick={onOpenNewBooking}
              className="mt-1 rounded-lg px-3 py-2 text-xs font-medium text-[#1E60F3] hover:bg-white">
              예약 추가
            </button>
          </div>
        )}
      </section>
      {peek && peekBookings.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          data-calendar-peek-panel
          role="dialog"
          aria-label={`${selectedTitle(peek.date)} 배차 미리보기`}
          className="fixed inset-x-3 bottom-3 z-[160] max-h-[min(72dvh,420px)] overflow-hidden rounded-[20px] bg-white p-3.5 shadow-[0_16px_48px_rgba(26,41,69,0.16)] ring-1 ring-[#E9EEF5] sm:inset-auto sm:w-[352px] sm:max-h-[min(440px,70dvh)] sm:p-4"
          style={{ ...(window.matchMedia('(min-width: 640px)').matches ? { top: peek.top, left: peek.left, bottom: 'auto' } : {}) }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-[#17233B]">{selectedTitle(peek.date)}</p>
              <p className="mt-0.5 text-[11px] text-[#8998AD]">배차 {peekBookings.length}건 · 일정을 누르면 상세 화면으로 이동</p>
            </div>
            <button type="button" onClick={() => setPeek(null)}
              aria-label="배차 미리보기 닫기"
              className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F5F7FA] text-[#687C96] hover:bg-[#EDF1F6]">
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-[min(56dvh,340px)] space-y-2 overflow-y-auto overscroll-contain">
            {peekBookings.map(booking => {
              const run = getHqCalendarContinuity(visibleBookings, peek.date);
              const sameRun = run && run.colorBooking.id === booking.id ? run : null;
              return (
                <button key={booking.id} type="button" onClick={() => { setPeek(null); onViewBooking(booking); }}
                  className="block w-full rounded-[14px] bg-[#F7F9FC] px-3 py-2.5 text-left transition-colors hover:bg-[#EFF3F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E60F3]">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getCustomerDotColor(booking.customerId, booking.customerName) }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#17233B]">{booking.customerName}</span>
                    {sameRun && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[#72849B]">연속 {sameRun.days}일</span>}
                  </div>
                  <p className="mt-1.5 pl-4 text-[11px] font-medium text-[#586D89]">
                    {booking.vehicleModel ? booking.vehicleModel + ' · ' : ''}{vehiclePlate(booking)} · {chauffeur(booking)}
                  </p>
                  <p className="mt-0.5 pl-4 text-[11px] text-[#8A9AB0]">
                    {normalizeDateToIso(booking.pickupDate) === peek.date ? booking.pickupTime : '연속 운행'} · {status(booking) || '배차 일정'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>, document.body
      )}
      {monthlyBookings.length === 0 && (
        <p className="flex items-center justify-center gap-2 pb-2 text-xs text-[#95A3B9]">
          <Inbox className="h-4 w-4" strokeWidth={1.5} /> 이 달에는 등록된 배차가 없습니다.
        </p>
      )}
    </section>
  );
}
