'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Sun,
  Moon,
  Clock,
  Calendar,
  Car,
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
  sortRouteStopsChronologically,
} from '@/utils/drivingLog';
import { withCurrentProfilePassenger } from '@/utils/drivingLogPassenger';
import Link from 'next/link';
import { AddScheduleModal } from './AddScheduleModal';
import { haptics } from '@/utils/haptics';
import { submitDriverLogToHqDb } from '@/utils/drivingLogHqStorage';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { findVipVehicle } from '@/utils/vehicleData';

function resolveDriverAvatarFallback(name?: string | null): string {
  const n = (name || '').trim();
  if (n.includes('이')) return '/images/driver_lee.png';
  if (n.includes('박')) return '/images/driver_park.png';
  if (n.includes('최')) return '/images/driver_choi.png';
  if (n.includes('정') || n.includes('윤')) return '/images/driver_jung.png';
  return '/images/driver_kim.png';
}

interface DrivingLogModalProps {
  presentation?: 'modal' | 'page';
  isOpen: boolean;
  onClose: () => void;
  driverProfile: DriverProfile;
  bookingId?: string;
  onOpenProfileModal?: () => void;
  onUpdateProfile?: (patch: Partial<DriverProfile>) => void;
  onOpenLocationSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}

const DrivingLogModalContent: React.FC<{
  presentation: 'modal' | 'page';
  onClose: () => void;
  driverProfile: DriverProfile;
  bookingId?: string;
  onOpenProfileModal?: () => void;
  onUpdateProfile?: (patch: Partial<DriverProfile>) => void;
  onOpenLocationSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}> = ({ presentation, onClose, driverProfile, bookingId, onOpenProfileModal, onUpdateProfile, onOpenLocationSearch, selectedLocationFromMap }) => {
  const scrollContainerRef = useRef<HTMLElement>(null);

  // Master driving log state initialized purely (booking-aware)
  const [logData, setLogData] = useState<DrivingLogData>(() =>
    loadDrivingLogDraft(driverProfile, undefined, undefined, bookingId)
  );

  const [fetchedAvatarUrl, setFetchedAvatarUrl] = useState<string | null>(driverProfile.avatarUrl || null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [isEditingCarNumber, setIsEditingCarNumber] = useState(false);
  const [carNumberDraft, setCarNumberDraft] = useState('');
  const carNumberInputRef = useRef<HTMLInputElement>(null);

  // Sync driverName and carNumber from driverProfile into logData
  useEffect(() => {
    setLogData((prev) => ({
      ...prev,
      driverName: driverProfile.driverName || prev.driverName,
      carNumber: driverProfile.carNumber || prev.carNumber,
    }));
  }, [driverProfile.driverName, driverProfile.carNumber]);

  // Fetch currently logged-in driver's profile photo from DB/Storage
  useEffect(() => {
    setAvatarLoadError(false);
    if (driverProfile.avatarUrl) {
      setFetchedAvatarUrl(driverProfile.avatarUrl);
    }
    const targetDriverId = driverProfile.driverId || driverProfile.id;
    if (!targetDriverId) return;
    const abort = new AbortController();
    fetch(`/api/hq/drivers/assets?driverId=${encodeURIComponent(targetDriverId)}&type=profile`, {
      cache: 'no-store',
      signal: abort.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!abort.signal.aborted && data?.ok && data.profile?.signedUrl) {
          setFetchedAvatarUrl(data.profile.signedUrl);
          onUpdateProfile?.({ avatarUrl: data.profile.signedUrl });
        }
      })
      .catch(() => { });
    return () => abort.abort();
  }, [driverProfile.driverId, driverProfile.id, driverProfile.avatarUrl]);

  // Profile settings are the only place the driver edits passenger identity.
  // Changing that setting updates this still-open draft without losing route or odometer.
  useEffect(() => {
    setLogData(previous => withCurrentProfilePassenger(previous, driverProfile.passengerName));
  }, [driverProfile.passengerName]);

  // Customer/company belongs to the HQ booking, not the driver's passenger profile.
  useEffect(() => {
    if (!bookingId) return;
    const abort = new AbortController();
    void fetch(`/api/schedules?date=${encodeURIComponent(logData.rawDate)}`, {
      credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
    }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      const booking = Array.isArray(data.schedules)
        ? data.schedules.find((item: { id?: string }) => String(item.id) === String(bookingId))
        : null;
      if (!booking || abort.signal.aborted) return;
      const customerName = typeof booking.customer_name === 'string' ? booking.customer_name.trim() : '';
      setLogData(previous => previous.clientName === customerName ? previous : { ...previous, clientName: customerName });
    }).catch(() => { });
    return () => abort.abort();
  }, [bookingId, logData.rawDate]);

  useEffect(() => {
    const abort = new AbortController();
    const query = new URLSearchParams({ date: logData.rawDate }); if (bookingId) query.set('bookingId', bookingId);
    fetch(`/api/driving-logs?${query}`, { cache: 'no-store', credentials: 'include', signal: abort.signal })
      .then(async response => {
        if (!response.ok) return; const data = await response.json(); const row = data.logs?.find((entry: HqDrivingLog) => (entry.bookingId || null) === (bookingId || null)); if (!row || abort.signal.aborted) return;
        setLogData(previous => {
          if (previous.stops.length || previous.startKm) return { ...previous, submissionId: row.id, hqStatus: row.status };
          const next: DrivingLogData = { ...previous, submissionId: row.id, hqStatus: row.status, driverId: row.driverId, clientName: row.customerName === '미지정 고객' ? '' : row.customerName, passengerName: row.passengerName ?? '', passengerCount: row.passengerCount ? `${row.passengerCount}명` : '', clockIn: row.clockIn, clockOut: row.clockOut, startKm: row.startKm, endKm: row.endKm, totalDutyHours: row.totalDutyHours, distanceKm: row.distanceKm, notes: row.notes, stops: sortRouteStopsChronologically(row.stops.map((stop: HqDrivingLog['stops'][number]) => ({ ...stop, memo: stop.note }))), status: row.status === 'draft' ? 'draft' : 'submitted' };
          return withCurrentProfilePassenger(next, driverProfile.passengerName);
        });
      }).catch(() => { });
    return () => abort.abort();
  }, [bookingId, driverProfile.driverId, driverProfile.passengerName, logData.rawDate]);

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

  // Add or update stop (Strictly sorted chronologically by HH:mm)
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
      const nextLog: DrivingLogData = {
        ...prev,
        stops: sortRouteStopsChronologically(updatedStops),
      };
      saveDrivingLogDraft(nextLog);
      return nextLog;
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
    if (logData.isDemoFixture) { alert('샘플 운행일지는 본사에 제출할 수 없습니다. 실제 운행 기록으로 전환해 주세요.'); return; }
    if (isSubmittingLog) return;
    setIsSubmittingLog(true);
    haptics.selection();

    // Map stops ensuring complete route details are passed in chronological order
    const sortedStops = sortRouteStopsChronologically(logData.stops);
    const stopsMapped = sortedStops.map((s) => ({
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
        id: logData.submissionId,
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
      const saved = { ...logData, submissionId: res.log?.id || logData.submissionId, hqStatus: res.log?.status, carNumber: res.log?.vehiclePlate || logData.carNumber, vehicleId: res.log?.vehicleId || logData.vehicleId, status: 'submitted' as const };
      setLogData(saved); saveDrivingLogDraft(saved);
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
    showToast('레퍼런스 샘플 데이터를 불러왔습니다.');
  };

  const handleResetToRealDraft = () => {
    haptics.selection();
    const fresh = loadDrivingLogDraft(driverProfile);
    setLogData(fresh);
    setTempStartKm(fresh.startKm);
    setTempEndKm(fresh.endKm);
    showToast('실제 빈 일지 상태로 초기화했습니다.');
  };

  const displayDriverName = (driverProfile.driverName || logData.driverName || '담당 기사').trim();
  const effectiveCarNumber = (driverProfile.carNumber || logData.carNumber || '').trim();
  const matchedDbVehicle = findVipVehicle(effectiveCarNumber);
  const hasDbMatchedCarNumber = Boolean(matchedDbVehicle);
  const resolvedVehicleModel =
    matchedDbVehicle?.model ||
    driverProfile.carModel ||
    (effectiveCarNumber === '서울99바9999' || driverProfile.vehicleNo?.includes('99')
      ? '대형버스 (유니버스)'
      : '차량 미지정');
  const effectiveAvatarSrc =
    !avatarLoadError && (fetchedAvatarUrl || driverProfile.avatarUrl)
      ? (fetchedAvatarUrl || driverProfile.avatarUrl)!
      : resolveDriverAvatarFallback(displayDriverName);

  const handleSaveInlineCarNumber = async () => {
    const trimmed = carNumberDraft.trim();
    setIsEditingCarNumber(false);
    if (!trimmed || trimmed === effectiveCarNumber) return;
    haptics.selection();
    setLogData((prev) => {
      const next = { ...prev, carNumber: trimmed };
      saveDrivingLogDraft(next);
      return next;
    });
    onUpdateProfile?.({ carNumber: trimmed });
    if (driverProfile.driverId) {
      try {
        await fetch('/api/driver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driverId: driverProfile.driverId,
            driver_name: displayDriverName,
            car_number: trimmed,
          }),
        });
      } catch { }
    }
    showToast('차량번호가 저장되었습니다.');
  };

  return (
    <div
      className={presentation === 'page' ? "w-full bg-inherit select-none" : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none overscroll-contain driver-modal-backdrop"}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className={presentation === 'page' ? "relative flex min-h-[70dvh] w-full flex-col bg-inherit" : "w-full max-w-lg bg-[#F6F8FC] rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90dvh] h-[90dvh] sm:h-auto sm:max-h-[90vh] relative driver-modal-card"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Scrollable Content */}
        <section
          aria-label="운행일지 작성"
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 w-full pb-4"
        >
          {logData.hqStatus && <p role="status" className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800">본사 검토 상태: {logData.hqStatus === 'draft' ? '임시 기록' : logData.hqStatus}</p>}
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

          {/* 1 & 2. 통합 상단 카드: 운행일지 헤더 + 로그인 기사 프로필 카드 + 오늘의 배차 정보 카드 */}
          <section className="bg-[#F6F8FC] border border-white/90 rounded-[28px] p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] space-y-3.5">
            {/* Header Row inside Top Card */}
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center space-x-3">
                <img
                  src="/images/icons/driving-logs/icon_driving_log.png"
                  alt="운행일지"
                  className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 select-none pointer-events-none"
                  draggable={false}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">운행일지</h2>
                    {logData.isDemoFixture ? (
                      <span className="text-[11px] bg-blue-50 text-[#1E60F3] font-bold px-2.5 py-0.5 rounded-full border border-blue-100">
                        샘플
                      </span>
                    ) : (
                      <span className="text-[11px] bg-[#EBF0F7] text-slate-500 font-bold px-2.5 py-0.5 rounded-full">
                        임시저장
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-400 font-semibold mt-0.5">
                    {logData.date || formatKoreanDate()}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {logData.isDemoFixture ? (
                  <button
                    type="button"
                    onClick={handleResetToRealDraft}
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-full hover:bg-white/80 transition-colors cursor-pointer"
                    title="실제 빈 일지로 전환"
                  >
                    <RotateCcw className="w-4 h-4 stroke-[2]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLoadDemoFixture}
                    className="w-9 h-9 flex items-center justify-center text-[#1E60F3] hover:text-blue-700 rounded-full hover:bg-white/80 transition-colors cursor-pointer"
                    title="레퍼런스 샘플 불러오기"
                  >
                    <Sparkles className="w-4 h-4 stroke-[2]" />
                  </button>
                )}
              </div>
            </div>

            {/* Logged-in Driver Profile Card (Replaces old Bus Hero Image) */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)] border border-slate-100/90 flex items-center gap-4 sm:gap-5">
              <div className="w-20 h-20 sm:w-[86px] sm:h-[86px] rounded-full overflow-hidden bg-slate-100 border border-slate-200/70 shrink-0 shadow-xs flex items-center justify-center">
                <img
                  src={effectiveAvatarSrc}
                  alt={displayDriverName}
                  onError={() => setAvatarLoadError(true)}
                  className="w-full h-full object-cover object-top select-none pointer-events-none"
                  draggable={false}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-[18px] sm:text-[20px] font-black text-slate-900 tracking-tight leading-snug truncate">
                  {displayDriverName}
                </div>

                {isEditingCarNumber ? (
                  <div className="flex items-center gap-1.5 py-0.5">
                    <input
                      ref={carNumberInputRef}
                      type="text"
                      value={carNumberDraft}
                      onChange={(e) => setCarNumberDraft(e.target.value)}
                      onBlur={handleSaveInlineCarNumber}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSaveInlineCarNumber();
                        } else if (e.key === 'Escape') {
                          setIsEditingCarNumber(false);
                        }
                      }}
                      placeholder="차량번호 입력 (예: 서울99바9999)"
                      className="w-full max-w-[180px] h-8 px-2.5 rounded-lg bg-slate-50 border border-[#1E60F3] text-sm font-bold text-slate-900 focus:outline-none tabular-nums"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] sm:text-base font-bold text-slate-600 tabular-nums truncate">
                      {effectiveCarNumber || '차량번호 미입력'}
                    </span>
                    {!hasDbMatchedCarNumber && (
                      <button
                        type="button"
                        onClick={() => {
                          haptics.lightTap();
                          setCarNumberDraft(effectiveCarNumber);
                          setIsEditingCarNumber(true);
                          setTimeout(() => carNumberInputRef.current?.focus(), 30);
                        }}
                        title="차량번호 직접 입력"
                        className="p-1 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
                        aria-label="차량번호 직접 입력"
                      >
                        <Pencil className="w-3.5 h-3.5 stroke-[2]" />
                      </button>
                    )}
                  </div>
                )}

                <div className="text-[13px] sm:text-sm font-semibold text-slate-400 leading-snug truncate pt-0.5">
                  {resolvedVehicleModel}
                </div>
              </div>
            </div>

            {/* Today's Dispatch Info Card (오늘의 배차 정보) */}
            <div className="rounded-3xl bg-white p-4 sm:p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)] border border-slate-100/90">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] sm:text-base font-black text-slate-900 tracking-tight">오늘의 배차 정보</span>
                {onOpenProfileModal && logData.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      onOpenProfileModal();
                    }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
                  >
                    <Pencil className="h-3.5 w-3.5" /> 프로필에서 수정
                  </button>
                )}
              </div>
              <div className="mt-3 divide-y divide-slate-200/60 rounded-2xl bg-[#F8FAFC] px-4 py-0.5">
                <div className="flex items-center justify-between gap-3 py-3">
                  <span className="shrink-0 text-xs sm:text-[13px] font-bold text-slate-500">담당 승객</span>
                  <span className="min-w-0 break-words text-right text-sm sm:text-[15px] font-black text-slate-900">
                    {logData.passengerName || '프로필에서 미입력'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <span className="shrink-0 text-xs sm:text-[13px] font-bold text-slate-500">탑승 인원</span>
                  <span className="text-sm sm:text-[15px] font-black text-slate-900">
                    {logData.passengerCount || '미확인'}
                  </span>
                </div>
                {logData.clientName && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <span className="shrink-0 text-xs sm:text-[13px] font-bold text-slate-500">예약 고객사</span>
                    <span className="min-w-0 break-words text-right text-sm sm:text-[15px] font-black text-slate-900">
                      {logData.clientName}
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[11.5px] sm:text-xs font-medium leading-relaxed text-slate-400">
                승객명은 프로필 설정에서 관리합니다. 인원은 승객명에 &apos;외 1명&apos; 또는 &apos;총 2명&apos;처럼 명시된 경우에만 계산됩니다.
              </p>
            </div>
          </section>

          {/* 3. '오늘의 운행' KPI 바 및 출퇴근 2열 화이트 카드 통합 섹션 */}
          <section className="bg-white border border-slate-100/90 rounded-3xl p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] space-y-3.5">
            {/* 상단 헤더 + 통합 KPI 바 */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-[15px] font-extrabold text-slate-900 tracking-tight">오늘의 운행</h2>
              </div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#F3F6FB] text-xs font-extrabold text-slate-600 tabular-nums">
                <span>
                  총 운행 <strong className="text-[#1E60F3] font-black">{logData.totalDutyHours || '0시간 0분'}</strong> · 실주행 <strong className="text-[#1E60F3] font-black">{logData.distanceKm || '0 km'}</strong>
                </span>
              </div>
            </div>

            {/* 출근 / 퇴근 2열 화이트 라운드 탭 카드 (회색 대신 깨끗한 화이트 볼륨감 적용) */}
            <div className="grid grid-cols-2 gap-3">
              {/* 출근 카드 */}
              <button
                type="button"
                onClick={() => openTimePicker('clockIn')}
                className="w-full text-left rounded-2xl p-3.5 sm:p-4 bg-white hover:bg-[#FBFDFF] border border-slate-100/90 hover:border-blue-200 shadow-[0_3px_14px_rgba(15,23,42,0.05)] transition-all cursor-pointer active:scale-98 flex items-center gap-3 group"
              >
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-amber-100/85 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src="/images/icons/driver_ui/icon_work_start.png"
                    alt="출근"
                    className="w-9 h-9 sm:w-10 sm:h-10 scale-115 object-contain select-none"
                    draggable={false}
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] text-slate-400 font-semibold block">출근 시각</span>
                  {logData.clockIn ? (
                    <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight tabular-nums group-hover:text-[#1E60F3] transition-colors block mt-0.5">
                      {logData.clockIn}
                    </span>
                  ) : (
                    <span className="text-xs sm:text-sm font-extrabold text-[#1E60F3] block mt-0.5">
                      출근 기록
                    </span>
                  )}
                </div>
              </button>

              {/* 퇴근 카드 */}
              <button
                type="button"
                onClick={() => openTimePicker('clockOut')}
                className="w-full text-left rounded-2xl p-3.5 sm:p-4 bg-white hover:bg-[#FBFDFF] border border-slate-100/90 hover:border-blue-200 shadow-[0_3px_14px_rgba(15,23,42,0.05)] transition-all cursor-pointer active:scale-98 flex items-center gap-3 group"
              >
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-blue-100/85 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src="/images/icons/driver_ui/icon_work_end.png"
                    alt="퇴근"
                    className="w-9 h-9 sm:w-10 sm:h-10 scale-115 object-contain select-none"
                    draggable={false}
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] text-slate-400 font-semibold block">퇴근 시각</span>
                  {logData.clockOut ? (
                    <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight tabular-nums group-hover:text-[#1E60F3] transition-colors block mt-0.5">
                      {logData.clockOut}
                    </span>
                  ) : (
                    <span className="text-xs sm:text-sm font-extrabold text-[#1E60F3] block mt-0.5">
                      퇴근 기록
                    </span>
                  )}
                </div>
              </button>
            </div>
          </section>

          {/* 4. 주행거리 일체형 입력 컨테이너 */}
          <section className="bg-white border border-slate-100/90 rounded-3xl p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-[15px] font-extrabold text-slate-900 tracking-tight">주행거리</h2>
              </div>
              <span className="text-xs sm:text-[13px] font-extrabold text-[#1E60F3] tabular-nums">
                실주행 {logData.distanceKm || '0 km'}
              </span>
            </div>

            <CustodyMileageLink driverId={driverProfile.driverId} bookingId={bookingId} date={logData.rawDate} onApply={value => {
              const distance = calculateDrivingDistance(value.startKm, value.endKm);
              setLogData(previous => ({ ...previous, ...value, startKm: formatOdometer(value.startKm), endKm: formatOdometer(value.endKm), distanceKm: distance.formatted, odoSource: 'inspection_verified', isOdoManualOverride: false }));
              showToast('서버 인수·반납 계기판 값을 적용했습니다.');
            }} />

            {/* 일체형 출발/복귀 계기판 입력 컨테이너 (클린 화이트 볼륨감) */}
            <button
              type="button"
              onClick={() => {
                setTempStartKm(formatOdometer(logData.startKm));
                setTempEndKm(formatOdometer(logData.endKm));
                setMileageError(null);
                setIsEditingMileage(true);
              }}
              className="w-full bg-white hover:bg-[#FBFDFF] border border-slate-100/90 hover:border-blue-200 shadow-[0_3px_14px_rgba(15,23,42,0.05)] rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-all group"
              title="탭하여 출발·복귀 계기판 입력"
            >
              {/* 좌측: 출발 계기판 */}
              <div className="flex-1 min-w-0 text-left">
                <span className="text-[11px] font-semibold text-slate-400 block">출발 계기판</span>
                <span
                  className={`text-sm sm:text-base font-black tracking-tight tabular-nums block mt-0.5 ${logData.startKm ? 'text-slate-900 group-hover:text-[#1E60F3]' : 'text-[#1E60F3]'
                    }`}
                >
                  {logData.startKm ? `${logData.startKm} km` : '계기판 입력'}
                </span>
              </div>

              {/* 중앙: 미니멀 SVG 우측 화살표 */}
              <svg
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                className="w-4 h-4 text-slate-300 group-hover:text-[#1E60F3] transition-colors shrink-0"
              >
                <path
                  d="M4.5 10H15.5M15.5 10L11 5.5M15.5 10L11 14.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* 우측: 복귀 계기판 */}
              <div className="flex-1 min-w-0 text-right">
                <span className="text-[11px] font-semibold text-slate-400 block">복귀 계기판</span>
                <span
                  className={`text-sm sm:text-base font-black tracking-tight tabular-nums block mt-0.5 ${logData.endKm ? 'text-slate-900 group-hover:text-[#1E60F3]' : 'text-[#1E60F3]'
                    }`}
                >
                  {logData.endKm ? `${logData.endKm} km` : '계기판 입력'}
                </span>
              </div>
            </button>
          </section>

          {/* 5. 운행 경로 Timeline */}
          <section className="bg-white border border-slate-100/90 rounded-3xl p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] space-y-3.5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-[15px] font-extrabold text-slate-900 tracking-tight">운행 경로</h2>
                <span className="inline-flex items-center gap-1 bg-[#F3F6FB] text-slate-600 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>총 {logData.stops.length}개 일정</span>
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
                {sortRouteStopsChronologically(logData.stops).map((stop, idx, sortedArr) => {
                  // Check timeline consistency against duty hours
                  const consistency = checkStopTimelineConsistency(
                    logData.clockIn,
                    logData.clockOut,
                    stop.time
                  );
                  const isFirst = idx === 0;
                  const isLast = idx === sortedArr.length - 1;

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
                            className={`absolute left-1/2 -translate-x-1/2 w-[2px] bg-[#60A5FA] pointer-events-none ${isFirst
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
                className="w-full border border-dashed border-slate-200 hover:border-[#1E60F3] rounded-2xl p-6 text-center bg-[#FBFDFF] hover:bg-blue-50/20 transition-all cursor-pointer group space-y-2.5"
              >
                <p className="text-xs font-semibold text-slate-500">오늘 배차된 운행 일정이 없어요</p>
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-slate-100 group-hover:border-[#1E60F3] text-xs font-extrabold text-[#1E60F3] shadow-[0_3px_10px_rgba(15,23,42,0.05)] transition-all">
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>첫 번째 일정 추가하기</span>
                </span>
              </button>
            )}
          </section>

          {/* 6. 특이사항 (자주 쓰는 태그 칩 + textarea) */}
          <section className="bg-white border border-slate-100/90 rounded-3xl p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-[15px] font-extrabold text-slate-900 tracking-tight">특이사항</h2>
              </div>
              <span className="text-[11px] text-slate-400 font-semibold">빠른 메모 태그</span>
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
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer active:scale-95 ${isIncluded
                      ? 'bg-[#1E60F3] text-white shadow-2xs'
                      : 'bg-[#F3F6FB] hover:bg-blue-50 text-slate-600 hover:text-[#1E60F3]'
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
                className="w-full p-4 pb-7 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all resize-none"
              />
              <span className="absolute bottom-2.5 right-3.5 text-[11px] text-slate-400 font-medium">
                {logData.notes.length}/500
              </span>
            </div>
          </section>
        </section>

        {/* 7. Bottom Action Buttons inside Modal Card */}
        <div className="px-4 pb-4 pt-2 bg-inherit shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTemporarySave}
              className="w-[38%] h-12 sm:h-13 border border-slate-100/90 bg-white text-slate-800 text-sm font-extrabold rounded-2xl hover:bg-slate-50 active:scale-98 transition-all shadow-[0_4px_14px_rgba(15,23,42,0.05)] cursor-pointer"
            >
              임시저장
            </button>
            <button
              type="button"
              onClick={handleSubmitLog}
              className="flex-1 h-12 sm:h-13 bg-[#1E60F3] text-white text-sm font-extrabold rounded-2xl shadow-[0_6px_18px_rgba(30,96,243,0.30)] hover:bg-[#1650D6] active:scale-98 transition-all cursor-pointer"
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

      {/* iOS-style Wheel & Direct Input Time Picker Modal (출근 시각 설정 / 퇴근 시각 설정) */}
      {timePickerTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 driver-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              haptics.lightTap();
              setTimePickerTarget(null);
            }
          }}
        >
          <div
            className="bg-[#F6F8FC] border border-slate-100/90 rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4 driver-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                {timePickerTarget === 'clockIn' ? '출근 시각 설정' : '퇴근 시각 설정'}
              </h3>
              <button
                type="button"
                onClick={() => setTimePickerTarget(null)}
                className="w-8 h-8 rounded-full bg-[#EDF1F7] hover:bg-slate-200/80 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>

            {/* 직접 타이핑 가능한 시간 입력 바 + 원터치 '지금' 버튼 */}
            <div className="flex items-center justify-between bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <input
                  id="driving-log-picker-hour-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={pickerHour}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    if (digits === '') {
                      setPickerHour('');
                      return;
                    }
                    const num = Math.min(23, parseInt(digits, 10));
                    const nextVal = digits.length === 2 ? String(num).padStart(2, '0') : digits;
                    setPickerHour(nextVal);
                    const padded = String(num).padStart(2, '0');
                    document
                      .getElementById(`wheel-hour-${padded}`)
                      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    if (digits.length === 2) {
                      const minInput = document.getElementById(
                        'driving-log-picker-min-input'
                      ) as HTMLInputElement | null;
                      minInput?.focus();
                      minInput?.select();
                    }
                  }}
                  onBlur={() => setPickerHour(clampTimeComponent(pickerHour || '00', 23))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyTimePicker();
                    }
                  }}
                  aria-label="시 입력"
                  className="w-12 h-9 rounded-xl bg-[#F4F7FC] border border-transparent focus:bg-white focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 text-center text-lg font-black text-[#0055FF] tabular-nums outline-none transition-all"
                />
                <span className="text-lg font-black text-[#0055FF] select-none">:</span>
                <input
                  id="driving-log-picker-min-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={pickerMinute}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    if (digits === '') {
                      setPickerMinute('');
                      return;
                    }
                    const num = Math.min(59, parseInt(digits, 10));
                    const nextVal = digits.length === 2 ? String(num).padStart(2, '0') : digits;
                    setPickerMinute(nextVal);
                    const padded = String(num).padStart(2, '0');
                    document
                      .getElementById(`wheel-min-${padded}`)
                      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }}
                  onBlur={() => setPickerMinute(clampTimeComponent(pickerMinute || '00', 59))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyTimePicker();
                    }
                  }}
                  aria-label="분 입력"
                  className="w-12 h-9 rounded-xl bg-[#F4F7FC] border border-transparent focus:bg-white focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 text-center text-lg font-black text-[#0055FF] tabular-nums outline-none transition-all"
                />
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
                className="px-2.5 py-1.5 rounded-xl bg-[#EBF3FF] hover:bg-blue-100/80 text-xs font-extrabold text-[#0055FF] active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>지금</span>
              </button>
            </div>

            {/* iOS 스타일 상하 스와이프 휠 피커 */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl p-2.5">
              {/* Hour Wheel (00 ~ 23) */}
              <div className="h-36 overflow-y-auto snap-y snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-1 px-1">
                {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((hh) => {
                  const selected = clampTimeComponent(pickerHour || '00', 23) === hh;
                  return (
                    <button
                      id={`wheel-hour-${hh}`}
                      key={hh}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setPickerHour(hh);
                      }}
                      className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${selected
                        ? 'bg-[#0055FF] text-white text-base font-black shadow-[0_3px_10px_rgba(0,85,255,0.25)]'
                        : 'text-sm font-semibold text-slate-500 hover:bg-slate-100'
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
                  const selected = clampTimeComponent(pickerMinute || '00', 59) === mm;
                  return (
                    <button
                      id={`wheel-min-${mm}`}
                      key={mm}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setPickerMinute(mm);
                      }}
                      className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${selected
                        ? 'bg-[#0055FF] text-white text-base font-black shadow-[0_3px_10px_rgba(0,85,255,0.25)]'
                        : 'text-sm font-semibold text-slate-500 hover:bg-slate-100'
                        }`}
                    >
                      {mm}분
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setTimePickerTarget(null)}
                className="flex-1 py-3 bg-[#EEF2F7] hover:bg-slate-200/80 text-xs sm:text-sm font-extrabold text-slate-700 rounded-2xl cursor-pointer transition-all active:scale-98"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={applyTimePicker}
                className="flex-1 py-3 bg-[#0055FF] hover:bg-[#0046D5] text-white text-xs sm:text-sm font-extrabold rounded-2xl shadow-[0_6px_16px_rgba(0,85,255,0.28)] cursor-pointer transition-all active:scale-98"
              >
                설정 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mileage Edit Modal */}
      {isEditingMileage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 driver-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              haptics.lightTap();
              setIsEditingMileage(false);
            }
          }}
        >
          <div
            className="bg-[#F6F8FC] rounded-3xl p-5 sm:p-6 w-full max-w-sm shadow-2xl border border-slate-100/90 space-y-5 driver-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="/images/icons/driver_ui/icon_km.png"
                  alt="주행거리"
                  className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0 select-none"
                  draggable={false}
                />
                <h3 className="text-base sm:text-[17px] font-extrabold text-slate-900 tracking-tight">
                  주행거리 입력
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsEditingMileage(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
                aria-label="닫기"
              >
                <X className="w-5 h-5 stroke-[2.2]" />
              </button>
            </div>

            {/* Volumetric White Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs sm:text-[13px] font-bold text-slate-600 mb-2">
                  출발 계기판 (km)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={tempStartKm}
                  onChange={(e) => setTempStartKm(formatOdometer(e.target.value))}
                  placeholder="예: 154,725"
                  className="w-full h-12 sm:h-13 px-4 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl text-base sm:text-lg font-extrabold text-slate-900 placeholder:font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-[13px] font-bold text-slate-600 mb-2">
                  복귀 계기판 (km)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={tempEndKm}
                  onChange={(e) => setTempEndKm(formatOdometer(e.target.value))}
                  placeholder="예: 154,861"
                  className="w-full h-12 sm:h-13 px-4 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl text-base sm:text-lg font-extrabold text-slate-900 placeholder:font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all tabular-nums"
                />
              </div>

              {mileageError && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl border border-red-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{mileageError}</span>
                </div>
              )}
            </div>

            {/* Bottom Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsEditingMileage(false);
                }}
                className="h-12 sm:h-13 rounded-2xl bg-[#EEF2F7] hover:bg-slate-200/80 text-slate-700 text-sm font-extrabold cursor-pointer transition-all active:scale-98"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveMileage}
                className="h-12 sm:h-13 rounded-2xl bg-[#0055FF] hover:bg-[#0046D5] text-white text-sm font-extrabold shadow-[0_6px_18px_rgba(0,85,255,0.28)] cursor-pointer transition-all active:scale-98"
              >
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Submission Notice Modal connected to HQ Operations System */}
      {isPreviewSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 driver-modal-backdrop">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-4 driver-modal-card">
            <div className="flex items-center gap-2.5 text-[#1E60F3]">
              <img
                src="/images/icons/driving-logs/icon_driving_log.png"
                alt="운행일지"
                className="w-9 h-9 object-contain shrink-0 select-none"
                draggable={false}
              />
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
  onOpenProfileModal,
  onUpdateProfile,
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
      onOpenProfileModal={onOpenProfileModal}
      onUpdateProfile={onUpdateProfile}
      onOpenLocationSearch={onOpenLocationSearch}
      selectedLocationFromMap={selectedLocationFromMap}
    />
  );
};
