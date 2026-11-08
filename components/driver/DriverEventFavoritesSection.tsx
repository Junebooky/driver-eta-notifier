'use client';

import React, { useState } from 'react';
import { CalendarDays, ChevronDown, MapPin, Route, RefreshCw } from 'lucide-react';
import type { DriverEventFavorite, DriverEventRoute, DriverEventStop } from '@/utils/driverEventFavorites';

type Props = {
  events: DriverEventFavorite[];
  onLoadRoute: (route: DriverEventRoute) => void;
  onSelectStop?: (stop: DriverEventStop) => void;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  compact?: boolean;
};

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return date;
  return `${month}월 ${day}일 (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
}

/** A-style read-only event navigation view shared by the driver schedule and favorites. */
export function DriverEventFavoritesSection({
  events, onLoadRoute, onSelectStop, isLoading, error, onRefresh, compact = false,
}: Props) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  return (
    <section className={compact ? 'space-y-3' : 'space-y-3.5'} aria-label="배정 행사">
      {!compact && (
        <div className="flex items-center justify-between px-0.5">
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-[#17233B]">배정 행사</h3>
            <p className="mt-1 text-[12px] text-[#8290A5]">확정된 배차의 모든 장소를 날짜별로 확인하세요.</p>
          </div>
          {onRefresh && (
            <button type="button" onClick={onRefresh} aria-label="배정 행사 새로고침"
              className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white text-[#8290A5] shadow-[0_3px_14px_rgba(35,49,78,0.045)] hover:text-[#1E60F3]">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-[14px] bg-[#F6F7FA] p-3.5 text-[12px] text-[#4D607C]">
          {error}
          {onRefresh && <button type="button" onClick={onRefresh} className="ml-2 font-bold text-[#1E60F3]">다시 불러오기</button>}
        </div>
      )}
      {isLoading && events.length === 0 ? (
        <div role="status" className="rounded-[16px] bg-white p-5 text-center text-[13px] text-[#8290A5]">
          배정된 행사 정보를 확인하고 있습니다.
        </div>
      ) : !error && events.length === 0 ? (
        <div className="rounded-[16px] bg-white px-5 py-8 text-center shadow-[0_4px_18px_rgba(35,49,78,0.045)]">
          <CalendarDays className="mx-auto h-6 w-6 text-[#A8B5C8]" />
          <p className="mt-3 text-[14px] font-semibold text-[#17233B]">배정된 행사가 없습니다</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#8290A5]">고객사 이메일 예약의 기사·차량 배차가 확정되면 자동으로 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {events.map((event) => {
            const open = expandedEventId === event.id || (!expandedEventId && event.id === events[0].id);
            const routeCount = event.days.reduce((total, day) => total + day.routes.length, 0);
            return (
              <article key={event.id} className="overflow-hidden rounded-[16px] bg-white shadow-[0_4px_18px_rgba(35,49,78,0.045)]">
                <button type="button" aria-expanded={open}
                  onClick={() => { setExpandedEventId(open ? '__closed__' : event.id); setExpandedDay(null); }}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[#FAFBFD]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#F2F5FA]">
                    <CalendarDays className="h-5 w-5 text-[#59708F]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-[14px] font-bold text-[#17233B]">{event.name}</h4>
                    <p className="mt-1 text-[11px] text-[#8290A5]">
                      {event.customerName && event.customerName !== event.name ? `${event.customerName} · ` : ''}
                      {event.days.length}일 · 배차 {routeCount}건
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#8290A5] transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
                    {event.days.map((day, dayIndex) => {
                      const key = `${event.id}:${day.date}`;
                      const dayOpen = expandedDay === key || (!expandedDay && dayIndex === 0);
                      return (
                        <div key={key} className="overflow-hidden rounded-[13px] bg-[#F6F7FA]">
                          <button type="button" aria-expanded={dayOpen}
                            onClick={() => setExpandedDay(dayOpen ? '__closed__' : key)}
                            className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left">
                            <span className="text-[13px] font-bold text-[#25344D]">{formatDate(day.date)}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-[#8290A5]">
                              {day.routes.length > 1 ? `${day.routes.length}개 배차` : `${day.routes[0]?.stops.length || 0}개 장소`}
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dayOpen ? 'rotate-180' : ''}`} />
                            </span>
                          </button>
                          {dayOpen && (
                            <div className="space-y-2 px-2.5 pb-2.5">
                              {day.routes.map((route) => (
                                <div key={route.scheduleId} className="rounded-[12px] bg-white px-3.5 py-3 shadow-[0_2px_10px_rgba(35,49,78,0.025)]">
                                  <div className="flex items-center justify-between gap-2 pb-2.5">
                                    <span className="text-[11px] font-semibold text-[#6E809B]">
                                      {route.pickupTime ? `${route.pickupTime} 출발` : '시각 미정'}
                                    </span>
                                    {day.routes.length > 1 && <span className="text-[11px] text-[#8290A5]">{route.vehiclePlate}</span>}
                                  </div>
                                  <ol className="space-y-3" aria-label={`${formatDate(day.date)} 방문 장소`}>
                                    {route.stops.map((stop, index) => (
                                      <li key={stop.id + index} className="flex items-start gap-2.5">
                                        <div className="mt-0.5 flex w-5 shrink-0 justify-center">
                                          <MapPin className={`h-4 w-4 ${stop.isPoiConfirmed ? 'text-[#1E60F3]' : 'text-[#A8B5C8]'}`} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-baseline gap-2">
                                            <span className="min-w-0 flex-1 break-words text-[13px] font-semibold text-[#25344D]">{stop.name || '장소 미지정'}</span>
                                            {stop.time && <span className="shrink-0 text-[11px] tabular-nums text-[#8290A5]">{stop.time}</span>}
                                          </div>
                                          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-[#8290A5]">
                                            {stop.address || '주소 확인 필요'}
                                          </p>
                                          {stop.notes && <p className="mt-1 text-[11px] text-[#6E809B]">{stop.notes}</p>}
                                        </div>
                                        {onSelectStop && stop.isPoiConfirmed && (
                                          <button type="button" onClick={() => onSelectStop(stop)}
                                            aria-label={`${stop.name} 선택`}
                                            className="shrink-0 rounded-[10px] bg-[#EFF4FF] px-2.5 py-1.5 text-[11px] font-bold text-[#1E60F3]">
                                            선택
                                          </button>
                                        )}
                                      </li>
                                    ))}
                                  </ol>
                                  <button type="button" disabled={!route.ready} onClick={() => onLoadRoute(route)}
                                    className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-[#1E60F3] px-3 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#174BC4] disabled:cursor-not-allowed disabled:bg-[#E8EDF5] disabled:text-[#92A0B4]">
                                    <Route className="h-4 w-4" /> 이 날짜 전체 경로 불러오기
                                  </button>
                                  {!route.ready && (
                                    <p className="mt-2 text-[11px] leading-relaxed text-[#8290A5]">
                                      {route.fullItinerary ? '확정되지 않은 장소가 있어 본사에서 주소 확인 후 경로를 불러올 수 있습니다.' : '이전 예약에는 전체 경유지가 저장되지 않아 경로를 자동으로 불러올 수 없습니다.'}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
