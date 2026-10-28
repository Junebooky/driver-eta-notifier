'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  History,
  Mail,
  MessageSquareText,
  Send,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { CustomerNotificationTrigger, HqBooking } from '@/types/hq';
import { HqCustomer } from '@/types/customerHq';
import {
  CUSTOMER_TRIGGER_LABELS,
  generateCustomerNotificationDraft,
} from '@/utils/customerMessageGenerator';

interface HqCustomerMessageModalProps {
  isOpen: boolean;
  booking: HqBooking | null;
  customers?: HqCustomer[];
  initialTrigger?: CustomerNotificationTrigger;
  onClose: () => void;
  onSentSuccess?: () => void;
}

export default function HqCustomerMessageModal({
  isOpen,
  booking,
  customers = [],
  initialTrigger,
  onClose,
  onSentSuccess,
}: HqCustomerMessageModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [trigger, setTrigger] = useState<CustomerNotificationTrigger>('dispatch_confirmed');
  const [language, setLanguage] = useState<'ko' | 'en'>('ko');
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');

  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [smsBody, setSmsBody] = useState('');

  const [copiedFlag, setCopiedFlag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const matchedCustomer = useMemo(() => {
    if (!booking) return null;
    if (booking.customerId) {
      const byId = customers.find((c) => c.id === booking.customerId);
      if (byId) return byId;
    }
    const cleanName = (booking.customerName || '').trim().toLowerCase();
    return (
      customers.find(
        (c) => c.name.trim().toLowerCase() === cleanName
      ) || null
    );
  }, [booking, customers]);

  useEffect(() => {
    if (!booking || !isOpen) return;
    const defaultTrigger: CustomerNotificationTrigger =
      initialTrigger ||
      booking.pendingCustomerTrigger ||
      (booking.operationStatus === 'arrived_pickup'
        ? 'arrived_pickup'
        : booking.previousDriverName || booking.previousVehiclePlate
        ? 'driver_changed'
        : 'dispatch_confirmed');

    const defaultLang: 'ko' | 'en' = booking.requestedLanguage === 'en' ? 'en' : 'ko';
    setTrigger(defaultTrigger);
    setLanguage(defaultLang);
    setFeedback(null);
    setCopiedFlag(false);
  }, [booking, isOpen, initialTrigger]);

  const generatedDraft = useMemo(() => {
    if (!booking) return null;
    return generateCustomerNotificationDraft({
      booking,
      trigger,
      language,
      customerRecord: matchedCustomer,
    });
  }, [booking, trigger, language, matchedCustomer]);

  useEffect(() => {
    if (!generatedDraft) return;
    setRecipientPhone(generatedDraft.recipientPhone);
    setRecipientEmail(generatedDraft.recipientEmail);
    setEmailSubject(generatedDraft.emailSubject);
    setEmailBody(generatedDraft.emailBody);
    setSmsBody(generatedDraft.smsBody);
  }, [generatedDraft]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && booking) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen, booking]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    let cleanupFallback: (() => void) | undefined;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      cleanupFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  if (!booking) return null;

  const scheduleId = booking.scheduleId || booking.id;

  const handleCopy = async () => {
    const textToCopy =
      channel === 'sms' ? smsBody : `제목: ${emailSubject}\n\n${emailBody}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2200);
    } catch {
      setFeedback({ type: 'error', message: '클립보드 복사에 실패했습니다. 직접 선택하여 복사해주세요.' });
    }
  };

  const handleRecordSent = async (deliveryMethod: 'manual_copy' | 'sms_app') => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/schedules/customer-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          action: 'record_sent',
          trigger,
          channel,
          language,
          recipient: channel === 'sms' ? recipientPhone : recipientEmail,
          subject: channel === 'email' ? emailSubject : undefined,
          body: channel === 'sms' ? smsBody : emailBody,
          deliveryMethod,
          sentBy: '본사 관리자',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFeedback({ type: 'error', message: json.error || '발송 이력 저장에 실패했습니다.' });
        return;
      }
      setFeedback({
        type: 'success',
        message: '고객사 안내 메시지 발송 완료 내역이 Supabase에 기록되었으며 대기 알림이 해제되었습니다.',
      });
      onSentSuccess?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '네트워크 오류가 발생했습니다.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendSmtpEmail = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/schedules/customer-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          action: 'send_email',
          trigger,
          channel: 'email',
          language,
          recipient: recipientEmail,
          subject: emailSubject,
          body: emailBody,
          sentBy: '본사 관리자',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFeedback({
          type: json.smtpNotConfigured ? 'warning' : 'error',
          message: json.error || '이메일 발송에 실패했습니다.',
        });
        return;
      }
      setFeedback({
        type: 'success',
        message: `${recipientEmail} 앞으로 안내 이메일이 발송되었고 이력이 저장되었습니다.`,
      });
      onSentSuccess?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '이메일 발송 중 오류가 발생했습니다.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismissPending = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/schedules/customer-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          action: 'dismiss_pending',
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        onSentSuccess?.();
        dialogRef.current?.close();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cleanSmsHref = recipientPhone
    ? `sms:${recipientPhone.replace(/[^0-9+]/g, '')}?body=${encodeURIComponent(smsBody)}`
    : `sms:?body=${encodeURIComponent(smsBody)}`;

  const historyList = booking.customerNotifications || [];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
      className="m-auto w-[calc(100%-1.5rem)] max-w-2xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl"
    >
      <div className="flex max-h-[88vh] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-indigo-950 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/25 text-indigo-200 border border-indigo-400/30">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base sm:text-lg font-extrabold tracking-tight">
                  고객사 자동 안내 메시지 확인 · 발송
                </h2>
                <span className="rounded-full bg-indigo-500/30 border border-indigo-300/30 px-2 py-0.5 text-[10px] font-bold text-indigo-100">
                  관리자 승인 후 발송
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                기사·차량 프로필 소개서와는 별도로, 실제 배차·변경·픽업지 도착 상태를 반영한 단문/이메일 안내문입니다.
              </p>
            </div>
          </div>
          <form method="dialog">
            <button
              type="submit"
              value="close"
              autoFocus
              aria-label="고객 안내 모달 닫기"
              className="rounded-lg p-1.5 text-indigo-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </form>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Booking Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-slate-900">{booking.customerName}</span>
              <span className="text-slate-400">|</span>
              <span className="font-semibold text-slate-700">
                {booking.pickupDate} {booking.pickupTime}
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">
                {booking.pickupLocation} ➔ {booking.destination}
              </span>
            </div>
            <span className="font-bold text-indigo-700">
              {booking.vehicleModel} ({booking.vehiclePlate || '미배정'}) · {booking.driverName}
            </span>
          </div>

          {/* Trigger & Language Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                ['dispatch_confirmed', 'driver_changed', 'arrived_pickup'] as CustomerNotificationTrigger[]
              ).map((t) => {
                const isSelected = trigger === t;
                const isPendingMatch = booking.pendingCustomerTrigger === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrigger(t)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {isPendingMatch && <Sparkles className="h-3 w-3 text-amber-300" />}
                    <span>{CUSTOMER_TRIGGER_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('ko')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold cursor-pointer ${
                  language === 'ko' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                국문
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold cursor-pointer ${
                  language === 'en' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <Globe className="h-3 w-3" />
                English
              </button>
            </div>
          </div>

          {generatedDraft?.missingFieldsWarning && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>{generatedDraft.missingFieldsWarning} — 발송 전 내용을 반드시 확인해주세요.</span>
            </div>
          )}

          {/* Channel Tabs */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setChannel('sms')}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-extrabold transition-all cursor-pointer ${
                channel === 'sms'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5 text-indigo-600" />
              문자 · 알림톡용 짧은 메시지
            </button>
            <button
              type="button"
              onClick={() => setChannel('email')}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-extrabold transition-all cursor-pointer ${
                channel === 'email'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="h-3.5 w-3.5 text-indigo-600" />
              고객사 이메일 안내문
            </button>
          </div>

          {/* Editor */}
          {channel === 'sms' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  수신 연락처 (고객사 담당자 / 탑승객 휴대폰)
                </label>
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    문자 안내 본문 (발송 전 자유 수정 가능)
                  </label>
                  <span className="text-[11px] text-slate-400">{smsBody.length}자</span>
                </div>
                <textarea
                  rows={7}
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-xs leading-relaxed font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  수신 이메일 주소
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="customer@company.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  이메일 제목
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  이메일 본문 (발송 전 자유 수정 가능)
                </label>
                <textarea
                  rows={9}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-xs leading-relaxed font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : feedback.type === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {/* Sent History */}
          {historyList.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 mb-2">
                <History className="h-3.5 w-3.5 text-slate-500" />
                이전 고객 안내 발송 이력 ({historyList.length}건)
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {historyList.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px] border border-slate-100"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-700">
                        {CUSTOMER_TRIGGER_LABELS[rec.trigger] || rec.trigger}
                      </span>
                      <span className="font-semibold text-slate-700">
                        {rec.channel === 'email' ? '이메일' : '문자'} ({rec.language.toUpperCase()})
                      </span>
                      <span className="text-slate-500">→ {rec.recipient}</span>
                    </div>
                    <span className="text-slate-400">
                      {new Date(rec.sentAt).toLocaleString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2">
            {booking.pendingCustomerTrigger && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleDismissPending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                이번 안내 생략(대기 해제)
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
            >
              {copiedFlag ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  복사 완료!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-600" />
                  안내문 복사
                </>
              )}
            </button>

            {channel === 'sms' ? (
              <>
                <a
                  href={cleanSmsHref}
                  onClick={() => handleRecordSent('sms_app')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-emerald-700"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  문자앱 열기 및 발송기록
                </a>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRecordSent('manual_copy')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  복사 발송 완료 기록
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRecordSent('manual_copy')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  수동 발송 완료 기록
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSendSmtpEmail}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting ? '처리 중...' : '이메일 즉시 발송'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
