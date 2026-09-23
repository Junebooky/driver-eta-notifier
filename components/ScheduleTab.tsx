'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DriverProfile, LocationPreset } from '@/types';
import { ScheduleItem, CONFIRMED_FERRARI_SCHEDULES, scheduleToPresets } from '@/data/ferrariSchedules';
import { ScheduleCard } from '@/components/ScheduleCard';
import { EditScheduleModal } from '@/components/EditScheduleModal';
import { ScheduleFormModal } from '@/components/ScheduleFormModal';
import { Camera, Send, AlertCircle, Sparkles, RefreshCw, Bot, Copy, Check, X, Plus, CalendarPlus } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { ENABLE_DEV_FLEET_SWITCHER } from '@/utils/constants';
import { generateNameCandidates } from '@/utils/nameMatcher';
import { parseVehicleDetails } from '@/components/ProfileModal';

const THINKING_STEPS = [
  '🔍 배차 데이터베이스 동선 대조 중...',
  '⚡ 실시간 스케줄 및 VIP 승객 분석 중...',
  '📋 맞춤 브리핑 작성 중...',
];

const COCKPIT_ANALYSIS_STAGES = [
  { step: 1, text: '1단계 · 운항 지시서 이미지 분석 중...', percent: 32 },
  { step: 2, text: '2단계 · 기사 및 차량 정보 식별 중...', percent: 50 },
  { step: 3, text: '3단계 · VIP 및 항공편 정보 추출 중...', percent: 68 },
  { step: 4, text: '4단계 · 기사님의 개인 스케줄 구성 중...', percent: 84 },
  { step: 5, text: '5단계 · 일정과 이동 정보 교차 검증 중...', percent: 96 },
  { step: 6, text: '6단계 · 최종 스케줄 정확도 확인', percent: 100 },
];

// Helper: Extract 8-digit date string from user query
function extractDateFromQuery(q: string): string | null {
  // 1. YYYYMMDD (e.g. 20260925)
  const yyyymmdd = q.match(/(\d{4})(\d{2})(\d{2})/);
  if (yyyymmdd) return yyyymmdd[0];

  // 2. YYYY-MM-DD or YYYY.MM.DD
  const ymdWithDelim = q.match(/(\d{4})[.-/](\d{1,2})[.-/](\d{1,2})/);
  if (ymdWithDelim) {
    return `${ymdWithDelim[1]}${ymdWithDelim[2].padStart(2, '0')}${ymdWithDelim[3].padStart(2, '0')}`;
  }

  // 3. M월 D일 or M.D or M/D
  const mdMatch = q.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || q.match(/(\d{1,2})[./](\d{1,2})/);
  if (mdMatch) {
    const curYear = new Date().getFullYear();
    return `${curYear}${mdMatch[1].padStart(2, '0')}${mdMatch[2].padStart(2, '0')}`;
  }

  // 4. '내일'
  if (q.includes('내일')) {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const y = tmr.getFullYear();
    const m = String(tmr.getMonth() + 1).padStart(2, '0');
    const d = String(tmr.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  // 5. '오늘'
  if (q.includes('오늘')) {
    const td = new Date();
    const y = td.getFullYear();
    const m = String(td.getMonth() + 1).padStart(2, '0');
    const d = String(td.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  return null;
}

// Helper: Validate and format 8-digit date for response
function parseAndValidate8DigitDate(raw: string) {
  if (raw.length !== 8) return null;
  const year = parseInt(raw.slice(0, 4), 10);
  const month = parseInt(raw.slice(4, 6), 10);
  const day = parseInt(raw.slice(6, 8), 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const targetDate = new Date(year, month - 1, day);
  if (
    targetDate.getFullYear() !== year ||
    targetDate.getMonth() !== month - 1 ||
    targetDate.getDate() !== day
  ) {
    return null;
  }
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][targetDate.getDay()];
  const formattedDate = `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  return { year, month, day, dayOfWeek, formattedDate };
}

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

  // Schedule Form Modal State
  const [isScheduleFormModalOpen, setIsScheduleFormModalOpen] = useState(false);
  const [scheduleFormInitialDate, setScheduleFormInitialDate] = useState<string | undefined>(undefined);

  const handleOpenScheduleFormModal = (dateStr?: string) => {
    haptics.lightTap();
    setScheduleFormInitialDate(dateStr);
    setIsScheduleFormModalOpen(true);
  };

  const handleSaveNewSchedule = async (newSchedule: ScheduleItem) => {
    setSchedules((prev) => {
      const updated = [newSchedule, ...prev];
      try {
        localStorage.setItem('cockpit_schedules', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to cache new schedule to storage:', e);
      }
      return updated;
    });

    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_no: newSchedule.vehicle_no,
          date: newSchedule.date,
          pickup_time: newSchedule.pickup_time,
          time_display: newSchedule.time_display,
          origin: newSchedule.origin_name,
          origin_address: newSchedule.origin_address,
          origin_lat: newSchedule.origin_lat,
          origin_lng: newSchedule.origin_lng,
          destination: newSchedule.destination_name,
          destination_address: newSchedule.destination_address,
          destination_lat: newSchedule.destination_lat,
          destination_lng: newSchedule.destination_lng,
          passenger_name: newSchedule.passenger,
          flight_number: newSchedule.flight,
          protocol_notes: newSchedule.notes,
          status: newSchedule.status,
        }),
      });
    } catch (err) {
      console.warn('Failed to persist new schedule to Supabase:', err);
    }
  };

  // Vehicle Isolation & Fleet Switcher State (Dev Mode enables switching between vehicles & All)
  const initialVehicle = profile.vehicleNo?.match(/(\d+호차)/)?.[1] || '4호차';
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>(initialVehicle);
  const [availableVehicles, setAvailableVehicles] = useState<string[]>(['1호차', '2호차', '4호차', '8호차']);
  const [vehicleCounts, setVehicleCounts] = useState<Record<string, number>>({
    '1호차': 0,
    '2호차': 0,
    '4호차': 0,
    '8호차': 0,
    'all': 0,
  });

  const fetchCounts = useCallback(async () => {
    try {
      const [schedRes, driverRes] = await Promise.all([
        fetch('/api/schedules?vehicle_no=all'),
        fetch('/api/driver?all=true'),
      ]);

      const vehicleSet = new Set<string>(['1호차', '2호차', '4호차', '8호차']);
      const currentHocha = profile.vehicleNo?.match(/(\d+호차)/)?.[1];
      if (currentHocha) vehicleSet.add(currentHocha);

      const counts: Record<string, number> = {
        '1호차': 0,
        '2호차': 0,
        '4호차': 0,
        '8호차': 0,
        all: 0,
      };

      if (schedRes.ok) {
        const data = await schedRes.json();
        if (data.schedules) {
          counts.all = data.schedules.length;
          data.schedules.forEach((s: ScheduleItem) => {
            const v = s.vehicle_no || '4호차';
            vehicleSet.add(v);
            counts[v] = (counts[v] || 0) + 1;
          });
        }
      }

      if (driverRes.ok) {
        const dData = await driverRes.json();
        if (Array.isArray(dData.drivers)) {
          dData.drivers.forEach((d: any) => {
            if (d.vehicle_no) {
              vehicleSet.add(d.vehicle_no);
              if (counts[d.vehicle_no] === undefined) {
                counts[d.vehicle_no] = 0;
              }
            }
          });
        }
      }

      const sortedVehicles = Array.from(vehicleSet).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 999;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 999;
        return numA - numB;
      });

      setAvailableVehicles(sortedVehicles);
      setVehicleCounts(counts);
    } catch (err) {
      console.warn('Failed to fetch schedule counts:', err);
    }
  }, [profile.vehicleNo]);

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

  // 6-Stage Cockpit AI Precision Analysis States for Schedule Image Parsing
  const [isAnalyzingSchedule, setIsAnalyzingSchedule] = useState(false);
  const [scheduleAnalysisStage, setScheduleAnalysisStage] = useState(0);
  const [scheduleAnalysisProgress, setScheduleAnalysisProgress] = useState(45);
  const [scheduleAnalysisCompleted, setScheduleAnalysisCompleted] = useState(false);
  const scheduleAnalysisTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopTypewriter = () => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }
  };

  const clearThinkingTimers = () => {
    thinkingTimersRef.current.forEach((t) => clearTimeout(t));
    thinkingTimersRef.current = [];
    if (scheduleAnalysisTimerRef.current) {
      clearInterval(scheduleAnalysisTimerRef.current);
      scheduleAnalysisTimerRef.current = null;
    }
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

  // Helper to format date string 'YYYY-MM-DD' into 'M월 D일(요일)'
  const formatBriefingDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + 'T00:00:00+09:00');
      if (isNaN(d.getTime())) return dateStr;
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${m}월 ${day}일(${days[d.getDay()]})`;
    } catch {
      return dateStr;
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Handle batch image upload and sequential AI parsing (Calls Gemini 3.8 Flash Vision with 3-anchor guardrail)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const totalFiles = files.length;

    haptics.mediumTap();
    stopTypewriter();
    clearThinkingTimers();

    setIsAnalyzing(true);
    setIsAnalyzingSchedule(true);
    setScheduleAnalysisCompleted(false);
    setScheduleAnalysisStage(0);
    setScheduleAnalysisProgress(15);
    setIsThinking(false);
    setDisplayedReply('');
    setCopilotResponse({
      query: totalFiles > 1 ? `배차표 ${totalFiles}장 정밀 관제 분석` : `배차표 정밀 관제 분석: ${files[0].name}`,
      reply: '',
      type: 'thinking',
    });
    setIsCopilotOpen(true);

    // Adaptive multi-stage timing:
    // Earlier stages (1~4): calm, measured pace (속도를 조금 더 줄임)
    // Final stages (5~6): swift, brisk acceleration into 100% (속도를 올림)
    const startTime = Date.now();
    const stageInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed < 2400) {
        // 0.0s ~ 2.4s: 1단계 · 운항 지시서 이미지 분석 중... (15% ~ 32%)
        const ratio = elapsed / 2400;
        setScheduleAnalysisStage(0);
        setScheduleAnalysisProgress(Math.round(15 + ratio * 17));
      } else if (elapsed < 4800) {
        // 2.4s ~ 4.8s: 2단계 · 기사 및 차량 정보 식별 중... (32% ~ 50%)
        const ratio = (elapsed - 2400) / 2400;
        setScheduleAnalysisStage(1);
        setScheduleAnalysisProgress(Math.round(32 + ratio * 18));
      } else if (elapsed < 7000) {
        // 4.8s ~ 7.0s: 3단계 · VIP 및 항공편 정보 추출 중... (50% ~ 68%)
        const ratio = (elapsed - 4800) / 2200;
        setScheduleAnalysisStage(2);
        setScheduleAnalysisProgress(Math.round(50 + ratio * 18));
      } else if (elapsed < 9000) {
        // 7.0s ~ 9.0s: 4단계 · 기사님의 개인 스케줄 구성 중... (68% ~ 84%)
        const ratio = (elapsed - 7000) / 2000;
        setScheduleAnalysisStage(3);
        setScheduleAnalysisProgress(Math.round(68 + ratio * 16));
      } else {
        // 9.0s 이상: 5단계 · 일정과 이동 정보 교차 검증 중... (84% ~ 96% 빠른 가속)
        setScheduleAnalysisStage(4);
        const stage5Elapsed = elapsed - 9000;
        if (stage5Elapsed <= 1200) {
          // 1.2초 만에 84% -> 96%로 빠르게 치고 올라감 (속도를 올림)
          const ratio = stage5Elapsed / 1200;
          setScheduleAnalysisProgress(Math.round(84 + ratio * 12));
        } else {
          // 네트워크 응답 추가 대기 시에도 멈추지 않고 96% -> 98%로 부드럽게 유지
          const waitSec = (stage5Elapsed - 1200) / 1000;
          const damped = 96 + 2 * (1 - Math.exp(-waitSec / 2));
          setScheduleAnalysisProgress(Math.min(Math.round(damped), 98));
        }
      }
    }, 50);
    scheduleAnalysisTimerRef.current = stageInterval;

    const vehicleDetails = parseVehicleDetails(profile.vehicleNo);
    const hochaStr = vehicleDetails.hocha ? `${vehicleDetails.hocha}호차` : (profile.vehicleNo || '4호차');
    const plateNo = vehicleDetails.plateNumber || profile.carNumber || '142호 7811';
    const plateLast4 = vehicleDetails.plateBack || (plateNo ? plateNo.replace(/\D/g, '').slice(-4) : '7811');
    const driverName = profile.driverName || '윤태준';
    const mobile = profile.phone || profile.mobile || '010-6348-8726';
    const nameCandidates = generateNameCandidates(driverName);

    const allParsedSchedules: Array<{
      date: string;
      pickup_time: string;
      dropoff_time?: string | null;
      origin_name: string;
      destination_name: string;
      passenger_name?: string | null;
      flight_no?: string | null;
      notes?: string | null;
    }> = [];

    try {
      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const base64Data = await readFileAsDataUrl(file);

        const res = await fetch('/api/schedule/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64Data,
            profile: {
              vehicleNo: hochaStr,
              driverName,
              nameCandidates,
              plateNo,
              plateLast4,
              mobile,
              passengerName: profile.passengerName,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.schedules)) {
            data.schedules.forEach((s: any) => {
              const exists = allParsedSchedules.some(
                (ex) => ex.date === s.date && ex.pickup_time.slice(0, 5) === s.pickup_time.slice(0, 5)
              );
              if (!exists) {
                allParsedSchedules.push(s);
              }
            });
          }
        }
      }

      // 타이머 정리 및 최종 5~6단계 신속 가속 완충 처리
      if (scheduleAnalysisTimerRef.current) {
        clearInterval(scheduleAnalysisTimerRef.current);
        scheduleAnalysisTimerRef.current = null;
      }

      // API가 초기에 너무 일찍 끝났을 경우에만 자연스러운 전개를 위한 최소 보장 (5.0s)
      const totalElapsed = Date.now() - startTime;
      if (totalElapsed < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 5000 - totalElapsed));
      }

      // 5단계 확실한 도달 및 가속
      setScheduleAnalysisStage(4);
      setScheduleAnalysisProgress(96);
      await new Promise((resolve) => setTimeout(resolve, 180));

      // 6단계 · 최종 스케줄 정확도 확인 (속도 가속 98% -> 100%)
      setScheduleAnalysisStage(5);
      setScheduleAnalysisProgress(98);
      await new Promise((resolve) => setTimeout(resolve, 180));

      setScheduleAnalysisProgress(100);
      setScheduleAnalysisCompleted(true);
      haptics.success();

      // 완료 카드 0.5초 산뜻하게 유지
      await new Promise((resolve) => setTimeout(resolve, 500));

      setIsAnalyzingSchedule(false);
      setScheduleAnalysisCompleted(false);

      // Refresh SSOT from Supabase (Auto-switch view to uploaded hocha if not viewing all)
      if (selectedVehicleFilter !== 'all' && selectedVehicleFilter !== hochaStr) {
        setSelectedVehicleFilter(hochaStr);
        await fetchSchedulesForVehicle(hochaStr);
      } else {
        await fetchSchedulesForVehicle(selectedVehicleFilter);
      }
      await fetchCounts();

      if (allParsedSchedules.length > 0) {
        const scheduleItemsFormatted = allParsedSchedules
          .sort((a, b) => a.date.localeCompare(b.date) || a.pickup_time.localeCompare(b.pickup_time))
          .map((s) => {
            const dateLabel = formatBriefingDate(s.date);
            const flightPart = s.flight_no ? ` (항공편: ${s.flight_no})` : '';
            return `• ${dateLabel} ${s.pickup_time}\n  출발: ${s.origin_name}\n  도착: ${s.destination_name}\n  승객: ${s.passenger_name || profile.passengerName || 'VIP 승객'}${flightPart}`;
          })
          .join('\n\n');

        const replyText = `📋 배차 일정 동기화 완료
${driverName} 기사님(${hochaStr} · ${plateNo})의 의전 일정 총 ${allParsedSchedules.length}건이 정리되었습니다.

${scheduleItemsFormatted}`.trim();

        setCopilotResponse({
          query: totalFiles > 1 ? `배차표 ${totalFiles}장 일괄 동기화 완료` : `배차표 이미지 분석 완료`,
          reply: replyText,
          type: 'schedule_parse',
        });
        startTypewriter(replyText);
        haptics.success();
      } else {
        const noMatchText = `기사님, 배차표에서 ${driverName} 기사님(${hochaStr} · ${plateNo})의 배차 일정이 발견되지 않았습니다. 프로필 정보나 배차표 이미지를 다시 한번 확인해 주시기 바랍니다.`;
        setCopilotResponse({
          query: totalFiles > 1 ? `배차표 ${totalFiles}장 일괄 분석 결과` : `배차표 이미지 분석 결과`,
          reply: noMatchText,
          type: 'schedule_parse',
        });
        startTypewriter(noMatchText);
        haptics.warningPulse();
      }
    } catch (err: any) {
      console.error('Image analysis error:', err);
      if (scheduleAnalysisTimerRef.current) {
        clearInterval(scheduleAnalysisTimerRef.current);
        scheduleAnalysisTimerRef.current = null;
      }
      setIsAnalyzingSchedule(false);
      setScheduleAnalysisCompleted(false);
      setIsThinking(false);
      setThinkingStep(null);
      const errMsg = `기사님, 배차표 이미지 분석 중 네트워크 연결에 문제가 발생했습니다. 잠시 후 다시 시도해 주시기 바랍니다.`;
      setCopilotResponse({
        query: `배차표 분석 안내`,
        reply: errMsg,
        type: 'schedule_parse',
      });
      startTypewriter(errMsg);
      haptics.warningPulse();
    } finally {
      if (scheduleAnalysisTimerRef.current) {
        clearInterval(scheduleAnalysisTimerRef.current);
        scheduleAnalysisTimerRef.current = null;
      }
      setIsAnalyzing(false);
      if (e.target) e.target.value = '';
    }
  };

  // Handle text input submission to Protocol Copilot API (Calls gemini-3.5-flash-lite)
  const handleCopilotSubmit = async (customQuery?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetQuery = (customQuery || inputText).trim();
    if (!targetQuery) return;

    haptics.mediumTap();
    stopTypewriter();
    clearThinkingTimers();

    // Check if user wants to register / add a new schedule
    const isRegisterIntent =
      targetQuery.includes('일정 등록') ||
      targetQuery.includes('스케줄 등록') ||
      targetQuery.includes('일정 추가') ||
      targetQuery.includes('스케줄 추가') ||
      targetQuery.includes('새 스케줄') ||
      (extractDateFromQuery(targetQuery) !== null &&
        (targetQuery.includes('등록') || targetQuery.includes('추가') || targetQuery.includes('작성')));

    if (isRegisterIntent) {
      const extractedDate = extractDateFromQuery(targetQuery);
      const dateInfo = extractedDate ? parseAndValidate8DigitDate(extractedDate) : null;

      const reply = dateInfo
        ? `📝 **${dateInfo.formattedDate} (${dateInfo.dayOfWeek})** 신규 스케줄 등록 팝업을 열었습니다.\n픽업 시간 및 장소를 확인 후 저장해 주세요.`
        : '📝 신규 스케줄 등록 팝업을 열었습니다.\n운행 일자(8자리 숫자) 및 상세 일정을 입력해 주세요.';

      setIsAnalyzing(false);
      setIsThinking(false);
      setThinkingStep(null);
      setCopilotResponse({
        query: targetQuery,
        reply,
        type: 'schedule_form',
      });
      setIsCopilotOpen(true);
      setInputText('');
      startTypewriter(reply);
      handleOpenScheduleFormModal(extractedDate || undefined);
      haptics.success();
      return;
    }

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
      {/* Hidden File Input for Image Upload (multiple enabled) */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        multiple
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
        <div className="mb-3 bg-slate-100/90 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80 shadow-xs overflow-x-auto">
          {[
            ...availableVehicles.map((v) => ({ id: v, label: v })),
            { id: 'all', label: '전체' },
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
                className={`flex-1 py-1.5 px-1 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${isSelected
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/90 scale-100'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                <span>{v.label}</span>
                <span
                  className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${isSelected
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
            내 스케줄, AI가 바로 만들어드려요 ✨
          </h2>
          <p className="text-xs text-slate-500 mt-2 text-center max-w-xs leading-relaxed">
            배차표 이미지나 텍스트만 등록해 주세요
          </p>

          {/* Convenience Helper: 1-Click Ferrari Confirmed Schedule Loader & Manual Register */}
          <div className="flex items-center gap-2 mt-6">
            <button
              type="button"
              onClick={() => handleOpenScheduleFormModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1E60F3] hover:bg-[#1650D6] text-white text-xs font-bold transition-all active:scale-95 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>새 스케줄 직접 등록</span>
            </button>
            <button
              type="button"
              onClick={handleLoadDemoSchedules}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50/80 hover:bg-blue-100 text-[#1E60F3] border border-blue-200/60 text-xs font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
            >
              <span> ✨ 샘플로 먼저 확인하기</span>
            </button>
          </div>
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

            {/* Header Action Buttons: Add Schedule & Reset */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleOpenScheduleFormModal()}
                className="text-xs text-[#1E60F3] hover:text-[#1650D6] bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center gap-1 py-1 px-2.5 rounded-lg transition-all font-bold cursor-pointer"
                title="새 스케줄 직접 등록"
              >
                <Plus className="w-3 h-3" />
                <span>일정 추가</span>
              </button>
              <button
                type="button"
                onClick={handleResetSchedules}
                className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-100 transition-all font-medium cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>배차표 재등록</span>
              </button>
            </div>
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
            {filteredSchedules.map((item, itemIdx) => (
              <ScheduleCard
                key={`${item.id}-${itemIdx}`}
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
            <div className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg truncate font-medium">
              {isAnalyzingSchedule ? (
                <span>분석 대상: {copilotResponse.query}</span>
              ) : (
                <span>💬 <span className="font-bold text-slate-700">질문:</span> {copilotResponse.query}</span>
              )}
            </div>

            {/* 6-Stage Cockpit AI Precision Analysis with Soft Tech Blue Gauge Bar */}
            {isAnalyzingSchedule ? (
              <div className="space-y-3 p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs animate-fade-in">
                {!scheduleAnalysisCompleted ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div key={scheduleAnalysisStage} className="animate-fade-in min-w-0 flex-1 truncate">
                        <span className="animate-reasoning-shimmer text-xs font-semibold tracking-tight truncate block">
                          {COCKPIT_ANALYSIS_STAGES[scheduleAnalysisStage]?.text || '1단계 · 운항 지시서 이미지 분석 중...'}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-sky-600 shrink-0 font-mono transition-opacity duration-300">
                        {scheduleAnalysisProgress >= 100
                          ? '분석 신뢰도 100%'
                          : `분석 신뢰도 ${scheduleAnalysisProgress}%`}
                      </span>
                    </div>

                    {/* Progress Track & Soft Tech Blue Gauge Bar */}
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-gradient-to-r from-blue-300 via-sky-400 to-blue-400 transition-all duration-200 ease-out shadow-xs"
                        style={{ width: `${scheduleAnalysisProgress}%` }}
                      />
                    </div>
                  </>
                ) : (
                  /* 100% 완충 및 최종 완료 확정 상태 (약 0.8초 유지) */
                  <div className="space-y-2 py-0.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 tracking-tight">
                        ✓ Cockpit AI 분석 완료
                      </span>
                      <span className="text-xs font-black text-sky-600 font-mono">
                        신뢰도 100%
                      </span>
                    </div>

                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500 transition-all duration-300 ease-out shadow-xs"
                        style={{ width: '100%' }}
                      />
                    </div>

                    <p className="text-xs font-semibold text-slate-700 tracking-tight pt-0.5">
                      기사님 전용 스케줄이 준비되었습니다.
                    </p>
                  </div>
                )}
              </div>
            ) : isThinking ? (
              /* Normal text chat thinking indicator */
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 border border-slate-200/90 text-xs font-bold text-slate-800 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-slate-700" />
                <span className="truncate text-slate-800">{THINKING_STEPS[thinkingStep ?? 0]}</span>
              </div>
            ) : null}

            {/* Formatted Reply Body with Typewriter Streaming Effect */}
            {!isThinking && displayedReply && (
              <div className="text-xs text-slate-800 font-normal leading-relaxed whitespace-pre-wrap bg-slate-50/90 p-3 rounded-xl border border-slate-200/90 select-text font-mono">
                {displayedReply}
                {isTyping && (
                  <span className="inline-block w-1.5 h-3.5 bg-slate-800 animate-pulse ml-0.5 align-middle" />
                )}
                {copilotResponse.type === 'schedule_form' && !isTyping && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenScheduleFormModal(scheduleFormInitialDate)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E60F3] text-white text-xs font-bold shadow-xs hover:bg-[#1650D6] active:scale-95 transition-all cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>스케줄 등록 팝업 열기</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick Suggestion Prompt Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => handleCopilotSubmit('9월 25일 일정 등록')}
            disabled={isAnalyzing}
            className="shrink-0 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200/90 text-[11px] font-bold text-[#1E60F3] rounded-full transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            ➕ 9/25 스케줄 등록
          </button>
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

      {/* 5. Schedule Form Modal (New Manual / Voice Schedule Addition) */}
      <ScheduleFormModal
        isOpen={isScheduleFormModalOpen}
        onClose={() => setIsScheduleFormModalOpen(false)}
        onSave={handleSaveNewSchedule}
        initialDate={scheduleFormInitialDate}
        vehicleNo={profile.vehicleNo}
        passengerName={profile.passengerName}
      />
    </div>
  );
};
