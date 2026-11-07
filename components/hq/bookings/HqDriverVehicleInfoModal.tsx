'use client';

import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import {
  X,
  User,
  Car,
  Download,
  Send,
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
  { value: 'manual_copy', label: '문자 / 카카오톡 직접 전달', detail: '직접 전송한 내역을 기록' },
  { value: 'email', label: '외부 이메일 직접 전달', detail: '이메일 전송 후 이력 기록' },
  { value: 'download', label: '다운로드 준비 기록', detail: '안내자료 준비 상태만 저장' },
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

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (isChannelMenuOpen && !channelMenuRef.current?.contains(event.target as Node)) {
        setIsChannelMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
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
      <div role="dialog" aria-modal="true" aria-labelledby="hq-driver-card-title" className="flex w-full max-w-[760px] max-h-[94dvh] sm:max-h-[90vh] flex-col overflow-hidden rounded-[24px] sm:rounded-[28px] bg-white shadow-[0_26px_76px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.045)]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 bg-white px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[#EEF3FF] text-[#1E60F3]">
              <Car className="size-5" />
            </div>
            <div>
              <h2 id="hq-driver-card-title" className="text-[18px] font-bold tracking-[-0.035em] text-[#17233B] sm:text-[20px]">
                기사·차량 Info 고객 안내자료
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[#73839D]">
                예약 {booking.bookingNo || booking.id.slice(0, 8)} · {booking.customerName} ({booking.pickupDate} {booking.pickupTime})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="배차 카드 닫기"
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

            <div className="flex items-center gap-1.5 font-bold">
              <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
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
              <span>{mismatchReason || '배차 정보가 변경되어 기존 발송 자료와 불일치합니다.'}</span>
              <span className="mt-1 block text-[11px] font-normal leading-relaxed text-[#9E8067]">
                새 배차 조합의 안내자료를 확인한 뒤 준비하거나 직접 전달한 기록을 남겨주세요.
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
              <h3 className="text-[17px] font-bold tracking-tight text-[#17233B]">배차 미확정 (발송 차단)</h3>
              <p className="mx-auto max-w-md text-[13px] leading-6 text-[#73839D]">
                해당 예약에 담당 기사 또는 차량이 아직 배정되지 않았습니다. 고객에게 잘못된 차량이나 다른 기사
                안내자료가 나가는 것을 방지하기 위해 발송이 차단되었습니다.
              </p>
              <div className="pt-2 text-[12px] font-medium text-[#73839D]">
                예약 상세에서 먼저 기사와 차량을 배정한 뒤 다시 시도해주세요.
              </div>
            </div>
          ) : !bundle?.isReadyForCustomerDispatch ? (
            /* Condition 2: Assigned, but Info is Missing */
            <div className="py-12 px-6 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="mx-auto flex size-14 items-center justify-center rounded-[19px] bg-[#F7F9FC] text-[#73839D]">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                Info 미등록 (발송 차단)
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                <strong className="font-semibold text-[#17233B]">[{booking.driverName}]</strong> 기사님의{' '}
                <strong className="font-semibold text-[#17233B]">[{booking.vehicleModel} ({booking.vehiclePlate})]</strong> 실차 조합
                PC/모바일 안내 이미지가 Supabase에 아직 등록되지 않았습니다.
              </p>
              <p className="text-[11px] text-[#95A3B9]">
                다른 차량 이미지를 대체 표시하거나 임의로 변경하지 않습니다.
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
                    <span>이 기사 × 차량 안내자료 등록하러 가기</span>
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
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
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
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>고화질 원본 다운로드</span>
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

              {/* Recipient & Send Options Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-[#1E60F3]" />
                  <span>고객사 발송 방식 및 수신처 확인</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      수신 연락처 / 이메일
                    </label>
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRecipient(val.includes('@') ? val : formatPhoneNumber(val));
                      }}
                      placeholder="010-0000-0000 또는 이메일 주소"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      기록할 발송 방식
                    </label>
                    <select
                      value={channel}
                      onChange={(e) => { const value = e.target.value; if (value === 'manual_copy' || value === 'email' || value === 'download') { setChannel(value); setManualDeliveryConfirmed(false); } }}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                    >
                      <option value="manual_copy">문자 / 카카오톡 직접 전달</option>
                      <option value="email">외부 이메일 직접 전달</option>
                      <option value="download">다운로드 준비 기록</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-slate-600">이 화면은 준비 상태와 직접 전달한 이력을 저장합니다. 이메일·문자를 자동으로 보내거나 고객 수신을 확인하지 않습니다.</p>
                {channel !== 'download' && <label className="flex items-start gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={manualDeliveryConfirmed} onChange={e => setManualDeliveryConfirmed(e.target.checked)} className="mt-0.5" />
                  <span>위 수신처에 안내자료를 직접 전달했으며 수동 발송 기록을 남깁니다.</span>
                </label>}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSubmitting || (manualDeliveryConfirmed && channel !== 'download' && !recipient.trim())}
                    onClick={handleRecordDispatch}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>{manualDeliveryConfirmed && channel !== 'download' ? '직접 전달한 수동 발송 기록 저장' : '안내자료 준비 상태 저장'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>비공개 만료형 서명 URL · cross-tenant 격리 적용됨</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
