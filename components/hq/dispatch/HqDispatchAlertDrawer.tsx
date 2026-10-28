'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquareText,
  Phone,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { CustomerNotificationTrigger } from '@/types/hq';
import { EscalationSeverity, UnackEscalationAlert } from '@/utils/unackAlertEngine';

interface HqDispatchAlertDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: UnackEscalationAlert[];
  onSendReminder: (
    scheduleId: string
  ) => Promise<{ ok: boolean; reminderCount?: number; error?: string }>;
  onOpenBookingDetail: (bookingId: string) => void;
  onOpenCustomerMessage: (bookingId: string, trigger?: CustomerNotificationTrigger) => void;
}

type FilterTab = 'all' | 'imminent' | 'unacked' | 'omission' | 'customer';

const SEVERITY_STYLES: Record<
  EscalationSeverity,
  { badge: string; cardBorder: string; label: string; dot: string }
> = {
  critical: {
    badge: 'bg-red-600 text-white border-red-700',
    cardBorder: 'border-red-300 bg-red-50/50',
    label: '초긴급',
    dot: 'bg-red-600 animate-ping',
  },
  urgent: {
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
    cardBorder: 'border-orange-200 bg-orange-50/30',
    label: '긴급',
    dot: 'bg-orange-500',
  },
  warning: {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    cardBorder: 'border-amber-200 bg-white',
    label: '주의',
    dot: 'bg-amber-500',
  },
  watch: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    cardBorder: 'border-slate-200 bg-white',
    label: '확인 대기',
    dot: 'bg-blue-500',
  },
};

export default function HqDispatchAlertDrawer({
  isOpen,
  onClose,
  alerts,
  onSendReminder,
  onOpenBookingDetail,
  onOpenCustomerMessage,
}: HqDispatchAlertDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

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

  const counts = useMemo(() => {
    const imminent = alerts.filter(
      (a) => a.severity === 'critical' || a.category === 'unacked_imminent'
    ).length;
    const unacked = alerts.filter(
      (a) =>
        a.category === 'unacked_imminent' ||
        a.category === 'unacked_delayed' ||
        a.category === 'reconfirm_pending'
    ).length;
    const omission = alerts.filter((a) => a.category === 'unassigned_omission').length;
    const customer = alerts.filter((a) => a.category === 'customer_notify_pending').length;
    return { all: alerts.length, imminent, unacked, omission, customer };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    if (activeTab === 'imminent') {
      return alerts.filter(
        (a) => a.severity === 'critical' || a.category === 'unacked_imminent'
      );
    }
    if (activeTab === 'unacked') {
      return alerts.filter(
        (a) =>
          a.category === 'unacked_imminent' ||
          a.category === 'unacked_delayed' ||
          a.category === 'reconfirm_pending'
      );
    }
    if (activeTab === 'omission') {
      return alerts.filter((a) => a.category === 'unassigned_omission');
    }
    if (activeTab === 'customer') {
      return alerts.filter((a) => a.category === 'customer_notify_pending');
    }
    return alerts;
  }, [alerts, activeTab]);

  const handleRemindClick = async (alertItem: UnackEscalationAlert) => {
    const targetId = alertItem.scheduleId || alertItem.bookingId;
    setRemindingId(alertItem.id);
    try {
      const res = await onSendReminder(targetId);
      if (res.ok) {
        setFeedbackMap((prev) => ({
          ...prev,
          [alertItem.id]: {
            ok: true,
            text: `기사 Cockpit에 재확인 긴급 알림 전송 완료 (누적 ${res.reminderCount || alertItem.reminderCount + 1}회)`,
          },
        }));
      } else {
        setFeedbackMap((prev) => ({
          ...prev,
          [alertItem.id]: {
            ok: false,
            text: res.error || '재알림 전송에 실패했습니다.',
          },
        }));
      }
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
      className="m-auto w-[calc(100%-1.5rem)] max-w-3xl rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl"
    >
      <div className="flex max-h-[86vh] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-300 border border-red-400/30">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="text-base sm:text-lg font-extrabold tracking-tight">
                배차 미확인 자동 추적 · 전달 누락 경보 센터
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                기사 미확인·변경 재확인·미배정 누락·고객 안내 대기 건을 픽업 임박도 순으로 자동 감시합니다.
              </p>
            </div>
          </div>
          <form method="dialog">
            <button
              type="submit"
              value="close"
              autoFocus
              aria-label="경보 센터 닫기"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </form>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          {[
            { id: 'all' as const, label: '전체 경보', count: counts.all },
            { id: 'imminent' as const, label: '초긴급·픽업임박', count: counts.imminent },
            { id: 'unacked' as const, label: '기사 미확인·재확인', count: counts.unacked },
            { id: 'omission' as const, label: '배차 누락(미배정)', count: counts.omission },
            { id: 'customer' as const, label: '고객 안내 대기', count: counts.customer },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                    active
                      ? 'bg-white/20 text-white'
                      : tab.id === 'imminent' && tab.count > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Alert List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60">
          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-12 px-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2.5" />
              <p className="text-sm font-bold text-slate-800">
                현재 해당 분류에 감지된 미확인·누락 경보가 없습니다.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                모든 배차가 정상 확인되었거나 발송 대기 항목이 처리되었습니다.
              </p>
            </div>
          ) : (
            filteredAlerts.map((item) => {
              const sev = SEVERITY_STYLES[item.severity];
              const feedback = feedbackMap[item.id];
              const isReminding = remindingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 shadow-xs transition-all ${sev.cardBorder}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${sev.badge}`}
                      >
                        {item.severity === 'critical' ? (
                          <ShieldAlert className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {item.categoryLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-900/90 px-2 py-0.5 text-[11px] font-bold text-white">
                        <Clock className="h-3 w-3 text-amber-300" />
                        {item.pickupCountdownLabel}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {item.bookingNo}
                      </span>
                      {item.reminderCount > 0 && (
                        <span className="rounded-md bg-violet-100 border border-violet-200 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                          본사 재알림 {item.reminderCount}회 전송됨
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {item.elapsedWaitLabel}
                    </span>
                  </div>

                  <div className="mb-1.5">
                    <h3 className="text-sm font-extrabold text-slate-900">{item.title}</h3>
                    <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">{item.detail}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-100/80 px-3 py-2 text-xs text-slate-700 mb-3">
                    <span>
                      <strong className="text-slate-900">일시:</strong> {item.pickupDate} {item.pickupTime}
                    </span>
                    <span>
                      <strong className="text-slate-900">구간:</strong> {item.pickupLocation} ➔ {item.destination}
                    </span>
                    <span>
                      <strong className="text-slate-900">차량/기사:</strong> {item.vehicleModel}{' '}
                      {item.vehiclePlate ? `(${item.vehiclePlate})` : ''} · {item.driverName}
                    </span>
                  </div>

                  {feedback && (
                    <div
                      className={`mb-2.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
                        feedback.ok
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {feedback.text}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {item.driverPhone && item.driverPhone !== '-' && (
                      <a
                        href={`tel:${item.driverPhone.replace(/[^0-9+]/g, '')}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <Phone className="h-3.5 w-3.5 text-emerald-600" />
                        기사 전화 ({item.driverPhone})
                      </a>
                    )}

                    {item.canSendDriverReminder && (
                      <button
                        type="button"
                        disabled={isReminding}
                        onClick={() => handleRemindClick(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {isReminding ? '재알림 전송 중...' : '기사 Cockpit 재알림 전송'}
                      </button>
                    )}

                    {item.category === 'customer_notify_pending' && (
                      <button
                        type="button"
                        onClick={() => {
                          dialogRef.current?.close();
                          onOpenCustomerMessage(
                            item.bookingId,
                            item.pendingCustomerTrigger || 'dispatch_confirmed'
                          );
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-indigo-700 cursor-pointer"
                      >
                        <MessageSquareText className="h-3.5 w-3.5" />
                        고객 안내 확인·발송
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        dialogRef.current?.close();
                        onOpenBookingDetail(item.bookingId);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      <span>{item.category === 'unassigned_omission' ? '즉시 배차하기' : '배차 상세'}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </dialog>
  );
}
