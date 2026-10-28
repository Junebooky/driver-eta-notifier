'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  FileText,
  RotateCcw,
  Users,
  PhoneCall,
  Mail,
  Ban,
  MessageSquareText,
  Send,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';
import { VIP_REAL_VEHICLES, stripManufacturerName } from '@/utils/vehicleData';
import { DEFAULT_DRIVER_PROFILES } from '@/utils/settlementCalculator';

export type HqDispatchTabKey = 'action' | 'today' | 'tomorrow' | 'all';

export interface HqDispatchTableProps {
  bookings: HqBooking[];
  allBookingsForCounts?: HqBooking[];
  activeTab: HqDispatchTabKey;
  onSelectTab: (tab: HqDispatchTabKey) => void;
  onOpenNewBooking: () => void;
  onViewBooking: (booking: HqBooking) => void;
  onAssignDriver?: (booking: HqBooking) => void;
  onResendBrochure?: (booking: HqBooking) => void;
  onOpenCustomerMessage?: (booking: HqBooking) => void;
  onRemindDriver?: (booking: HqBooking) => void;
}

export const HqDispatchTable: React.FC<HqDispatchTableProps> = ({
  bookings,
  allBookingsForCounts,
  activeTab,
  onSelectTab,
  onOpenNewBooking,
  onViewBooking,
  onOpenCustomerMessage,
  onRemindDriver,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');

  const sourceForCounts = allBookingsForCounts || bookings;

  const tabCounts = useMemo(() => {
    const activeNonCancelled = sourceForCounts.filter((b) => b.dispatchStatus !== '취소');
    return {
      action: activeNonCancelled.filter(
        (b) =>
          b.dispatchStatus === '미배정' ||
          b.dispatchStatus === '작성 중' ||
          b.dispatchStatus === '재확인 필요' ||
          b.driverAck === '미확인' ||
          b.driverAck === '재확인 필요' ||
          b.hasConflict
      ).length,
      today: sourceForCounts.filter((b) => b.isToday).length,
      tomorrow: sourceForCounts.filter((b) => b.isTomorrow).length,
      all: sourceForCounts.length,
    };
  }, [sourceForCounts]);

  const driverOptions = useMemo(() => {
    const names = new Set<string>(DEFAULT_DRIVER_PROFILES.map((d) => d.name));
    sourceForCounts.forEach((b) => {
      if (b.driverName && b.driverName !== '-' && b.driverName !== '미배정') {
        names.add(b.driverName.replace(/\s*기사$/, '').trim());
      }
    });
    return Array.from(names);
  }, [sourceForCounts]);

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    sourceForCounts.forEach((b) => {
      if (b.customerName) names.add(b.customerName);
    });
    return Array.from(names);
  }, [sourceForCounts]);

  const handleResetFilters = () => {
    haptics.lightTap();
    setSearchQuery('');
    setStatusFilter('all');
    setDriverFilter('all');
    setVehicleFilter('all');
    setCustomerFilter('all');
  };

  const filteredList = useMemo(() => {
    return bookings.filter((b) => {
      if (activeTab === 'today' && !b.isToday) return false;
      if (activeTab === 'tomorrow' && !b.isTomorrow) return false;
      if (activeTab === 'action') {
        const needsAction =
          b.dispatchStatus !== '취소' &&
          (b.dispatchStatus === '미배정' ||
            b.dispatchStatus === '작성 중' ||
            b.dispatchStatus === '재확인 필요' ||
            b.driverAck === '미확인' ||
            b.driverAck === '재확인 필요' ||
            Boolean(b.hasConflict));
        if (!needsAction) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.customerName.toLowerCase().includes(q) ||
          b.bookingNo.toLowerCase().includes(q) ||
          b.destination.toLowerCase().includes(q) ||
          b.pickupLocation.toLowerCase().includes(q) ||
          b.driverName.toLowerCase().includes(q) ||
          (b.passengerName && b.passengerName.toLowerCase().includes(q)) ||
          b.vehicleModel.toLowerCase().includes(q) ||
          (b.vehiclePlate && b.vehiclePlate.toLowerCase().includes(q));
        if (!matches) return false;
      }

      if (statusFilter === 'conflict') {
        if (!b.hasConflict) return false;
      } else if (statusFilter === 'unacked') {
        if (b.driverAck !== '미확인' && b.driverAck !== '재확인 필요') return false;
      } else if (statusFilter !== 'all' && b.dispatchStatus !== statusFilter) {
        return false;
      }

      if (driverFilter !== 'all') {
        const cleanDrv = b.driverName.replace(/\s*기사$/, '').trim();
        if (cleanDrv !== driverFilter) return false;
      }

      if (vehicleFilter !== 'all') {
        const matchesVehicle =
          b.vehiclePlate === vehicleFilter ||
          b.vehicleModel === vehicleFilter ||
          b.vehicleModel.includes(vehicleFilter);
        if (!matchesVehicle) return false;
      }

      if (customerFilter !== 'all' && b.customerName !== customerFilter) return false;

      return true;
    });
  }, [bookings, activeTab, searchQuery, statusFilter, driverFilter, vehicleFilter, customerFilter]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
      {/* 1. Header */}
      <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 border border-blue-100/60">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate">
              예약 · 배차 대기함 및 확인 현황
            </h2>
            <p className="text-[11px] text-slate-400 font-medium truncate">
              행을 터치/클릭하면 차량·기사 선정, 일정 변경(재확인), 배차 취소를 처리합니다
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenNewBooking();
          }}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>예약 접수</span>
        </button>
      </div>

      {/* 2. Operational Tabs (with real live counts) */}
      <div className="pt-3 flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('action');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === 'action'
              ? 'bg-[#0B1E48] text-white shadow-xs'
              : 'bg-rose-50/80 hover:bg-rose-100/80 text-rose-700 border border-rose-200/70'
          }`}
        >
          <span>배차대기·미확인</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'action' ? 'bg-rose-500 text-white' : 'bg-rose-200/80 text-rose-800'
            }`}
          >
            {tabCounts.action}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('today');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === 'today'
              ? 'bg-[#1E60F3] text-white shadow-xs'
              : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600'
          }`}
        >
          <span>오늘 예약</span>
          <span className="font-black">{tabCounts.today}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('tomorrow');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === 'tomorrow'
              ? 'bg-[#1E60F3] text-white shadow-xs'
              : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600'
          }`}
        >
          <span>내일 예약</span>
          <span className="font-black">{tabCounts.tomorrow}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('all');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
            activeTab === 'all'
              ? 'bg-[#1E60F3] text-white shadow-xs'
              : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600'
          }`}
        >
          <span>전체 일정</span>
          <span className="font-black">{tabCounts.all}</span>
        </button>
      </div>

      {/* 3. Filter Row */}
      <div className="pt-2.5 pb-1 flex flex-wrap items-center gap-2 text-xs">
        <div className="relative flex-1 min-w-[160px] sm:min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="고객사, 승객명, 예약번호, 목적지 검색..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 font-medium focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 상태</option>
          <option value="미배정">미배정 (배차대기)</option>
          <option value="unacked">기사 미확인 / 재확인</option>
          <option value="재확인 필요">변경 재확인 필요</option>
          <option value="conflict">일정 충돌 경고</option>
          <option value="배차 완료">배차 완료</option>
          <option value="작성 중">임시 초안</option>
          <option value="취소">취소됨</option>
        </select>

        <select
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 기사</option>
          {driverOptions.map((name) => (
            <option key={name} value={name}>
              {name} 기사
            </option>
          ))}
        </select>

        <select
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          className="hidden sm:block px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[170px]"
        >
          <option value="all">전체 차량</option>
          {VIP_REAL_VEHICLES.map((v) => (
            <option key={v.id} value={v.plate}>
              {v.plate} · {v.modelShort}
            </option>
          ))}
        </select>

        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="hidden md:block px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[160px]"
        >
          <option value="all">전체 고객사</option>
          {customerOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleResetFilters}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg font-bold transition-all cursor-pointer"
        >
          <RotateCcw className="w-3 h-3 text-slate-400" />
          <span>초기화</span>
        </button>
      </div>

      {/* 4. Container-Query Semantic Data Table (Desktop Sticky Table -> Mobile Stacked Cards) */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="hq-dispatch-table-caption"
        className="hq-responsive-table-wrapper mt-2"
      >
        <table className="text-left select-none min-w-[860px]">
          <caption id="hq-dispatch-table-caption" className="sr-only">
            예약 접수 및 기사 배차 확인 현황 목록
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 bg-slate-50">
              <th scope="col" className="py-2.5 px-3 bg-slate-50">고객사 · 승객</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">운행 일시</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">담당 기사</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">배정 차량</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">픽업 출발지</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">도착 목적지</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">배차 상태</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">기사 확인</th>
              <th scope="col" className="py-2.5 px-3 bg-slate-50">안내자료</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80 text-xs">
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                  현재 조건에 해당하는 예약/배차 내역이 없습니다.
                </td>
              </tr>
            ) : (
              filteredList.map((b) => {
                const isAssigned = b.dispatchStatus === '배차 완료' || b.dispatchStatus === '운행 완료';
                const isUnassigned = b.dispatchStatus === '미배정';
                const isDraft = b.dispatchStatus === '작성 중';
                const isReconfirm = b.dispatchStatus === '재확인 필요';
                const isCancelled = b.dispatchStatus === '취소';

                return (
                  <tr
                    key={b.id}
                    onClick={() => onViewBooking(b)}
                    className={`transition-colors group cursor-pointer ${
                      isCancelled
                        ? 'opacity-60 bg-slate-50/40 hover:bg-slate-50'
                        : b.hasConflict
                        ? 'bg-rose-50/30 hover:bg-rose-50/60'
                        : isUnassigned
                        ? 'bg-amber-50/20 hover:bg-amber-50/50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Col 1 (Row Header <th>): 고객사 · 승객 · 그룹 · 접수채널 */}
                    <th scope="row" className="py-3 px-3 text-left font-bold text-slate-900 align-middle">
                      <div className="flex items-center justify-between sm:justify-start gap-1.5 flex-wrap">
                        <span className="group-hover:text-[#1E60F3] transition-colors font-black">
                          {b.customerName}
                        </span>

                        {b.intakeSource === 'phone' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                            <PhoneCall className="w-2.5 h-2.5" />
                            전화
                          </span>
                        )}
                        {b.intakeSource === 'email' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                            <Mail className="w-2.5 h-2.5" />
                            메일
                          </span>
                        )}

                        {b.groupTotalVehicles && b.groupTotalVehicles > 1 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
                            <Users className="w-2.5 h-2.5" />
                            {b.groupVehicleIndex || 1}호차/{b.groupTotalVehicles}대
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] text-slate-400">{b.bookingNo}</span>
                        {b.passengerName && b.passengerName !== b.customerName && (
                          <span className="text-slate-700 font-semibold">· 탑승: {b.passengerName}</span>
                        )}
                      </div>
                    </th>

                    {/* Col 2: 운행 일시 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-black text-slate-900">{b.pickupTime || '-'}</div>
                      <div className="text-[10px] text-slate-400 font-semibold">{b.pickupDate}</div>
                    </td>

                    {/* Col 3: 담당 기사 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isUnassigned || b.driverName === '-' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 font-black text-[11px]">
                          배정 필요
                        </span>
                      ) : (
                        <span className="font-bold text-slate-800">{b.driverName}</span>
                      )}
                    </td>

                    {/* Col 4: 배정 차량 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {b.vehicleModel === '-' && (!b.vehiclePlate || b.vehiclePlate === '미배정') ? (
                        <span className="text-slate-400 font-medium text-[11px]">차량 미선정</span>
                      ) : (
                        <div>
                          <div className="font-bold text-slate-900 text-xs tracking-tight">
                            {b.vehiclePlate && b.vehiclePlate !== '미배정' ? b.vehiclePlate : '-'}
                          </div>
                          <div
                            className="text-[11px] text-slate-500 font-medium truncate max-w-[140px]"
                            title={b.vehicleModel}
                          >
                            {stripManufacturerName(b.vehicleModel)}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Col 5: 픽업 출발지 */}
                    <td className="py-3 px-3 text-slate-700 font-medium max-w-[150px] truncate" title={b.pickupLocation}>
                      {b.pickupLocation}
                    </td>

                    {/* Col 6: 도착 목적지 */}
                    <td className="py-3 px-3 text-slate-700 font-medium max-w-[160px] truncate" title={b.destination}>
                      <span>{b.destination}</span>
                      {b.flightNumber && (
                        <span className="ml-1 text-[10px] font-mono font-bold text-[#1E60F3]">
                          ({b.flightNumber})
                        </span>
                      )}
                    </td>

                    {/* Col 7: 배차 상태 & 일정 충돌 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex flex-col items-end sm:items-start gap-1">
                        {isAssigned && (
                          <span className="inline-flex items-center gap-1.5 font-bold text-blue-700 text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                            <span>{b.dispatchStatus}</span>
                            {b.version && b.version > 1 && (
                              <span className="text-[10px] text-slate-400 font-mono">v{b.version}</span>
                            )}
                          </span>
                        )}
                        {isUnassigned && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-800 font-extrabold text-[11px]">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>미배정</span>
                          </span>
                        )}
                        {isDraft && (
                          <span className="inline-flex items-center gap-1 font-bold text-slate-600 text-[11px]">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>작성 중</span>
                          </span>
                        )}
                        {isReconfirm && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 font-extrabold text-rose-700 text-[11px]">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                            <span>재확인 필요 (v{b.version || 2})</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 font-bold text-[11px] line-through">
                            <Ban className="w-3 h-3" />
                            <span>배차 취소</span>
                          </span>
                        )}

                        {b.hasConflict && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white font-black text-[10px]"
                            title={(b.conflictMessages || []).join('\n')}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>일정 충돌</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Col 8: 기사 확인 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {b.driverAck === '확인완료' ? (
                        <div className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          <span>확인완료</span>
                          {b.driverAckTime && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {b.driverAckTime}
                            </span>
                          )}
                        </div>
                      ) : b.driverAck === '미확인' || b.driverAck === '재확인 필요' ? (
                        <div className="flex flex-col items-end sm:items-start gap-1">
                          {b.driverAck === '미확인' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[11px]">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>기사 미확인</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-extrabold text-[11px]">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>재확인 대기 (v{b.version || 2})</span>
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            {(b.reminderCount || 0) > 0 && (
                              <span className="text-[10px] font-bold text-violet-700">
                                재알림 {b.reminderCount}회
                              </span>
                            )}
                            {onRemindDriver && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  haptics.mediumTap();
                                  onRemindDriver(b);
                                }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold cursor-pointer"
                                title="담당 기사 Cockpit에 즉시 확인 요청 알림 전송"
                              >
                                <Send className="w-2.5 h-2.5" />
                                <span>재알림</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-normal">-</span>
                      )}
                    </td>

                    {/* Col 9: 고객 안내 (소개서 + 자동 안내 문자·메일) */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex flex-col items-end sm:items-start gap-1">
                        {onOpenCustomerMessage && !isCancelled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              haptics.lightTap();
                              onOpenCustomerMessage(b);
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${
                              b.pendingCustomerTrigger
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                            }`}
                            title="배차 확정 / 기사 변경 / 픽업지 도착 고객사 안내 문자·이메일 확인 및 발송"
                          >
                            <MessageSquareText className="w-3 h-3" />
                            <span>
                              {b.pendingCustomerTrigger
                                ? b.pendingCustomerTrigger === 'arrived_pickup'
                                  ? '도착안내 준비됨'
                                  : b.pendingCustomerTrigger === 'driver_changed'
                                  ? '변경안내 준비됨'
                                  : '확정안내 준비됨'
                                : (b.customerNotifications?.length || 0) > 0
                                ? `안내발송(${b.customerNotifications!.length})`
                                : '안내메시지'}
                            </span>
                          </button>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium">
                          프로필: {b.customerBrochure}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
