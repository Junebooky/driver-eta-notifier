'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  X,
  User,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  Ban,
  PhoneCall,
  RefreshCw,
  Clock,
  BellRing,
  MessageSquareText,
  Image as ImageIcon,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';
import { VIP_REAL_VEHICLES, stripManufacturerName } from '@/utils/vehicleData';
import { HqDriverVehicleInfoModal } from './bookings/HqDriverVehicleInfoModal';
import { HqDriverAssetManagerModal } from './drivers/HqDriverAssetManagerModal';
import { useHqDrivers } from '@/utils/useHqDrivers';
import {
  createBookingPricingSnapshot,
  DEFAULT_DRIVER_PROFILES,
  DEFAULT_VEHICLE_PRICING_PRESETS,
  getSortedDriversForLanguage,
} from '@/utils/settlementCalculator';
import {
  getDriverProfilesSnapshot,
  getHqCustomersSnapshot,
  getVehiclePresetsSnapshot,
  subscribeSettlementReports,
  upsertEventSettlementFromBookings,
} from '@/utils/settlementStorage';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { HqPlaceSearchInput } from './HqPlaceSearchInput';
import { TossDatePicker } from '@/components/common/TossDatePicker';
import {
  cleanDriverIdentity,
  detectDispatchConflicts,
  formatSettlementDateLabel,
  getKstTodayDateStr,
  mapScheduleItemToHqBooking,
  normalizeDateToIso,
  normalizeTimeHHmm,
} from '@/utils/dispatchConflictDetector';

export interface HqBookingDetailModalProps {
  booking: HqBooking | null;
  existingBookings?: HqBooking[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateBooking: (updated: HqBooking) => void;
  onSavedServer?: () => Promise<void> | void;
  onOpenCustomerMessage?: (booking: HqBooking) => void;
}

export const HqBookingDetailModal: React.FC<HqBookingDetailModalProps> = ({
  booking,
  existingBookings = [],
  isOpen,
  onClose,
  onUpdateBooking,
  onSavedServer,
  onOpenCustomerMessage,
}) => {
  const liveDriverProfiles = useSyncExternalStore(
    subscribeSettlementReports,
    getDriverProfilesSnapshot,
    () => DEFAULT_DRIVER_PROFILES
  );
  const liveVehiclePresets = useSyncExternalStore(
    subscribeSettlementReports,
    getVehiclePresetsSnapshot,
    () => DEFAULT_VEHICLE_PRICING_PRESETS
  );
  const liveCustomers = useSyncExternalStore(
    subscribeSettlementReports,
    getHqCustomersSnapshot,
    () => INITIAL_HQ_CUSTOMERS
  );

  // Editable fields state synced when booking changes
  const [customerName, setCustomerName] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [passengerCount, setPassengerCount] = useState(1);
  const [flightNumber, setFlightNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [selectedDriverName, setSelectedDriverName] = useState('');
  const [selectedVehiclePlate, setSelectedVehiclePlate] = useState('');
  const [allowConflictOverride, setAllowConflictOverride] = useState(false);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('고객 요청 일정 취소');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Driver & Vehicle Info Asset Modal States
  const { drivers: hqDrivers } = useHqDrivers();
  const [isDriverVehicleInfoModalOpen, setIsDriverVehicleInfoModalOpen] = useState(false);
  const [isAssetManagerModalOpen, setIsAssetManagerModalOpen] = useState(false);
  const [assetManagerDriverId, setAssetManagerDriverId] = useState('');
  const [assetManagerVehiclePlate, setAssetManagerVehiclePlate] = useState('');

  const isNewBooking = Boolean(booking && !booking.scheduleId && booking.id.startsWith('new_'));

  useEffect(() => {
    if (!booking || !isOpen) return;
    setCustomerName(booking.customerName || '');
    setPickupDate(normalizeDateToIso(booking.pickupDate) || getKstTodayDateStr());
    setPickupTime(normalizeTimeHHmm(booking.pickupTime) || '09:00');
    setPickupLocation(booking.pickupLocation || '');
    setDestination(booking.destination || '');
    setPassengerName(booking.passengerName || '');
    setPassengerPhone(booking.passengerPhone || '');
    setPassengerCount(booking.passengerCount || 1);
    setFlightNumber(booking.flightNumber || '');
    setNotes(booking.notes || '');

    const cleanDrv = cleanDriverIdentity(booking.driverName);
    setSelectedDriverName(cleanDrv);
    setSelectedVehiclePlate(
      booking.vehiclePlate && booking.vehiclePlate !== '미배정' ? booking.vehiclePlate : ''
    );
    setAllowConflictOverride(false);
    setShowCancelConfirm(false);
    setNotice(null);
    setErrorMsg(null);
  }, [booking, isOpen]);

  const sortedDrivers = useMemo(
    () => getSortedDriversForLanguage(booking?.requestedLanguage || 'ko', liveDriverProfiles),
    [booking?.requestedLanguage, liveDriverProfiles]
  );

  // Live conflict check in modal
  const modalConflicts = useMemo(() => {
    if (!booking || !isOpen) return [];
    return detectDispatchConflicts(
      {
        id: booking.id,
        scheduleId: booking.scheduleId,
        pickupDate,
        pickupTime,
        driverName: selectedDriverName,
        vehiclePlate: selectedVehiclePlate,
      },
      existingBookings
    );
  }, [booking, isOpen, pickupDate, pickupTime, selectedDriverName, selectedVehiclePlate, existingBookings]);

  if (!isOpen || !booking) return null;

  const handleSelectDriver = (drvName: string) => {
    setErrorMsg(null);
    setSelectedDriverName(drvName);
    const matched = liveDriverProfiles.find((d) => d.name === drvName);
    if (matched && !selectedVehiclePlate) {
      setSelectedVehiclePlate(matched.plate);
    }
  };

  // Persist reservation (unassigned) or confirmed dispatch (published) to real API
  const handleSaveOrPublish = async (targetStatus: 'unassigned' | 'published') => {
    setErrorMsg(null);
    setNotice(null);

    if (!customerName.trim()) {
      setErrorMsg('고객사명(또는 예약자명)을 입력해 주세요.');
      return;
    }
    if (!pickupDate || !pickupTime || !pickupLocation.trim() || !destination.trim()) {
      setErrorMsg('운행 일자, 픽업 시간, 출발지, 도착지는 모두 필수 입력 항목입니다.');
      return;
    }

    if (targetStatus === 'published') {
      if (booking.serviceMode !== 'vehicle_only' && !selectedDriverName) {
        setErrorMsg('배차 확정을 위해 담당 기사를 선택해 주세요. 선정 전이라면 [미배정 대기함 저장]을 이용하세요.');
        return;
      }
      if (!selectedVehiclePlate) {
        setErrorMsg('배정할 차량을 선택해 주세요.');
        return;
      }
      if (modalConflicts.length > 0 && !allowConflictOverride) {
        setErrorMsg(modalConflicts[0].message);
        return;
      }
    }

    const matchedDriver = liveDriverProfiles.find((d) => d.name === selectedDriverName);
    const matchedVehicle = VIP_REAL_VEHICLES.find((v) => v.plate === selectedVehiclePlate);
    const resolvedModel =
      matchedVehicle?.model ||
      matchedDriver?.defaultVehicleRaw ||
      (booking.vehicleModel !== '-' ? booking.vehicleModel : '');

    const matchedCust = liveCustomers.find(
      (c) => c.id === booking.customerId || c.name === customerName.trim()
    );

    const pricingSnapshot = createBookingPricingSnapshot({
      vehicleModel: resolvedModel || '스프린터 블랙',
      driverName: selectedDriverName,
      serviceMode: booking.serviceMode || 'with_driver',
      requestedLanguage: booking.requestedLanguage || 'ko',
      customer: matchedCust || null,
      vehiclePresets: liveVehiclePresets,
      driverProfiles: liveDriverProfiles,
    });

    setIsSaving(true);
    try {
      const res = await fetch('/api/schedules/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: isNewBooking ? undefined : booking.scheduleId || booking.id,
          bookingNo: booking.bookingNo,
          customerName: customerName.trim(),
          customerId: booking.customerId || matchedCust?.id,
          orderingAgency: booking.orderingAgency,
          endBrand: booking.endBrand || customerName.trim(),
          eventId: booking.eventId,
          eventName: booking.eventName || `${customerName.trim()} VIP 의전`,
          billingTarget: booking.billingTarget,
          billingTargetName: booking.billingTargetName,
          groupId: booking.groupId,
          groupName: booking.groupName,
          groupTotalVehicles: booking.groupTotalVehicles,
          groupVehicleIndex: booking.groupVehicleIndex,
          intakeSource: isNewBooking
            ? targetStatus === 'unassigned'
              ? 'phone'
              : 'manual'
            : booking.intakeSource || 'manual',
          vehicleNo:
            targetStatus === 'unassigned' && !selectedVehiclePlate
              ? undefined
              : selectedVehiclePlate || booking.vehicleNoKey,
          vehicleModel: targetStatus === 'unassigned' && !selectedVehiclePlate ? undefined : resolvedModel,
          vehiclePlate: targetStatus === 'unassigned' && !selectedVehiclePlate ? undefined : selectedVehiclePlate,
          driverId: matchedDriver?.id,
          driverName:
            targetStatus === 'unassigned' && !selectedDriverName
              ? undefined
              : booking.serviceMode === 'vehicle_only'
                ? '차량만 대여'
                : selectedDriverName,
          driverPhone: matchedDriver?.phone || booking.driverPhone,
          date: pickupDate,
          pickupTime,
          origin: pickupLocation.trim(),
          destination: destination.trim(),
          passengerName: passengerName.trim() || customerName.trim(),
          passengerPhone: passengerPhone.trim() || undefined,
          passengerCount,
          flightNumber: flightNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          dispatchStatus: targetStatus,
          customerBrochure:
            !isNewBooking &&
              booking.dispatchStatus === '배차 완료' &&
              cleanDriverIdentity(booking.driverName) !== selectedDriverName
              ? '재발송 필요'
              : booking.customerBrochure,
          requestedLanguage: booking.requestedLanguage || 'ko',
          languageOverrideConfirmed: booking.languageOverrideConfirmed,
          serviceMode: booking.serviceMode || 'with_driver',
          appliedPricingSnapshot: pricingSnapshot,
          allowUnverified: true,
          allowConflictOverride,
          publishedBy: targetStatus === 'unassigned' ? '사모님(예약접수)' : '대표님(배차확정)',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.schedule) {
        setErrorMsg(data.error || '서버 저장에 실패했습니다. 다시 시도해 주세요.');
        haptics.errorAlert();
        return;
      }

      const updatedBooking = mapScheduleItemToHqBooking(data.schedule, booking.no - 1);

      if (targetStatus === 'published' && matchedCust) {
        const evId = updatedBooking.eventId || `ev-${updatedBooking.id}`;
        upsertEventSettlementFromBookings({
          reportId: `rep-${evId}`,
          eventId: evId,
          customer: matchedCust,
          eventName: updatedBooking.eventName || `${matchedCust.name} VIP 의전`,
          eventDate: formatSettlementDateLabel(pickupDate),
          location: pickupLocation.trim(),
          bookings: [updatedBooking],
          orderingAgency: updatedBooking.orderingAgency,
          billingTarget: updatedBooking.billingTarget || 'end_brand',
          billingTargetName: updatedBooking.billingTargetName || `${matchedCust.name} 귀하`,
          status: 'draft',
        });
      }

      haptics.successPulse();
      onUpdateBooking(updatedBooking);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vip_hq_schedules_updated'));
      }
      await onSavedServer?.();

      if (targetStatus === 'unassigned') {
        setNotice('전화 예약이 [배차 대기함(미배정)]에 등록되었습니다. PC·모바일 어디서나 배차 확정 가능합니다.');
      } else if ((updatedBooking.version || 1) > 1 && updatedBooking.driverAck !== '확인완료') {
        setNotice(
          `배차 변경사항(v${updatedBooking.version})이 반영되어 ${selectedDriverName} 기사님 Cockpit에 [배차 재확인 요청]이 전송되었습니다.`
        );
      } else {
        setNotice(
          `${selectedDriverName} 기사님(${selectedVehiclePlate}) 배차가 확정되어 Driver Cockpit에 즉시 반영되었습니다.`
        );
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '통신 오류가 발생했습니다.');
      haptics.errorAlert();
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel dispatch end-to-end via /api/schedules/cancel
  const handleCancelDispatch = async () => {
    if (isNewBooking) {
      onClose();
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const targetId = booking.scheduleId || booking.id;
      const res = await fetch('/api/schedules/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: targetId,
          reason: cancelReason.trim() || '고객 요청 취소',
          cancelledBy: '본사 관제',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || '배차 취소 처리에 실패했습니다.');
        haptics.errorAlert();
        return;
      }

      const updatedBooking = data.schedule
        ? mapScheduleItemToHqBooking(data.schedule, booking.no - 1)
        : {
          ...booking,
          dispatchStatus: '취소' as const,
          driverAck: '-' as const,
          cancelReason: cancelReason.trim(),
        };

      haptics.warningPulse();
      onUpdateBooking(updatedBooking);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vip_hq_schedules_updated'));
      }
      await onSavedServer?.();
      setShowCancelConfirm(false);
      setNotice('배차가 취소 처리되었으며 담당 기사 Cockpit에도 [배차 취소됨]으로 즉시 반영되었습니다.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '취소 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendCustomerBrochure = async () => {
    haptics.successPulse();
    const updated: HqBooking = {
      ...booking,
      customerBrochure: '발송됨',
    };
    onUpdateBooking(updated);
    setNotice('고객 안내자료(기사·차량 블랙&골드 프로필) 발송 상태가 기록되었습니다.');
  };

  const isAlreadyPublished =
    !isNewBooking &&
    (booking.dispatchStatus === '배차 완료' || booking.dispatchStatus === '재확인 필요');
  const isCancelled = booking.dispatchStatus === '취소';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 text-[#1E60F3] font-mono">
              {booking.bookingNo}
            </span>
            <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">
              {isNewBooking
                ? '신규 전화 예약 접수 · 배차 등록'
                : `${booking.customerName} 예약 · 배차 관리`}
            </h3>
            {booking.version && booking.version > 1 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-[#1E60F3]">
                v{booking.version}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="모달 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Banners */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white flex items-start gap-2 shrink-0 shadow-xs">
            <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {notice && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-start gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Editable Reservation & Passenger Info */}
            <div className="space-y-3.5">
              <h4 className="text-sm font-black text-slate-800 flex items-center justify-between">
                <span>1. 예약 · 운행 일정 및 담당 승객</span>
                {booking.groupTotalVehicles && booking.groupTotalVehicles > 1 && (
                  <span className="text-xs font-bold text-[#1E60F3] bg-blue-50 px-2.5 py-1 rounded-lg">
                    복수 차량 {booking.groupVehicleIndex || 1}호차 / 총 {booking.groupTotalVehicles}대
                  </span>
                )}
              </h4>

              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    고객사 / 예약처 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="예: CHANEL Korea / 심텍 / 모건스탠리"
                    className="w-full h-11 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-bold text-slate-900 shadow-2xs transition-all outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TossDatePicker
                    label="운행 일자"
                    required
                    value={pickupDate}
                    onChange={(newDate) => setPickupDate(newDate)}
                    heightClass="h-11"
                  />
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      픽업 시간 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-bold text-slate-900 shadow-2xs transition-all outline-none cursor-pointer"
                    />
                  </div>
                </div>

                <HqPlaceSearchInput
                  label="출발지 (픽업 위치)"
                  required
                  value={pickupLocation}
                  onChange={(val) => setPickupLocation(val)}
                  placeholder="예: 인천국제공항 T2 / 조선팰리스 강남"
                  heightClass="h-11"
                  icon="mapPin"
                />

                <HqPlaceSearchInput
                  label="도착지 (목적지)"
                  required
                  value={destination}
                  onChange={(val) => setDestination(val)}
                  placeholder="예: 신라호텔 서울 / 코엑스"
                  heightClass="h-11"
                  icon="flag"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      담당 승객명
                    </label>
                    <input
                      type="text"
                      value={passengerName}
                      onChange={(e) => setPassengerName(e.target.value)}
                      placeholder="VIP 승객 성함"
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-bold text-slate-900 shadow-2xs transition-all outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      승객 연락처
                    </label>
                    <input
                      type="tel"
                      value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-medium text-slate-900 shadow-2xs transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      탑승 인원 (명)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={passengerCount}
                      onChange={(e) => setPassengerCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-bold text-slate-900 shadow-2xs transition-all outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      항공편명 (선택)
                    </label>
                    <input
                      type="text"
                      value={flightNumber}
                      onChange={(e) => setFlightNumber(e.target.value)}
                      placeholder="예: KE082"
                      className="w-full h-11 px-3.5 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-mono font-bold text-slate-900 shadow-2xs transition-all outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    배차 특이사항 · 의전 메모
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="피켓 영접, 수하물 개수, 차량 내 비품 요청 등"
                    className="w-full p-3 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl text-sm font-medium text-slate-800 shadow-2xs transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Representative Vehicle/Driver Assignment & Driver Cockpit Ack Status */}
            <div className="space-y-3.5">
              <h4 className="text-sm font-black text-slate-800">
                2. 차량 · 기사 배정 및 기사 확인 현황
              </h4>

              {/* Driver Assignment & Ack Card */}
              <div className="p-4 rounded-2xl border-2 border-blue-200/80 bg-blue-50/20 space-y-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#1E60F3]" />
                    <span className="text-sm font-black text-slate-900">
                      기사 Cockpit 동기화 상태
                    </span>
                  </div>

                  {isNewBooking ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-800">
                      신규 접수 작성 중
                    </span>
                  ) : isCancelled ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-700">
                      배차 취소됨
                    </span>
                  ) : booking.driverAck === '확인완료' ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      기사 확인완료 ({booking.driverAckTime || '기록됨'})
                    </span>
                  ) : booking.driverAck === '재확인 필요' ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-indigo-100 text-indigo-800">
                      변경됨 · 기사 재확인 대기 (v{booking.version || 2})
                    </span>
                  ) : booking.dispatchStatus === '미배정' ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-100 text-[#1E60F3]">
                      배차 대기함 (미배정)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      발송 완료 · 기사 미확인
                    </span>
                  )}
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      담당 기사 선정 (대표님 확인)
                    </label>
                    <select
                      value={selectedDriverName}
                      onChange={(e) => handleSelectDriver(e.target.value)}
                      disabled={isCancelled}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 bg-white text-sm font-bold text-slate-900 shadow-2xs cursor-pointer outline-none"
                    >
                      <option value="">-- 기사 미배정 (배차 대기함) --</option>
                      {sortedDrivers.map(({ driver }) => (
                        <option key={driver.id} value={driver.name}>
                          {driver.isEnglishVerified ? '[영어검증] ' : '[국문전용] '}
                          {driver.name} 기사 ({driver.phone} · 기본 {driver.plate})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      투입 차량 선정 (실제 보유 20대)
                    </label>
                    <select
                      value={selectedVehiclePlate}
                      onChange={(e) => {
                        setErrorMsg(null);
                        setSelectedVehiclePlate(e.target.value);
                      }}
                      disabled={isCancelled}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 bg-white text-sm font-bold text-slate-900 shadow-2xs cursor-pointer outline-none"
                    >
                      <option value="">-- 차량 미배정 --</option>
                      {VIP_REAL_VEHICLES.map((v) => (
                        <option key={v.id} value={v.plate}>
                          {v.plate} · {stripManufacturerName(v.model)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Schedule Conflict Warning */}
                {modalConflicts.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white space-y-1.5 shadow-sm">
                    {modalConflicts.map((c, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <span>{c.message}</span>
                      </div>
                    ))}
                    <label className="flex items-center gap-1.5 pt-1 text-xs font-bold text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowConflictOverride}
                        onChange={(e) => setAllowConflictOverride(e.target.checked)}
                        className="rounded border-slate-600 text-[#1E60F3] focus:ring-[#1E60F3]"
                      />
                      <span>일정 간격 중복을 확인했으며 예외 배차를 승인합니다.</span>
                    </label>
                  </div>
                )}

                {!isCancelled && (
                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveOrPublish('published')}
                      className="w-full py-3 px-4 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-[0.99] text-white text-sm font-black shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                    >
                      {isSaving ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>
                        {isAlreadyPublished
                          ? '변경사항 반영 · 기사 재확인 요청 전송'
                          : '차량·기사 배차 확정 · 기사 Cockpit 전송'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveOrPublish('unassigned')}
                      className="w-full py-2.5 px-3 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>
                        {isNewBooking
                          ? '배차 대기함에 미배정 예약으로 등록 (사모님 접수)'
                          : '미배정(배차 대기함) 상태로 저장'}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Driver Reminder Quick Card (when unacknowledged) */}
              {!isNewBooking &&
                !isCancelled &&
                (booking.driverAck === '미확인' || booking.driverAck === '재확인 필요') && (
                  <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <BellRing className="w-4 h-4 text-[#1E60F3]" />
                        <span className="text-sm font-black text-slate-900">
                          기사 미확인 재알림 전송
                        </span>
                      </div>
                      {(booking.reminderCount || 0) > 0 && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-blue-100 text-[#1E60F3] text-xs font-extrabold">
                          누적 {booking.reminderCount}회
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={async () => {
                        if (!booking.scheduleId && !booking.id) return;
                        setIsSaving(true);
                        setErrorMsg(null);
                        try {
                          const res = await fetch('/api/schedules/remind', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              scheduleId: booking.scheduleId || booking.id,
                              remindedBy: '본사 상세모달',
                            }),
                          });
                          const json = await res.json();
                          if (!res.ok || !json.ok) {
                            setErrorMsg(json.error || '재알림 전송에 실패했습니다.');
                          } else {
                            setNotice(
                              `담당 기사 Cockpit에 즉시 재확인 알림을 보냈습니다 (누적 ${json.reminderCount}회).`
                            );
                            await onSavedServer?.();
                          }
                        } catch {
                          setErrorMsg('재알림 전송 중 네트워크 오류가 발생했습니다.');
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Send className="w-4 h-4" />
                      <span>담당 기사 Cockpit에 확인 재알림 보내기</span>
                    </button>
                  </div>
                )}

              {/* Customer Auto-Prepared Notification Card (Distinct from Brochure) */}
              {!isNewBooking && !isCancelled && onOpenCustomerMessage && (
                <div className="p-4 rounded-2xl border border-indigo-200/90 bg-indigo-50/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <MessageSquareText className="w-4 h-4 text-indigo-600" />
                      <span className="text-sm font-black text-slate-900">
                        고객사 자동 안내 메시지 (문자·이메일)
                      </span>
                    </div>
                    {booking.pendingCustomerTrigger ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-indigo-600 text-white">
                        자동 준비됨
                      </span>
                    ) : (booking.customerNotifications?.length || 0) > 0 ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        발송 {booking.customerNotifications!.length}회
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-600 leading-normal">
                    실제 확정 일정·기사 변경·픽업지 도착 상태를 반영한 짧은 안내문입니다 (관리자 확인 후 발송).
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCustomerMessage(booking);
                    }}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquareText className="w-4 h-4" />
                    <span>안내 문자 · 이메일 확인 및 발송창 열기</span>
                  </button>
                </div>
              )}

              {/* Customer Brochure & Driver-Vehicle Info Card */}
              <div className="p-4 rounded-2xl border border-slate-200/90 bg-white space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#1E60F3]" />
                    <span className="text-sm font-black text-slate-900">
                      기사·차량 Info 고객 안내자료
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                      booking.customerBrochure === '발송됨'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : booking.customerBrochure === '준비완료'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : booking.customerBrochure === '재발송 필요'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {booking.customerBrochure || '미발송'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-normal">
                  확정된 기사와 실차 번호판 조합의 완성형 안내자료(PC·모바일)를 확인하고 다운로드하거나 발송 기록을 남깁니다.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDriverVehicleInfoModalOpen(true)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  >
                    <ImageIcon className="w-4 h-4 text-blue-400" />
                    <span>기사·차량 Info 확인 및 발송창 열기</span>
                  </button>

                  {booking.customerBrochure !== '발송됨' && (
                    <button
                      type="button"
                      onClick={handleSendCustomerBrochure}
                      className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                      title="단순 발송 완료 표시"
                    >
                      <span>완료 표시</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Dispatch Cancellation Box */}
              {!isNewBooking && !isCancelled && (
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2">
                  {!showCancelConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(true)}
                      className="w-full py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <Ban className="w-3.5 h-3.5 text-slate-500" />
                      <span>이 배차/예약 취소 처리</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-slate-700">
                        취소 사유 입력 (담당 기사 Cockpit에도 즉시 취소 알림 표시)
                      </label>
                      <input
                        type="text"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                        >
                          돌아가기
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={handleCancelDispatch}
                          className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer disabled:opacity-50"
                        >
                          배차 취소 확정
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="truncate">PC · 모바일 · 기사 Cockpit 실시간 연동됨</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold cursor-pointer shrink-0"
          >
            닫기
          </button>
        </div>
      </div>

      {/* Driver Vehicle Info Modal */}
      {isDriverVehicleInfoModalOpen && (
        <HqDriverVehicleInfoModal
          isOpen={isDriverVehicleInfoModalOpen}
          booking={booking}
          onClose={() => setIsDriverVehicleInfoModalOpen(false)}
          onOpenAssetManager={(drvId, vPlate) => {
            setAssetManagerDriverId(drvId);
            setAssetManagerVehiclePlate(vPlate);
            setIsAssetManagerModalOpen(true);
          }}
          onDispatchRecorded={() => {
            onUpdateBooking({
              ...booking,
              customerBrochure: '발송됨',
            });
            onSavedServer?.();
          }}
        />
      )}

      {/* Driver Asset Manager Modal */}
      {isAssetManagerModalOpen && (
        <HqDriverAssetManagerModal
          isOpen={isAssetManagerModalOpen}
          onClose={() => setIsAssetManagerModalOpen(false)}
          drivers={hqDrivers}
          initialDriverId={assetManagerDriverId || booking.driverId}
          initialVehiclePlate={assetManagerVehiclePlate || booking.vehiclePlate}
        />
      )}
    </div>
  );
};
