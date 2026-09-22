'use client';

import React from 'react';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { Navigation, Clock, User, Plane, FileText, CheckCircle2, ChevronRight } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ScheduleCardProps {
  item: ScheduleItem;
  onNavigate: (item: ScheduleItem) => void;
  onPredict: (item: ScheduleItem) => void;
  onSelectForCockpit?: (item: ScheduleItem) => void;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  item,
  onNavigate,
  onPredict,
  onSelectForCockpit,
}) => {
  return (
    <div className="w-full bg-white rounded-2xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-md transition-all space-y-3.5 relative overflow-hidden">
      {/* Top Header: Date, Status, and Single Landing/Pickup Time Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 tracking-tight">
            {item.dateLabel}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/80">
            <CheckCircle2 className="w-3 h-3" />
            확정
          </span>
        </div>

        {/* Pure Single Time Badge (No simulation end time) */}
        <div className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-900 text-white tracking-tight shadow-xs">
          {item.time_display}
        </div>
      </div>

      {/* Address Inline Layout: 2 Rows (출발 row 1, 도착 row 2 with inline street address) */}
      <div className="relative pl-6 py-0.5 space-y-2.5">
        {/* Left Vertical Route Connector Line */}
        <div className="absolute left-2.5 top-2.5 bottom-2.5 w-[2px] bg-slate-200" />

        {/* Row 1: Departure Origin Spot Name + Road Address Inline */}
        <div className="relative flex items-center gap-2 min-w-0">
          {/* Origin Dot */}
          <div className="absolute -left-[19px] w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-600 shrink-0">
            출발
          </span>
          <span className="text-sm font-bold text-slate-900 tracking-tight shrink-0">
            {item.origin_name}
          </span>
          <span className="text-xs text-slate-400 font-normal truncate">
            {item.origin_address}
          </span>
        </div>

        {/* Row 2: Arrival Destination Spot Name + Road Address Inline */}
        <div className="relative flex items-center gap-2 min-w-0">
          {/* Destination Dot (Cobalt Accent) */}
          <div className="absolute -left-[19px] w-2.5 h-2.5 rounded-full bg-[#1E60F3] ring-2 ring-white shadow-xs" />
          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-50 text-[#1E60F3] shrink-0">
            도착
          </span>
          <span className="text-sm font-bold text-slate-900 tracking-tight shrink-0">
            {item.destination_name}
          </span>
          <span className="text-xs text-slate-400 font-normal truncate">
            {item.destination_address}
          </span>
        </div>
      </div>

      {/* Details Box: Passenger, Flight, Notes */}
      <div className="bg-slate-50/80 rounded-xl p-3 space-y-1.5 text-xs text-slate-700 border border-slate-100">
        {/* Passenger */}
        <div className="flex items-center gap-1.5 font-medium">
          <User className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
          <span className="text-slate-500 font-normal">승객:</span>
          <span className="font-bold text-slate-900 truncate">{item.passenger}</span>
        </div>

        {/* Flight (Optional) */}
        {item.flight && (
          <div className="flex items-center gap-1.5 font-medium">
            <Plane className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-slate-500 font-normal">항공편:</span>
            <span className="font-bold text-slate-900">{item.flight}</span>
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <div className="flex items-start gap-1.5 font-medium pt-0.5">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="text-slate-600 leading-snug">{item.notes}</span>
          </div>
        )}
      </div>

      {/* Card Footer: Left Route Set & Right Dual Action Floating Buttons */}
      <div className="flex items-center justify-between pt-1">
        {/* Left: One-touch Cockpit Bind */}
        {onSelectForCockpit && (
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onSelectForCockpit(item);
            }}
            className="text-xs font-bold text-slate-600 hover:text-[#1E60F3] flex items-center gap-1 cursor-pointer transition-colors py-1.5 px-2 -ml-2 rounded-lg hover:bg-slate-100"
          >
            <span>관제 대시보드 연동</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Right: Dual Action Buttons (Preserved exactly per user directive) */}
        <div className="flex items-center gap-2.5 ml-auto">
          {/* Action 1: White Circular Departure Time Picker Wheel Button (w-11 h-11) */}
          <button
            type="button"
            onClick={() => {
              haptics.mediumTap();
              onPredict(item);
            }}
            className="w-11 h-11 rounded-full bg-white hover:bg-slate-50 active:scale-90 text-slate-700 border border-slate-200/90 shadow-md flex items-center justify-center transition-all cursor-pointer relative"
            title="출발 시간 예측 (휠 피커)"
            aria-label="출발 시간 예측"
          >
            <Clock className="w-5 h-5 text-slate-700" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#1E60F3]" />
          </button>

          {/* Action 2: Solid Blue Circular Navigation Launch Button (w-11 h-11) */}
          <button
            type="button"
            onClick={() => {
              haptics.heavyTap();
              onNavigate(item);
            }}
            className="w-11 h-11 rounded-full bg-[#1E60F3] hover:bg-[#1650D6] active:scale-90 text-white shadow-lg shadow-blue-500/25 flex items-center justify-center transition-all cursor-pointer"
            title="길안내 내비 즉시 실행"
            aria-label="길안내 실행"
          >
            <Navigation className="w-5 h-5 fill-white text-white translate-x-px" />
          </button>
        </div>
      </div>
    </div>
  );
};
