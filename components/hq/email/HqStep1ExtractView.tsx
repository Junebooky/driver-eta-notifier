'use client';

import React from 'react';
import {
  Sparkles,
  Paperclip,
  FileText,
  FileSpreadsheet,
  ArrowRight,
  Edit3,
  Calendar,
  Clock,
  MapPin,
  Plane,
  Users,
  Car,
  MessageSquare,
  Building2,
} from 'lucide-react';
import { ReferenceEmailItem } from './emailReferenceData';
import { haptics } from '@/utils/haptics';

interface HqStep1ExtractViewProps {
  emailItem: ReferenceEmailItem;
  onProceedToBooking: () => void;
  onSaveModifiedDraft?: () => void;
}

export const HqStep1ExtractView: React.FC<HqStep1ExtractViewProps> = ({
  emailItem,
  onProceedToBooking,
  onSaveModifiedDraft,
}) => {
  const { summary, detail, extractedDraft } = emailItem;

  const handleRegisterClick = () => {
    haptics.success();
    onProceedToBooking();
  };

  const handleSaveClick = () => {
    haptics.lightTap();
    onSaveModifiedDraft?.();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* 1. Left Sub-Column: Original Safe Email Viewer */}
      <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[640px]">
        {/* Email Header */}
        <div className="p-5 border-b border-slate-100 bg-white">
          <h2 className="text-base font-black text-slate-900 leading-snug">
            {detail.subject}
          </h2>

          <div className="mt-3 flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full ${emailItem.avatarBg} ${emailItem.avatarTextColor} font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs`}
            >
              {emailItem.avatarInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">
                  {detail.from.name}
                </span>
                <span className="text-[11px] text-slate-400 truncate">
                  &lt;{detail.from.address}&gt;
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                To: {detail.to.join(', ')}
              </div>
            </div>
          </div>
        </div>

        {/* Email Body */}
        <div className="p-5 flex-1 overflow-y-auto font-sans text-xs text-slate-700 leading-relaxed whitespace-pre-line selection:bg-blue-100">
          {detail.bodyText}
        </div>

        {/* Attachments Section */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2.5">
            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
            <span>첨부 파일 (2)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-blue-400 transition-colors cursor-pointer group">
              <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <div className="text-[11px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                  Flight Itinerary.pdf
                </div>
                <div className="text-[9px] text-slate-400">1.2 MB</div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-emerald-400 transition-colors cursor-pointer group">
              <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <div className="text-[11px] font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                  Guest List.xlsx
                </div>
                <div className="text-[9px] text-slate-400">850 KB</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Right Sub-Column: AI Extraction Card */}
      <div className="lg:col-span-6 bg-white rounded-2xl border border-blue-200/90 shadow-md p-5 flex flex-col justify-between min-h-[640px] relative overflow-hidden">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4 fill-[#1E60F3]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  AI가 추출한 예약 정보
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">
                  Gemini AI 실시간 구조화 완료
                </p>
              </div>
            </div>

            <button
              type="button"
              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold transition-all cursor-pointer"
            >
              원문과 비교
            </button>
          </div>

          {/* Key-Value Extracted Table */}
          <div className="mt-4 divide-y divide-slate-100 text-xs">
            {/* 고객사 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>고객사</span>
              </div>
              <div className="font-extrabold text-slate-900 text-right">
                {detail.from.name}
              </div>
            </div>

            {/* 운행 날짜 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>운행 날짜</span>
              </div>
              <div className="font-extrabold text-slate-900 text-right">
                {extractedDraft.pickupDate === '2026-10-28'
                  ? '2026. 10. 28. (수)'
                  : extractedDraft.pickupDate}
              </div>
            </div>

            {/* 픽업 시간 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>픽업 시간</span>
              </div>
              <div className="font-extrabold text-slate-900 text-right">
                {extractedDraft.pickupTime}
              </div>
            </div>

            {/* 픽업 위치 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <MapPin className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>픽업 위치</span>
              </div>
              <div className="font-extrabold text-slate-900 text-right">
                {extractedDraft.pickupLocation}
              </div>
            </div>

            {/* 목적지 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>목적지</span>
              </div>
              <div className="font-extrabold text-slate-900 text-right">
                {extractedDraft.dropoffLocation}
              </div>
            </div>

            {/* 탑승객 수 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>탑승객 수</span>
              </div>
              <div className="font-extrabold text-slate-900 text-right">
                {extractedDraft.passengerCount}명
              </div>
            </div>

            {/* 항공편명 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <Plane className="w-3.5 h-3.5 text-slate-400" />
                <span>항공편명</span>
              </div>
              <div className="font-extrabold text-blue-600 text-right">
                {extractedDraft.flightNumber || '정보 없음'}
              </div>
            </div>

            {/* 요청 차종 */}
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                <Car className="w-3.5 h-3.5 text-slate-400" />
                <span>요청 차종</span>
              </div>
              <div className="flex items-center gap-1.5 justify-end flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1E60F3] border border-blue-200 text-[11px] font-bold">
                  스프린터 1대
                </span>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1E60F3] border border-blue-200 text-[11px] font-bold">
                  G90 1대
                </span>
              </div>
            </div>

            {/* 특이사항 */}
            <div className="py-2.5 flex items-start justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-semibold w-28 shrink-0">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <span>특이사항</span>
              </div>
              <div className="font-bold text-slate-800 text-right leading-snug">
                {extractedDraft.specialRequests || '특이사항 없음'}
              </div>
            </div>
          </div>
        </div>

        {/* Big Sparkle Icon Accent in lower corner */}
        <div className="absolute right-6 bottom-20 pointer-events-none opacity-20">
          <Sparkles className="w-16 h-16 text-blue-500" />
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 z-10">
          <button
            type="button"
            onClick={handleSaveClick}
            className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
            <span>수정 후 저장</span>
          </button>

          <button
            type="button"
            onClick={handleRegisterClick}
            className="px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>예약으로 등록</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
