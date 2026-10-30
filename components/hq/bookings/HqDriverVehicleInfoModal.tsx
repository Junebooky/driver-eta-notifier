'use client';

import React, { useState, useEffect } from 'react';
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
  RefreshCw,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { DriverVehicleAssetBundle } from '@/types/driverVehicleAsset';
import { resolveVehicleEntity } from '@/utils/vehicleData';
import { haptics } from '@/utils/haptics';

export interface HqDriverVehicleInfoModalProps {
  isOpen: boolean;
  booking: HqBooking | null;
  onClose: () => void;
  onOpenAssetManager?: (driverId: string, vehiclePlate: string) => void;
  onDispatchRecorded?: () => void;
}

export const HqDriverVehicleInfoModal: React.FC<HqDriverVehicleInfoModalProps> = ({
  isOpen,
  booking,
  onClose,
  onOpenAssetManager,
  onDispatchRecorded,
}) => {
  const [activeTab, setActiveTab] = useState<'pc' | 'mobile'>('pc');
  const [bundle, setBundle] = useState<DriverVehicleAssetBundle | null>(null);
  const [latestDispatchLog, setLatestDispatchLog] = useState<any>(null);
  const [hasMismatch, setHasMismatch] = useState(false);
  const [mismatchReason, setMismatchReason] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [channel, setChannel] = useState<'manual_copy' | 'email' | 'download'>('manual_copy');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Initialize recipient when booking opens
  useEffect(() => {
    if (booking) {
      setRecipient(booking.passengerPhone || '');
      setFeedback(null);
    }
  }, [booking, isOpen]);

  // Load bundle and dispatch status
  const loadData = async () => {
    if (!booking) return;

    const isAssigned =
      booking.vehiclePlate &&
      booking.vehiclePlate !== '미배정' &&
      booking.vehiclePlate !== '-' &&
      booking.driverName &&
      booking.driverName !== '미배정';

    if (!isAssigned) {
      setBundle(null);
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const vPlate = booking.vehiclePlate || '';
      const driverId = booking.driverId || '';

      // 1. Fetch asset bundle
      const bundleRes = await fetch(
        `/api/hq/drivers/assets?driverId=${encodeURIComponent(driverId)}&vehiclePlate=${encodeURIComponent(vPlate)}&type=bundle`
      );
      const bundleJson = await bundleRes.json();
      if (bundleRes.ok && bundleJson.ok) {
        setBundle(bundleJson.bundle);
      }

      // 2. Fetch dispatch log & check for mismatches
      const bookingId = booking.scheduleId || booking.id;
      const dispatchRes = await fetch(
        `/api/hq/drivers/assets/dispatch?bookingId=${encodeURIComponent(bookingId)}&currentDriverId=${encodeURIComponent(
          driverId
        )}&currentVehiclePlate=${encodeURIComponent(vPlate)}`
      );
      const dispatchJson = await dispatchRes.json();
      if (dispatchRes.ok && dispatchJson.ok) {
        setLatestDispatchLog(dispatchJson.latestLog);
        setHasMismatch(Boolean(dispatchJson.hasMismatch));
        setMismatchReason(dispatchJson.mismatchReason || null);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '자료 조회 실패' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && booking) {
      loadData();
    }
  }, [isOpen, booking?.scheduleId, booking?.driverId, booking?.vehiclePlate]);

  if (!isOpen || !booking) return null;

  const isAssigned =
    booking.vehiclePlate &&
    booking.vehiclePlate !== '미배정' &&
    booking.vehiclePlate !== '-' &&
    booking.driverName &&
    booking.driverName !== '미배정';

  const bookingId = booking.scheduleId || booking.id;
  const currentAsset = activeTab === 'pc' ? bundle?.pcInfo : bundle?.mobileInfo;

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
    if (!isAssigned || !bundle?.isReadyForCustomerDispatch) return;

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
          recipient: recipient.trim() || '고객사 담당자',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFeedback({ type: 'error', message: json.error || '발송 기록 실패' });
        haptics.errorAlert();
        return;
      }

      haptics.success();
      setFeedback({
        type: 'success',
        message: '고객사 안내자료 발송 기록이 Supabase에 안전하게 보존되었습니다.',
      });
      setHasMismatch(false);
      await loadData();
      onDispatchRecorded?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '네트워크 오류' });
      haptics.errorAlert();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center font-bold">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                기사·차량 Info 고객 안내자료
              </h2>
              <p className="text-xs text-slate-400">
                예약 {booking.bookingNo || booking.id.slice(0, 8)} · {booking.customerName} ({booking.pickupDate} {booking.pickupTime})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dispatch Target Summary Banner */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-bold">
              <User className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span className="text-slate-500">배정 기사:</span>
              <strong className="text-slate-900">{booking.driverName || '미배정'}</strong>
            </div>

            <div className="flex items-center gap-1.5 font-bold">
              <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span className="text-slate-500">배정 차량:</span>
              <strong className="text-slate-900">
                {booking.vehicleModel} ({booking.vehiclePlate || '미배정'})
              </strong>
            </div>
          </div>

          {latestDispatchLog?.dispatchedAt && (
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>최종 발송 기록: {String(latestDispatchLog.dispatchedAt).slice(0, 16).replace('T', ' ')}</span>
            </div>
          )}
        </div>

        {/* Mismatch Warning Alert */}
        {hasMismatch && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="flex-1">
              <span>{mismatchReason || '배차 정보가 변경되어 기존 발송 자료와 불일치합니다.'}</span>
              <span className="block text-[11px] font-normal text-amber-700">
                새 배차 조합의 안내자료를 확인한 뒤 다시 발송 완료 처리해주세요.
              </span>
            </div>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-5 py-2.5 text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-100'
                : 'bg-rose-50 text-rose-800 border-b border-rose-100'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!isAssigned ? (
            /* Condition 1: Dispatch Not Confirmed */
            <div className="py-12 px-6 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">배차 미확정 (발송 차단)</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                해당 예약에 담당 기사 또는 차량이 아직 배정되지 않았습니다. 고객에게 잘못된 차량이나 다른 기사
                안내자료가 나가는 것을 방지하기 위해 발송이 차단되었습니다.
              </p>
              <div className="pt-2 text-xs font-bold text-slate-400">
                예약 상세에서 먼저 기사와 차량을 배정한 뒤 다시 시도해주세요.
              </div>
            </div>
          ) : !bundle?.isReadyForCustomerDispatch ? (
            /* Condition 2: Assigned, but Info is Missing */
            <div className="py-12 px-6 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                Info 미등록 (발송 차단)
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                <strong className="text-slate-900">[{booking.driverName}]</strong> 기사님의{' '}
                <strong className="text-slate-900">[{booking.vehicleModel} ({booking.vehiclePlate})]</strong> 실차 조합
                PC/모바일 안내 이미지가 Supabase에 아직 등록되지 않았습니다.
              </p>
              <p className="text-[11px] text-slate-400">
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
                    className="px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5"
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab('pc')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'pc'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5 text-[#1E60F3]" />
                    <span>PC 가로형 {bundle.pcInfo ? '✓' : '(미등록)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('mobile')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'mobile'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#1E60F3]" />
                    <span>모바일 세로형 {bundle.mobileInfo ? '✓' : '(미등록)'}</span>
                  </button>
                </div>

                {currentAsset && (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>고화질 원본 다운로드</span>
                  </button>
                )}
              </div>

              {/* Image Preview Box */}
              <div className="bg-slate-900/5 rounded-2xl border border-slate-200 p-4 flex items-center justify-center min-h-[300px] overflow-hidden">
                {currentAsset?.signedUrl ? (
                  <div className="relative group max-h-[420px] flex items-center justify-center">
                    <img
                      src={currentAsset.signedUrl}
                      alt={`${booking.driverName} ${booking.vehicleModel} ${activeTab.toUpperCase()}`}
                      className="max-h-[400px] w-auto max-w-full rounded-xl shadow-md object-contain"
                    />
                    <a
                      href={currentAsset.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1 rounded-xl"
                    >
                      <ExternalLink className="w-4 h-4" /> 브라우저 새 탭에서 원본 보기
                    </a>
                  </div>
                ) : (
                  <div className="text-center p-8 text-slate-400">
                    <p className="text-xs font-bold">
                      {activeTab === 'pc' ? 'PC 가로형' : '모바일 세로형'} 이미지가 등록되지 않았습니다.
                    </p>
                  </div>
                )}
              </div>

              {/* Asset Meta Specs */}
              {currentAsset && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 truncate">{currentAsset.fileName}</span>
                  <div className="flex items-center gap-3">
                    {currentAsset.width && currentAsset.height && (
                      <span>해상도: {currentAsset.width} × {currentAsset.height} px</span>
                    )}
                    <span>파일 크기: {Math.round(currentAsset.fileSize / 1024)} KB</span>
                    <span>버전: v{currentAsset.version}</span>
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
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="수신 전화번호 또는 이메일 주소"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      기록할 발송 방식
                    </label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                    >
                      <option value="manual_copy">문자 / 카카오톡 메신저 첨부 발송 준비</option>
                      <option value="email">이메일 첨부 발송 기록</option>
                      <option value="download">안전 파일 다운로드 후 직접 전달</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleRecordDispatch}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>고객사 안내자료 발송 완료 기록</span>
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
