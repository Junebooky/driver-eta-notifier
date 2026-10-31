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
  isOpen: boolean;
  onClose: () => void;
  driverProfile: DriverProfile;
  bookingId?: string;
  onOpenLocationSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}

const DrivingLogModalContent: React.FC<{
  onClose: () => void;
  driverProfile: DriverProfile;
  bookingId?: string;
  onOpenLocationSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}> = ({ onClose, driverProfile, bookingId, onOpenLocationSearch, selectedLocationFromMap }) => {
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
          if(previous.stops.length || previous.startKm)return {...previous,submissionId:row.id};
          return {...previous,submissionId:row.id,driverId:row.driverId,clientName:row.customerName,passengerCount:String(row.passengerCount || ''),clockIn:row.clockIn,clockOut:row.clockOut,startKm:row.startKm,endKm:row.endKm,totalDutyHours:row.totalDutyHours,distanceKm:row.distanceKm,notes:row.notes,stops:row.stops.map((stop:HqDrivingLog['stops'][number])=>({...stop,memo:stop.note})),status:row.status==='draft'?'draft':'submitted'};
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
        passengerCount:logData.passengerCount ? Number(logData.passengerCount) : undefined,
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
      };

      const res = await submitDriverLogToHqDb(payload);
      if (!res.ok) {
        alert(`운행일지 제출 실패: ${res.error || '서버 저장에 실패했습니다.'}`);
        return;
      }

      haptics.success();
      const saved={...logData,submissionId:res.log?.id || logData.submissionId,status:'submitted' as const};
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in select-none overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-[#F8FAFC] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92dvh] h-[92dvh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-6 sm:animate-scale-up duration-300 relative"
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
        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 w-full pb-4"
        >
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

        {/* 2. Summary Hero Card (수행담당, 차량번호, 고객명, 담당승객 수) */}
        <section className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_rgba(30,96,243,0.05)] overflow-hidden">
          {/* Top Illustration Banner */}
          <div className="relative w-full h-28 sm:h-32 bg-sky-100 overflow-hidden">
            <Image
              src="/images/driving_log_hero.jpg"
              alt="VIP 의전 리무진 및 도시 전경"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 500px"
              className="object-cover object-center"
            />
            {/* Subtle Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-transparent to-black/10" />
          </div>

          {/* Bottom 4 Summary Columns */}
          <div
            className="grid grid-cols-4 py-3.5 px-2 text-center divide-x divide-slate-100 relative group cursor-pointer"
            onClick={() => {
              setTempClientName(logData.clientName);
              setTempPassengerCount(logData.passengerCount);
              setIsEditingSummary(true);
            }}
            title="클릭하여 고객명/승객수 수정"
          >
            {/* Column 1: 수행담당 */}
            <div className="px-1">
              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {logData.driverName}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">수행담당</div>
            </div>

            {/* Column 2: 차량번호 */}
            <div className="px-1">
              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {logData.carNumber}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">차량번호</div>
            </div>

            {/* Column 3: 고객명 */}
            <div className="px-1">
              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate flex items-center justify-center gap-0.5">
                <span className={logData.clientName ? '' : 'text-slate-400 font-normal'}>
                  {logData.clientName || '고객명 입력'}
                </span>
                <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-[#1E60F3] transition-colors" />
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">고객명</div>
            </div>

            {/* Column 4: 담당승객 수 */}
            <div className="px-1">
              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate flex items-center justify-center gap-0.5">
                <span className={logData.passengerCount ? '' : 'text-slate-400 font-normal'}>
                  {logData.passengerCount || '인원 입력'}
                </span>
                <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-[#1E60F3] transition-colors" />
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">담당승객 수</div>
            </div>
          </div>
        </section>

        {/* 3. Editable 출근시간 and 퇴근시간 */}
        <section className="grid grid-cols-2 gap-3">
          {/* 출근시간 Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => openTimePicker('clockIn')}
            className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-[#1E60F3]/40 active:scale-98 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 shrink-0">
                <Sun className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">출근시간</span>
                <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight group-hover:text-[#1E60F3] transition-colors">
                  {logData.clockIn || '--:--'}
                </span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-slate-600 transition-colors">
              <ChevronDown className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>

          {/* 퇴근시간 Card */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => openTimePicker('clockOut')}
            className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)] flex items-center justify-between cursor-pointer hover:border-[#1E60F3]/40 active:scale-98 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E60F3] shrink-0">
                <Moon className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">퇴근시간</span>
                <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight group-hover:text-[#1E60F3] transition-colors">
                  {logData.clockOut || '--:--'}
                </span>
              </div>
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-slate-600 transition-colors">
              <ChevronDown className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
        </section>

        {/* 4. Automatically calculated 총 근무시간 */}
        <section className="bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-blue-100/50 border border-blue-100/80 rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden shadow-[0_4px_18px_rgba(30,96,243,0.08)]">
          {/* Subtle curved background pattern */}
          <div className="absolute -right-8 -bottom-10 w-36 h-36 bg-blue-200/30 rounded-full blur-xl pointer-events-none" />

          {/* Clock Icon Badge */}
          <div className="w-12 h-12 rounded-full bg-[#1E60F3] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(30,96,243,0.3)] shrink-0">
            <Clock className="w-6 h-6 stroke-[2.2]" />
          </div>

          <div>
            <div className="text-xs text-slate-500 font-medium">총 근무시간</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {logData.totalDutyHours}
            </div>
          </div>
        </section>

        {/* 5. 주행거리 (시작 km -> 종료 km, emphasized 오늘 운행 box) */}
        <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#1E60F3] stroke-[2.2]" />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">주행거리</h2>
          </div>

          {/* Improved hierarchy with directional arrow and emphasized 오늘 운행 box */}
          <div className="flex items-center gap-2">
            {/* 시작 km */}
            <div
              onClick={() => {
                setTempStartKm(logData.startKm);
                setTempEndKm(logData.endKm);
                setMileageError(null);
                setIsEditingMileage(true);
              }}
              className="flex-1 bg-white border border-slate-200/90 rounded-xl p-2.5 text-center cursor-pointer hover:border-[#1E60F3] shadow-2xs group"
              title="클릭하여 시작 km 수정"
            >
              <div className="text-[11px] text-slate-400 font-medium">시작 km</div>
              <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center justify-center gap-1">
                <span>{logData.startKm || '-'}</span>
                <Pencil className="w-3 h-3 text-slate-300 group-hover:text-[#1E60F3] transition-colors" />
              </div>
            </div>

            {/* Directional Arrow */}
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />

            {/* 종료 km */}
            <div
              onClick={() => {
                setTempStartKm(logData.startKm);
                setTempEndKm(logData.endKm);
                setMileageError(null);
                setIsEditingMileage(true);
              }}
              className="flex-1 bg-white border border-slate-200/90 rounded-xl p-2.5 text-center cursor-pointer hover:border-[#1E60F3] shadow-2xs group"
              title="클릭하여 종료 km 수정"
            >
              <div className="text-[11px] text-slate-400 font-medium">종료 km</div>
              <div className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 flex items-center justify-center gap-1">
                <span>{logData.endKm || '-'}</span>
                <Pencil className="w-3 h-3 text-slate-300 group-hover:text-[#1E60F3] transition-colors" />
              </div>
            </div>

            {/* 오늘 운행 box (Emphasized cobalt blue) */}
            <div className="min-w-[92px] shrink-0 bg-white border border-[#FFFFFF] rounded-xl p-2.5 text-center shadow-2xs">
              <div className="text-[11px] text-[#1E60F3] font-semibold">오늘 운행</div>
              <div className="text-xs sm:text-sm font-black text-[#1E60F3] mt-0.5">
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

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setEditingStop(null);
                setIsAddStopOpen(true);
              }}
              className="flex items-center gap-1 text-xs font-bold text-[#1E60F3] border border-[#1E60F3] px-2.5 py-1 rounded-full hover:bg-blue-50 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>경로 추가</span>
            </button>
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
            <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400 bg-slate-50/40 space-y-2">
              <p>등록된 운행 일정이 없습니다.</p>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setEditingStop(null);
                  setIsAddStopOpen(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E60F3] hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>첫 번째 일정 추가하기</span>
              </button>
            </div>
          )}
        </section>

        {/* 7. 특이사항 textarea */}
        <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-[0_4px_16px_rgba(0,0,0,0.03)] space-y-2.5">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1E60F3] stroke-[2.2]" />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">특이사항</h2>
          </div>

          <div className="relative">
            <textarea
              rows={3}
              value={logData.notes}
              onChange={(e) =>
                setLogData((prev) => ({ ...prev, notes: e.target.value.slice(0, 500) }))
              }
              placeholder="특이사항이 있으시면 입력해주세요."
              className="w-full p-3.5 pb-7 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all resize-none shadow-2xs"
            />
            <span className="absolute bottom-2.5 right-3 text-[11px] text-slate-400 font-medium">
              {logData.notes.length}/500
            </span>
          </div>
        </section>
      </main>

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
              운행일지 제출
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

      {/* Time Picker Modal with strict clamping */}
      {timePickerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {timePickerTarget === 'clockIn' ? '출근시간 선택' : '퇴근시간 선택'}
              </h3>
              <button
                type="button"
                onClick={() => setTimePickerTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 py-2">
              <div className="flex flex-col items-center">
                <span className="text-[11px] text-slate-400 mb-1">시 (00~23)</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={pickerHour}
                  onChange={(e) => setPickerHour(e.target.value.slice(0, 2))}
                  className="w-16 p-2 text-center text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl focus:border-[#1E60F3] focus:outline-none"
                />
              </div>
              <span className="text-2xl font-bold text-slate-400 mt-4">:</span>
              <div className="flex flex-col items-center">
                <span className="text-[11px] text-slate-400 mb-1">분 (00~59)</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={pickerMinute}
                  onChange={(e) => setPickerMinute(e.target.value.slice(0, 2))}
                  className="w-16 p-2 text-center text-xl font-bold bg-slate-50 border border-slate-200 rounded-xl focus:border-[#1E60F3] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTimePickerTarget(null)}
                className="flex-1 py-2.5 border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl"
              >
                취소
              </button>
              <button
                type="button"
                onClick={applyTimePicker}
                className="flex-1 py-2.5 bg-[#1E60F3] text-white text-xs font-bold rounded-xl shadow-xs"
              >
                확인
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
              <h3 className="text-sm font-bold text-slate-900">주행거리 (km) 직접 수정</h3>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">시작 km</label>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">종료 km</label>
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
  isOpen,
  onClose,
  driverProfile,
  bookingId,
  onOpenLocationSearch,
  selectedLocationFromMap,
}) => {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <DrivingLogModalContent
      key={`${driverProfile.vehicleNo || 'default'}-${bookingId || 'none'}-${isOpen}`}
      onClose={onClose}
      driverProfile={driverProfile}
      bookingId={bookingId}
      onOpenLocationSearch={onOpenLocationSearch}
      selectedLocationFromMap={selectedLocationFromMap}
    />
  );
};
