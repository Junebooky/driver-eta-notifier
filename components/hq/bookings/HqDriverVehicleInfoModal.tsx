'use client';

import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import {
  X,
  User,
  Car,
  Download,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  Smartphone,
  ExternalLink,
  Loader2,
  Clock,
  ShieldCheck,
  ChevronDown,
  Check,
} from 'lucide-react';
import { HqBooking, CustomerBrochureStatus } from '@/types/hq';
import { DriverVehicleAssetBundle, DriverInfoDispatchLog } from '@/types/driverVehicleAsset';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';

export interface HqDriverVehicleInfoModalProps {
  isOpen: boolean;
  booking: HqBooking | null;
  onClose: () => void;
  onOpenAssetManager?: (driverId: string, vehiclePlate: string) => void;
  onDispatchRecorded?: (status: CustomerBrochureStatus, scheduleSynced: boolean) => void;
}

const DELIVERY_OPTIONS = [
  { value: 'manual_copy', label: '문자·카카오톡으로 보냈어요', detail: '문자나 카카오톡으로 전달했어요', icon: '/images/icons/driver_ui/icon_talk.png' },
  { value: 'email', label: '이메일로 보냈어요', detail: '이메일로 직접 전달했어요', icon: '/images/icons/eemail/icon_email.png' },
  { value: 'download', label: '이미지만 저장해둘게요', detail: '보내기 전 준비해둘게요', icon: null },
] as const;

export const HqDriverVehicleInfoModal: React.FC<HqDriverVehicleInfoModalProps> = ({
  isOpen,
  booking,
  onClose,
  onOpenAssetManager,
  onDispatchRecorded,
}) => {
  const [activeTab, setActiveTab] = useState<'pc' | 'mobile'>('pc');
  const [bundle, setBundle] = useState<DriverVehicleAssetBundle | null>(null);
  const [latestDispatchLog, setLatestDispatchLog] = useState<DriverInfoDispatchLog | null>(null);
  const [hasMismatch, setHasMismatch] = useState(false);
  const [mismatchReason, setMismatchReason] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipient, setRecipient] = useState(booking?.passengerPhone || '');
  const [manualDeliveryConfirmed, setManualDeliveryConfirmed] = useState(false);
  const submittingRef = useRef(false);
  const loadGeneration = useRef(0);
  const [channel, setChannel] = useState<'manual_copy' | 'email' | 'download'>('manual_copy');
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const channelMenuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const channelTriggerRef = useRef<HTMLButtonElement>(null);
  const channelOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const currentBookingId = booking?.scheduleId || booking?.id;
  const currentDriverId = booking?.driverId;
  const currentVehiclePlate = booking?.vehiclePlate;
  const currentDriverName = booking?.driverName;
  const currentVersion = booking?.version;

  // Load bundle and dispatch status
  const loadData = useCallback(async () => {
    if (!currentBookingId) return;

    const isAssigned =
      currentVehiclePlate &&
      currentVehiclePlate !== '미배정' &&
      currentVehiclePlate !== '-' &&
      currentDriverName &&
      currentDriverName !== '미배정';

    if (!isAssigned) {
      setBundle(null);
      return;
    }

    const generation = ++loadGeneration.current;
    setIsLoading(true);
    setBundle(null);
    setLatestDispatchLog(null);
    setHasMismatch(false);
    try {
      const vPlate = currentVehiclePlate || '';
      const driverId = currentDriverId || '';

      // 1. Fetch asset bundle
      const bundleRes = await fetch(
        `/api/hq/drivers/assets?driverId=${encodeURIComponent(driverId)}&vehiclePlate=${encodeURIComponent(vPlate)}&type=bundle`
      );
      const bundleJson = await bundleRes.json();
      if (!bundleRes.ok || !bundleJson.ok) throw new Error(bundleJson.error || '안내자료 조회 실패');
      if (generation !== loadGeneration.current) return;

      // 2. Fetch dispatch log & check for mismatches
      const bookingId = currentBookingId;
      const dispatchRes = await fetch(
        `/api/hq/drivers/assets/dispatch?bookingId=${encodeURIComponent(bookingId)}&currentDriverId=${encodeURIComponent(
          driverId
        )}&currentVehiclePlate=${encodeURIComponent(vPlate)}&version=${currentVersion || ''}`
      );
      const dispatchJson = await dispatchRes.json();
      if (dispatchRes.ok && dispatchJson.ok) {
        if (generation !== loadGeneration.current) return;
        setBundle(bundleJson.bundle);
        setLatestDispatchLog(dispatchJson.latestLog);
        setHasMismatch(Boolean(dispatchJson.hasMismatch));
        setMismatchReason(dispatchJson.mismatchReason || null);
      } else throw new Error(dispatchJson.error || '안내자료 기록 조회 실패');
    } catch (err: unknown) {
      if (generation === loadGeneration.current) setFeedback({ type: 'error', message: err instanceof Error ? err.message : '자료 조회 실패' });
    } finally {
      if (generation === loadGeneration.current) setIsLoading(false);
    }
  }, [currentBookingId, currentDriverId, currentVehiclePlate, currentDriverName, currentVersion]);

  useEffect(() => {
    if (isOpen) startTransition(() => { void loadData(); });
    const generation = loadGeneration;
    return () => { generation.current++; };
  }, [isOpen, loadData]);

  // The open modal can be reused for a different dispatch card. Never keep
  // a previous client's recipient or manual-delivery confirmation.
  useEffect(() => {
    if (!isOpen) return;
    setRecipient(booking?.passengerPhone || '');
    setManualDeliveryConfirmed(false);
    setChannel('manual_copy');
    setActiveTab('pc');
    setIsChannelMenuOpen(false);
    setFeedback(null);
  }, [isOpen, currentBookingId]);

  // Prevent the dispatch screen from moving behind the mobile modal.
  // Restore the previously focused control on close.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (isChannelMenuOpen && !channelMenuRef.current?.contains(event.target as Node)) {
        setIsChannelMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled])'
        )].filter(element => element.getClientRects().length > 0);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if (event.key !== 'Escape') return;
      if (isChannelMenuOpen) {
        setIsChannelMenuOpen(false);
        channelTriggerRef.current?.focus();
      } else {
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isChannelMenuOpen, onClose]);

  useEffect(() => {
    if (isChannelMenuOpen) channelOptionRefs.current[DELIVERY_OPTIONS.findIndex(option => option.value === channel)]?.focus();
  }, [isChannelMenuOpen, channel]);

  if (!isOpen || !booking) return null;

  const isAssigned =
    booking.vehiclePlate &&
    booking.vehiclePlate !== '미배정' &&
    booking.vehiclePlate !== '-' &&
    booking.driverName &&
    booking.driverName !== '미배정';

  const bookingId = booking.scheduleId || booking.id;
  const currentAsset = activeTab === 'pc' ? bundle?.pcInfo : bundle?.mobileInfo;
  const selectedDelivery = DELIVERY_OPTIONS.find(option => option.value === channel) || DELIVERY_OPTIONS[0];

  // Handle Download
  const handleDownload = () => {
    if (!currentAsset?.signedUrl) return;
    const link = document.createElement('a');
    link.href = currentAsset.signedUrl;
    link.download = `VIP안내_${booking.driverName || '기사'}_${booking.vehicleModel || '차량'}_${activeTab.toUpperCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    haptics.success();
  };

  // Handle Record Dispatch
  const handleRecordDispatch = async () => {
    if (!isAssigned || !bundle?.isReadyForCustomerDispatch || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/hq/drivers/assets/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          driverId: booking.driverId,
          driverName: booking.driverName,
          vehiclePlate: booking.vehiclePlate,
          vehicleModel: booking.vehicleModel,
          channel,
          recipient: recipient.trim(),
          expectedVersion: booking.version,
          manualDeliveryConfirmed,
          isPreparationOnly: !manualDeliveryConfirmed,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFeedback({ type: 'error', message: json.error || '발송 기록 실패' });
        haptics.errorAlert();
        return;
      }

      await loadData();
      if (json.scheduleSynced) haptics.success();
      else haptics.errorAlert();
      setFeedback({ type: json.scheduleSynced ? 'success' : 'warning', message: json.warning || json.message });
      setManualDeliveryConfirmed(false);
      onDispatchRecorded?.(json.brochureStatus, json.scheduleSynced === true);
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : '네트워크 오류' });
      haptics.errorAlert();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-2.5 sm:p-6 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="hq-driver-card-title" className="flex w-full max-w-[760px] max-h-[94dvh] sm:max-h-[90vh] flex-col overflow-hidden outline-none rounded-[24px] sm:rounded-[28px] bg-white shadow-[0_26px_76px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.045)]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 bg-white px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <div className="flex min-w-0 items-center gap-3.5">
            <img src="/images/icons/drivers/icon_profile_card.png" alt="" aria-hidden="true" className="size-12 shrink-0 select-none object-contain" draggable={false} />
            <div>
              <h2 id="hq-driver-card-title" className="text-[18px] font-bold tracking-[-0.035em] text-[#17233B] sm:text-[20px]">
                고객 안내 카드
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[#73839D]">
                예약 {booking.bookingNo || booking.id.slice(0, 8)} · {booking.customerName} ({booking.pickupDate} {booking.pickupTime})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="고객 안내 카드 닫기"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6] hover:text-[#17233B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dispatch Target Summary Banner */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pb-5 text-xs sm:px-7 sm:pb-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 font-medium">
              <User className="size-4 text-[#73839D]" />
              <span className="text-[#73839D]">배정 기사:</span>
              <strong className="font-semibold text-[#17233B]">{booking.driverName || '미배정'}</strong>
            </div>

            <div className="flex items-center gap-2 font-medium">
              <Car className="size-4 text-[#73839D]" />
              <span className="text-[#73839D]">배정 차량:</span>
              <strong className="font-semibold text-[#17233B]">
                {booking.vehicleModel} ({booking.vehiclePlate || '미배정'})
              </strong>
            </div>
          </div>

          {latestDispatchLog?.dispatchedAt && (
            <div className="flex items-center gap-1.5 text-[#73839D] text-[11px] font-medium">
              <Clock className="size-3.5 text-[#95A3B9]" />
              <span>{latestDispatchLog.snapshot?.status === 'prepared' ? '준비 완료' : latestDispatchLog.snapshot?.status === 'manual_recorded' ? '수동 발송 기록' : '이전 발송 기록'}: {String(latestDispatchLog.dispatchedAt).slice(0, 16).replace('T', ' ')}</span>
            </div>
          )}
        </div>

        {/* Mismatch Warning Alert */}
        {hasMismatch && (
          <div className="mx-5 mb-4 flex items-start gap-2.5 rounded-[16px] bg-[#FFF9F1] px-4 py-3 text-xs font-semibold text-[#8E633F] sm:mx-7">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#A8784C]" />
            <div className="flex-1">
              <span>{mismatchReason || '배차가 바뀌었어요. 새 안내 카드를 확인해 주세요.'}</span>
              <span className="mt-1 block text-[11px] font-normal leading-relaxed text-[#9E8067]">
                새 기사·차량 안내 카드를 확인한 뒤 전달해 주세요.
              </span>
            </div>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div
            role={feedback.type === 'success' ? 'status' : 'alert'}
            className={`mx-5 mb-4 flex items-center gap-2.5 rounded-[16px] px-4 py-3 text-xs font-medium sm:mx-7 ${
              feedback.type === 'success'
                ? 'bg-[#EEF3FF] text-[#31598F]'
                : feedback.type === 'warning' ? 'bg-[#FFF9F1] text-[#8E633F]'
                : 'bg-[#FFF4F2] text-[#A34E45]'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0 text-[#1E60F3]" />
            ) : (
              <AlertTriangle className="size-4 shrink-0 text-[#A34E45]" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-[#FAFBFD] px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
          {isLoading ? (
            <div role="status" className="flex min-h-[270px] items-center justify-center rounded-[22px] bg-white px-6 text-center text-sm text-[#73839D] shadow-[0_6px_20px_rgba(35,49,78,0.045)]">최신 배차와 안내자료를 확인하고 있습니다.</div>
          ) : !isAssigned ? (
            /* Condition 1: Dispatch Not Confirmed */
            <div className="space-y-3 rounded-[24px] bg-white px-6 py-12 text-center shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)]">
              <div className="mx-auto flex size-14 items-center justify-center rounded-[19px] bg-[#F7F9FC] text-[#73839D]">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-[17px] font-bold tracking-tight text-[#17233B]">기사와 차량을 먼저 배정해 주세요</h3>
              <p className="mx-auto max-w-md text-[13px] leading-6 text-[#73839D]">
                기사나 차량이 아직 정해지지 않았어요. 정확한 정보를 전달할 수 있도록 배차부터 완료해 주세요.
              </p>
              <div className="pt-2 text-[12px] font-medium text-[#73839D]">
                배차를 완료하면 안내 카드를 볼 수 있어요.
              </div>
            </div>
          ) : !bundle?.isReadyForCustomerDispatch ? (
            /* Condition 2: Assigned, but Info is Missing */
            <div className="space-y-3 rounded-[24px] bg-white px-6 py-12 text-center shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)]">
              <div className="mx-auto flex size-14 items-center justify-center rounded-[19px] bg-[#F7F9FC] text-[#73839D]">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-[17px] font-bold tracking-tight text-[#17233B]">
                아직 안내 카드가 없어요
              </h3>
              <p className="mx-auto max-w-md text-[13px] leading-6 text-[#73839D]">
                <strong className="font-semibold text-[#17233B]">[{booking.driverName}]</strong> 기사님의{' '}
                <strong className="font-semibold text-[#17233B]">[{booking.vehicleModel} ({booking.vehiclePlate})]</strong> 실차 조합
                PC/모바일 안내 이미지가 Supabase에 아직 등록되지 않았습니다.
              </p>
              <p className="text-[11px] text-[#95A3B9]">
                잘못된 차량 이미지로 대신 보여드리지 않아요.
              </p>
              {onOpenAssetManager && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAssetManager(booking.driverId || '', booking.vehiclePlate || '');
                    }}
                    className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[15px] bg-[#1E60F3] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-all hover:bg-[#1757DC] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1E60F3]/20"
                  >
                    <span>안내 카드 등록하기</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Condition 3: Info Ready for Customer Dispatch */
            <div className="space-y-4">
              {/* PC / Mobile Variant Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex max-w-full items-center gap-1 rounded-[16px] bg-[#F1F4F9] p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('pc')}
                    aria-pressed={activeTab === 'pc'}
                    className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[12px] px-3 sm:px-4 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 ${
                      activeTab === 'pc'
                        ? 'bg-white text-[#17233B] shadow-[0_3px_10px_rgba(35,49,78,0.07)]'
                        : 'text-[#73839D] hover:text-[#17233B]'
                    }`}
                  >
                    <Monitor className={activeTab === 'pc' ? 'size-4 text-[#1E60F3]' : 'size-4 text-[#95A3B9]'} />
                    <span>PC 가로형 {bundle.pcInfo ? '✓' : '(미등록)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('mobile')}
                    aria-pressed={activeTab === 'mobile'}
                    className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[12px] px-3 sm:px-4 text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 ${
                      activeTab === 'mobile'
                        ? 'bg-white text-[#17233B] shadow-[0_3px_10px_rgba(35,49,78,0.07)]'
                        : 'text-[#73839D] hover:text-[#17233B]'
                    }`}
                  >
                    <Smartphone className={activeTab === 'mobile' ? 'size-4 text-[#1E60F3]' : 'size-4 text-[#95A3B9]'} />
                    <span>모바일 세로형 {bundle.mobileInfo ? '✓' : '(미등록)'}</span>
                  </button>
                </div>

                {currentAsset && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] bg-white px-3.5 text-[12px] font-semibold text-[#4D607C] shadow-[0_5px_16px_rgba(35,49,78,0.045),0_2px_5px_rgba(35,49,78,0.02)] transition-all hover:bg-[#FAFBFD] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25"
                  >
                    <Download className="size-4 text-[#73839D]" />
                    <span>이미지 저장</span>
                  </button>
                )}
              </div>

              {/* Premium white preview: retain original asset, no decorative overlays */}
              <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-[24px] bg-white p-4 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:min-h-[320px] sm:p-6">
                {currentAsset?.signedUrl ? (
                  <div className="relative flex w-full items-center justify-center rounded-[16px] bg-[#FAFBFD] px-3 py-5 sm:px-5 sm:py-6">
                    <img
                      src={currentAsset.signedUrl}
                      alt={String(booking.driverName || '') + ' ' + String(booking.vehicleModel || '') + ' ' + (activeTab === 'pc' ? 'PC 가로형' : '모바일 세로형') + ' 안내자료'}
                      className="max-h-[400px] w-auto max-w-full rounded-[12px] object-contain shadow-[0_6px_18px_rgba(35,49,78,0.10)] sm:max-h-[460px]"
                    />
                    <a
                      href={currentAsset.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="안내자료 원본 새 창에서 보기"
                      title="원본 크게 보기"
                      className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-[12px] bg-white/95 text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.09)] transition-colors hover:text-[#1E60F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2 px-4 py-10 text-center">
                    <p className="text-[14px] font-semibold text-[#17233B]">
                      {activeTab === 'pc' ? 'PC 가로형' : '모바일 세로형'} 이미지가 아직 없습니다
                    </p>
                    <p className="text-[12px] text-[#73839D]">기사·차량 안내자료를 등록하면 여기서 확인할 수 있어요.</p>
                  </div>
                )}
              </div>

              {/* Exact source asset details stay visible under the preview */}
              {currentAsset && (
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-1 text-[11px] leading-relaxed text-[#73839D]">
                  <span className="max-w-full truncate font-semibold text-[#4D607C]" title={currentAsset.fileName}>{currentAsset.fileName}</span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {currentAsset.width && currentAsset.height && (
                      <span>해상도 {currentAsset.width} × {currentAsset.height} px</span>
                    )}
                    <span>파일 크기 {Math.round(currentAsset.fileSize / 1024)} KB</span>
                    <span>버전 v{currentAsset.version}</span>
                  </div>
                </div>
              )}

              {/* A안: Customer channel and manual-send log. No automated email or SMS. */}
              <section aria-labelledby="hq-delivery-heading" className="relative space-y-5 rounded-[24px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
                <div className="space-y-1.5">
                  <h3 id="hq-delivery-heading" className="text-[16px] font-bold tracking-[-0.025em] text-[#17233B]">
                    어떻게 전달하셨나요?
                  </h3>
                  <p className="text-[12px] leading-relaxed text-[#73839D]">
                    고객에게 직접 전달한 방법을 기록으로 남겨둘 수 있어요.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="hq-brochure-recipient" className="block text-[12px] font-semibold text-[#4D607C]">
                      받는 분
                    </label>
                    <input
                      id="hq-brochure-recipient"
                      type="text"
                      autoComplete="off"
                      value={recipient}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRecipient(value.includes('@') ? value : formatPhoneNumber(value));
                      }}
                      placeholder="연락처 또는 이메일 주소"
                      className="h-[52px] w-full rounded-[16px] border border-[#E1E7F0]/30 bg-white px-4 text-[14px] font-medium text-[#17233B] shadow-[0_5px_16px_rgba(35,49,78,0.045),0_2px_5px_rgba(35,49,78,0.02)] outline-none transition-shadow placeholder:text-[#95A3B9] hover:shadow-[0_6px_18px_rgba(35,49,78,0.07)] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <span id="hq-brochure-channel-label" className="block text-[12px] font-semibold text-[#4D607C]">
                      전달 방법
                    </span>
                    <div className="relative" ref={channelMenuRef}>
                      <button
                        ref={channelTriggerRef}
                        type="button"
                        aria-labelledby="hq-brochure-channel-label hq-brochure-channel-value"
                        aria-haspopup="listbox"
                        aria-expanded={isChannelMenuOpen}
                        aria-controls="hq-brochure-channel-options"
                        onClick={() => {
                          haptics.lightTap();
                          setIsChannelMenuOpen(!isChannelMenuOpen);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault();
                            setIsChannelMenuOpen(true);
                          }
                        }}
                        className="flex h-[52px] w-full cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-[#E1E7F0]/30 bg-white px-4 text-left text-[13px] font-semibold text-[#17233B] shadow-[0_5px_16px_rgba(35,49,78,0.045),0_2px_5px_rgba(35,49,78,0.02)] outline-none transition-shadow hover:shadow-[0_6px_18px_rgba(35,49,78,0.07)] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
                      >
                        <span id="hq-brochure-channel-value" className="flex min-w-0 items-center gap-2.5">
                          {selectedDelivery.icon ? (
                            <img src={selectedDelivery.icon} alt="" aria-hidden="true" draggable={false} className="size-6 shrink-0 object-contain" />
                          ) : (
                            <Download aria-hidden="true" className="size-5 shrink-0 text-[#73839D]" />
                          )}
                          <span className="min-w-0 truncate">{selectedDelivery.label}</span>
                        </span>
                        <ChevronDown aria-hidden="true" className={'size-4 shrink-0 text-[#73839D] transition-transform ' + (isChannelMenuOpen ? 'rotate-180' : '')} />
                      </button>

                      {isChannelMenuOpen && (
                        <div
                          id="hq-brochure-channel-options"
                          role="listbox"
                          aria-labelledby="hq-brochure-channel-label"
                          className="absolute inset-x-0 bottom-[calc(100%+8px)] z-30 overflow-hidden rounded-[18px] bg-white p-1.5 shadow-[0_14px_36px_rgba(35,49,78,0.13),0_3px_10px_rgba(35,49,78,0.05)]"
                        >
                          {DELIVERY_OPTIONS.map((option, index) => (
                            <button
                              key={option.value}
                              ref={(node) => { channelOptionRefs.current[index] = node; }}
                              type="button"
                              role="option"
                              aria-selected={channel === option.value}
                              onClick={() => {
                                setChannel(option.value);
                                setManualDeliveryConfirmed(false);
                                setIsChannelMenuOpen(false);
                                channelTriggerRef.current?.focus();
                                haptics.lightTap();
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
                                  event.preventDefault();
                                  const next = event.key === 'Home' ? 0
                                    : event.key === 'End' ? DELIVERY_OPTIONS.length - 1
                                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + DELIVERY_OPTIONS.length) % DELIVERY_OPTIONS.length;
                                  channelOptionRefs.current[next]?.focus();
                                }
                              }}
                              className={'flex w-full cursor-pointer items-center justify-between gap-2 rounded-[13px] px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:bg-[#EEF3FF] ' + (channel === option.value ? 'bg-[#EEF3FF]' : 'hover:bg-[#F7F9FC]')}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white">
                                  {option.icon ? (
                                    <img src={option.icon} alt="" aria-hidden="true" draggable={false} className="size-7 object-contain" />
                                  ) : (
                                    <Download aria-hidden="true" className="size-[18px] text-[#73839D]" />
                                  )}
                                </span>
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <span className="text-[13px] font-semibold text-[#17233B]">{option.label}</span>
                                  <span className="text-[11px] text-[#73839D]">{option.detail}</span>
                                </span>
                              </span>
                              {channel === option.value && <Check aria-hidden="true" className="size-4 shrink-0 text-[#1E60F3]" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-0.5">
                  <p className="text-[12px] leading-[1.65] text-[#73839D]">
                    자동으로 발송되지 않아요. 직접 전달한 뒤 기록을 남겨주세요.
                  </p>
                  {channel !== 'download' && (
                    <label className="group flex cursor-pointer items-start gap-3 rounded-[14px] py-0.5 text-[13px] leading-relaxed text-[#4D607C]">
                      <input
                        type="checkbox"
                        checked={manualDeliveryConfirmed}
                        onChange={(event) => setManualDeliveryConfirmed(event.target.checked)}
                        className="peer sr-only"
                      />
                      <span aria-hidden="true" className={'mt-0.5 flex size-[21px] shrink-0 items-center justify-center rounded-[7px] transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-[#1E60F3]/30 ' + (manualDeliveryConfirmed ? 'bg-[#1E60F3] text-white' : 'bg-white text-transparent shadow-[0_2px_8px_rgba(35,49,78,0.11)] ring-1 ring-[#E1E7F0]/60')}>
                        <Check className="size-3.5" strokeWidth={2.5} />
                      </span>
                      <span>안내 카드를 직접 전달했어요</span>
                    </label>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSubmitting || (manualDeliveryConfirmed && channel !== 'download' && !recipient.trim())}
                  onClick={handleRecordDispatch}
                  className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-[#1E60F3] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.16)] transition-all hover:bg-[#1757DC] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1E60F3]/20 disabled:cursor-not-allowed disabled:bg-[#E5EAF2] disabled:text-[#95A3B9] disabled:shadow-none"
                >
                  {isSubmitting ? <Loader2 aria-hidden="true" className="size-[17px] animate-spin" /> : <Check aria-hidden="true" className="size-[18px]" strokeWidth={2.4} />}
                  <span>기록 저장하기</span>
                </button>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-white px-5 py-3.5 text-[11px] text-[#73839D] sm:px-7 sm:py-4">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-[#95A3B9]" />
            <span>안전하게 보호되는 보안 링크예요</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[14px] bg-white px-5 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.06),0_1px_4px_rgba(35,49,78,0.025)] transition-all hover:bg-[#FAFBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
