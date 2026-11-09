'use client';

import React, { useState } from 'react';
import { CalendarDays, ChevronDown, MapPin, ArrowRight, RefreshCw } from 'lucide-react';
import { getEventRouteLegs, type DriverEventFavorite, type DriverEventLeg, type DriverEventStop } from '@/utils/driverEventFavorites';

type Props = {
  events: DriverEventFavorite[];
  onLoadLeg: (leg: DriverEventLeg) => void;
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
  events, onLoadLeg, onSelectStop, isLoading, error, onRefresh, compact = false,
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
                                  <div className="mt-4 border-t border-[#EEF1F5] pt-3">
                                    <p className="mb-2.5 text-[12px] font-bold text-[#25344D]">이동 구간 선택</p>
                                    {getEventRouteLegs(route).length > 0 ? (
                                      <div className="space-y-2">
                                        {getEventRouteLegs(route).map((leg) => (
                                          <div key={leg.id} className="rounded-[12px] bg-[#F7F8FB] px-3 py-3">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                              <span className="shrink-0 text-[11px] font-semibold text-[#8290A5]">{leg.index + 1}구간</span>
                                              <span className="min-w-0 break-words text-[12px] font-semibold text-[#25344D]">{leg.origin.name}</span>
                                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#A8B5C8]" />
                                              <span className="min-w-0 break-words text-[12px] font-semibold text-[#25344D]">{leg.destination.name}</span>
                                            </div>
                                            <button type="button" disabled={!leg.ready} onClick={() => onLoadLeg(leg)}
                                              aria-label={`${leg.index + 1}구간 ${leg.origin.name}에서 ${leg.destination.name}까지 불러오기`}
                                              className="mt-2.5 flex min-h-10 w-full items-center justify-center rounded-[11px] bg-white px-3 text-[12px] font-bold text-[#1E60F3] shadow-[0_2px_8px_rgba(35,49,78,0.035)] transition-colors hover:bg-[#EFF4FF] disabled:cursor-not-allowed disabled:bg-[#E8EDF5] disabled:text-[#9BA9BA]">
                                              {leg.samePlace ? '같은 장소 · 이동 불필요' : leg.ready ? '길안내 · 보고 자동 복사' : '장소 확인 필요'}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[11px] leading-relaxed text-[#8290A5]">
                                        이전 예약에는 전체 경유지가 저장되지 않아 이동 구간을 자동으로 만들 수 없습니다.
                                      </p>
                                    )}
                                    <p className="mt-2.5 text-[11px] leading-relaxed text-[#8290A5]">
                                      각 구간은 출발지와 목적지만 설정합니다. 표시된 시간은 원본 일정 기준이며, 다음 출발 시각을 임의로 추정하지 않습니다.
                                    </p>
                                  </div>
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
