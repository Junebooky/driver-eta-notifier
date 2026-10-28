'use client';

import React, { useState, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import {
  Car,
  Send,
  Info,
  CheckCircle2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Building2,
  Search,
  Users,
  X,
  Globe,
  AlertTriangle,
  ShieldCheck,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';
import { VIP_REAL_VEHICLES, stripManufacturerName } from '@/utils/vehicleData';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { HqCustomer } from '@/types/customerHq';
import {
  RequestedDriverLanguage,
  ServiceIncludeMode,
} from '@/types/settlementHq';
import {
  calculateDriverLaborCost,
  createBookingPricingSnapshot,
  DEFAULT_DRIVER_PROFILES,
  DEFAULT_VEHICLE_PRICING_PRESETS,
  getSortedDriversForLanguage,
  resolveEffectivePricingTerms,
} from '@/utils/settlementCalculator';
import {
  getDriverProfilesSnapshot,
  getHqCustomersSnapshot,
  getVehiclePresetsSnapshot,
  subscribeSettlementReports,
  upsertEventSettlementFromBookings,
} from '@/utils/settlementStorage';
import { formatKRW } from '@/utils/expense';
import {
  cleanDriverIdentity,
  cleanVehicleIdentity,
  DEFAULT_CONFLICT_WINDOW_MINUTES,
  detectDispatchConflicts,
  formatSettlementDateLabel,
  getKstTodayDateStr,
  getKstTomorrowDateStr,
  mapScheduleItemToHqBooking,
  timeHHmmToMinutes,
} from '@/utils/dispatchConflictDetector';
import { ScheduleItem } from '@/data/ferrariSchedules';

export interface HqQuickDispatchProps {
  existingBookings?: HqBooking[];
  onSavedBookings?: () => Promise<void> | void;
  onCreateBooking?: (
    booking: Partial<HqBooking> | Partial<HqBooking>[],
    isDraft: boolean
  ) => void;
}

const VEHICLE_OPTIONS = VIP_REAL_VEHICLES.map((v) => ({
  id: v.id,
  plate: v.plate,
  modelRaw: v.model,
  modelClean: stripManufacturerName(v.model),
  label: `${stripManufacturerName(v.model)} (${v.plate})`,
}));

export interface VehicleAllocationItem {
  id: string;
  vehicleIndex: number;
  selectedDriver: string;
  selectedVehicleModel: string;
  selectedVehiclePlate: string;
  requestedLanguage: RequestedDriverLanguage;
  languageOverrideConfirmed: boolean;
  serviceMode: ServiceIncludeMode;
  hasCustomItinerary: boolean;
  customPassengerName: string;
  customPassengerPhone: string;
  customFlightNumber: string;
  customPickupTime: string;
  customPickupLocation: string;
  customDestination: string;
  customNotes: string;
}

const createInitialAllocation = (
  index: number,
  defaultLang: RequestedDriverLanguage = 'ko',
  expandCustom: boolean = false
): VehicleAllocationItem => ({
  id: `alloc-${Date.now()}-${index}`,
  vehicleIndex: index,
  selectedDriver: '',
  selectedVehicleModel: '',
  selectedVehiclePlate: '',
  requestedLanguage: defaultLang,
  languageOverrideConfirmed: false,
  serviceMode: 'with_driver',
  hasCustomItinerary: expandCustom,
  customPassengerName: '',
  customPassengerPhone: '',
  customFlightNumber: '',
  customPickupTime: '',
  customPickupLocation: '',
  customDestination: '',
  customNotes: '',
});

export const HqQuickDispatch: React.FC<HqQuickDispatchProps> = ({
  existingBookings = [],
  onSavedBookings,
  onCreateBooking,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [showAgencyFields, setShowAgencyFields] = useState(false);
  const [orderingAgency, setOrderingAgency] = useState('');
  const [endBrand, setEndBrand] = useState('');
  const [billingTarget, setBillingTarget] = useState<'ordering_agency' | 'end_brand'>('end_brand');

  // Real KST date & explicit time (no hardcoded 2026.10.26)
  const [pickupDate, setPickupDate] = useState(() => getKstTodayDateStr());
  const [pickupTimeOnly, setPickupTimeOnly] = useState('09:00');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [commonPassengerName, setCommonPassengerName] = useState('');
  const [commonPassengerPhone, setCommonPassengerPhone] = useState('');
  const [commonFlightNumber, setCommonFlightNumber] = useState('');
  const [groupEventTitle, setGroupEventTitle] = useState('');
  const [commonMemo, setCommonMemo] = useState('');
  const [commonLanguage, setCommonLanguage] = useState<RequestedDriverLanguage>('ko');

  const [allocations, setAllocations] = useState<VehicleAllocationItem[]>([
    createInitialAllocation(1, 'ko', false),
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allowConflictOverride, setAllowConflictOverride] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liveVehiclePresets = useSyncExternalStore(
    subscribeSettlementReports,
    getVehiclePresetsSnapshot,
    () => DEFAULT_VEHICLE_PRICING_PRESETS
  );
  const liveDriverProfiles = useSyncExternalStore(
    subscribeSettlementReports,
    getDriverProfilesSnapshot,
    () => DEFAULT_DRIVER_PROFILES
  );
  const liveCustomers = useSyncExternalStore(
    subscribeSettlementReports,
    getHqCustomersSnapshot,
    () => INITIAL_HQ_CUSTOMERS
  );

  const selectedCustomerObj = useMemo(() => {
    if (!selectedCustomerId) return null;
    return liveCustomers.find((c) => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, liveCustomers]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filteredCustomerSuggestions = useMemo(() => {
    if (!customerName.trim()) {
      return liveCustomers.slice(0, 6);
    }
    const q = customerName.toLowerCase();
    return liveCustomers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.primaryContactName || '').toLowerCase().includes(q) ||
          (c.department || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [customerName, liveCustomers]);

  const handleSelectCustomer = (customer: HqCustomer) => {
    haptics.lightTap();
    setCustomerName(customer.name);
    setSelectedCustomerId(customer.id);
    setEndBrand(customer.name);
    setIsCustomerDropdownOpen(false);

    if (!pickupLocation.trim() && customer.nextEvent?.location) {
      setPickupLocation(customer.nextEvent.location);
    }
    if (!groupEventTitle.trim()) {
      setGroupEventTitle(customer.nextEvent?.title || `${customer.name} VIP 의전`);
    }

    const prefersEnglish = (customer.preferences || []).some((p) => p.includes('영어'));
    if (prefersEnglish) {
      setCommonLanguage('en');
      setAllocations((prev) => prev.map((a) => ({ ...a, requestedLanguage: 'en' })));
    }
  };

  const handleCommonLanguageChange = (lang: RequestedDriverLanguage) => {
    haptics.selection();
    setCommonLanguage(lang);
    setAllocations((prev) =>
      prev.map((a) => ({
        ...a,
        requestedLanguage: lang,
        languageOverrideConfirmed: false,
      }))
    );
  };

  const handleAddVehicleAllocation = () => {
    haptics.selection();
    const nextIndex = allocations.length + 1;
    setAllocations((prev) => [
      // Auto-open custom passenger/itinerary on multi-vehicle so each vehicle's passenger & pickup can be set clearly
      ...prev.map((p, idx) => (idx === 0 && prev.length === 1 ? { ...p, hasCustomItinerary: true } : p)),
      createInitialAllocation(nextIndex, commonLanguage, true),
    ]);
  };

  const handleRemoveVehicleAllocation = (id: string) => {
    if (allocations.length <= 1) return;
    haptics.lightTap();
    setAllocations((prev) => {
      const filtered = prev.filter((a) => a.id !== id);
      return filtered.map((item, idx) => ({
        ...item,
        vehicleIndex: idx + 1,
      }));
    });
  };

  const handleUpdateAllocation = (
    id: string,
    field: keyof VehicleAllocationItem,
    value: any
  ) => {
    setErrorMsg(null);
    setAllocations((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (field === 'selectedDriver') {
          const drv = liveDriverProfiles.find(
            (d) => `${d.name} 기사` === value || d.name === value || d.id === value
          );
          if (drv) {
            return {
              ...item,
              selectedDriver: `${drv.name} 기사`,
              selectedVehicleModel: item.selectedVehicleModel || drv.defaultVehicleRaw,
              selectedVehiclePlate: item.selectedVehiclePlate || drv.plate,
              languageOverrideConfirmed: false,
            };
          }
          return {
            ...item,
            selectedDriver: value,
            languageOverrideConfirmed: false,
          };
        }

        if (field === 'selectedVehicleModel') {
          const veh = VEHICLE_OPTIONS.find(
            (v) => v.modelRaw === value || v.modelClean === value
          );
          return {
            ...item,
            selectedVehicleModel: value,
            selectedVehiclePlate: veh?.plate || item.selectedVehiclePlate,
          };
        }

        if (field === 'serviceMode' && value === 'vehicle_only') {
          return {
            ...item,
            serviceMode: 'vehicle_only',
            selectedDriver: '',
            languageOverrideConfirmed: true,
          };
        }

        return { ...item, [field]: value };
      })
    );
  };

  // Compute live client-side conflicts per allocation (against existingBookings + intra-batch)
  const allocationConflictsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    allocations.forEach((alloc, idx) => {
      const effTime =
        alloc.hasCustomItinerary && alloc.customPickupTime.trim()
          ? alloc.customPickupTime.trim()
          : pickupTimeOnly;
      const cleanDrv = cleanDriverIdentity(alloc.selectedDriver);
      const vehObj = VEHICLE_OPTIONS.find(
        (v) => v.modelRaw === alloc.selectedVehicleModel || v.modelClean === alloc.selectedVehicleModel
      );
      const matchedDrv = liveDriverProfiles.find((d) => d.name === cleanDrv);
      const effPlate = alloc.selectedVehiclePlate || vehObj?.plate || matchedDrv?.plate || '';

      const msgs: string[] = [];

      // 1. Existing DB schedule conflicts
      const dbConflicts = detectDispatchConflicts(
        {
          pickupDate,
          pickupTime: effTime,
          driverName: cleanDrv,
          vehiclePlate: effPlate,
        },
        existingBookings
      );
      dbConflicts.forEach((c) => msgs.push(c.message));

      // 2. Intra-group duplicate driver / vehicle check
      for (let j = 0; j < allocations.length; j++) {
        if (j === idx) continue;
        const other = allocations[j];
        const otherTime =
          other.hasCustomItinerary && other.customPickupTime.trim()
            ? other.customPickupTime.trim()
            : pickupTimeOnly;
        const m1 = timeHHmmToMinutes(effTime);
        const m2 = timeHHmmToMinutes(otherTime);
        if (m1 === null || m2 === null || Math.abs(m1 - m2) >= DEFAULT_CONFLICT_WINDOW_MINUTES) {
          continue;
        }
        const otherDrv = cleanDriverIdentity(other.selectedDriver);
        const otherVehObj = VEHICLE_OPTIONS.find(
          (v) => v.modelRaw === other.selectedVehicleModel || v.modelClean === other.selectedVehicleModel
        );
        const otherMatchedDrv = liveDriverProfiles.find((d) => d.name === otherDrv);
        const otherPlate = other.selectedVehiclePlate || otherVehObj?.plate || otherMatchedDrv?.plate || '';

        if (cleanDrv && otherDrv && cleanDrv === otherDrv) {
          msgs.push(`[행사 내 기사 중복] ${j + 1}호차에도 ${cleanDrv} 기사가 선택되어 있습니다.`);
        }
        if (
          cleanVehicleIdentity(effPlate) &&
          cleanVehicleIdentity(otherPlate) &&
          cleanVehicleIdentity(effPlate) === cleanVehicleIdentity(otherPlate)
        ) {
          msgs.push(`[행사 내 차량 중복] ${j + 1}호차에도 동일 차량(${effPlate})이 선택되어 있습니다.`);
        }
      }

      map[alloc.id] = msgs;
    });
    return map;
  }, [allocations, pickupDate, pickupTimeOnly, existingBookings, liveDriverProfiles]);

  const totalLiveConflicts = useMemo(
    () => Object.values(allocationConflictsMap).reduce((acc, arr) => acc + arr.length, 0),
    [allocationConflictsMap]
  );

  // Unified Real API Save / Publish Handler
  const handleSubmit = async (mode: 'unassigned' | 'draft' | 'published') => {
    setErrorMsg(null);
    setNotificationMsg(null);

    if (!customerName.trim()) {
      setErrorMsg('고객사명(또는 예약자명)을 입력해 주세요.');
      haptics.warningPulse();
      return;
    }
    if (!pickupDate || !pickupTimeOnly) {
      setErrorMsg('운행 일자와 픽업 시간을 입력해 주세요.');
      haptics.warningPulse();
      return;
    }

    const totalVehicles = allocations.length;
    const isMultiVehicleGroup = totalVehicles > 1;
    const sharedEventId = `ev-${Date.now()}`;
    const sharedGroupId = isMultiVehicleGroup ? `grp-${Date.now()}` : undefined;
    const sharedGroupName =
      groupEventTitle.trim() ||
      `${customerName.trim()} ${isMultiVehicleGroup ? `VIP 단체 의전 (${totalVehicles}대)` : 'VIP 의전'}`;

    // Validate per-vehicle route & assignment
    for (const alloc of allocations) {
      const effOrigin =
        alloc.hasCustomItinerary && alloc.customPickupLocation.trim()
          ? alloc.customPickupLocation.trim()
          : pickupLocation.trim();
      const effDest =
        alloc.hasCustomItinerary && alloc.customDestination.trim()
          ? alloc.customDestination.trim()
          : destination.trim();

      if (!effOrigin || !effDest) {
        setErrorMsg(`${alloc.vehicleIndex}호차의 출발지(픽업 위치)와 도착지(목적지)를 입력해 주세요.`);
        haptics.warningPulse();
        return;
      }

      if (mode === 'published') {
        const cleanDrv = cleanDriverIdentity(alloc.selectedDriver);
        if (alloc.serviceMode === 'with_driver' && !cleanDrv) {
          setErrorMsg(
            `${alloc.vehicleIndex}호차의 담당 기사를 선택해 주세요. 차량·기사 선정 전 전화 접수라면 [배차 대기함 등록(미배정)]을 눌러주세요.`
          );
          haptics.warningPulse();
          return;
        }
        if (!alloc.selectedVehicleModel && !alloc.selectedVehiclePlate) {
          setErrorMsg(`${alloc.vehicleIndex}호차의 배정 차량을 선택해 주세요.`);
          haptics.warningPulse();
          return;
        }

        if (alloc.serviceMode === 'with_driver' && alloc.requestedLanguage === 'en' && cleanDrv) {
          const drv = liveDriverProfiles.find((d) => d.name === cleanDrv);
          if (drv && !drv.isEnglishVerified && !alloc.languageOverrideConfirmed) {
            setErrorMsg(
              `${alloc.vehicleIndex}호차: 영어 가능 기사가 요청되었으나 한국어 전용 기사(${drv.name})가 선택되었습니다. 영어 가능 기사로 변경하거나 예외 배정을 체크해 주세요.`
            );
            haptics.warningPulse();
            return;
          }
        }
      }
    }

    if (mode === 'published' && totalLiveConflicts > 0 && !allowConflictOverride) {
      setErrorMsg(
        '선택한 기사 또는 차량에 일정 충돌이 있습니다. 다른 기사·차량을 선택하거나 아래 [일정 충돌 예외 배차 승인]을 체크해 주세요.'
      );
      haptics.warningPulse();
      return;
    }

    const payloadItems = allocations.map((alloc, idx) => {
      const vehicleNum = idx + 1;
      const cleanDrv = mode === 'unassigned' ? '' : cleanDriverIdentity(alloc.selectedDriver);
      const matchedDriver = cleanDrv
        ? liveDriverProfiles.find((d) => d.name === cleanDrv || d.id === cleanDrv)
        : undefined;
      const matchedVehicle =
        mode === 'unassigned'
          ? undefined
          : VEHICLE_OPTIONS.find(
              (v) =>
                v.modelRaw === alloc.selectedVehicleModel ||
                v.modelClean === alloc.selectedVehicleModel
            );

      const resolvedPlate =
        mode === 'unassigned'
          ? ''
          : alloc.selectedVehiclePlate || matchedVehicle?.plate || matchedDriver?.plate || '';

      const resolvedModel =
        mode === 'unassigned'
          ? ''
          : alloc.selectedVehicleModel || matchedVehicle?.modelRaw || matchedDriver?.defaultVehicleRaw || '';

      const resolvedPickupTime =
        alloc.hasCustomItinerary && alloc.customPickupTime.trim()
          ? alloc.customPickupTime.trim()
          : pickupTimeOnly;

      const resolvedPickupLoc =
        alloc.hasCustomItinerary && alloc.customPickupLocation.trim()
          ? alloc.customPickupLocation.trim()
          : pickupLocation.trim();

      const resolvedDest =
        alloc.hasCustomItinerary && alloc.customDestination.trim()
          ? alloc.customDestination.trim()
          : destination.trim();

      const resolvedPassengerName =
        (alloc.hasCustomItinerary && alloc.customPassengerName.trim()) ||
        commonPassengerName.trim() ||
        (isMultiVehicleGroup ? `${customerName.trim()} (${vehicleNum}호차 VIP)` : customerName.trim());

      const resolvedPassengerPhone =
        (alloc.hasCustomItinerary && alloc.customPassengerPhone.trim()) ||
        commonPassengerPhone.trim() ||
        undefined;

      const resolvedFlightNumber =
        (alloc.hasCustomItinerary && alloc.customFlightNumber.trim()) ||
        commonFlightNumber.trim() ||
        undefined;

      const combinedNotes = [
        commonMemo.trim(),
        alloc.customNotes.trim() ? `[${vehicleNum}호차] ${alloc.customNotes.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' / ');

      const pricingSnapshot = createBookingPricingSnapshot({
        vehicleModel: resolvedModel || '스프린터 블랙',
        driverName: cleanDrv,
        serviceMode: alloc.serviceMode,
        requestedLanguage: alloc.requestedLanguage,
        customer: selectedCustomerObj,
        vehiclePresets: liveVehiclePresets,
        driverProfiles: liveDriverProfiles,
      });

      const dateCompact = pickupDate.replace(/-/g, '').slice(2);
      const randSuffix = String(Math.floor(100 + Math.random() * 900));
      const bookingNo = isMultiVehicleGroup
        ? `#${dateCompact}-${randSuffix}-${vehicleNum}`
        : `#${dateCompact}-${randSuffix}`;

      return {
        bookingNo,
        customerName: customerName.trim(),
        customerId: selectedCustomerId || `cust-${Date.now()}`,
        orderingAgency: orderingAgency.trim() || undefined,
        endBrand: endBrand.trim() || customerName.trim(),
        eventId: sharedEventId,
        eventName: sharedGroupName,
        billingTarget: orderingAgency.trim() ? billingTarget : 'end_brand',
        billingTargetName:
          orderingAgency.trim() && billingTarget === 'ordering_agency'
            ? `${orderingAgency.trim()} 귀하`
            : `${customerName.trim()} 귀하`,
        groupId: sharedGroupId,
        groupName: isMultiVehicleGroup ? sharedGroupName : undefined,
        groupTotalVehicles: totalVehicles,
        groupVehicleIndex: vehicleNum,
        intakeSource: mode === 'unassigned' ? 'phone' : 'quick_dispatch',
        vehicleNo: resolvedPlate || undefined,
        vehicleModel: resolvedModel || undefined,
        vehiclePlate: resolvedPlate || undefined,
        driverId: matchedDriver?.id || undefined,
        driverName: alloc.serviceMode === 'vehicle_only' ? '차량만 대여' : cleanDrv || undefined,
        driverPhone: matchedDriver?.phone || undefined,
        date: pickupDate,
        pickupTime: resolvedPickupTime,
        origin: resolvedPickupLoc,
        destination: resolvedDest,
        passengerName: resolvedPassengerName,
        passengerPhone: resolvedPassengerPhone,
        flightNumber: resolvedFlightNumber,
        notes: combinedNotes || undefined,
        dispatchStatus: mode,
        allowUnverified: true,
        allowConflictOverride,
        publishedBy: mode === 'unassigned' ? '사모님(예약접수)' : '대표님(배차확정)',
        requestedLanguage: alloc.requestedLanguage,
        languageOverrideConfirmed: alloc.languageOverrideConfirmed,
        serviceMode: alloc.serviceMode,
        appliedPricingSnapshot: pricingSnapshot,
      };
    });

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/schedules/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payloadItems }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const serverErr =
          data.error ||
          (res.status === 409
            ? '선택한 기사 또는 차량의 일정이 기존 배차와 중복됩니다.'
            : '서버 배차 저장에 실패했습니다. 네트워크 및 입력 정보를 확인해 주세요.');
        setErrorMsg(serverErr);
        haptics.errorAlert();
        return;
      }

      const savedSchedules: ScheduleItem[] = Array.isArray(data.schedules)
        ? data.schedules
        : data.schedule
        ? [data.schedule]
        : [];

      const createdHqBookings = savedSchedules.map((s, idx) =>
        mapScheduleItemToHqBooking(s, idx)
      );

      // Sync Settlement Event Report when assigned/published
      if (mode === 'published' && createdHqBookings.length > 0) {
        const fallbackCustomer: HqCustomer = selectedCustomerObj || {
          id: selectedCustomerId || `cust-${Date.now()}`,
          name: customerName.trim(),
          tier: 'VIP',
          isFavorite: false,
          primaryContactName: commonPassengerName.trim() || '전담 담당자',
          contactCountExtra: 0,
          recentSnippet: sharedGroupName,
          mainPhone: commonPassengerPhone.trim() || '010-0000-0000',
          mainEmail: 'vip@viplimo.co.kr',
          department: '기업 의전팀',
          preferences: [],
          notes: [],
          recentRequests: [],
          contacts: [],
          eventsHistory: [],
          tripsHistory: [],
          communications: [],
        };

        upsertEventSettlementFromBookings({
          reportId: `rep-${sharedEventId}`,
          eventId: sharedEventId,
          customer: fallbackCustomer,
          eventName: sharedGroupName,
          eventDate: formatSettlementDateLabel(pickupDate),
          location: pickupLocation.trim(),
          bookings: createdHqBookings,
          orderingAgency: orderingAgency.trim() || undefined,
          billingTarget: orderingAgency.trim() ? billingTarget : 'end_brand',
          billingTargetName:
            orderingAgency.trim() && billingTarget === 'ordering_agency'
              ? `${orderingAgency.trim()} 귀하`
              : `${fallbackCustomer.name} 귀하`,
          status: 'draft',
        });
      }

      haptics.successPulse();

      if (onCreateBooking && createdHqBookings.length > 0) {
        onCreateBooking(
          createdHqBookings.length === 1 ? createdHqBookings[0] : createdHqBookings,
          mode !== 'published'
        );
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vip_hq_schedules_updated'));
      }
      await onSavedBookings?.();

      if (mode === 'unassigned') {
        setNotificationMsg(
          isMultiVehicleGroup
            ? `전화 예약 ${totalVehicles}대가 [배차 대기함(미배정)]에 등록되었습니다. 대표님 스마트폰에서 바로 배차 확정할 수 있습니다.`
            : `전화 예약이 [배차 대기함(미배정)]에 등록되었습니다. 대표님 스마트폰에서 차량·기사를 배정할 수 있습니다.`
        );
      } else if (mode === 'draft') {
        setNotificationMsg(
          isMultiVehicleGroup
            ? `총 ${totalVehicles}대 배차 초안이 서버에 저장되었습니다.`
            : '배차 초안이 서버에 안전하게 저장되었습니다.'
        );
      } else {
        setNotificationMsg(
          isMultiVehicleGroup
            ? `총 ${totalVehicles}대 배차가 확정되어 각 담당 기사님의 Driver Cockpit에 즉시 반영되었습니다!`
            : `배차가 확정되어 ${payloadItems[0]?.driverName || '담당'} 기사님의 Driver Cockpit에 즉시 반영되었습니다!`
        );
      }

      // Reset form cleanly after confirmed server write
      setCustomerName('');
      setSelectedCustomerId(null);
      setOrderingAgency('');
      setEndBrand('');
      setPickupLocation('');
      setDestination('');
      setCommonPassengerName('');
      setCommonPassengerPhone('');
      setCommonFlightNumber('');
      setGroupEventTitle('');
      setCommonMemo('');
      setCommonLanguage('ko');
      setAllowConflictOverride(false);
      setAllocations([createInitialAllocation(1, 'ko', false)]);

      setTimeout(() => {
        setNotificationMsg(null);
      }, 4500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '네트워크 오류가 발생했습니다.';
      setErrorMsg(`서버 저장 실패: ${msg}`);
      haptics.errorAlert();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between select-none">
      <div>
        {/* 1. Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 border border-blue-100/60">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                전화 예약 접수 · 빠른 배차 확정
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                사모님 미배정 접수부터 대표님 복수 차량 확정까지 실시간 서버 공유
              </p>
            </div>
          </div>

          {allocations.length > 1 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs shrink-0">
              <Users className="w-3.5 h-3.5" />
              <span>총 {allocations.length}대</span>
            </span>
          )}
        </div>

        {/* 2. Form Body */}
        <div className="space-y-3 text-xs mt-3.5">
          {/* Customer Search Autocomplete */}
          <div className="relative" ref={customerDropdownRef}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-[#1E60F3]" />
                <span>고객사 / 예약처</span>
                <span className="text-[#1E60F3]">*</span>
              </label>
              {selectedCustomerId && (
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                  고객 연동됨
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setSelectedCustomerId(null);
                  setIsCustomerDropdownOpen(true);
                  setErrorMsg(null);
                }}
                onFocus={() => setIsCustomerDropdownOpen(true)}
                placeholder="고객사명 검색 또는 직접 입력 (예: CHANEL, 심텍, 모건스탠리)"
                className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-semibold text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {customerName && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerName('');
                    setSelectedCustomerId(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {isCustomerDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 flex items-center justify-between">
                  <span>고객 관리 등록사 목록</span>
                  <span>{filteredCustomerSuggestions.length}개</span>
                </div>

                {filteredCustomerSuggestions.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {filteredCustomerSuggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {c.name}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-black ${
                                c.tier === 'VIP'
                                  ? 'bg-purple-100 text-purple-700'
                                  : c.tier === '주요'
                                  ? 'bg-blue-100 text-[#1E60F3]'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {c.tier}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {c.primaryContactName} · {c.department}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center text-slate-400 text-[11px]">
                    신규 고객사명으로 직접 접수됩니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Row 2: 운행 일자 (오늘/내일 원터치) + 공통 픽업 시간 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700">
                  운행 일자 <span className="text-[#1E60F3]">*</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPickupDate(getKstTodayDateStr())}
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold cursor-pointer ${
                      pickupDate === getKstTodayDateStr()
                        ? 'bg-[#1E60F3] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    오늘
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickupDate(getKstTomorrowDateStr())}
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold cursor-pointer ${
                      pickupDate === getKstTomorrowDateStr()
                        ? 'bg-[#1E60F3] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    내일
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                공통 픽업 시간 <span className="text-[#1E60F3]">*</span>
              </label>
              <input
                type="time"
                value={pickupTimeOnly}
                onChange={(e) => setPickupTimeOnly(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Row 3: 공통 출발지 & 목적지 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                공통 픽업 위치 (출발지) <span className="text-[#1E60F3]">*</span>
              </label>
              <input
                type="text"
                value={pickupLocation}
                onChange={(e) => {
                  setPickupLocation(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="예: 인천공항 T2 / 조선팰리스 강남"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                공통 목적지 (도착지) <span className="text-[#1E60F3]">*</span>
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="예: 신라호텔 서울 / 코엑스"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Row 4: 대표 승객명 · 연락처 · 항공편 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                대표 탑승객명
              </label>
              <input
                type="text"
                value={commonPassengerName}
                onChange={(e) => setCommonPassengerName(e.target.value)}
                placeholder="예: Mr. Laurent / 김전무"
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                승객/담당 연락처
              </label>
              <input
                type="tel"
                value={commonPassengerPhone}
                onChange={(e) => setCommonPassengerPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                항공편명 (선택)
              </label>
              <input
                type="text"
                value={commonFlightNumber}
                onChange={(e) => setCommonFlightNumber(e.target.value)}
                placeholder="예: KE082"
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Agency / End Brand Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAgencyFields((prev) => !prev)}
              className="text-[11px] font-bold text-[#1E60F3] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {showAgencyFields ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  <span>대행사 발주 / 최종 브랜드 구분 접기</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>+ 광고대행사 발주 · 최종 브랜드 · 실제 청구처 구분</span>
                </>
              )}
            </button>

            {showAgencyFields && (
              <div className="mt-2 p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    발주 고객사 (대행사)
                  </label>
                  <input
                    type="text"
                    value={orderingAgency}
                    onChange={(e) => setOrderingAgency(e.target.value)}
                    placeholder="예: 제일기획, 이노션"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    최종 브랜드
                  </label>
                  <input
                    type="text"
                    value={endBrand || customerName}
                    onChange={(e) => setEndBrand(e.target.value)}
                    placeholder="예: CHANEL, Ferrari"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    실제 청구 대상
                  </label>
                  <select
                    value={billingTarget}
                    onChange={(e) =>
                      setBillingTarget(e.target.value as 'ordering_agency' | 'end_brand')
                    }
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-bold cursor-pointer"
                  >
                    <option value="ordering_agency">발주 대행사 청구</option>
                    <option value="end_brand">최종 브랜드 직접 청구</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Row 5: 요청 기사 언어 & 행사명 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Globe className="w-3 h-3 text-[#1E60F3]" />
                <span>요청 기사 언어</span>
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                {(
                  [
                    { id: 'ko', label: '한국어' },
                    { id: 'en', label: '영어 가능' },
                    { id: 'other', label: '기타/별도' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleCommonLanguageChange(opt.id)}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      commonLanguage === opt.id
                        ? 'bg-[#1E60F3] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                행사 / 프로젝트명 (선택)
              </label>
              <input
                type="text"
                value={groupEventTitle}
                onChange={(e) => setGroupEventTitle(e.target.value)}
                placeholder="예: 글로벌 임원 방한 의전"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {commonLanguage === 'en' && (
            <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-2 text-[11px] text-blue-800">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">영어 검증 기사 우선 표시:</span> 윤태준, 김민수, 박서연, 최영식 기사가 상단에 배치됩니다.
              </div>
            </div>
          )}

          {/* 공통 요청 메모 */}
          <div>
            <input
              type="text"
              maxLength={120}
              value={commonMemo}
              onChange={(e) => setCommonMemo(e.target.value)}
              placeholder="공통 의전 지시사항 입력 (피켓 문구, 생수, 대기 위치 등)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 3. Section: 차량·기사 배정 (대표님 선정 영역, 복수 차량 지원) */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>호차별 차량 · 기사 배정 ({allocations.length}대)</span>
              </span>

              <button
                type="button"
                onClick={handleAddVehicleAllocation}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border border-blue-200 text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>기사·차량 추가</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {allocations.map((alloc, idx) => {
                const sortedDrivers = getSortedDriversForLanguage(
                  alloc.requestedLanguage,
                  liveDriverProfiles
                );
                const cleanSelectedDriver = cleanDriverIdentity(alloc.selectedDriver);
                const selectedDriverObj = liveDriverProfiles.find(
                  (d) => d.name === cleanSelectedDriver
                );
                const hasLanguageMismatch =
                  alloc.serviceMode === 'with_driver' &&
                  alloc.requestedLanguage === 'en' &&
                  selectedDriverObj &&
                  !selectedDriverObj.isEnglishVerified;

                const previewPricing = resolveEffectivePricingTerms({
                  vehicleModel:
                    alloc.selectedVehicleModel || selectedDriverObj?.defaultVehicleRaw,
                  serviceMode: alloc.serviceMode,
                  customerContractTerms: selectedCustomerObj?.contractTerms,
                  vehiclePresets: liveVehiclePresets,
                });

                const previewLabor = calculateDriverLaborCost({
                  driverName: cleanSelectedDriver,
                  vehicleModel:
                    alloc.selectedVehicleModel || selectedDriverObj?.defaultVehicleRaw,
                  serviceMode: alloc.serviceMode,
                  profiles: liveDriverProfiles,
                });

                const conflictMessages = allocationConflictsMap[alloc.id] || [];

                return (
                  <div
                    key={alloc.id}
                    className={`rounded-xl p-3 border space-y-2.5 transition-all ${
                      conflictMessages.length > 0
                        ? 'bg-rose-50/50 border-rose-300'
                        : 'bg-slate-50/80 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-[#1E60F3] text-white flex items-center justify-center text-[10px] font-black">
                          {idx + 1}
                        </span>
                        <span>
                          {allocations.length === 1
                            ? '투입 차량 · 기사 (미정 시 아래 미배정 등록 가능)'
                            : `${idx + 1}호차 배정`}
                        </span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        <div className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAllocation(alloc.id, 'serviceMode', 'with_driver')
                            }
                            className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                              alloc.serviceMode === 'with_driver'
                                ? 'bg-[#1E60F3] text-white'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            기사 포함
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAllocation(alloc.id, 'serviceMode', 'vehicle_only')
                            }
                            className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                              alloc.serviceMode === 'vehicle_only'
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            차량만
                          </button>
                        </div>

                        {allocations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVehicleAllocation(alloc.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="호차 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Driver & Vehicle Selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          {alloc.serviceMode === 'vehicle_only'
                            ? '기사 배정 (차량만 대여)'
                            : '담당 기사 선정'}
                        </label>
                        <select
                          disabled={alloc.serviceMode === 'vehicle_only'}
                          value={alloc.selectedDriver}
                          onChange={(e) =>
                            handleUpdateAllocation(alloc.id, 'selectedDriver', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="">
                            {alloc.serviceMode === 'vehicle_only'
                              ? '기사 미배정 (차량만)'
                              : '-- 기사 선택 --'}
                          </option>
                          {sortedDrivers.map(({ driver }) => (
                            <option key={driver.id} value={`${driver.name} 기사`}>
                              {driver.isEnglishVerified ? '[영어] ' : '[국문] '}
                              {driver.name} ({stripManufacturerName(driver.defaultVehicleRaw)} ·{' '}
                              {driver.plate})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          투입 차량 선정
                        </label>
                        <select
                          value={alloc.selectedVehicleModel}
                          onChange={(e) =>
                            handleUpdateAllocation(
                              alloc.id,
                              'selectedVehicleModel',
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                        >
                          <option value="">-- 차량 선택 --</option>
                          {VEHICLE_OPTIONS.map((v) => (
                            <option key={v.id} value={v.modelRaw}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Live Schedule Conflict Alert per Vehicle Card */}
                    {conflictMessages.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-rose-100/90 border border-rose-300 text-[11px] text-rose-900 space-y-1">
                        {conflictMessages.map((msg, mIdx) => (
                          <div key={mIdx} className="flex items-start gap-1.5 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <span>{msg}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Language Mismatch Warning */}
                    {hasLanguageMismatch && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-900 space-y-1.5">
                        <div className="flex items-start gap-1.5 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            영어 가능 요청이나 {selectedDriverObj?.name} 기사는 한국어 전용입니다.
                          </span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-amber-800">
                          <input
                            type="checkbox"
                            checked={alloc.languageOverrideConfirmed}
                            onChange={(e) =>
                              handleUpdateAllocation(
                                alloc.id,
                                'languageOverrideConfirmed',
                                e.target.checked
                              )
                            }
                            className="rounded border-amber-400 text-[#1E60F3]"
                          />
                          <span>[관리자 확인] 요청 언어 불일치 예외 배정 승인</span>
                        </label>
                      </div>
                    )}

                    {/* Pricing Preview */}
                    {(alloc.selectedVehicleModel || selectedDriverObj) && (
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/80 text-[10px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.2 rounded bg-blue-50 text-[#1E60F3] font-black border border-blue-100">
                            {previewPricing.isTemporaryPreset ? '임시 단가(10h)' : '계약 단가'}
                          </span>
                          <span className="font-bold text-slate-700">
                            청구:{' '}
                            {previewPricing.hasContractTerms
                              ? formatKRW(previewPricing.baseFare)
                              : '요금 미등록'}
                          </span>
                        </div>
                        <div className="text-slate-500 font-semibold">
                          인건비:{' '}
                          <strong className="text-slate-800">
                            {alloc.serviceMode === 'vehicle_only'
                              ? '₩0'
                              : formatKRW(previewLabor.driverLaborCost)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* Per-Vehicle Passenger & Itinerary Override */}
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateAllocation(
                            alloc.id,
                            'hasCustomItinerary',
                            !alloc.hasCustomItinerary
                          )
                        }
                        className="text-[11px] font-bold text-[#1E60F3] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {alloc.hasCustomItinerary ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            <span>호차별 개별 승객·일정 접기</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            <span>+ 이 차량의 담당 승객·픽업시간·위치 개별 지정</span>
                          </>
                        )}
                      </button>

                      {alloc.hasCustomItinerary && (
                        <div className="mt-2 p-2.5 bg-white rounded-lg border border-slate-200/80 space-y-2 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                {idx + 1}호차 담당 승객명
                              </label>
                              <input
                                type="text"
                                value={alloc.customPassengerName}
                                onChange={(e) =>
                                  handleUpdateAllocation(
                                    alloc.id,
                                    'customPassengerName',
                                    e.target.value
                                  )
                                }
                                placeholder={commonPassengerName || '예: VIP 회장님'}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                승객 연락처
                              </label>
                              <input
                                type="tel"
                                value={alloc.customPassengerPhone}
                                onChange={(e) =>
                                  handleUpdateAllocation(
                                    alloc.id,
                                    'customPassengerPhone',
                                    e.target.value
                                  )
                                }
                                placeholder={commonPassengerPhone || '010-0000-0000'}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-medium"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                항공편명
                              </label>
                              <input
                                type="text"
                                value={alloc.customFlightNumber}
                                onChange={(e) =>
                                  handleUpdateAllocation(
                                    alloc.id,
                                    'customFlightNumber',
                                    e.target.value
                                  )
                                }
                                placeholder={commonFlightNumber || '예: AF264'}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-mono font-bold"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                개별 픽업 시간
                              </label>
                              <input
                                type="time"
                                value={alloc.customPickupTime}
                                onChange={(e) =>
                                  handleUpdateAllocation(
                                    alloc.id,
                                    'customPickupTime',
                                    e.target.value
                                  )
                                }
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-bold"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                개별 픽업 출발지
                              </label>
                              <input
                                type="text"
                                value={alloc.customPickupLocation}
                                onChange={(e) =>
                                  handleUpdateAllocation(
                                    alloc.id,
                                    'customPickupLocation',
                                    e.target.value
                                  )
                                }
                                placeholder={pickupLocation || '출발 위치'}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-medium"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                개별 도착 목적지
                              </label>
                              <input
                                type="text"
                                value={alloc.customDestination}
                                onChange={(e) =>
                                  handleUpdateAllocation(
                                    alloc.id,
                                    'customDestination',
                                    e.target.value
                                  )
                                }
                                placeholder={destination || '도착 위치'}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-medium"
                              />
                            </div>
                          </div>

                          <div>
                            <input
                              type="text"
                              value={alloc.customNotes}
                              onChange={(e) =>
                                handleUpdateAllocation(alloc.id, 'customNotes', e.target.value)
                              }
                              placeholder={`${idx + 1}호차 전용 의전 지시사항 (예: 골프백 4세트 적재)`}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-medium"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conflict Override Checkbox when active conflicts exist */}
          {totalLiveConflicts > 0 && (
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-800 cursor-pointer">
              <input
                type="checkbox"
                checked={allowConflictOverride}
                onChange={(e) => setAllowConflictOverride(e.target.checked)}
                className="rounded border-rose-400 text-rose-600"
              />
              <span>[대표님 확인] 일정 간격 충돌을 인지하였으며 예외 중복 배차를 승인합니다.</span>
            </label>
          )}

          <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p>
              사모님은 차량·기사 선택 없이 <strong>[배차 대기함 등록]</strong>만 누르면 대표님 스마트폰 대기함에 즉시 공유됩니다. 대표님이 배차 확정 시 각 기사님 Cockpit에 본인 일정만 반영됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* Error Banner (Honest Server Validation — Never Fakes Success!) */}
      {errorMsg && (
        <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-2 text-xs font-bold text-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Server-Confirmed Success Notification */}
      {notificationMsg && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* 4. Action Buttons: [배차 대기함 등록(미배정)] + [임시 초안] + [배차 확정 · 기사 전송] */}
      <div className="pt-3.5 mt-3 border-t border-slate-100 space-y-2">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            haptics.lightTap();
            handleSubmit('unassigned');
          }}
          className="w-full py-2.5 px-3 rounded-xl border-2 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 active:scale-[0.99] text-indigo-900 text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <PhoneCall className="w-3.5 h-3.5 text-indigo-700" />
          <span>
            {allocations.length > 1
              ? `배차 대기함 등록 · 미배정 (${allocations.length}대)`
              : '배차 대기함 등록 · 미배정 (사모님 전화접수)'}
          </span>
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              haptics.lightTap();
              handleSubmit('draft');
            }}
            className="col-span-1 py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer text-center disabled:opacity-50"
          >
            임시 초안
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              haptics.selection();
              handleSubmit('published');
            }}
            className="col-span-2 py-2.5 px-4 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-black shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>
              {allocations.length > 1
                ? `배차 확정 · 기사 전송 (${allocations.length}대)`
                : '배차 확정 · 기사 Cockpit 전송'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
