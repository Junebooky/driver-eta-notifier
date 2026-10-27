'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqDispatchTableProps {
  bookings: HqBooking[];
  activeTab: 'today' | 'target' | 'tomorrow';
  onSelectTab: (tab: 'today' | 'target' | 'tomorrow') => void;
  onOpenNewBooking: () => void;
  onViewBooking: (booking: HqBooking) => void;
  onAssignDriver: (booking: HqBooking) => void;
  onResendBrochure: (booking: HqBooking) => void;
}

export const HqDispatchTable: React.FC<HqDispatchTableProps> = ({
  bookings,
  activeTab,
  onSelectTab,
  onOpenNewBooking,
  onViewBooking,
  onAssignDriver,
  onResendBrochure,
}) => {
  // Local Filter States matching the mockup
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');

  // Reset all filters
  const handleResetFilters = () => {
    haptics.lightTap();
    setSearchQuery('');
    setStatusFilter('all');
    setDriverFilter('all');
    setVehicleFilter('all');
    setCustomerFilter('all');
  };

  // Filtered Bookings
  const filteredList = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Tab Filter
      if (activeTab === 'today' && !b.isToday) return false;
      if (activeTab === 'tomorrow' && !b.isTomorrow) return false;
      if (activeTab === 'target' && b.dispatchStatus === '배차 완료') return false;

      // 2. Search Query (Customer, BookingNo, Destination, Driver)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.customerName.toLowerCase().includes(q) ||
          b.bookingNo.toLowerCase().includes(q) ||
          b.destination.toLowerCase().includes(q) ||
          b.pickupLocation.toLowerCase().includes(q) ||
          b.driverName.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 3. Status Filter
      if (statusFilter !== 'all' && b.dispatchStatus !== statusFilter) return false;

      // 4. Driver Filter
      if (driverFilter !== 'all' && b.driverName !== driverFilter) return false;

      // 5. Vehicle Filter
      if (vehicleFilter !== 'all' && b.vehicleModel !== vehicleFilter) return false;

      // 6. Customer Filter
      if (customerFilter !== 'all' && b.customerName !== customerFilter) return false;

      return true;
    });
  }, [bookings, activeTab, searchQuery, statusFilter, driverFilter, vehicleFilter, customerFilter]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      {/* 1. Header: Icon + Title + Blue "+ 신규 예약 등록" Button */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 border border-blue-100/60">
            <Calendar className="w-4 h-4" />
          </div>
          <h2 className="text-base font-black text-slate-900 tracking-tight">
            예약 목록
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenNewBooking();
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>신규 예약 등록</span>
        </button>
      </div>

      {/* 2. Date Tabs (오늘 예약 18 / 내일 예약 12 / 전체 예약) */}
      <div className="pt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('today');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'today'
              ? 'bg-[#1E60F3] text-white shadow-xs'
              : 'bg-slate-100/70 hover:bg-slate-200/70 text-slate-600'
          }`}
        >
          <span>오늘 예약</span>
          <span className="font-black">18</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('tomorrow');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'tomorrow'
              ? 'bg-[#1E60F3] text-white shadow-xs'
              : 'bg-slate-100/70 hover:bg-slate-200/70 text-slate-600'
          }`}
        >
          <span>내일 예약</span>
          <span className="font-black">12</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('target');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'target'
              ? 'bg-[#1E60F3] text-white shadow-xs'
              : 'bg-slate-100/70 hover:bg-slate-200/70 text-slate-600'
          }`}
        >
          전체 예약
        </button>
      </div>

      {/* 3. Filter Row: Search + 4 Dropdowns + 초기화 */}
      <div className="pt-3 pb-1 flex flex-wrap items-center gap-2 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] sm:min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="고객명, 예약번호, 목적지 검색..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 font-medium focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Dropdown 1: 전체 상태 */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 상태</option>
          <option value="배차 완료">배차 완료</option>
          <option value="미배정">미배정</option>
          <option value="작성 중">작성 중</option>
          <option value="재확인 필요">재확인 필요</option>
        </select>

        {/* Dropdown 2: 전체 기사 */}
        <select
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 기사</option>
          <option value="김기사">김기사</option>
          <option value="이기사">이기사</option>
          <option value="박기사">박기사</option>
          <option value="최기사">최기사</option>
          <option value="정기사">정기사</option>
        </select>

        {/* Dropdown 3: 전체 차량 */}
        <select
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 차량</option>
          <option value="G90">G90</option>
          <option value="Staria 9">Staria 9</option>
          <option value="Sprinter">Sprinter</option>
          <option value="G90 LWB">G90 LWB</option>
          <option value="Carnival HL">Carnival HL</option>
          <option value="Staria 10">Staria 10</option>
        </select>

        {/* Dropdown 4: 전체 고객사 */}
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 고객사</option>
          <option value="A전자">A전자</option>
          <option value="B바이오">B바이오</option>
          <option value="C무역">C무역</option>
          <option value="D컨설팅">D컨설팅</option>
          <option value="E엔터테인먼트">E엔터테인먼트</option>
          <option value="F금융">F금융</option>
          <option value="G호텔">G호텔</option>
          <option value="H의료재단">H의료재단</option>
          <option value="I패션">I패션</option>
          <option value="J정부기관">J정부기관</option>
        </select>

        {/* 초기화 버튼 */}
        <button
          type="button"
          onClick={handleResetFilters}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg font-bold transition-all cursor-pointer"
        >
          <RotateCcw className="w-3 h-3 text-slate-400" />
          <span>초기화</span>
        </button>
      </div>

      {/* 4. Full 11-Column Booking Table */}
      <div className="overflow-x-auto pt-2">
        <table className="w-full text-left border-collapse select-none min-w-[880px]">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 bg-slate-50/50">
              <th className="py-2.5 px-3 w-10 text-center">No.</th>
              <th className="py-2.5 px-3">고객명</th>
              <th className="py-2.5 px-3">픽업 시간</th>
              <th className="py-2.5 px-3">기사명</th>
              <th className="py-2.5 px-3">차량</th>
              <th className="py-2.5 px-3">픽업지</th>
              <th className="py-2.5 px-3">목적지</th>
              <th className="py-2.5 px-3">배차 상태</th>
              <th className="py-2.5 px-3">기사 확인</th>
              <th className="py-2.5 px-3">고객 안내자료</th>
              <th className="py-2.5 px-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80 text-xs">
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400 font-medium">
                  조건에 일치하는 예약 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filteredList.slice(0, 10).map((b) => {
                const isAssigned = b.dispatchStatus === '배차 완료';
                const isUnassigned = b.dispatchStatus === '미배정';
                const isDraft = b.dispatchStatus === '작성 중';
                const isReconfirm = b.dispatchStatus === '재확인 필요';

                return (
                  <tr
                    key={b.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => onViewBooking(b)}
                  >
                    {/* No. */}
                    <td className="py-3 px-3 text-center text-slate-400 font-semibold text-[11px]">
                      {b.no}
                    </td>

                    {/* 고객명 */}
                    <td className="py-3 px-3 font-bold text-slate-900 group-hover:text-[#1E60F3] transition-colors whitespace-nowrap">
                      {b.customerName}
                    </td>

                    {/* 픽업 시간 */}
                    <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      {b.pickupTime}
                    </td>

                    {/* 기사명 */}
                    <td className="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">
                      {b.driverName === '-' ? (
                        <span className="text-slate-400 font-normal">-</span>
                      ) : (
                        b.driverName
                      )}
                    </td>

                    {/* 차량 */}
                    <td className="py-3 px-3 text-slate-700 font-medium whitespace-nowrap">
                      {b.vehicleModel === '-' ? (
                        <span className="text-slate-400 font-normal">-</span>
                      ) : (
                        b.vehicleModel
                      )}
                    </td>

                    {/* 픽업지 */}
                    <td className="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                      {b.pickupLocation}
                    </td>

                    {/* 목적지 */}
                    <td className="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                      {b.destination}
                    </td>

                    {/* 배차 상태 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isAssigned && (
                        <span className="inline-flex items-center gap-1.5 font-bold text-blue-700 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                          <span>배차 완료</span>
                        </span>
                      )}
                      {isUnassigned && (
                        <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full border border-slate-300" />
                          <span>미배정</span>
                        </span>
                      )}
                      {isDraft && (
                        <span className="inline-flex items-center gap-1 font-bold text-blue-600 text-[11px]">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          <span>작성 중</span>
                        </span>
                      )}
                      {isReconfirm && (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-600 text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                          <span>재확인 필요</span>
                        </span>
                      )}
                    </td>

                    {/* 기사 확인 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {b.driverAck === '확인완료' ? (
                        <div className="flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>확인완료</span>
                          {b.driverAckTime && (
                            <span className="text-[10px] text-slate-400 font-medium ml-1">
                              {b.driverAckTime}
                            </span>
                          )}
                        </div>
                      ) : b.driverAck === '미확인' ? (
                        <div className="flex items-center gap-1 text-amber-500 font-bold text-[11px]">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>미확인</span>
                        </div>
                      ) : b.driverAck === '재확인 필요' ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 flex items-center gap-1 w-fit">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          <span>재확인 요청</span>
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">-</span>
                      )}
                    </td>

                    {/* 고객 안내자료 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {b.customerBrochure === '발송됨' ? (
                        <span className="text-slate-600 font-medium text-[11px]">
                          발송됨
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium text-[11px]">
                          미발송
                        </span>
                      )}
                    </td>

                    {/* 작업 */}
                    <td
                      className="py-3 px-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-2">
                        {isUnassigned ? (
                          <button
                            type="button"
                            onClick={() => {
                              haptics.lightTap();
                              onAssignDriver(b);
                            }}
                            className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                          >
                            기사 배정
                          </button>
                        ) : isDraft ? (
                          <button
                            type="button"
                            onClick={() => {
                              haptics.lightTap();
                              onResendBrochure(b);
                            }}
                            className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                          >
                            재발송
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              haptics.lightTap();
                              onViewBooking(b);
                            }}
                            className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                          >
                            보기
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            onViewBooking(b);
                          }}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="상세 옵션"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
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
