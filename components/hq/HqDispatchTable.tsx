'use client';

import React from 'react';
import {
  Bus,
  Plus,
  Mail,
  AlertCircle,
  MoreHorizontal,
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
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      {/* Table Header: Title + Filter Pills + Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
              <Bus className="w-4 h-4" />
            </div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              오늘 / 내일 배차 현황
            </h2>
          </div>

          {/* Filter Pill Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/70 rounded-xl">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectTab('today');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'today'
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              오늘 전체 예약 <span className="opacity-90 font-black">18</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectTab('target');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'target'
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              배차 대상 <span className="opacity-90 font-black">12</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectTab('tomorrow');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'tomorrow'
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              내일 예약 <span className="opacity-90 font-black">8</span>
            </button>
          </div>
        </div>

        {/* New Booking Button */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenNewBooking();
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#1E60F3] text-[#1E60F3] hover:bg-blue-50 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>신규 예약 등록</span>
        </button>
      </div>

      {/* Booking Records Table */}
      <div className="overflow-x-auto pt-2">
        <table className="w-full text-left border-collapse select-none min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400">
              <th className="py-2.5 px-3 w-10 text-center">No.</th>
              <th className="py-2.5 px-3">고객명</th>
              <th className="py-2.5 px-3">픽업 시간</th>
              <th className="py-2.5 px-3">기사명</th>
              <th className="py-2.5 px-3">차량</th>
              <th className="py-2.5 px-3">목적지</th>
              <th className="py-2.5 px-3">배차 상태</th>
              <th className="py-2.5 px-3">기사 확인</th>
              <th className="py-2.5 px-3">고객 안내자료</th>
              <th className="py-2.5 px-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80 text-xs">
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                  해당 조건의 예약 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              bookings.map((b) => {
                const isAssigned = b.dispatchStatus === '배차 완료';
                const isReissueNeeded = b.customerBrochure === '재발송 필요';
                const isSent = b.customerBrochure === '발송됨';

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

                    {/* Customer */}
                    <td className="py-3 px-3 font-bold text-slate-900 group-hover:text-[#1E60F3] transition-colors truncate max-w-[120px]">
                      {b.customerName}
                    </td>

                    {/* Pickup Time */}
                    <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      {b.pickupTime}
                    </td>

                    {/* Driver */}
                    <td className="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">
                      {b.driverName === '-' ? (
                        <span className="text-slate-400 font-normal">-</span>
                      ) : (
                        b.driverName
                      )}
                    </td>

                    {/* Vehicle */}
                    <td className="py-3 px-3 text-slate-700 font-medium whitespace-nowrap">
                      {b.vehicleModel}{' '}
                      {b.vehiclePlate && b.vehiclePlate !== '미배정' && (
                        <span className="text-slate-400 text-[11px] font-semibold">
                          {b.vehiclePlate}
                        </span>
                      )}
                    </td>

                    {/* Destination */}
                    <td className="py-3 px-3 text-slate-600 font-medium truncate max-w-[130px]" title={b.destination}>
                      {b.destination}
                    </td>

                    {/* Dispatch Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isAssigned ? 'bg-[#1E60F3]' : 'bg-slate-300'
                          }`}
                        />
                        <span
                          className={`font-bold ${
                            isAssigned ? 'text-slate-800' : 'text-slate-400 font-medium'
                          }`}
                        >
                          {b.dispatchStatus}
                        </span>
                      </div>
                    </td>

                    {/* Driver Ack */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {b.driverAckTime ? (
                        <span className="text-[11px] font-semibold text-slate-600">
                          {b.driverAckTime}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">-</span>
                      )}
                    </td>

                    {/* Customer Brochure */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isReissueNeeded ? (
                        <div className="flex items-center gap-1 text-rose-500 font-bold text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>재발송 필요</span>
                        </div>
                      ) : isSent ? (
                        <div className="flex items-center gap-1 text-[#1E60F3] font-semibold text-[11px]">
                          <Mail className="w-3.5 h-3.5 shrink-0 text-[#1E60F3]" />
                          <span>발송됨</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-400 font-medium text-[11px]">
                          <Mail className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                          <span>미발송</span>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td
                      className="py-3 px-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {!isAssigned ? (
                          <button
                            type="button"
                            onClick={() => {
                              haptics.lightTap();
                              onAssignDriver(b);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E60F3] font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            기사 배정
                          </button>
                        ) : isReissueNeeded ? (
                          <button
                            type="button"
                            onClick={() => {
                              haptics.lightTap();
                              onResendBrochure(b);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[11px] transition-colors cursor-pointer"
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
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors cursor-pointer"
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
                          className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
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

      {/* Table Footer with explicit count disclosure */}
      <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>
          <strong className="text-slate-700 font-bold">{bookings.length}건</strong> 표시 / 총 18건 (배차 대상 12건)
        </span>
        <span className="text-[11px] font-medium text-slate-400">
          실시간 배차 동기화 중
        </span>
      </div>
    </div>
  );
};
