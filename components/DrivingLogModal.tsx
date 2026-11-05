'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Sun,
  Moon,
  Clock,
  Navigation,
  MapPin,
  Pencil,
  FileText,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Sparkles,
  RotateCcw,
  NotebookPen,
} from 'lucide-react';
import { DriverProfile } from '@/types';
import { CustodyMileageLink } from './CustodyMileageLink';
import {
  RouteStopItem,
  DrivingLogData,
  calculateDutyDuration,
  calculateDrivingDistance,
  formatOdometer,
  loadDrivingLogDraft,
  saveDrivingLogDraft,
  formatKoreanDate,
  checkStopTimelineConsistency,
  clampTimeComponent,
  createReferenceDemoFixture,
} from '@/utils/drivingLog';
import Link from 'next/link';
import { AddScheduleModal } from './AddScheduleModal';
import { haptics } from '@/utils/haptics';
import { submitDriverLogToHqDb } from '@/utils/drivingLogHqStorage';
import { HqDrivingLog } from '@/types/drivingLogHq';

interface DrivingLogModalProps {
  presentation?: 'modal' | 'page';
  isOpen: boolean;
  onClose: () => void;
  driverProfile: DriverProfile;
  bookingId?: string;
  onOpenLocationSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}

const DrivingLogModalContent: React.FC<{
  presentation: 'modal' | 'page';
  onClose: () => void;
  driverProfile: DriverProfile;
  bookingId?: string;
  onOpenLocationSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}> = ({ presentation, onClose, driverProfile, bookingId, onOpenLocationSearch, selectedLocationFromMap }) => {
  const scrollContainerRef = useRef<HTMLElement>(null);

  // Master driving log state initialized purely (booking-aware)
  const [logData, setLogData] = useState<DrivingLogData>(() =>
    loadDrivingLogDraft(driverProfile, undefined, undefined, bookingId)
  );

  useEffect(()=>{
    const abort=new AbortController();
    const query=new URLSearchParams({date:logData.rawDate});if(bookingId)query.set('bookingId',bookingId);
    fetch(`/api/driving-logs?${query}`,{cache:'no-store',credentials:'include',signal:abort.signal})
      .then(async response=>{if(!response.ok)return;const data=await response.json();const row=data.logs?.find((entry:HqDrivingLog)=>(entry.bookingId || null)===(bookingId || null));if(!row || abort.signal.aborted)return;
        setLogData(previous=>{
          if(previous.stops.length || previous.startKm)return {...previous,submissionId:row.id,hqStatus:row.status};
          return {...previous,submissionId:row.id,hqStatus:row.status,driverId:row.driverId,clientName:row.customerName,passengerCount:String(row.passengerCount || ''),clockIn:row.clockIn,clockOut:row.clockOut,startKm:row.startKm,endKm:row.endKm,totalDutyHours:row.totalDutyHours,distanceKm:row.distanceKm,notes:row.notes,stops:row.stops.map((stop:HqDrivingLog['stops'][number])=>({...stop,memo:stop.note})),status:row.status==='draft'?'draft':'submitted'};
        });
      }).catch(()=>{});
    return()=>abort.abort();
  },[bookingId,driverProfile.driverId,logData.rawDate]);

  // Auto-scroll to top when modal mounts
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, []);

  // Time edit modal states
  const [timePickerTarget, setTimePickerTarget] = useState<'clockIn' | 'clockOut' | null>(null);
  const [pickerHour, setPickerHour] = useState('06');
  const [pickerMinute, setPickerMinute] = useState('40');

  // Mileage edit modal states
  const [isEditingMileage, setIsEditingMileage] = useState(false);
  const [tempStartKm, setTempStartKm] = useState(logData.startKm);
  const [tempEndKm, setTempEndKm] = useState(logData.endKm);
  const [mileageError, setMileageError] = useState<string | null>(null);

  // Stop add/edit state
  const [isAddStopOpen, setIsAddStopOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<RouteStopItem | null>(null);
  const [activeMenuStopId, setActiveMenuStopId] = useState<string | null>(null);

  // Summary fields edit state (수행담당, 차량번호, 고객명, 담당승객 수)
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [tempClientName, setTempClientName] = useState(logData.clientName);
  const [tempPassengerCount, setTempPassengerCount] = useState(logData.passengerCount);

  // Toast / notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPreviewSubmitModalOpen, setIsPreviewSubmitModalOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Recalculate duration whenever times change
  const handleTimeChange = (type: 'clockIn' | 'clockOut', value: string) => {
    const newClockIn = type === 'clockIn' ? value : logData.clockIn;
    const newClockOut = type === 'clockOut' ? value : logData.clockOut;
    const { formatted } = calculateDutyDuration(newClockIn, newClockOut);

    setLogData((prev) => ({
      ...prev,
      clockIn: newClockIn,
      clockOut: newClockOut,
      totalDutyHours: formatted,
    }));
  };

  // Open Time Picker Modal
  const openTimePicker = (target: 'clockIn' | 'clockOut') => {
    haptics.lightTap();
    setTimePickerTarget(target);
    const curr = target === 'clockIn' ? logData.clockIn : logData.clockOut;
    const [hh, mm] = (curr || (target === 'clockIn' ? '06:40' : '21:50')).split(':');
    setPickerHour(hh || '08');
    setPickerMinute(mm || '00');
  };

  useEffect(() => {
    if (!timePickerTarget) return;
    const timer = setTimeout(() => {
      const hEl = document.getElementById(`wheel-hour-${clampTimeComponent(pickerHour, 23)}`);
      const mEl = document.getElementById(`wheel-min-${clampTimeComponent(pickerMinute, 59)}`);
      hEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      mEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [timePickerTarget]);

  const applyTimePicker = () => {
    if (!timePickerTarget) return;
    haptics.selection();
    const cleanH = clampTimeComponent(pickerHour, 23);
    const cleanM = clampTimeComponent(pickerMinute, 59);
    const formattedTime = `${cleanH}:${cleanM}`;
    handleTimeChange(timePickerTarget, formattedTime);
    setTimePickerTarget(null);
  };

  // Mileage save handler
  const handleSaveMileage = () => {
    const { formatted, error } = calculateDrivingDistance(tempStartKm, tempEndKm);
    if (error) {
      setMileageError(error);
      return;
    }

    setMileageError(null);
    const formattedStart = formatOdometer(tempStartKm);
    const formattedEnd = formatOdometer(tempEndKm);

    setLogData((prev) => ({
      ...prev,
      startKm: formattedStart,
      endKm: formattedEnd,
      distanceKm: formatted,
      isOdoManualOverride: true,
      odoSource: 'manual',
      custodyId: undefined,
    }));
    setIsEditingMileage(false);
    haptics.success();
    showToast('주행거리가 수정되었습니다.');
  };

  // Add or update stop
  const handleSaveStop = (stop: RouteStopItem) => {
    setLogData((prev) => {
      const existingIdx = prev.stops.findIndex((s) => s.id === stop.id);
      let updatedStops: RouteStopItem[];
      if (existingIdx >= 0) {
        updatedStops = [...prev.stops];
        updatedStops[existingIdx] = stop;
      } else {
        updatedStops = [...prev.stops, stop];
      }
      return {
        ...prev,
        stops: updatedStops,
      };
    });
    setEditingStop(null);
    showToast('운행 일정이 추가되었습니다.');
  };

  // Delete stop
  const handleDeleteStop = (id: string) => {
    haptics.mediumTap();
    setLogData((prev) => ({
      ...prev,
      stops: prev.stops.filter((s) => s.id !== id),
    }));
    setActiveMenuStopId(null);
    showToast('일정이 삭제되었습니다.');
  };

  // Summary (Client / Passenger) save
  const handleSaveSummary = () => {
    setLogData((prev) => ({
      ...prev,
      clientName: tempClientName.trim(),
      passengerCount: tempPassengerCount.trim(),
    }));
    setIsEditingSummary(false);
    haptics.selection();
    showToast('수행 요약 정보가 저장되었습니다.');
  };

  // Temporary save to localStorage (Strictly draft status)
  const handleTemporarySave = () => {
    haptics.success();
    const success = saveDrivingLogDraft({ ...logData, status: 'draft' });
    if (success) {
      showToast('운행일지가 임시저장되었습니다.');
    } else {
      showToast('임시저장에 실패했습니다.');
    }
  };

  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

  // Submit Driving Log to HQ Operations system
  const handleSubmitLog = async () => {
    if(logData.isDemoFixture){alert('샘플 운행일지는 본사에 제출할 수 없습니다. 실제 운행 기록으로 전환해 주세요.');return;}
    if (isSubmittingLog) return;
    setIsSubmittingLog(true);
    haptics.selection();

    // Map stops ensuring complete route details are passed
    const stopsMapped = logData.stops.map((s) => ({
      id: s.id,
      time: s.time,
      place: s.place,
      note: s.memo,
      address: s.address,
    }));

    const currentDriverName = logData.driverName || driverProfile.driverName || '';
    const currentVehiclePlate = logData.carNumber || driverProfile.carNumber || '';

    try {
      const payload: Partial<HqDrivingLog> = {
        id:logData.submissionId,
        driverName: currentDriverName,
        customerName: logData.clientName || '',
        vehicleModel: driverProfile.carModel || currentVehiclePlate,
        vehiclePlate: currentVehiclePlate,
        clockIn: logData.clockIn,
        clockOut: logData.clockOut,
        totalDutyHours: logData.totalDutyHours,
        passengerCount: logData.passengerCount
          ? Number(String(logData.passengerCount).replace(/[^0-9]/g, '')) || undefined
          : undefined,
        startKm: logData.startKm,
        endKm: logData.endKm,
        distanceKm: logData.distanceKm,
        stops: stopsMapped,
        notes: logData.notes || '',
        status: '검토 대기',
        drivingDate: logData.rawDate,
        rawDate: logData.rawDate,
        bookingId: logData.bookingId || bookingId,
        driverId: logData.driverId,
        vehicleId: logData.vehicleId,
        custodyId: logData.custodyId,
      };

      const res = await submitDriverLogToHqDb(payload);
      if (!res.ok) {
        alert(`운행일지 제출 실패: ${res.error || '서버 저장에 실패했습니다.'}`);
        return;
      }

      haptics.success();
      const saved={...logData,submissionId:res.log?.id || logData.submissionId,hqStatus:res.log?.status,carNumber:res.log?.vehiclePlate || logData.carNumber,vehicleId:res.log?.vehicleId || logData.vehicleId,status:'submitted' as const};
      setLogData(saved);saveDrivingLogDraft(saved);
      setIsPreviewSubmitModalOpen(true);
    } catch (err: any) {
      alert(`운행일지 제출 중 오류: ${err.message}`);
    } finally {
      setIsSubmittingLog(false);
    }
  };

  // Toggle reference demo fixture vs clean real report
  const handleLoadDemoFixture = () => {
    haptics.selection();
    const demo = createReferenceDemoFixture(driverProfile);
    setLogData(demo);
    setTempStartKm(demo.startKm);
    setTempEndKm(demo.endKm);
    setTempClientName(demo.clientName);
    setTempPassengerCount(demo.passengerCount);
    showToast('레퍼런스 샘플 데이터를 불러왔습니다.');
  };

  const handleResetToRealDraft = () => {
    haptics.selection();
    const fresh = loadDrivingLogDraft(driverProfile);
    setLogData(fresh);
    setTempStartKm(fresh.startKm);
    setTempEndKm(fresh.endKm);
    setTempClientName(fresh.clientName);
    setTempPassengerCount(fresh.passengerCount);
    showToast('실제 빈 일지 상태로 초기화했습니다.');
  };

  return (
    <div
      className={presentation === 'page' ? "w-full select-none" : "fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in select-none overscroll-contain"}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className={presentation === 'page' ? "relative flex min-h-[70dvh] w-full flex-col bg-[#F8FAFC]" : "w-full max-w-lg bg-[#F8FAFC] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92dvh] h-[92dvh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-6 sm:animate-scale-up duration-300 relative"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shadow-xs shrink-0">
              <NotebookPen className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">운행일지</h2>
                {logData.isDemoFixture ? (
                  <span className="text-[10px] bg-blue-50 text-[#1E60F3] font-semibold px-1.5 py-0.2 rounded border border-blue-100">
                    샘플
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-1.5 py-0.2 rounded">
                    임시저장
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-normal">
                {logData.date || formatKoreanDate()}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {logData.isDemoFixture ? (
              <button
                type="button"
                onClick={handleResetToRealDraft}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
                title="실제 빈 일지로 전환"
              >
                <RotateCcw className="w-4 h-4 stroke-[2]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoadDemoFixture}
                className="p-1.5 text-blue-500 hover:text-blue-700 rounded-full hover:bg-blue-50"
                title="레퍼런스 샘플 불러오기"
              >
                <Sparkles className="w-4 h-4 stroke-[2]" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-500 cursor-pointer transition-all"
              aria-label="닫기"
            >
              <X className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>
        </div>

        {/* Main Scrollable Content */}
        <section
          aria-label="운행일지 작성"
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 w-full pb-4"
        >
        {logData.hqStatus && <p role="status" className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800">본사 검토 상태: {logData.hqStatus==='draft'?'임시 기록':logData.hqStatus}</p>}
        {/* Notice Banner for Demo Fixture or Empty Report */}
        {logData.isDemoFixture && (
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-blue-700">
            <span className="font-medium">레퍼런스 스크린샷 시연 모드입니다.</span>
            <button
              type="button"
              onClick={handleResetToRealDraft}
              className="underline text-[11px] font-bold hover:text-blue-900"
            >
              빈 일지로 작성
            </button>
          </div>
        )}

        {/* 2. 차량 및 수행 정보 카드 (컴팩트 틴트 배너 + 레이블/입력칸 분리) */}
        <section className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_rgba(30,96,243,0.05)] overflow-hidden">
          {/* Compact Tinted Limousine Header Strip */}
          <div className="relative w-full h-16 sm:h-20 bg-slate-900 overflow-hidden flex items-center justify-between px-4">
            <Image
              src="/images/driving_log_hero.jpg"
              alt="VIP 의전 리무진 및 도시 전경"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 500px"
              className="object-cover object-center opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-900/60 to-slate-900/40" />

            <div className="relative z-10 flex items-center gap-2.5 min-w-0">
              <div className="px-2.5 py-1 rounded-lg bg-white/15 backdrop-blur-xs border border-white/20 text-white">
                <span className="text-[10px] text-white/75 font-medium block leading-none">수행담당</span>
                <span className="text-xs sm:text-sm font-extrabold tracking-tight mt-0.5 block truncate">
                  {logData.driverName}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-white/15 backdrop-blur-xs border border-white/20 text-white">
                <span className="text-[10px] text-white/75 font-medium block leading-none">차량번호</span>
                <span className="text-xs sm:text-sm font-extrabold tracking-tight mt-0.5 block truncate">
                  {logData.carNumber}
                </span>
              </div>
            </div>

            <span className="relative z-10 text-[10px] font-bold text-white/85 bg-black/30 backdrop-blur-xs px-2 py-1 rounded-full border border-white/15 shrink-0">
              VIP 의전 수행
            </span>
          </div>

          {/* Label above, Input below: 고객명 & 탑승 인원 스테퍼 */}
          <div className="p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-[1fr_148px] gap-3 bg-white">
            {/* 고객명 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                고객명
              </label>
              <input
                type="text"
                value={logData.clientName}
                onChange={(e) =>
                  setLogData((prev) => ({
                    ...prev,
                    clientName: e.target.value,
                  }))
                }
                placeholder="탑승 VIP 성함 또는 행사명"
                className="w-full h-10 px-3.5 rounded-xl bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/15 text-xs sm:text-sm font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none transition-all"
              />
            </div>

            {/* 탑승 인원 (- 1명 + 스테퍼) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                탑승 인원
              </label>
              {(() => {
                const countNum = Math.max(
                  1,
                  parseInt(String(logData.passengerCount || '1').replace(/[^0-9]/g, ''), 10) || 1
                );
                return (
                  <div className="flex items-center justify-between h-10 px-2.5 rounded-xl bg-slate-50/70 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        const next = Math.max(1, countNum - 1);
                        setLogData((prev) => ({ ...prev, passengerCount: `${next}명` }));
                      }}
                      disabled={countNum <= 1}
                      aria-label="탑승 인원 감소"
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-40 shadow-2xs transition active:scale-95"
                    >
                      <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <span className="text-xs sm:text-sm font-black text-slate-900 tabular-nums select-none">
                      {countNum}명
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        const next = Math.min(45, countNum + 1);
                        setLogData((prev) => ({ ...prev, passengerCount: `${next}명` }));
                      }}
                      aria-label="탑승 인원 증가"
                      className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200/80 hover:bg-blue-100 text-[#1E60F3] flex items-center justify-center cursor-pointer shadow-2xs transition active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* 3. 출근 / 퇴근 기록 (탭 가능한 아웃라인 액션 카드) */}
        <section className="grid grid-cols-2 gap-3">
          {/* 출근 기록 Card */}
          <button
            type="button"
            onClick={() => openTimePicker('clockIn')}
            className={`text-left rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer active:scale-98 flex items-center justify-between group ${
              logData.clockIn
                ? 'bg-white border-2 border-slate-200/90 hover:border-[#1E60F3] shadow-[0_4px_16px_rgba(0,0,0,0.03)]'
                : 'bg-white border-2 border-dashed border-blue-300 hover:border-[#1E60F3] hover:bg-blue-50/30 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 shrink-0">
                <Sun className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-slate-400 font-semibold block">출근 시각</span>
                {logData.clockIn ? (
                  <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight tabular-nums group-hover:text-[#1E60F3] transition-colors">
                    {logData.clockIn}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-extrabold text-[#1E60F3] mt-0.5">
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>출근 기록</span>
                  </span>
                )}
              </div>
            </div>
            <span className="px-2 py-1 rounded-lg bg-slate-50 group-hover:bg-blue-50 text-[10px] font-bold text-slate-400 group-hover:text-[#1E60F3] transition-colors shrink-0">
              {logData.clockIn ? '변경' : '입력'}
            </span>
          </button>

          {/* 퇴근 기록 Card */}
          <button
            type="button"
            onClick={() => openTimePicker('clockOut')}
            className={`text-left rounded-2xl p-3.5 sm:p-4 transition-all cursor-pointer active:scale-98 flex items-center justify-between group ${
              logData.clockOut
                ? 'bg-white border-2 border-slate-200/90 hover:border-[#1E60F3] shadow-[0_4px_16px_rgba(0,0,0,0.03)]'
                : 'bg-white border-2 border-dashed border-blue-300 hover:border-[#1E60F3] hover:bg-blue-50/30 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E60F3] shrink-0">
                <Moon className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] text-slate-400 font-semibold block">퇴근 시각</span>
                {logData.clockOut ? (
                  <span className="text-lg sm:text-xl font-black text-slate-900 tracking-tight tabular-nums group-hover:text-[#1E60F3] transition-colors">
                    {logData.clockOut}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-extrabold text-[#1E60F3] mt-0.5">
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>퇴근 기록</span>
                  </span>
                )}
              </div>
            </div>
            <span className="px-2 py-1 rounded-lg bg-slate-50 group-hover:bg-blue-50 text-[10px] font-bold text-slate-400 group-hover:text-[#1E60F3] transition-colors shrink-0">
              {logData.clockOut ? '변경' : '입력'}
            </span>
          </button>
        </section>

        {/* 4. 토스 스타일 KPI 요약 카드 (총 운행시간 & 실 주행거리 통합 강조) */}
        <section className="bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-blue-100/50 border border-blue-100/80 rounded-2xl p-4 flex items-center justify-between gap-3 relative overflow-hidden shadow-[0_4px_18px_rgba(30,96,243,0.08)]">
          <div className="absolute -right-8 -bottom-10 w-36 h-36 bg-blue-200/30 rounded-full blur-xl pointer-events-none" />

          <div className="flex items-center gap-3.5 min-w-0 relative z-10">
            <div className="w-11 h-11 rounded-2xl bg-[#1E60F3] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(30,96,243,0.3)] shrink-0">
              <Clock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-[#1E60F3] font-extrabold tracking-tight">
                오늘 운행 요약
              </div>
              <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate mt-0.5">
                오늘 총 {logData.distanceKm || '0 km'} · 총 운행 {logData.totalDutyHours || '0시간 0분'}
              </div>
            </div>
          </div>
        </section>

        {/* 5. 주행거리 (출발 계기판 -> 복귀 계기판 -> 실 주행거리) */}
        <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[#1E60F3] stroke-[2.2]" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">주행거리</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setTempStartKm(logData.startKm);
                setTempEndKm(logData.endKm);
                setMileageError(null);
                setIsEditingMileage(true);
              }}
              className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
            >
              계기판 입력
            </button>
          </div>

          <CustodyMileageLink driverId={driverProfile.driverId} bookingId={bookingId} date={logData.rawDate} onApply={value => {
            const distance = calculateDrivingDistance(value.startKm, value.endKm);
            setLogData(previous => ({ ...previous, ...value, startKm: formatOdometer(value.startKm), endKm: formatOdometer(value.endKm), distanceKm: distance.formatted, odoSource: 'inspection_verified', isOdoManualOverride: false }));
            showToast('서버 인수·반납 계기판 값을 적용했습니다.');
          }} />

          {/* 출발 계기판 -> 복귀 계기판 -> 실 주행거리 */}
          <div className="flex items-center gap-2">
            {/* 출발 계기판 */}
            <div
              onClick={() => {
                setTempStartKm(logData.startKm);
                setTempEndKm(logData.endKm);
                setMileageError(null);
                setIsEditingMileage(true);
              }}
              className="flex-1 bg-white border border-slate-200/90 rounded-xl p-2.5 text-center cursor-pointer hover:border-[#1E60F3] shadow-2xs group"
              title="클릭하여 출발 계기판 수정"
            >
              <div className="text-[11px] text-slate-400 font-medium">출발 계기판</div>
              <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center justify-center gap-1 tabular-nums">
                <span>{logData.startKm ? `${logData.startKm} km` : '입력'}</span>
                <Pencil className="w-3 h-3 text-slate-300 group-hover:text-[#1E60F3] transition-colors" />
              </div>
            </div>

            {/* Directional Arrow */}
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

            {/* 복귀 계기판 */}
            <div
              onClick={() => {
                setTempStartKm(logData.startKm);
                setTempEndKm(logData.endKm);
                setMileageError(null);
                setIsEditingMileage(true);
              }}
              className="flex-1 bg-white border border-slate-200/90 rounded-xl p-2.5 text-center cursor-pointer hover:border-[#1E60F3] shadow-2xs group"
              title="클릭하여 복귀 계기판 수정"
            >
              <div className="text-[11px] text-slate-400 font-medium">복귀 계기판</div>
              <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center justify-center gap-1 tabular-nums">
                <span>{logData.endKm ? `${logData.endKm} km` : '입력'}</span>
                <Pencil className="w-3 h-3 text-slate-300 group-hover:text-[#1E60F3] transition-colors" />
              </div>
            </div>

            {/* 실 주행거리 box (Emphasized cobalt blue) */}
            <div className="min-w-[92px] shrink-0 bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 text-center shadow-2xs">
              <div className="text-[11px] text-[#1E60F3] font-semibold">실 주행거리</div>
              <div className="text-xs sm:text-sm font-black text-[#1E60F3] mt-0.5 tabular-nums">
                {logData.distanceKm}
              </div>
            </div>
          </div>
        </section>

        {/* 6. 운행 경로 Timeline */}
        <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)] space-y-3.5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#1E60F3] stroke-[2.2]" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">운행 경로</h2>
              <span className="bg-slate-100 text-slate-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                총 {logData.stops.length}개 일정
              </span>
            </div>

            {/* 일정이 1개 이상일 때만 우측 상단 경로 추가 버튼 표시 (0개일 때는 중앙 액션 카드에 집중) */}
            {logData.stops.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setEditingStop(null);
                  setIsAddStopOpen(true);
                }}
                className="flex items-center gap-1 text-xs font-bold text-[#1E60F3] border border-[#1E60F3] px-2.5 py-1 rounded-full hover:bg-blue-50 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>경로 추가</span>
              </button>
            )}
          </div>

          {/* Timeline List or Empty State */}
          {logData.stops.length > 0 ? (
            <div className="relative pl-1 pr-1 flex flex-col pt-1">
              {logData.stops.map((stop, idx) => {
                // Check timeline consistency against duty hours
                const consistency = checkStopTimelineConsistency(
                  logData.clockIn,
                  logData.clockOut,
                  stop.time
                );
                const isFirst = idx === 0;
                const isLast = idx === logData.stops.length - 1;

                return (
                  <div
                    key={stop.id}
                    className="relative flex items-start justify-between text-xs sm:text-sm group z-10"
                  >
                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                      {/* Number Badge */}
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>

                      {/* Time */}
                      <span className="font-semibold text-slate-700 w-11 sm:w-12 shrink-0 text-left tabular-nums mt-0.5">
                        {stop.time}
                      </span>

                      {/* Continuous Timeline Axis: line connects from first circle to last circle */}
                      <div className="relative w-5 flex justify-center shrink-0 self-stretch min-h-[36px]">
                        {/* Continuous Vertical Line */}
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 w-[2px] bg-[#60A5FA] pointer-events-none ${
                            isFirst
                              ? 'top-2.5 bottom-0'
                              : isLast
                              ? 'top-0 h-2.5'
                              : 'top-0 bottom-0'
                          }`}
                        />

                        {/* Blue Connected Dot placed directly on the line */}
                        <div className="relative z-10 mt-1 flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1E60F3] ring-4 ring-white shrink-0 shadow-2xs" />
                        </div>
                      </div>

                      {/* Location Place Name & Inconsistency Warning */}
                      <div className="min-w-0 flex-1 pl-0.5 pb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800 truncate block">{stop.place}</span>
                          {!consistency.isConsistent && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-medium shrink-0">
                              {consistency.warning}
                            </span>
                          )}
                        </div>
                        {stop.memo && (
                          <span className="text-[11px] text-slate-400 truncate block mt-0.5">{stop.memo}</span>
                        )}
                      </div>
                    </div>

                    {/* More Action Button */}
                    <div className="relative shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuStopId(activeMenuStopId === stop.id ? null : stop.id);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuStopId === stop.id && (
                        <div className="absolute right-0 top-full mt-1 w-24 bg-white border border-slate-100 rounded-xl shadow-lg z-20 py-1 divide-y divide-slate-100 animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStop(stop);
                              setActiveMenuStopId(null);
                              setIsAddStopOpen(true);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                          >
                            <Pencil className="w-3 h-3 text-slate-400" />
                            <span>수정</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStop(stop.id)}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                            <span>삭제</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setEditingStop(null);
                setIsAddStopOpen(true);
              }}
              className="w-full border-2 border-dashed border-slate-200 hover:border-[#1E60F3] rounded-2xl p-6 text-center bg-slate-50/40 hover:bg-blue-50/30 transition-all cursor-pointer group space-y-2"
            >
              <p className="text-xs font-semibold text-slate-500">오늘 배차된 운행 일정이 없어요</p>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 group-hover:border-[#1E60F3] text-xs font-extrabold text-[#1E60F3] shadow-2xs transition-all">
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>첫 번째 일정 추가하기</span>
              </span>
            </button>
          )}
        </section>

        {/* 7. 특이사항 (자주 쓰는 태그 칩 + textarea) */}
        <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#1E60F3] stroke-[2.2]" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">특이사항</h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">빠른 메모 태그</span>
          </div>

          {/* Quick-insert Tag Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {['경유지 추가', 'VIP 대기 지연', '주유/세차 완료', '교통 정체 우회'].map((tag) => {
              const isIncluded = (logData.notes || '').includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setLogData((prev) => {
                      const current = (prev.notes || '').trim();
                      if (current.includes(tag)) {
                        return prev;
                      }
                      const nextNotes = current ? `${current}, ${tag}` : tag;
                      return { ...prev, notes: nextNotes.slice(0, 500) };
                    });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer active:scale-95 ${
                    isIncluded
                      ? 'bg-[#1E60F3] text-white border border-[#1E60F3] shadow-2xs'
                      : 'bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#1E60F3] border border-slate-200/80'
                  }`}
                >
                  + {tag}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <textarea
              rows={3}
              value={logData.notes}
              onChange={(e) =>
                setLogData((prev) => ({ ...prev, notes: e.target.value.slice(0, 500) }))
              }
              placeholder="운행 중 메모나 특이사항을 남겨주세요"
              className="w-full p-3.5 pb-7 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all resize-none shadow-2xs"
            />
            <span className="absolute bottom-2.5 right-3 text-[11px] text-slate-400 font-medium">
              {logData.notes.length}/500
            </span>
          </div>
        </section>
      </section>

        {/* 8. Bottom Action Buttons inside Modal Card */}
        <div className="p-3.5 bg-white/95 backdrop-blur-md border-t border-slate-100 shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleTemporarySave}
              className="w-full py-3 border border-slate-200 bg-white text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 active:scale-98 transition-all shadow-2xs cursor-pointer"
            >
              임시저장
            </button>
            <button
              type="button"
              onClick={handleSubmitLog}
              className="w-full py-3 bg-[#1E60F3] text-white text-sm font-bold rounded-xl shadow-[0_4px_14px_rgba(30,96,243,0.35)] hover:bg-blue-600 active:scale-98 transition-all cursor-pointer"
            >
              운행일지 제출하기
            </button>
          </div>
        </div>
      </div>

      {/* 일정 추가 / 수정 Bottom Sheet Popup */}
      <AddScheduleModal
        isOpen={isAddStopOpen}
        onClose={() => {
          setIsAddStopOpen(false);
          setEditingStop(null);
        }}
        onSave={handleSaveStop}
        editingStop={editingStop}
        onOpenMapSearch={onOpenLocationSearch}
        selectedLocationFromMap={selectedLocationFromMap}
      />

      {/* iOS-style Wheel & Native Time Picker Modal (출근 시각 설정 / 퇴근 시각 설정) */}
      {timePickerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                {timePickerTarget === 'clockIn' ? '출근 시각 설정' : '퇴근 시각 설정'}
              </h3>
              <button
                type="button"
                onClick={() => setTimePickerTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 원터치 '현재 시각 적용' 칩 */}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-2xl px-3.5 py-2.5">
              <div className="text-lg font-black text-[#1E60F3] tabular-nums tracking-tight">
                {clampTimeComponent(pickerHour, 23)}:{clampTimeComponent(pickerMinute, 59)}
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  const now = new Date();
                  const hh = String(now.getHours()).padStart(2, '0');
                  const mm = String(now.getMinutes()).padStart(2, '0');
                  setPickerHour(hh);
                  setPickerMinute(mm);
                  setTimeout(() => {
                    document.getElementById(`wheel-hour-${hh}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    document.getElementById(`wheel-min-${mm}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }, 30);
                }}
                className="px-3 py-1.5 rounded-full bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-extrabold shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>현재 시각 적용</span>
              </button>
            </div>

            {/* iOS 스타일 상하 스와이프 휠 피커 (모바일 키보드 올라옴 방지) */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-2.5">
              {/* Hour Wheel (00 ~ 23) */}
              <div className="h-36 overflow-y-auto snap-y snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-1 px-1">
                {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((hh) => {
                  const selected = clampTimeComponent(pickerHour, 23) === hh;
                  return (
                    <button
                      id={`wheel-hour-${hh}`}
                      key={hh}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setPickerHour(hh);
                      }}
                      className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${
                        selected
                          ? 'bg-[#1E60F3] text-white text-base font-black shadow-2xs'
                          : 'text-sm font-semibold text-slate-500 hover:bg-slate-200/60'
                      }`}
                    >
                      {hh}시
                    </button>
                  );
                })}
              </div>

              <span className="text-xl font-black text-slate-300 select-none">:</span>

              {/* Minute Wheel (00 ~ 59) */}
              <div className="h-36 overflow-y-auto snap-y snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-1 px-1">
                {Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0')).map((mm) => {
                  const selected = clampTimeComponent(pickerMinute, 59) === mm;
                  return (
                    <button
                      id={`wheel-min-${mm}`}
                      key={mm}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setPickerMinute(mm);
                      }}
                      className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${
                        selected
                          ? 'bg-[#1E60F3] text-white text-base font-black shadow-2xs'
                          : 'text-sm font-semibold text-slate-500 hover:bg-slate-200/60'
                      }`}
                    >
                      {mm}분
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTimePickerTarget(null)}
                className="flex-1 py-2.5 border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer transition-all"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={applyTimePicker}
                className="flex-1 py-2.5 bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-extrabold rounded-xl shadow-xs cursor-pointer transition-all"
              >
                설정 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mileage Edit Modal */}
      {isEditingMileage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">계기판 주행거리 (km) 입력</h3>
              <button
                type="button"
                onClick={() => setIsEditingMileage(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">출발 계기판 (km)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={tempStartKm}
                  onChange={(e) => setTempStartKm(e.target.value)}
                  placeholder="예: 154,725"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-[#1E60F3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">복귀 계기판 (km)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={tempEndKm}
                  onChange={(e) => setTempEndKm(e.target.value)}
                  placeholder="예: 154,861"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-[#1E60F3]"
                />
              </div>

              {mileageError && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{mileageError}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditingMileage(false)}
                className="flex-1 py-2.5 border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveMileage}
                className="flex-1 py-2.5 bg-[#1E60F3] text-white text-xs font-bold rounded-xl shadow-xs"
              >
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Edit Modal (Customer name & passenger count) */}
      {isEditingSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">수행 요약 정보 수정</h3>
              <button
                type="button"
                onClick={() => setIsEditingSummary(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">고객명</label>
                <input
                  type="text"
                  value={tempClientName}
                  onChange={(e) => setTempClientName(e.target.value)}
                  placeholder="예: 인터코스"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-[#1E60F3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">담당승객 수</label>
                <input
                  type="text"
                  value={tempPassengerCount}
                  onChange={(e) => setTempPassengerCount(e.target.value)}
                  placeholder="예: 9명"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-[#1E60F3]"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditingSummary(false)}
                className="flex-1 py-2.5 border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveSummary}
                className="flex-1 py-2.5 bg-[#1E60F3] text-white text-xs font-bold rounded-xl shadow-xs"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Submission Notice Modal connected to HQ Operations System */}
      {isPreviewSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#1E60F3]">
              <div className="w-9 h-9 rounded-full bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">운행일지 제출 완료</h3>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                  본사 검토 대기 등록됨
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              작성하신 <span className="font-bold text-slate-800">{logData.driverName || '윤태준'}</span> 기사님의 운행일지
              (운행 경로 <span className="font-bold text-[#1E60F3]">{logData.stops.length}건</span>, 총 근무 <span className="font-bold text-slate-800">{logData.totalDutyHours}</span>)가
              본사 <span className="font-bold text-slate-800">[운행일지 관리]</span> 시스템으로 즉시 전송되었습니다.
            </p>

            <div className="space-y-2 pt-1">
              <Link
                href="/hq?tab=driving_logs"
                onClick={() => {
                  setIsPreviewSubmitModalOpen(false);
                  onClose();
                }}
                className="w-full py-3 bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow-[0_4px_14px_rgba(30,96,243,0.35)] flex items-center justify-center gap-1.5 transition-all"
              >
                <span>HQ 운행일지 관리에서 확인하기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsPreviewSubmitModalOpen(false);
                  onClose();
                }}
                className="w-full py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all"
              >
                확인 (창 닫기)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export const DrivingLogModal: React.FC<DrivingLogModalProps> = ({
  presentation = 'modal',
  isOpen,
  onClose,
  driverProfile,
  bookingId,
  onOpenLocationSearch,
  selectedLocationFromMap,
}) => {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen || presentation === 'page') return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen, presentation]);

  if (!isOpen) return null;

  return (
    <DrivingLogModalContent
      presentation={presentation}
      key={`${driverProfile.driverId || 'default'}-${bookingId || 'none'}-${isOpen}`}
      onClose={onClose}
      driverProfile={driverProfile}
      bookingId={bookingId}
      onOpenLocationSearch={onOpenLocationSearch}
      selectedLocationFromMap={selectedLocationFromMap}
    />
  );
};
