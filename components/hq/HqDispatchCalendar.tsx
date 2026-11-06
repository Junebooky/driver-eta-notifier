'use client';

import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, MapPin } from 'lucide-react';
import type { HqBooking } from '@/types/hq';
import { getCustomerDotColor } from '@/utils/customerDotColor';
import { getKstTodayDateStr, normalizeDateToIso } from '@/utils/dispatchConflictDetector';
import {
  getHqCalendarDays,
  isHqBookingScheduledOn,
  shiftHqCalendarMonth,
  sortHqCalendarBookings,
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
      title={`${booking.customerName} · ${vehiclePlate(booking)} · ${chauffeur(booking)}`}
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

  const days = useMemo(() => getHqCalendarDays(monthKey), [monthKey]);
  const dayBookings = useMemo(() => {
    const result = new Map<string, HqBooking[]>();
    for (const day of days) {
      const rows = bookings.filter((booking) => isHqBookingScheduledOn(booking, day.iso));
      result.set(day.iso, sortHqCalendarBookings(rows));
    }
    return result;
  }, [days, bookings]);

  const selectedBookings = dayBookings.get(selectedDate) || [];
  const monthlyBookings = bookings.filter((booking) =>
    days.some((day) => day.inMonth && isHqBookingScheduledOn(booking, day.iso))
  );
  const openDay = (iso: string) => {
    setSelectedDate(iso);
    if (iso.slice(0, 7) !== monthKey) setMonthKey(iso.slice(0, 7));
  };
  const moveMonth = (delta: number) => {
    const next = shiftHqCalendarMonth(monthKey, delta);
    setMonthKey(next);
    setSelectedDate(`${next}-01`);
  };
  const backToToday = () => {
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
            return (
              <div
                key={day.iso}
                className={`min-w-0 bg-white p-1.5 sm:min-h-[132px] sm:p-2.5 lg:min-h-[150px] ${!day.inMonth ? 'bg-[#FAFBFD]' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => openDay(day.iso)}
                  aria-label={`${day.iso} 배차 ${rows.length}건 확인`}
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
      {monthlyBookings.length === 0 && (
        <p className="flex items-center justify-center gap-2 pb-2 text-xs text-[#95A3B9]">
          <Inbox className="h-4 w-4" strokeWidth={1.5} /> 이 달에는 등록된 배차가 없습니다.
        </p>
      )}
    </section>
  );
}
