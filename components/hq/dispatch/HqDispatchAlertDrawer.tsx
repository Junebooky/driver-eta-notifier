'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bell,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquareText,
  Phone,
  X,
} from 'lucide-react';
import { CustomerNotificationTrigger } from '@/types/hq';
import { UnackEscalationAlert } from '@/utils/unackAlertEngine';
import { DispatchRouteTimeline } from '@/components/common/DispatchRouteTimeline';
import { haptics } from '@/utils/haptics';

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

interface AlertItemCardProps {
  item: UnackEscalationAlert;
  feedback?: { ok: boolean; text: string };
  isReminding: boolean;
  onRemind: (item: UnackEscalationAlert) => void;
  onClose: () => void;
  onOpenBookingDetail: (bookingId: string) => void;
  onOpenCustomerMessage: (bookingId: string, trigger?: CustomerNotificationTrigger) => void;
}

function AlertItemCard({
  item,
  feedback,
  isReminding,
  onRemind,
  onClose,
  onOpenBookingDetail,
  onOpenCustomerMessage,
}: AlertItemCardProps) {
  const [hoveredButton, setHoveredButton] = useState<'phone' | 'message' | 'detail' | null>(null);

  // Category badge config
  const categoryBadge = useMemo(() => {
    if (item.category === 'customer_notify_pending') {
      return {
        label: '안내 준비',
        style: 'bg-[#FEF6EC] border-[#FCD9BD] text-[#D97706]',
      };
    }
    if (item.severity === 'critical' || item.category === 'unacked_imminent') {
      return {
        label: '긴급 확인',
        style: 'bg-red-50 border-red-200 text-red-600',
      };
    }
    if (item.category === 'unassigned_omission') {
      return {
        label: '미배정',
        style: 'bg-rose-50 border-rose-200 text-rose-700',
      };
    }
    if (item.category === 'reconfirm_pending') {
      return {
        label: '재확인 대기',
        style: 'bg-indigo-50 border-indigo-200 text-indigo-700',
      };
    }
    return {
      label: '기사 미확인',
      style: 'bg-amber-50 border-amber-200 text-amber-700',
    };
  }, [item.category, item.severity]);

  // Display Title formatting (matching reference: "테스트코리아 A · QA 테스트 기사 (193호 5336)")
  const displayTitle = useMemo(() => {
    const parts: string[] = [item.customerName || '고객사'];
    if (item.driverName && item.driverName !== '-' && item.driverName !== '미배정') {
      const carInfo = item.vehiclePlate ? ` (${item.vehiclePlate})` : '';
      parts.push(`${item.driverName} 기사${carInfo}`);
    } else if (item.vehiclePlate && item.vehiclePlate !== '미배정') {
      parts.push(`차량 ${item.vehiclePlate}`);
    } else {
      parts.push('차량/기사 미배정');
    }
    return parts.join(' · ');
  }, [item.customerName, item.driverName, item.vehiclePlate]);

  // Message tooltip label
  const messageTooltipText = useMemo(() => {
    if (item.category === 'customer_notify_pending') {
      return '고객 안내 발송';
    }
    if (item.canSendDriverReminder) {
      return '기사 재알림';
    }
    return '안내 메시지';
  }, [item.category, item.canSendDriverReminder]);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-slate-300">
      {/* 1. Top Badges & Elapsed Time Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category warning pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${categoryBadge.style}`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{categoryBadge.label}</span>
          </span>

          {/* Pickup countdown pill */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#EDF4FF] border border-[#D0E2FF] text-[#1E60F3]">
            <Clock className="w-3.5 h-3.5 shrink-0 text-[#1E60F3]" />
            <span>{item.pickupCountdownLabel}</span>
          </span>

          {/* Booking No */}
          {item.bookingNo && (
            <span className="text-xs text-slate-400 font-medium ml-1">
              {item.bookingNo}
            </span>
          )}

          {item.reminderCount > 0 && (
            <span className="rounded-lg bg-violet-50 border border-violet-200 px-2 py-0.5 text-[11px] font-bold text-violet-700">
              재알림 {item.reminderCount}회
            </span>
          )}
        </div>

        {/* Elapsed wait time */}
        <span className="text-xs text-slate-400 font-normal shrink-0">
          {item.elapsedWaitLabel}
        </span>
      </div>

      {/* 2. Title & Detail Subtitle */}
      <h3 className="text-base sm:text-[17px] font-bold text-slate-900 tracking-tight mt-3 mb-1">
        {displayTitle}
      </h3>
      <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed mb-3.5">
        {item.detail}
      </p>

      {/* 3. Details Box (일시, 구간, 차량/기사) */}
      <div className="rounded-xl bg-[#F8FAFC] border border-slate-100 p-3.5 sm:p-4 space-y-2 mb-3.5">
        {/* Row 1: 일시 */}
        <div className="flex items-center text-xs sm:text-sm min-w-0">
          <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="font-medium text-slate-600 ml-2 w-14 shrink-0">일시</span>
          <span className="text-slate-300 mx-2 shrink-0 select-none">|</span>
          <span className="font-semibold text-slate-800 truncate">
            {item.pickupDate} {item.pickupTime}
          </span>
        </div>

        {/* Full chronological itinerary for multi-stop dispatches; legacy two-stop schedules keep their existing row. */}
        {item.routeWaypoints && item.routeWaypoints.length > 2 ? (
          <DispatchRouteTimeline
            waypoints={item.routeWaypoints}
            heading="전체 운행 경로"
            compact
            className="rounded-xl bg-white px-3 py-3"
          />
        ) : (
          <div className="flex items-center text-xs sm:text-sm min-w-0">
            <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="font-medium text-slate-600 ml-2 w-14 shrink-0">구간</span>
            <span className="text-slate-300 mx-2 shrink-0 select-none">|</span>
            <span className="font-semibold text-slate-800 truncate">
              {item.pickupLocation} → {item.destination}
            </span>
          </div>
        )}

        {/* Row 3: 차량/기사 */}
        <div className="flex items-center text-xs sm:text-sm min-w-0">
          <Car className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="font-medium text-slate-600 ml-2 w-14 shrink-0">차량/기사</span>
          <span className="text-slate-300 mx-2 shrink-0 select-none">|</span>
          <span className="font-semibold text-slate-800 truncate">
            {item.vehicleModel}
            {item.vehiclePlate && item.vehiclePlate !== '미배정' ? ` (${item.vehiclePlate})` : ''}
            {item.driverName && item.driverName !== '-' ? ` · ${item.driverName}` : ''}
          </span>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-3 rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-2 ${
            feedback.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 4. Bottom Right Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1">
        {/* Phone Button */}
        {item.driverPhone && item.driverPhone !== '-' ? (
          <div className="relative">
            {hoveredButton === 'phone' && (
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md border border-slate-100/90 whitespace-nowrap pointer-events-none z-10 animate-in fade-in zoom-in-95 duration-100">
                <span>기사 전화</span>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-[6px] border-t-white" />
              </div>
            )}
            <a
              href={`tel:${item.driverPhone.replace(/[^0-9+]/g, '')}`}
              onMouseEnter={() => setHoveredButton('phone')}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={() => haptics.lightTap()}
              className="w-10 h-10 rounded-xl bg-[#EBF2FE] hover:bg-blue-100 active:scale-95 flex items-center justify-center text-[#1E60F3] border border-blue-200/60 transition-all cursor-pointer shadow-2xs"
              aria-label={`기사 전화 (${item.driverPhone})`}
            >
              <Phone className="w-4 h-4 text-[#1E60F3]" />
            </a>
          </div>
        ) : (
          <button
            type="button"
            disabled
            className="w-10 h-10 rounded-xl bg-slate-100 text-slate-300 border border-slate-200/60 flex items-center justify-center cursor-not-allowed opacity-50"
            title="기사 연락처 없음"
          >
            <Phone className="w-4 h-4" />
          </button>
        )}

        {/* Message Button */}
        <div className="relative">
          {hoveredButton === 'message' && (
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md border border-slate-100/90 whitespace-nowrap pointer-events-none z-10 animate-in fade-in zoom-in-95 duration-100">
              <span>{messageTooltipText}</span>
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-[6px] border-t-white" />
            </div>
          )}
          <button
            type="button"
            disabled={isReminding}
            onMouseEnter={() => setHoveredButton('message')}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => {
              haptics.lightTap();
              if (item.category === 'customer_notify_pending') {
                onClose();
                onOpenCustomerMessage(
                  item.bookingId,
                  item.pendingCustomerTrigger || 'dispatch_confirmed'
                );
              } else if (item.canSendDriverReminder) {
                onRemind(item);
              } else {
                onClose();
                onOpenCustomerMessage(item.bookingId);
              }
            }}
            className={`w-10 h-10 rounded-xl bg-white hover:bg-slate-50 active:scale-95 flex items-center justify-center text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-2xs ${
              isReminding ? 'opacity-60 cursor-wait' : ''
            }`}
            aria-label={messageTooltipText}
          >
            {isReminding ? (
              <Clock className="w-4 h-4 animate-spin text-[#1E60F3]" />
            ) : (
              <MessageSquareText className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>

        {/* Detail Button */}
        <div className="relative">
          {hoveredButton === 'detail' && (
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md border border-slate-100/90 whitespace-nowrap pointer-events-none z-10 animate-in fade-in zoom-in-95 duration-100">
              <span>배차 상세</span>
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-[6px] border-t-white" />
            </div>
          )}
          <button
            type="button"
            onMouseEnter={() => setHoveredButton('detail')}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => {
              haptics.lightTap();
              onClose();
              onOpenBookingDetail(item.bookingId);
            }}
            className="w-10 h-10 rounded-xl bg-white hover:bg-slate-50 active:scale-95 flex items-center justify-center text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-2xs"
            aria-label="배차 상세"
          >
            <ExternalLink className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HqDispatchAlertDrawer({
  isOpen,
  onClose,
  alerts,
  onSendReminder,
  onOpenBookingDetail,
  onOpenCustomerMessage,
}: HqDispatchAlertDrawerProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const counts = useMemo(() => {
    const imminent = alerts.filter(
      (a) => a.severity === 'critical' || a.severity === 'urgent' || a.category === 'unacked_imminent'
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

  const tabs = useMemo(
    () => [
      { id: 'all' as const, label: '전체', count: counts.all },
      { id: 'imminent' as const, label: '긴급', count: counts.imminent },
      { id: 'unacked' as const, label: '기사 확인', count: counts.unacked },
      { id: 'omission' as const, label: '미배정', count: counts.omission },
      { id: 'customer' as const, label: '안내 대기', count: counts.customer },
    ],
    [counts]
  );

  const filteredAlerts = useMemo(() => {
    if (activeTab === 'imminent') {
      return alerts.filter(
        (a) => a.severity === 'critical' || a.severity === 'urgent' || a.category === 'unacked_imminent'
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

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-3 sm:p-5 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 1. Header (Reference Style: Blue bell circle icon + Title & Subtitle + Close 'X' pill) */}
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#EBF2FE] flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-[#1E60F3] stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                배차 확인 알림
              </h2>
              <p className="text-xs sm:text-[13px] text-slate-400 font-normal mt-0.5 truncate">
                확인 필요한 건만 모아 보여줍니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            aria-label="닫기"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* 2. Filter Tabs (Pill style: 전체, 긴급, 기사 확인, 미배정, 안내 대기) */}
        <div className="flex items-center gap-2 overflow-x-auto px-6 py-3 border-b border-slate-100 bg-white no-scrollbar">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setActiveTab(tab.id);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#EBF2FE] text-[#1E60F3] shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                    active
                      ? 'bg-white text-[#1E60F3] shadow-2xs'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 3. Alert List */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 bg-[#FAFBFD]/70">
          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 px-6 text-center shadow-xs">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                확인이 필요한 배차 알림이 없습니다.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                모든 배차가 정상 확인되었거나 대기 중인 안내가 완료되었습니다.
              </p>
            </div>
          ) : (
            filteredAlerts.map((item) => (
              <AlertItemCard
                key={item.id}
                item={item}
                feedback={feedbackMap[item.id]}
                isReminding={remindingId === item.id}
                onRemind={handleRemindClick}
                onClose={onClose}
                onOpenBookingDetail={onOpenBookingDetail}
                onOpenCustomerMessage={onOpenCustomerMessage}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
