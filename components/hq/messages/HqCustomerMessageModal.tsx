'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronUp,
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
  generateCustomerNotificationDraft,
  formatSmsAppUrl,
} from '@/utils/customerMessageGenerator';
import { formatPhoneNumber } from '@/utils/formatters';
import { haptics } from '@/utils/haptics';

interface HqCustomerMessageModalProps {
  isOpen: boolean;
  booking: HqBooking | null;
  customers?: HqCustomer[];
  initialTrigger?: CustomerNotificationTrigger;
  onClose: () => void;
  onSentSuccess?: () => void;
}

const TRIGGER_LABELS: Record<CustomerNotificationTrigger, string> = {
  dispatch_confirmed: '배차 확정',
  driver_changed: '배차 변경',
  arrived_pickup: '도착 안내',
};

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
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Identity ref to initialize only when a NEW booking opens
  const activeBookingKeyRef = useRef<string | null>(null);

  // Flags to prevent background polling or state rerenders from wiping user input
  const isPhoneEditedRef = useRef(false);
  const isEmailEditedRef = useRef(false);
  const isSmsBodyEditedRef = useRef(false);
  const isEmailBodyEditedRef = useRef(false);
  const isEmailSubjectEditedRef = useRef(false);

  const matchedCustomer = useMemo(() => {
    if (!booking) return null;
    if (booking.customerId) {
      const byId = customers.find((c) => c.id === booking.customerId);
      if (byId) return byId;
    }
    const cleanName = (booking.customerName || '').trim().toLowerCase();
    if (!cleanName) return null;

    // 1. Exact match
    const exact = customers.find((c) => c.name.trim().toLowerCase() === cleanName);
    if (exact) return exact;

    // 2. Fuzzy substring match (e.g. "Ferrari Korea" <-> "Ferrari", "BMW Korea" <-> "BMW")
    const fuzzy = customers.find((c) => {
      const cName = c.name.trim().toLowerCase();
      return cleanName.includes(cName) || cName.includes(cleanName);
    });
    if (fuzzy) return fuzzy;

    // 3. Fallback to endBrand
    if (booking.endBrand) {
      const bBrand = booking.endBrand.trim().toLowerCase();
      const byBrand = customers.find((c) => {
        const cName = c.name.trim().toLowerCase();
        return bBrand.includes(cName) || cName.includes(bBrand);
      });
      if (byBrand) return byBrand;
    }
    return null;
  }, [booking, customers]);

  // Initialize draft when modal opens for a new booking
  useEffect(() => {
    if (!booking || !isOpen) {
      activeBookingKeyRef.current = null;
      isPhoneEditedRef.current = false;
      isEmailEditedRef.current = false;
      isSmsBodyEditedRef.current = false;
      isEmailBodyEditedRef.current = false;
      isEmailSubjectEditedRef.current = false;
      return;
    }

    const bookingKey = booking.scheduleId || booking.id;
    // If already initialized for this exact booking, do NOT wipe user edits on background polls!
    if (activeBookingKeyRef.current === bookingKey) {
      return;
    }

    activeBookingKeyRef.current = bookingKey;
    isPhoneEditedRef.current = false;
    isEmailEditedRef.current = false;
    isSmsBodyEditedRef.current = false;
    isEmailBodyEditedRef.current = false;
    isEmailSubjectEditedRef.current = false;

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
    setIsHistoryOpen(true);

    const initialDraft = generateCustomerNotificationDraft({
      booking,
      trigger: defaultTrigger,
      language: defaultLang,
      customerRecord: matchedCustomer,
    });

    setRecipientPhone(initialDraft.recipientPhone || '');
    setRecipientEmail(initialDraft.recipientEmail || '');
    setEmailSubject(initialDraft.emailSubject || '');
    setEmailBody(initialDraft.emailBody || '');
    setSmsBody(initialDraft.smsBody || '');
  }, [booking, isOpen, initialTrigger, matchedCustomer]);

  const handleSelectTrigger = (nextTrigger: CustomerNotificationTrigger) => {
    haptics.selection();
    setTrigger(nextTrigger);
    if (!booking) return;
    const nextDraft = generateCustomerNotificationDraft({
      booking,
      trigger: nextTrigger,
      language,
      customerRecord: matchedCustomer,
    });
    if (!isSmsBodyEditedRef.current) setSmsBody(nextDraft.smsBody);
    if (!isEmailBodyEditedRef.current) setEmailBody(nextDraft.emailBody);
    if (!isEmailSubjectEditedRef.current) setEmailSubject(nextDraft.emailSubject);
    if (!isPhoneEditedRef.current && !recipientPhone.trim() && nextDraft.recipientPhone) {
      setRecipientPhone(nextDraft.recipientPhone);
    }
    if (!isEmailEditedRef.current && !recipientEmail.trim() && nextDraft.recipientEmail) {
      setRecipientEmail(nextDraft.recipientEmail);
    }
  };

  const handleSelectLanguage = (nextLang: 'ko' | 'en') => {
    haptics.selection();
    setLanguage(nextLang);
    if (!booking) return;
    const nextDraft = generateCustomerNotificationDraft({
      booking,
      trigger,
      language: nextLang,
      customerRecord: matchedCustomer,
    });
    if (!isSmsBodyEditedRef.current) setSmsBody(nextDraft.smsBody);
    if (!isEmailBodyEditedRef.current) setEmailBody(nextDraft.emailBody);
    if (!isEmailSubjectEditedRef.current) setEmailSubject(nextDraft.emailSubject);
    if (!isPhoneEditedRef.current && !recipientPhone.trim() && nextDraft.recipientPhone) {
      setRecipientPhone(nextDraft.recipientPhone);
    }
    if (!isEmailEditedRef.current && !recipientEmail.trim() && nextDraft.recipientEmail) {
      setRecipientEmail(nextDraft.recipientEmail);
    }
  };

  const missingFieldsWarning = useMemo(() => {
    if (!booking) return null;
    return generateCustomerNotificationDraft({
      booking,
      trigger,
      language,
      customerRecord: matchedCustomer,
    }).missingFieldsWarning;
  }, [booking, trigger, language, matchedCustomer]);

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
    haptics.lightTap();
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
    haptics.lightTap();
    setSubmitting(true);
    setFeedback(null);
    try {
      const recipientVal = channel === 'sms' ? recipientPhone.trim() : recipientEmail.trim();
      const res = await fetch('/api/schedules/customer-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          action: 'record_sent',
          trigger,
          channel,
          language,
          recipient:
            recipientVal ||
            (channel === 'sms' ? '고객사/탑승객 연락처(수동발송)' : '고객사 이메일(수동발송)'),
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
        message:
          deliveryMethod === 'sms_app'
            ? `${recipientVal || '수신처'} 번호로 문자 앱을 열었으며 발송 이력이 기록되었습니다.`
            : '고객 안내 메시지 발송 완료 처리가 기록되었습니다.',
      });
      onSentSuccess?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || '네트워크 오류가 발생했습니다.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendSmtpEmail = async () => {
    haptics.lightTap();
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
    haptics.lightTap();
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

  const cleanSmsHref = formatSmsAppUrl(recipientPhone, smsBody);

  const handleOpenSmsAppClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    const cleanDigits = recipientPhone.replace(/[^0-9+]/g, '');
    if (!cleanDigits) {
      e.preventDefault();
      setFeedback({
        type: 'warning',
        message: '받는 분 번호(전화번호)를 먼저 입력해주세요. 번호가 있어야 문자 앱으로 바로 전송할 수 있습니다.',
      });
      phoneInputRef.current?.focus();
      return;
    }
    await handleRecordSent('sms_app');
  };

  const historyList = booking.customerNotifications || [];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
      className="m-auto w-[calc(100%-1.5rem)] max-w-xl rounded-3xl border border-slate-200/90 bg-white p-0 text-slate-900 shadow-2xl overflow-hidden backdrop:bg-black/40 backdrop:backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] flex-col">
        {/* 1. Header (Clean White Header matching Reference) */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-100/80 text-[#0050FF]">
              <MessageSquareText className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-extrabold text-slate-900 tracking-tight">
                고객 안내 메시지
              </h2>
            </div>
          </div>
          <form method="dialog">
            <button
              type="submit"
              value="close"
              autoFocus
              aria-label="모달 닫기"
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Booking Summary Card (3 Structured Lines) */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <span>{booking.customerName}</span>
              <span className="text-slate-300 font-normal">|</span>
              <span className="font-mono text-slate-700 font-semibold">
                {booking.pickupDate} {booking.pickupTime}
              </span>
            </div>
            <div className="text-slate-600 font-medium truncate">
              {booking.pickupLocation} ➔ {booking.destination}
            </div>
            <div className="text-[#0050FF] font-bold">
              {booking.vehicleModel} ({booking.vehiclePlate || '미배정'}) · {booking.driverName}
            </div>
          </div>

          {/* Trigger Tabs & Language Selection */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Trigger Pill Tabs */}
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
                    onClick={() => handleSelectTrigger(t)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0050FF] text-white shadow-2xs font-extrabold'
                        : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    {isPendingMatch && <Sparkles className="h-3 w-3 text-blue-200" />}
                    <span>{TRIGGER_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>

            {/* Language Capsule: 🇰🇷 한국어 | 🇺🇸 English */}
            <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSelectLanguage('ko')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                  language === 'ko' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🇰🇷 한국어</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectLanguage('en')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                  language === 'en' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🇺🇸 English</span>
              </button>
            </div>
          </div>

          {missingFieldsWarning && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#0050FF]" />
              <span>{missingFieldsWarning} — 발송 전 내용을 확인해주세요.</span>
            </div>
          )}

          {/* Channel Tabs: 문자 · 알림톡 vs 이메일 */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setChannel('sms');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-all cursor-pointer ${
                channel === 'sms'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Smartphone className={`h-3.5 w-3.5 ${channel === 'sms' ? 'text-[#0050FF]' : 'text-slate-400'}`} />
              <span>문자 · 알림톡</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setChannel('email');
              }}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-all cursor-pointer ${
                channel === 'email'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Mail className={`h-3.5 w-3.5 ${channel === 'email' ? 'text-[#0050FF]' : 'text-slate-400'}`} />
              <span>이메일</span>
            </button>
          </div>

          {/* Editor Area */}
          {channel === 'sms' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  받는 분 번호
                </label>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => {
                    setRecipientPhone(formatPhoneNumber(e.target.value));
                    isPhoneEditedRef.current = true;
                  }}
                  placeholder="예: 010-1234-5678 또는 +82..."
                  maxLength={16}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:border-[#0050FF] focus:ring-1 focus:ring-[#0050FF] focus:outline-hidden transition-all shadow-2xs"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    메시지 내용
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">{smsBody.length}자</span>
                </div>
                <textarea
                  rows={8}
                  value={smsBody}
                  onChange={(e) => {
                    setSmsBody(e.target.value);
                    isSmsBodyEditedRef.current = true;
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs leading-relaxed font-mono font-medium text-slate-900 focus:bg-white focus:border-[#0050FF] focus:ring-1 focus:ring-[#0050FF] focus:outline-hidden transition-all shadow-2xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  받는 분 이메일
                </label>
                <input
                  ref={emailInputRef}
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => {
                    setRecipientEmail(e.target.value);
                    isEmailEditedRef.current = true;
                  }}
                  placeholder="customer@company.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:border-[#0050FF] focus:ring-1 focus:ring-[#0050FF] focus:outline-hidden transition-all shadow-2xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  이메일 제목
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => {
                    setEmailSubject(e.target.value);
                    isEmailSubjectEditedRef.current = true;
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-[#0050FF] focus:ring-1 focus:ring-[#0050FF] focus:outline-hidden transition-all shadow-2xs"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    메시지 내용
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">{emailBody.length}자</span>
                </div>
                <textarea
                  rows={9}
                  value={emailBody}
                  onChange={(e) => {
                    setEmailBody(e.target.value);
                    isEmailBodyEditedRef.current = true;
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs leading-relaxed font-mono font-medium text-slate-900 focus:bg-white focus:border-[#0050FF] focus:ring-1 focus:ring-[#0050FF] focus:outline-hidden transition-all shadow-2xs"
                />
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`rounded-2xl border px-3.5 py-2.5 text-xs font-bold ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : feedback.type === 'warning'
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-slate-700 bg-slate-900 text-white'
              }`}
            >
              {feedback.message}
            </div>
          )}

          {/* 3. Sent History Accordion (최근 발송 내역) */}
          {historyList.length > 0 && (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-slate-500" />
                  <span>최근 발송 내역 ({historyList.length}건)</span>
                </div>
                {isHistoryOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>
              {isHistoryOpen && (
                <div className="px-3.5 pb-3 pt-1 space-y-1.5 max-h-32 overflow-y-auto">
                  {historyList.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs border border-slate-100 shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="rounded-md bg-blue-50 text-[#0050FF] border border-blue-100 px-2 py-0.5 text-[10.5px] font-bold shrink-0">
                          {TRIGGER_LABELS[rec.trigger] || rec.trigger}
                        </span>
                        <span className="font-bold text-slate-700 truncate">
                          {rec.channel === 'email' ? '이메일' : '문자'} ({rec.language.toUpperCase()})
                          <span className="text-slate-400 font-normal ml-1">➔ {rec.recipient}</span>
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
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
              )}
            </div>
          )}
        </div>

        {/* 4. Footer Actions (Clear Hierarchy: 내용 복사 | 문자 앱으로 열기 | 발송 완료 처리) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 bg-white px-5 py-3.5">
          <div className="flex items-center gap-2">
            {booking.pendingCustomerTrigger && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleDismissPending}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                안내 대기 해제
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            {/* 좌측 서브 버튼: 내용 복사 (화이트 배경 + 테두리) */}
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              {copiedFlag ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#0050FF]" />
                  <span>복사 완료!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  <span>내용 복사</span>
                </>
              )}
            </button>

            {channel === 'sms' ? (
              <>
                {/* 중앙 서브 버튼: 문자 앱으로 열기 (녹색 제거 ➔ 연한 슬레이트 그레이) */}
                <a
                  href={cleanSmsHref}
                  onClick={handleOpenSmsAppClick}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/70 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all cursor-pointer active:scale-95"
                >
                  <Smartphone className="h-3.5 w-3.5 text-slate-600" />
                  <span>문자 앱으로 열기</span>
                </a>

                {/* 우측 메인 액션 버튼: 발송 완료 처리 (시그니처 코발트 블루 bg-[#0050FF]) */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRecordSent('manual_copy')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0050FF] hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2.5 text-xs font-extrabold shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{submitting ? '처리 중...' : '발송 완료 처리'}</span>
                </button>
              </>
            ) : (
              <>
                {/* 이메일 채널 시 중앙 서브 버튼: 수동 발송 완료 */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRecordSent('manual_copy')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/70 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-slate-600" />
                  <span>수동 발송 완료</span>
                </button>

                {/* 이메일 채널 시 우측 메인 액션 버튼: 이메일 즉시 발송 */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSendSmtpEmail}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0050FF] hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2.5 text-xs font-extrabold shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{submitting ? '발송 중...' : '이메일 즉시 발송'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
