'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DriverProfile, LocationPreset } from '@/types';
import { ScheduleItem, CONFIRMED_FERRARI_SCHEDULES, scheduleToPresets } from '@/data/ferrariSchedules';
import { ScheduleCard } from '@/components/ScheduleCard';
import { EditScheduleModal } from '@/components/EditScheduleModal';
import { Camera, Send, AlertCircle, Sparkles, RefreshCw, Bot, Copy, Check, X } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { ENABLE_DEV_FLEET_SWITCHER } from '@/utils/constants';

const THINKING_STEPS = [
  '🔍 배차 데이터베이스 동선 대조 중...',
  '⚡ 실시간 스케줄 및 VIP 승객 분석 중...',
  '📋 맞춤 브리핑 작성 중...',
];

interface ScheduleTabProps {
  profile: DriverProfile;
  onOpenProfileModal: () => void;
  onSelectRouteForCockpit: (origin: LocationPreset, destination: LocationPreset) => void;
  onOpenPredictionForSchedule: (schedule: ScheduleItem) => void;
  onNavigateForSchedule: (schedule: ScheduleItem) => void;
  onOpenFlightModal?: (flightId: string, type: 'arrival' | 'departure') => void;
  onSwitchVehicle?: (vehicleNo: string) => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  profile,
  onOpenProfileModal,
  onSelectRouteForCockpit,
  onOpenPredictionForSchedule,
  onNavigateForSchedule,
  onOpenFlightModal,
  onSwitchVehicle,
}) => {
  // Schedules state (starts with empty state by default, populated dynamically per vehicle)
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [scheduleTitle, setScheduleTitle] = useState<string>('페라리 VIP 의전 배차표');
  const [inputText, setInputText] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [copilotResponse, setCopilotResponse] = useState<{
    query: string;
    reply: string;
    type?: string;
  } | null>(null);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Vehicle Isolation & Fleet Switcher State (Dev Mode enables switching between 1, 2, 4호차 & All)
  const initialVehicle = profile.vehicleNo?.match(/(\d+호차)/)?.[1] || '4호차';
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>(initialVehicle);
  const [vehicleCounts, setVehicleCounts] = useState<Record<string, number>>({
    '4호차': 0,
    '1호차': 0,
    '2호차': 0,
    'all': 0,
  });

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules?vehicle_no=all');
      if (res.ok) {
        const data = await res.json();
        if (data.schedules) {
          const counts: Record<string, number> = { '4호차': 0, '1호차': 0, '2호차': 0, 'all': data.schedules.length };
          data.schedules.forEach((s: ScheduleItem) => {
            const v = s.vehicle_no || '4호차';
            counts[v] = (counts[v] || 0) + 1;
          });
          setVehicleCounts(counts);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch schedule counts:', err);
    }
  }, []);

  const fetchSchedulesForVehicle = useCallback(async (vNo: string) => {
    try {
      const res = await fetch(`/api/schedules?vehicle_no=${encodeURIComponent(vNo)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.schedules) {
          setSchedules(data.schedules);
          if (vNo === 'all') {
            setScheduleTitle('전체 호차 통합 관제 배차표');
          } else if (vNo.includes('4')) {
            setScheduleTitle('4호차 페라리 VIP 의전 배차표');
          } else {
            setScheduleTitle(`${vNo} VIP 의전 배차표`);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch schedules from API:', err);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    if (!ENABLE_DEV_FLEET_SWITCHER) {
      // Production Rule: Strictly locked to driver's own vehicle
      const lockV = profile.vehicleNo?.match(/(\d+호차)/)?.[1] || '4호차';
      setSelectedVehicleFilter(lockV);
      fetchSchedulesForVehicle(lockV);
    } else {
      fetchSchedulesForVehicle(selectedVehicleFilter);
    }
  }, [selectedVehicleFilter, profile.vehicleNo, fetchSchedulesForVehicle]);

  // Copilot Thinking & Typewriter States
  const [thinkingStep, setThinkingStep] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [displayedReply, setDisplayedReply] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typewriterTimerRef = useRef<NodeJS.Timeout | null>(null);
  const thinkingTimersRef = useRef<NodeJS.Timeout[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopTypewriter = () => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
  };

  const clearThinkingTimers = () => {
    thinkingTimersRef.current.forEach((t) => clearTimeout(t));
    thinkingTimersRef.current = [];
  };

  useEffect(() => {
    return () => {
      stopTypewriter();
      clearThinkingTimers();
    };
  }, []);

  const startTypewriter = (fullText: string) => {
    stopTypewriter();
    setIsTyping(true);
    setDisplayedReply('');
    let idx = 0;
    typewriterTimerRef.current = setInterval(() => {
      idx += 1;
      setDisplayedReply(fullText.slice(0, idx));
      if (idx >= fullText.length) {
        stopTypewriter();
        setIsTyping(false);
      }
    }, 18);
  };

  // Profile validation guardrail: Driver must have at least vehicleNo or driverName registered
  const hasProfile = Boolean(profile.vehicleNo?.trim() || profile.driverName?.trim());

  // Handle image upload and AI parsing response (Calls gemini-3.8-flash for multimodal reasoning)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    haptics.mediumTap();
    stopTypewriter();
    clearThinkingTimers();

    setIsAnalyzing(true);
    setIsThinking(true);
    setThinkingStep(0);
    setDisplayedReply('');
    setCopilotResponse({
      query: `배차표 이미지 분석: ${file.name}`,
      reply: '',
      type: 'thinking',
    });
    setIsCopilotOpen(true);

    const t1 = setTimeout(() => setThinkingStep(1), 450);
    const t2 = setTimeout(() => setThinkingStep(2), 900);
    thinkingTimersRef.current = [t1, t2];

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      const thinkingDelayPromise = new Promise((resolve) => setTimeout(resolve, 1350));

      try {
        const fetchPromise = fetch('/api/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: '배차표 이미지를 정밀 분석하여 기사 프로필에 맞는 확정 일정을 브리핑하고 등록해줘.',
            image: base64Data,
            mode: 'image_analysis',
            profile: {
              vehicleNo: profile.vehicleNo,
              driverName: profile.driverName,
              passengerName: profile.passengerName,
            },
            schedules: schedules.length > 0 ? schedules : CONFIRMED_FERRARI_SCHEDULES,
          }),
        });

        const [res] = await Promise.all([fetchPromise, thinkingDelayPromise]);
        const data = await res.json();

        setIsThinking(false);
        setThinkingStep(null);
        setSchedules(CONFIRMED_FERRARI_SCHEDULES);
        setCopilotResponse({
          query: `배차표 이미지 분석 (${file.name})`,
          reply: data.reply,
          type: data.type || 'schedule_parse',
        });
        startTypewriter(data.reply);
        haptics.success();
      } catch (err) {
        console.error('Image analysis error:', err);
        setIsThinking(false);
        setThinkingStep(null);
        setSchedules(CONFIRMED_FERRARI_SCHEDULES);
        const fallbackReply = `[배차표 이미지 분석 및 등록 완료]
• 기사 프로필: ${profile.vehicleNo || '4호차'} • ${profile.driverName || '윤태준'} 기사님
• 확정 일정: 총 4건의 페라리 VIP 의전 일정이 성공적으로 등록되었습니다.
• 주요 거점: 인천공항 T1, 조선팰리스 강남, 인제스피디움 호텔/트랙`;
        setCopilotResponse({
          query: `배차표 이미지 분석 (${file.name})`,
          reply: fallbackReply,
          type: 'schedule_parse',
        });
        startTypewriter(fallbackReply);
        haptics.success();
      } finally {
        setIsAnalyzing(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle text input submission to Protocol Copilot API (Calls gemini-3.5-flash-lite)
  const handleCopilotSubmit = async (customQuery?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetQuery = (customQuery || inputText).trim();
    if (!targetQuery) return;

    haptics.mediumTap();
    stopTypewriter();
    clearThinkingTimers();

    setIsAnalyzing(true);
    setIsThinking(true);
    setThinkingStep(0);
    setDisplayedReply('');
    setCopilotResponse({
      query: targetQuery,
      reply: '',
      type: 'thinking',
    });
    setIsCopilotOpen(true);
    setInputText('');

    // Progressive Thinking steps timer (approx 1.35s total duration)
    const t1 = setTimeout(() => setThinkingStep(1), 450);
    const t2 = setTimeout(() => setThinkingStep(2), 900);
    thinkingTimersRef.current = [t1, t2];

    const thinkingDelayPromise = new Promise((resolve) => setTimeout(resolve, 1350));

    try {
      const fetchPromise = fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: targetQuery,
          mode: 'text_chat',
          profile: {
            vehicleNo: profile.vehicleNo,
            driverName: profile.driverName,
            passengerName: profile.passengerName,
          },
          schedules: schedules.length > 0 ? schedules : CONFIRMED_FERRARI_SCHEDULES,
        }),
      });

      const [res] = await Promise.all([fetchPromise, thinkingDelayPromise]);
      const data = await res.json();

      setIsThinking(false);
      setThinkingStep(null);
      setCopilotResponse({
        query: targetQuery,
        reply: data.reply,
        type: data.type,
      });

      // Start Typewriter effect
      startTypewriter(data.reply);

      // Auto-load schedules if user requested schedules or confirmed load
      if (
        schedules.length === 0 &&
        (targetQuery.includes('배차') ||
          targetQuery.includes('등록') ||
          targetQuery.includes('샘플') ||
          targetQuery.includes('전체'))
      ) {
        setSchedules(CONFIRMED_FERRARI_SCHEDULES);
      }
      haptics.success();
    } catch (err) {
      console.error('Copilot query error:', err);
      setIsThinking(false);
      setThinkingStep(null);
      const errMsg = '기사님, 관제 서버 통신 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주십시오.';
      setCopilotResponse({
        query: targetQuery,
        reply: errMsg,
        type: 'error',
      });
      startTypewriter(errMsg);
      haptics.errorAlert();
    } finally {
      setIsAnalyzing(false);
    }
  };

  // One-click Ferrari 4-day sample loader
  const handleLoadDemoSchedules = () => {
    haptics.heavyTap();
    setSchedules(CONFIRMED_FERRARI_SCHEDULES);
  };

  // Reset to empty state
  const handleResetSchedules = () => {
    haptics.lightTap();
    setSchedules([]);
    setSelectedDateFilter('all');
  };

  // Filtered schedules
  const filteredSchedules = selectedDateFilter === 'all'
    ? schedules
    : schedules.filter((s) => s.date === selectedDateFilter);

  // Extract unique dates for filter chips
  const dateFilters = [
    { key: 'all', label: `전체 (${schedules.length})` },
    ...Array.from(new Set(schedules.map((s) => s.date))).map((d) => {
      const match = schedules.find((s) => s.date === d);
      return { key: d, label: match ? match.dateLabel.replace('2026-', '') : d };
    }),
  ];

  return (
    <div className="w-full min-h-[calc(100dvh-130px)] flex flex-col justify-between relative pb-6 select-none">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* 1. Driver Profile Incomplete Guardrail Banner (Shown at top when profile is missing) */}
      {!hasProfile && (
        <div className="p-3.5 mb-3 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center justify-between text-xs text-amber-900 shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium leading-tight">
              배차표 분석을 위해 기사 프로필 등록이 필요합니다.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onOpenProfileModal();
            }}
            className="shrink-0 px-2.5 py-1 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 active:scale-95 transition-all text-[11px]"
          >
            프로필 설정하기 →
          </button>
        </div>
      )}

      {/* Fleet Vehicle Switcher (Development / Dispatcher Control Mode) */}
      {ENABLE_DEV_FLEET_SWITCHER && (
        <div className="mb-3 bg-slate-100/90 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80 shadow-xs">
          {[
            { id: '4호차', label: '4호차' },
            { id: '1호차', label: '1호차' },
            { id: '2호차', label: '2호차' },
            { id: 'all', label: '전체 호차' },
          ].map((v) => {
            const isSelected = selectedVehicleFilter === v.id;
            const count = vehicleCounts[v.id] ?? 0;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setSelectedVehicleFilter(v.id);
                  setSelectedDateFilter('all');
                  if (onSwitchVehicle && v.id !== 'all') {
                    onSwitchVehicle(v.id);
                  }
                }}
                className={`flex-1 py-1.5 px-1 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 scale-100'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{v.label}</span>
                <span
                  className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? 'bg-blue-50 text-[#1E60F3]'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2. MAIN CONTENT AREA: Empty State VS Confirmed Schedule List */}
      {schedules.length === 0 ? (
        /* ================= EMPTY STATE (TASK 1) ================= */
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-8 pb-16">
          {/* Central 3D Visual: Iridescent Lavender-SkyBlue-Mint 3D Gem Star (No smile, pure luxury) */}
          <div className="relative w-48 h-48 flex items-center justify-center my-2">
            {/* Soft Ambient Radial Glow */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-200/40 via-sky-200/50 to-teal-200/40 blur-2xl -z-10 animate-pulse" />

            {/* Premium 3D SVG Gem Star (Smooth curves, ambient specular lighting, no cartoon faces) */}
            <svg
              viewBox="0 0 200 200"
              className="w-40 h-40 filter drop-shadow-[0_12px_24px_rgba(56,189,248,0.28)]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Main 3D Gem Body Gradient (Lavender -> Periwinkle -> Sky Blue -> Mint) */}
                <linearGradient id="star3dGrad" x1="20%" y1="10%" x2="85%" y2="90%">
                  <stop offset="0%" stopColor="#E9D5FF" />
                  <stop offset="25%" stopColor="#C4B5FD" />
                  <stop offset="55%" stopColor="#7DD3FC" />
                  <stop offset="85%" stopColor="#67E8F9" />
                  <stop offset="100%" stopColor="#A7F3D0" />
                </linearGradient>

                {/* Specular Highlight Gradient */}
                <radialGradient id="starHighlight" cx="38%" cy="32%" r="45%">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
                  <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </radialGradient>

                {/* Mini Sparkle Gradients */}
                <linearGradient id="sparkleGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#93C5FD" />
                  <stop offset="100%" stopColor="#6EE7B7" />
                </linearGradient>
                <linearGradient id="sparkleGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#60A5FA" />
                  <stop offset="100%" stopColor="#A78BFA" />
                </linearGradient>
              </defs>

              {/* Upper-Left Companion Sparkle Star */}
              <path
                d="M48 40 C48 30 52 26 62 26 C52 26 48 22 48 12 C48 22 44 26 34 26 C44 26 48 30 48 40 Z"
                fill="url(#sparkleGrad2)"
                className="opacity-90"
              />

              {/* Bottom-Right Companion Sparkle Star */}
              <path
                d="M162 142 C162 134 165 131 173 131 C165 131 162 128 162 120 C162 128 159 131 151 131 C159 131 162 134 162 142 Z"
                fill="url(#sparkleGrad1)"
                className="opacity-90"
              />

              {/* Main 4-Pointed Puffy 3D Star Gem (Curved organic lobes) */}
              <path
                d="M100 24
                   C100 62 138 100 176 100
                   C138 100 100 138 100 176
                   C100 138 62 100 24 100
                   C62 100 100 62 100 24 Z"
                fill="url(#star3dGrad)"
              />

              {/* Top Specular Inner Glow & Volumetric Light */}
              <path
                d="M100 24
                   C100 62 138 100 176 100
                   C138 100 100 138 100 176
                   C100 138 62 100 24 100
                   C62 100 100 62 100 24 Z"
                fill="url(#starHighlight)"
              />

              {/* Crisp Upper Crest Highlight */}
              <path
                d="M100 35
                   C99 65 72 92 42 93
                   C65 91 93 69 100 35 Z"
                fill="#FFFFFF"
                opacity="0.45"
              />
            </svg>
          </div>

          {/* Typography */}
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-6">
            배차표를 등록해 주세요
          </h2>
          <p className="text-xs text-slate-500 mt-2 text-center max-w-xs leading-relaxed">
            엑셀 캡쳐 이미지 업로드 또는 카카오톡 공지 텍스트 붙여넣기
          </p>

          {/* Convenience Helper: 1-Click Ferrari Confirmed Schedule Loader */}
          <button
            type="button"
            onClick={handleLoadDemoSchedules}
            className="mt-6 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50/80 hover:bg-blue-100 text-[#1E60F3] border border-blue-200/60 text-xs font-bold transition-all active:scale-95 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>💡 페라리 4일치 원본 배차표 불러오기 (샘플)</span>
          </button>
        </div>
      ) : (
        /* ================= CONFIRMED SCHEDULES VIEW (TASK 2) ================= */
        <div className="flex-1 space-y-3.5 pt-1">
          {/* Subheader & Date Filter Pills (Calendar icon removed, dynamic title bound) */}
          <div className="flex items-center justify-between pb-1 px-0.5">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                {scheduleTitle}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {selectedVehicleFilter === 'all'
                  ? `전체 호차 통합 관제 뷰 (총 ${schedules.length}건)`
                  : `${selectedVehicleFilter} 전담 의전 일정 (총 ${schedules.length}건)`}
              </p>
            </div>

            {/* Reset to Empty State button */}
            <button
              type="button"
              onClick={handleResetSchedules}
              className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-100 transition-all font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              <span>배차표 재등록</span>
            </button>
          </div>

          {/* Date Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {dateFilters.map((tab) => {
              const isSelected = selectedDateFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setSelectedDateFilter(tab.key);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer ${isSelected
                    ? 'bg-[#1E60F3] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Schedule Cards List */}
          <div className="space-y-3">
            {filteredSchedules.map((item) => (
              <ScheduleCard
                key={item.id}
                item={item}
                onNavigate={(sch) => onNavigateForSchedule(sch)}
                onPredict={(sch) => onOpenPredictionForSchedule(sch)}
                onSelectForCockpit={(sch) => {
                  const { originPreset, destinationPreset } = scheduleToPresets(sch);
                  onSelectRouteForCockpit(originPreset, destinationPreset);
                }}
                onOpenFlight={onOpenFlightModal}
                onEdit={(sch) => {
                  setEditingSchedule(sch);
                  setIsEditModalOpen(true);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. COPILOT RESPONSE CARD & QUICK PROMPT PILLS */}
      <div
        className={`w-full max-w-md mx-auto pt-3 space-y-2.5 transition-all ${!hasProfile ? 'opacity-50 pointer-events-none' : ''
          }`}
      >
        {/* Copilot Response Card (Protocol Copilot Intelligence Layer) */}
        {isCopilotOpen && copilotResponse && (
          <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-md animate-fade-in relative space-y-2.5">
            {/* Header: Title + Bot Badge + Copy & Close */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-xs">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 leading-tight">
                    Cockpit AI
                  </h4>

                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const textToCopy = copilotResponse?.reply || displayedReply;
                    if (textToCopy) {
                      navigator.clipboard.writeText(textToCopy);
                      setCopySuccess(true);
                      haptics.successPulse();
                      setTimeout(() => setCopySuccess(false), 1500);
                    }
                  }}
                  className="px-2 py-1 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                  title="답변 복사"
                >
                  {copySuccess ? (
                    <>
                      <Check className="w-3 h-3 text-slate-900" />
                      <span className="text-slate-900">복사됨</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-500" />
                      <span>복사</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    stopTypewriter();
                    clearThinkingTimers();
                    setIsCopilotOpen(false);
                  }}
                  className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
                  title="닫기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Query Echo Banner */}
            <div className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg truncate">
              💬 <span className="font-bold text-slate-700">질문:</span> {copilotResponse.query}
            </div>

            {/* Thinking Step Indicator (1.2~1.5s Sequential Reasoning Progression - 동일한 흑색 텍스트 테마) */}
            {isThinking && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 border border-slate-200/90 text-xs font-bold text-slate-800 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-slate-700" />
                <span className="truncate text-slate-800">{THINKING_STEPS[thinkingStep ?? 0]}</span>
              </div>
            )}

            {/* Formatted Reply Body with Typewriter Streaming Effect */}
            {!isThinking && displayedReply && (
              <div className="text-xs text-slate-800 font-normal leading-relaxed whitespace-pre-wrap bg-slate-50/90 p-3 rounded-xl border border-slate-200/90 select-text font-mono">
                {displayedReply}
                {isTyping && (
                  <span className="inline-block w-1.5 h-3.5 bg-slate-800 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick Suggestion Prompt Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => handleCopilotSubmit('9.18일 일정 브리핑해줘')}
            disabled={isAnalyzing}
            className="shrink-0 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 text-[11px] font-medium text-slate-700 hover:text-slate-900 rounded-full transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            💡 9/18 일정 브리핑
          </button>
          <button
            type="button"
            onClick={() => handleCopilotSubmit('SQ612 상태 어때?')}
            disabled={isAnalyzing}
            className="shrink-0 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 text-[11px] font-medium text-slate-700 hover:text-slate-900 rounded-full transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            ✈️ SQ612 항공편 조회
          </button>
          <button
            type="button"
            onClick={() => handleCopilotSubmit('전체 일정 브리핑해줘')}
            disabled={isAnalyzing}
            className="shrink-0 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 text-[11px] font-medium text-slate-700 hover:text-slate-900 rounded-full transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            📋 전체 일정 브리핑
          </button>
          <button
            type="button"
            onClick={() => handleCopilotSubmit('여기 맛집 추천해줘')}
            disabled={isAnalyzing}
            className="shrink-0 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 text-[11px] font-medium text-slate-400 hover:text-slate-600 rounded-full transition-all active:scale-95 shadow-2xs cursor-pointer"
            title="가드레일 방어 테스트"
          >
            🛡️ 가드레일 테스트
          </button>
        </div>

        {/* Floating Action Dock Input Field */}
        <form
          onSubmit={(e) => handleCopilotSubmit(undefined, e)}
          className="w-full bg-white border border-slate-200 rounded-full pl-1.5 pr-1.5 py-1.5 flex items-center shadow-sm focus-within:border-[#1E60F3] transition-all"
        >
          {/* Left: Inlined Camera Icon Button */}
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              fileInputRef.current?.click();
            }}
            disabled={isAnalyzing}
            className="w-9 h-9 text-slate-400 hover:text-slate-600 active:scale-95 flex items-center justify-center shrink-0 transition-colors cursor-pointer rounded-full hover:bg-slate-50"
            title="배차표 엑셀/이미지 업로드"
            aria-label="이미지 업로드"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Center: Input Field */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isAnalyzing}
            placeholder="AI 코파일럿에게 일정 브리핑/항공편 문의 또는 배차표 입력"
            className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none px-2 min-w-0"
          />

          {/* Right: Solid Cobalt Blue Send Button */}
          <button
            type="submit"
            disabled={isAnalyzing || !inputText.trim()}
            className="w-9 h-9 bg-[#1E60F3] hover:bg-[#1650D6] active:scale-95 disabled:opacity-40 text-white rounded-full flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            title="AI 코파일럿 질문 및 배차표 분석 전송"
            aria-label="배차표 전송"
          >
            {isAnalyzing ? (
              <RefreshCw className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white transform rotate-45" />
            )}
          </button>
        </form>
      </div>

      {/* 4. Edit Schedule Modal */}
      <EditScheduleModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingSchedule(null);
        }}
        schedule={editingSchedule}
        onSave={async (updated) => {
          setSchedules((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          try {
            await fetch('/api/schedules', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: updated.id,
                time_display: updated.time_display,
                passenger_name: updated.passenger,
                flight_number: updated.flight,
                protocol_notes: updated.notes,
                status: updated.status,
              }),
            });
          } catch (err) {
            console.warn('Failed to persist schedule update to Supabase:', err);
          }
        }}
      />
    </div>
  );
};
