'use client';

import React, { useState, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import {
  Car,
  Send,
  Info,
  CheckCircle2,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Building2,
  Search,
  Users,
  X,
  Globe,
  AlertTriangle,
  FileText,
  Calendar,
  Clock,
  MapPin,
  Flag,
  Plane,
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
  createBookingPricingSnapshot,
  DEFAULT_DRIVER_PROFILES,
  DEFAULT_VEHICLE_PRICING_PRESETS,
} from '@/utils/settlementCalculator';
import {
  getDriverProfilesSnapshot,
  getHqCustomersSnapshot,
  getVehiclePresetsSnapshot,
  subscribeSettlementReports,
  upsertEventSettlementFromBookings,
} from '@/utils/settlementStorage';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';
import {
  cleanDriverIdentity,
  cleanVehicleIdentity,
  DEFAULT_CONFLICT_WINDOW_MINUTES,
  detectDispatchConflicts,
  formatSettlementDateLabel,
  getKstTodayDateStr,
  getKstTomorrowDateStr,
  mapScheduleItemToHqBooking,
  normalizeDateToIso,
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

const POPULAR_VEHICLE_MODELS = [
  'Mercedes-Benz Sprinter 519 CDI',
  'Mercedes-Benz Sprinter 319 CDI',
  'Mercedes-Benz V-Class',
  'Mercedes-Benz S-Class (W223)',
  'Genesis G90 LWB',
];

const POPULAR_TIMES = [
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
];

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

/**
 * Formats a single date or date range per user specification:
 * - 당일일 시: 2026.10.28일
 * - 여러 날 이용 시: 2026.10.28~10.30일
 */
export function formatDateRangeDisplay(startDateStr: string, endDateStr?: string | null): string {
  if (!startDateStr) return '날짜 선택';
  const startNormalized = normalizeDateToIso(startDateStr) || startDateStr;
  const endNormalized = endDateStr ? (normalizeDateToIso(endDateStr) || endDateStr) : startNormalized;

  const [sY, sM, sD] = startNormalized.split('-');
  if (!sY || !sM || !sD) return startDateStr;

  if (!endNormalized || startNormalized === endNormalized) {
    return `${sY}.${sM}.${sD}일`;
  }

  const [eY, eM, eD] = endNormalized.split('-');
  if (!eY || !eM || !eD) return `${sY}.${sM}.${sD}일`;

  if (sY === eY) {
    return `${sY}.${sM}.${sD}~${eM}.${eD}일`;
  } else {
    return `${sY}.${sM}.${sD}~${eY}.${eM}.${eD}일`;
  }
}

/**
 * Converts HH:mm time to Korean AM/PM format (e.g. 09:00 -> 오전 09:00, 14:30 -> 오후 02:30)
 */
export function formatTimeKoreanAmPm(hhmm: string): string {
  if (!hhmm) return '오전 09:00';
  const parts = hhmm.split(':');
  const h = parseInt(parts[0] || '9', 10);
  const m = parts[1] || '00';
  const isPm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${isPm ? '오후' : '오전'} ${String(h12).padStart(2, '0')}:${m}`;
}

function addDaysToIso(isoDate: string, days: number): string {
  try {
    const d = new Date(isoDate + 'T00:00:00+09:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return isoDate;
  }
}

// Brand Filled Icons with #1E60F3 (Non-transparent, filled with brand UI color)
function BrandFilledCarIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={`${className} text-[#1E60F3] shrink-0`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
    </svg>
  );
}

function BrandFilledDocumentIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={`${className} text-[#1E60F3] shrink-0`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  );
}

function BrandFilledGlobeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1E60F3" />
      <path
        d="M2.5 12h19M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrandFilledPlaneIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} text-[#1E60F3] shrink-0`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function BrandFilledUsersIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={`${className} text-[#1E60F3] shrink-0`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function BrandFilledNoteIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shrink-0 shadow-2xs`}>
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
      </svg>
    </div>
  );
}

export const HqQuickDispatch: React.FC<HqQuickDispatchProps> = ({
  existingBookings = [],
  onSavedBookings,
  onCreateBooking,
}) => {
  // 1. Customer Selection
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // 2. Date Range State (Single Day vs Multiple Days)
  const [pickupDate, setPickupDate] = useState(() => getKstTodayDateStr());
  const [pickupEndDate, setPickupEndDate] = useState<string>(() => getKstTodayDateStr());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // 3. Pickup Time State
  const [pickupTimeOnly, setPickupTimeOnly] = useState('09:00');
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const timePickerRef = useRef<HTMLDivElement>(null);

  // 4. Locations
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');

  // 5. Vehicle Model Selection
  const [selectedVehicleModel, setSelectedVehicleModel] = useState('');
  const [isVehicleModelDropdownOpen, setIsVehicleModelDropdownOpen] = useState(false);
  const vehicleModelRef = useRef<HTMLDivElement>(null);

  // 6. Additional Info Accordion & Fields
  // Extra Info Accordion Open/Closed State (default collapsed per Reference 1)
  const [isExtraInfoOpen, setIsExtraInfoOpen] = useState(false);
  const [commonLanguage, setCommonLanguage] = useState<RequestedDriverLanguage>('ko');
  const [commonFlightNumber, setCommonFlightNumber] = useState('');
  const [commonPassengerCount, setCommonPassengerCount] = useState<number>(1);
  const [commonPassengerName, setCommonPassengerName] = useState('');
  const [commonPassengerPhone, setCommonPassengerPhone] = useState('');
  const [commonMemo, setCommonMemo] = useState('');

  // Allocations (1 to N vehicles)
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

  // Outside click listener for all dropdowns & popovers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(target)) {
        setIsCustomerDropdownOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(target)) {
        setIsDatePickerOpen(false);
      }
      if (timePickerRef.current && !timePickerRef.current.contains(target)) {
        setIsTimePickerOpen(false);
      }
      if (vehicleModelRef.current && !vehicleModelRef.current.contains(target)) {
        setIsVehicleModelDropdownOpen(false);
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
    setIsCustomerDropdownOpen(false);

    if (!pickupLocation.trim() && customer.nextEvent?.location) {
      setPickupLocation(customer.nextEvent.location);
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

  // Stepper handlers for vehicle count
  const handleIncrementVehicle = () => {
    haptics.selection();
    const nextIndex = allocations.length + 1;
    if (nextIndex > 20) return;
    setAllocations((prev) => [
      ...prev,
      createInitialAllocation(nextIndex, commonLanguage, false),
    ]);
  };

  const handleDecrementVehicle = () => {
    if (allocations.length <= 1) return;
    haptics.lightTap();
    setAllocations((prev) => prev.slice(0, prev.length - 1));
  };

  // Vehicle model selector
  const handleSelectVehicleModel = (model: string) => {
    haptics.selection();
    setSelectedVehicleModel(model);
    setIsVehicleModelDropdownOpen(false);
    setAllocations((prev) =>
      prev.map((a) => {
        const matched = VEHICLE_OPTIONS.find(
          (v) => v.modelRaw === model || v.modelClean === model
        );
        return {
          ...a,
          selectedVehicleModel: model,
          selectedVehiclePlate: matched?.plate || a.selectedVehiclePlate,
        };
      })
    );
  };

  // Time picker handler
  const handleSelectTime = (hhmm: string) => {
    haptics.selection();
    setPickupTimeOnly(hhmm);
    setIsTimePickerOpen(false);
  };

  // Compute live client-side conflicts per allocation
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

  // Submit Handler: 'unassigned' (예약만 등록) or 'published' (바로 배차)
  const handleSubmit = async (mode: 'unassigned' | 'published') => {
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
    if (!pickupLocation.trim() || !destination.trim()) {
      setErrorMsg('픽업 위치와 목적지를 입력해 주세요.');
      haptics.warningPulse();
      return;
    }

    const totalVehicles = allocations.length;
    const isMultiVehicleGroup = totalVehicles > 1;
    const sharedEventId = `ev-${Date.now()}`;
    const sharedGroupId = isMultiVehicleGroup ? `grp-${Date.now()}` : undefined;
    const sharedGroupName = `${customerName.trim()} ${isMultiVehicleGroup ? `VIP 단체 의전 (${totalVehicles}대)` : 'VIP 의전'}`;

    const isMultiDay = Boolean(pickupEndDate && pickupEndDate !== pickupDate);
    const dateRangeLabel = formatDateRangeDisplay(pickupDate, pickupEndDate);

    const payloadItems = allocations.map((alloc, idx) => {
      const vehicleNum = idx + 1;

      // In 'published' (바로 배차) mode, resolve a driver and vehicle from fleet if not pre-assigned
      let cleanDrv = mode === 'unassigned' ? '' : cleanDriverIdentity(alloc.selectedDriver);
      if (mode === 'published' && !cleanDrv) {
        const candidate =
          (alloc.requestedLanguage === 'en'
            ? liveDriverProfiles.find((d) => d.isEnglishVerified)
            : null) ||
          liveDriverProfiles[idx % Math.max(1, liveDriverProfiles.length)] || {
            name: '윤태준',
            plate: '142호 7811',
            defaultVehicleRaw: 'Mercedes-Benz Sprinter 519 CDI',
          };
        cleanDrv = candidate.name;
      }

      const matchedDriver = cleanDrv
        ? liveDriverProfiles.find((d) => d.name === cleanDrv || d.id === cleanDrv)
        : undefined;

      let modelChoice = alloc.selectedVehicleModel || selectedVehicleModel;
      if (mode === 'published' && !modelChoice) {
        modelChoice = matchedDriver?.defaultVehicleRaw || 'Mercedes-Benz Sprinter 519 CDI';
      }

      const matchedVehicle = VEHICLE_OPTIONS.find(
        (v) => v.modelRaw === modelChoice || v.modelClean === modelChoice
      );

      const resolvedPlate =
        mode === 'unassigned'
          ? ''
          : alloc.selectedVehiclePlate || matchedVehicle?.plate || matchedDriver?.plate || '142호 7811';

      const resolvedModel =
        mode === 'unassigned' ? '' : modelChoice || matchedVehicle?.modelRaw || 'Mercedes-Benz Sprinter 519 CDI';

      const resolvedPassengerName =
        commonPassengerName.trim() ||
        (isMultiVehicleGroup ? `${customerName.trim()} (${vehicleNum}호차 VIP)` : customerName.trim());

      const resolvedPassengerPhone = commonPassengerPhone.trim() || undefined;
      const resolvedFlightNumber = commonFlightNumber.trim() || undefined;

      const notesParts: string[] = [];
      if (isMultiDay) {
        notesParts.push(`운행 기간: ${dateRangeLabel}`);
      }
      if (commonMemo.trim()) {
        notesParts.push(commonMemo.trim());
      }
      const combinedNotes = notesParts.join(' / ');

      const pricingSnapshot = createBookingPricingSnapshot({
        vehicleModel: resolvedModel || '스프린터 519 CDI',
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
        endBrand: customerName.trim(),
        eventId: sharedEventId,
        eventName: sharedGroupName,
        billingTarget: 'end_brand',
        billingTargetName: `${customerName.trim()} 귀하`,
        groupId: sharedGroupId,
        groupName: isMultiVehicleGroup ? sharedGroupName : undefined,
        groupTotalVehicles: totalVehicles,
        groupVehicleIndex: vehicleNum,
        intakeSource: mode === 'unassigned' ? 'phone' : 'quick_dispatch',
        vehicleNo: resolvedPlate || undefined,
        vehicleModel: resolvedModel || undefined,
        vehiclePlate: resolvedPlate || undefined,
        driverId: matchedDriver?.id || undefined,
        driverName: cleanDrv || undefined,
        driverPhone: matchedDriver?.phone || undefined,
        date: pickupDate,
        endDate: pickupEndDate || pickupDate,
        pickupTime: pickupTimeOnly,
        origin: pickupLocation.trim(),
        destination: destination.trim(),
        passengerName: resolvedPassengerName,
        passengerPhone: resolvedPassengerPhone,
        passengerCount: Math.max(1, commonPassengerCount || 1),
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
      await ensureClientAuth('hq');
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
          billingTarget: 'end_brand',
          billingTargetName: `${fallbackCustomer.name} 귀하`,
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
      } else {
        setNotificationMsg(
          isMultiVehicleGroup
            ? `총 ${totalVehicles}대 배차가 확정되어 각 담당 기사님의 Driver Cockpit에 즉시 반영되었습니다!`
            : `배차가 확정되어 담당 기사님의 Driver Cockpit에 즉시 반영되었습니다!`
        );
      }

      // Reset form cleanly
      setCustomerName('');
      setSelectedCustomerId(null);
      setPickupLocation('');
      setDestination('');
      setSelectedVehicleModel('');
      setCommonPassengerName('');
      setCommonPassengerPhone('');
      setCommonFlightNumber('');
      setCommonMemo('');
      setCommonLanguage('ko');
      setCommonPassengerCount(1);
      setAllowConflictOverride(false);
      setIsExtraInfoOpen(false);
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
    <div className="@container bg-white border border-slate-200/90 rounded-[24px] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] select-none flex flex-col justify-between">
      <div>
        {/* 1. Header (Reference 1) */}
        <div className="flex items-center gap-3 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF3FF] text-[#1E60F3] flex items-center justify-center shrink-0">
            <BrandFilledCarIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              빠른 예약 · 배차
            </h2>
            <p className="text-xs text-slate-400 font-normal leading-relaxed mt-0.5">
              필수 정보만 입력하고 예약하거나 바로 배차하세요.
            </p>
          </div>
        </div>

        {/* 2. Main Form Fields */}
        <div className="space-y-3.5 mt-1">
          {/* 고객사 / 예약자 * */}
          <div className="relative" ref={customerDropdownRef}>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              고객사 / 예약자 <span className="text-red-500 font-bold ml-0.5">*</span>
            </label>

            <div
              onClick={() => setIsCustomerDropdownOpen(true)}
              className="w-full h-12 bg-white border border-slate-200 hover:border-blue-400 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-blue-100 rounded-xl px-3.5 flex items-center justify-between transition-all cursor-pointer shadow-2xs"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Building2 className="w-5 h-5 text-slate-700 shrink-0" />
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
                  placeholder="고객사명 또는 예약자 입력"
                  className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </div>
              <ChevronDown className="w-5 h-5 text-slate-600 shrink-0" />
            </div>

            {/* Customer Dropdown */}
            {isCustomerDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto animate-in fade-in duration-150">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 flex items-center justify-between">
                  <span>등록 고객사</span>
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
                            <span className="font-bold text-slate-900 text-xs truncate">{c.name}</span>
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
                  <div className="p-3 text-center text-slate-400 text-xs">
                    신규 고객사/예약자로 등록됩니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 운행 날짜 * & 픽업 시간 * (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 운행 날짜 */}
            <div className="relative" ref={datePickerRef}>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                운행 날짜 <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setIsDatePickerOpen((prev) => !prev);
                  setIsTimePickerOpen(false);
                  setIsVehicleModelDropdownOpen(false);
                }}
                className="w-full h-12 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] rounded-xl px-3.5 flex items-center gap-2.5 transition-all cursor-pointer shadow-2xs"
              >
                <Calendar className="w-5 h-5 text-slate-700 shrink-0" />
                <span className="text-sm font-bold text-slate-900 truncate flex-1">
                  {formatDateRangeDisplay(pickupDate, pickupEndDate)}
                </span>
              </div>

              {/* Date Range Picker Popover */}
              {isDatePickerOpen && (
                <div className="absolute left-0 right-0 sm:right-auto sm:w-80 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900">운행 일정 선택</span>
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick Range Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const today = getKstTodayDateStr();
                        setPickupDate(today);
                        setPickupEndDate(today);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-[#1E60F3] hover:bg-blue-100 transition-colors"
                    >
                      오늘
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tmr = getKstTomorrowDateStr();
                        setPickupDate(tmr);
                        setPickupEndDate(tmr);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      내일
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPickupEndDate(addDaysToIso(pickupDate, 1));
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      +1일 (1박2일)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPickupEndDate(addDaysToIso(pickupDate, 2));
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      +2일 (2박3일)
                    </button>
                  </div>

                  {/* Inputs for Start Date & End Date */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        시작일
                      </label>
                      <input
                        type="date"
                        value={pickupDate}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          setPickupDate(newStart);
                          if (pickupEndDate && pickupEndDate < newStart) {
                            setPickupEndDate(newStart);
                          }
                        }}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        종료일
                      </label>
                      <input
                        type="date"
                        min={pickupDate}
                        value={pickupEndDate || pickupDate}
                        onChange={(e) => setPickupEndDate(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold"
                      />
                    </div>
                  </div>

                  {/* Summary Preview Box */}
                  <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-center">
                    <span className="text-[11px] text-slate-500 block">표시될 일정</span>
                    <span className="text-sm font-black text-[#1E60F3]">
                      {formatDateRangeDisplay(pickupDate, pickupEndDate)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setIsDatePickerOpen(false);
                    }}
                    className="w-full py-2 bg-[#1E60F3] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-blue-600 transition-colors"
                  >
                    일정 적용
                  </button>
                </div>
              )}
            </div>

            {/* 픽업 시간 */}
            <div className="relative" ref={timePickerRef}>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                픽업 시간 <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setIsTimePickerOpen((prev) => !prev);
                  setIsDatePickerOpen(false);
                  setIsVehicleModelDropdownOpen(false);
                }}
                className="w-full h-12 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] rounded-xl px-3.5 flex items-center justify-between transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Clock className="w-5 h-5 text-slate-700 shrink-0" />
                  <span className="text-sm font-bold text-slate-900 truncate">
                    {formatTimeKoreanAmPm(pickupTimeOnly)}
                  </span>
                </div>
                <ChevronDown className="w-5 h-5 text-slate-600 shrink-0" />
              </div>

              {/* Time Picker Dropdown */}
              {isTimePickerOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 animate-in fade-in duration-150 space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 px-1 pb-1 border-b border-slate-100">
                    주요 픽업 시간 선택
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto p-0.5">
                    {POPULAR_TIMES.map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => handleSelectTime(time)}
                        className={`py-2 px-1 text-xs font-bold rounded-lg text-center transition-colors cursor-pointer ${
                          pickupTimeOnly === time
                            ? 'bg-[#1E60F3] text-white shadow-xs'
                            : 'bg-slate-50 hover:bg-blue-50 text-slate-700'
                        }`}
                      >
                        {formatTimeKoreanAmPm(time)}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-bold shrink-0">직접 입력:</span>
                    <input
                      type="time"
                      value={pickupTimeOnly}
                      onChange={(e) => setPickupTimeOnly(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 픽업 위치 * & 목적지 * (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 픽업 위치 */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                픽업 위치 <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>

              <div className="w-full h-12 bg-white border border-slate-200 hover:border-blue-400 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-blue-100 rounded-xl px-3.5 flex items-center gap-2.5 transition-all shadow-2xs">
                <MapPin className="w-5 h-5 text-slate-700 shrink-0" />
                <input
                  type="text"
                  value={pickupLocation}
                  onChange={(e) => {
                    setPickupLocation(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="위치 검색 또는 입력"
                  className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </div>
            </div>

            {/* 목적지 */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                목적지 <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>

              <div className="w-full h-12 bg-white border border-slate-200 hover:border-blue-400 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-blue-100 rounded-xl px-3.5 flex items-center gap-2.5 transition-all shadow-2xs">
                <Flag className="w-5 h-5 text-slate-700 shrink-0" />
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="목적지 검색 또는 입력"
                  className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 차량 대수 * & 차종 (선택) (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 차량 대수 */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                차량 대수 <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>

              <div className="w-full h-12 bg-white border border-slate-200 rounded-xl px-2.5 flex items-center justify-between shadow-2xs">
                <button
                  type="button"
                  onClick={handleDecrementVehicle}
                  disabled={allocations.length <= 1}
                  className="w-8 h-8 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-[#1E60F3] font-black text-base flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  aria-label="차량 감소"
                >
                  <Minus className="w-4 h-4 stroke-[3]" />
                </button>

                <span className="text-sm font-black text-slate-900 text-center flex-1">
                  {allocations.length}대
                </span>

                <button
                  type="button"
                  onClick={handleIncrementVehicle}
                  className="w-8 h-8 rounded-lg bg-blue-50/80 hover:bg-blue-100 text-[#1E60F3] font-black text-base flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                  aria-label="차량 증가"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            </div>

            {/* 차종 (선택) */}
            <div className="relative" ref={vehicleModelRef}>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                차종 (선택)
              </label>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setIsVehicleModelDropdownOpen((prev) => !prev);
                  setIsDatePickerOpen(false);
                  setIsTimePickerOpen(false);
                }}
                className="w-full h-12 bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] rounded-xl px-3.5 flex items-center justify-between transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Car className="w-5 h-5 text-slate-700 shrink-0" />
                  <span
                    className={`text-sm truncate ${
                      selectedVehicleModel ? 'font-bold text-slate-900' : 'font-medium text-slate-400'
                    }`}
                  >
                    {selectedVehicleModel || '차종 선택'}
                  </span>
                </div>
                <ChevronDown className="w-5 h-5 text-slate-600 shrink-0" />
              </div>

              {/* Vehicle Model Dropdown */}
              {isVehicleModelDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1 divide-y divide-slate-100 animate-in fade-in duration-150">
                  <button
                    type="button"
                    onClick={() => handleSelectVehicleModel('')}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                  >
                    <span>차종 미정 (현장 배정)</span>
                  </button>
                  {POPULAR_VEHICLE_MODELS.map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => handleSelectVehicleModel(model)}
                      className={`w-full px-3.5 py-2.5 text-left text-xs font-bold flex items-center justify-between cursor-pointer transition-colors ${
                        selectedVehicleModel === model
                          ? 'bg-blue-50 text-[#1E60F3]'
                          : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span>{model}</span>
                      {selectedVehicleModel === model && <CheckCircle2 className="w-4 h-4 text-[#1E60F3]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. 추가 정보 (선택사항) Accordion (Reference 1 & 2) */}
          <div className="pt-1">
            {!isExtraInfoOpen ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setIsExtraInfoOpen(true);
                }}
                className="bg-[#F5F8FF] border border-blue-100 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-blue-50/70 transition-all shadow-2xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#EAF2FF] text-[#1E60F3] flex items-center justify-center shrink-0">
                    <BrandFilledDocumentIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      추가 정보 (선택사항)
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      기사 언어, 탑승객, 항공편, 요청사항 등을 입력하세요.
                    </p>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700">
                  <ChevronDown className="w-5 h-5 stroke-[2.2]" />
                </div>
              </div>
            ) : (
              <div className="@container bg-[#FAFBFD] border border-blue-100/90 rounded-3xl p-4 sm:p-5 shadow-2xs space-y-3.5 animate-in slide-in-from-top-2 duration-200">
                {/* Accordion Header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    haptics.lightTap();
                    setIsExtraInfoOpen(false);
                  }}
                  className="flex items-center justify-between cursor-pointer select-none pb-0.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#EAF2FF] text-[#1E60F3] flex items-center justify-center shrink-0">
                      <BrandFilledDocumentIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                        추가 정보 (선택사항)
                      </h3>
                      <p className="text-xs text-slate-400 font-normal mt-0.5">
                        언어, 탑승객, 항공편, 요청사항 등을 입력하세요.
                      </p>
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-800 hover:bg-slate-100/80 transition-colors">
                    <ChevronUp className="w-5 h-5 stroke-[2.5]" />
                  </div>
                </div>

                {/* Row 1: Sub-Card 1 (기사 언어 조건) & Sub-Card 2 (항공편 정보) */}
                <div className="grid grid-cols-1 @[540px]:grid-cols-2 gap-3 sm:gap-3.5">
                  {/* Sub-Card 1: 기사 언어 조건 */}
                  <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <BrandFilledGlobeIcon className="w-5 h-5" />
                      <span className="text-sm font-bold text-slate-800">기사 언어 조건</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 mt-3">
                      <button
                        type="button"
                        onClick={() => handleCommonLanguageChange("ko")}
                        className={`h-14 rounded-2xl flex items-center justify-center gap-2 px-2.5 transition-all cursor-pointer ${
                          commonLanguage === "ko"
                            ? "bg-[#EAF2FF] border-2 border-[#1E60F3] text-[#1E60F3] shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-white shadow-2xs border border-slate-200/60 text-base">
                          🇰🇷
                        </span>
                        <span className="text-xs @[400px]:text-sm font-bold whitespace-nowrap">무관</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCommonLanguageChange("en")}
                        className={`h-14 rounded-2xl flex items-center justify-center gap-2 px-2.5 transition-all cursor-pointer ${
                          commonLanguage === "en"
                            ? "bg-[#EAF2FF] border-2 border-[#1E60F3] text-[#1E60F3] shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-white shadow-2xs border border-slate-200/60 text-base">
                          🇺🇸
                        </span>
                        <span className="text-xs @[400px]:text-sm font-bold whitespace-nowrap">영어 가능</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-Card 2: 항공편 정보 */}
                  <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#E2EDFE] flex items-center justify-center text-[#1E60F3] shrink-0">
                        <BrandFilledPlaneIcon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-800">항공편 정보</span>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-700 whitespace-nowrap">항공편명</span>
                      <input
                        type="text"
                        value={commonFlightNumber}
                        onChange={(e) => setCommonFlightNumber(e.target.value)}
                        placeholder="예: KE082"
                        className="w-full h-14 bg-white border border-slate-200 rounded-2xl px-4 text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Sub-Card 3 (탑승객 정보) */}
                <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BrandFilledUsersIcon className="w-5 h-5" />
                    <span className="text-sm font-bold text-slate-800">탑승객 정보</span>
                  </div>

                  <div className="grid grid-cols-1 @[520px]:grid-cols-12 gap-3 items-end">
                    {/* 탑승객 수 (Aligned at bottom with input heights) */}
                    <div className="@[520px]:col-span-4">
                      <div className="h-14 bg-white border border-slate-200 rounded-2xl px-4 flex items-center justify-between shadow-2xs">
                        <span className="text-sm font-bold text-slate-800">탑승객 수</span>
                        <div className="flex items-center gap-1.5 bg-[#F1F6FD] rounded-xl px-2 py-1">
                          <button
                            type="button"
                            onClick={() => setCommonPassengerCount((prev) => Math.max(0, prev - 1))}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 text-slate-600 font-bold flex items-center justify-center cursor-pointer shadow-2xs transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                          <span className="text-sm font-black text-slate-900 px-2 min-w-5 text-center">
                            {commonPassengerCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCommonPassengerCount((prev) => prev + 1)}
                            className="w-7 h-7 rounded-lg bg-[#1E60F3] hover:bg-blue-600 text-white font-bold flex items-center justify-center cursor-pointer shadow-2xs transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 탑승객명 & 탑승객 번호 */}
                    <div className="grid grid-cols-2 gap-2.5 @[520px]:contents">
                      <div className="@[520px]:col-span-4">
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">탑승객명</label>
                        <input
                          type="text"
                          value={commonPassengerName}
                          onChange={(e) => setCommonPassengerName(e.target.value)}
                          placeholder="예: 홍길동"
                          className="w-full h-14 bg-white border border-slate-200 rounded-2xl px-4 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                      </div>

                      <div className="@[520px]:col-span-4">
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">탑승객 번호</label>
                        <input
                          type="tel"
                          value={commonPassengerPhone}
                          onChange={(e) => setCommonPassengerPhone(e.target.value)}
                          placeholder="예: 010-1234-5678"
                          className="w-full h-14 bg-white border border-slate-200 rounded-2xl px-4 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 3: Sub-Card 4 (추가 요청사항) */}
                <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-2xl p-4 sm:p-5">
                  <div className="flex flex-col @[520px]:flex-row @[520px]:items-center gap-2.5 @[520px]:gap-4">
                    <div className="flex items-center gap-2.5 shrink-0">
                      <BrandFilledNoteIcon className="w-8 h-8" />
                      <span className="text-sm font-bold text-slate-800 whitespace-nowrap">
                        추가 요청사항
                      </span>
                    </div>
                    <input
                      type="text"
                      value={commonMemo}
                      onChange={(e) => setCommonMemo(e.target.value)}
                      placeholder="요청사항을 입력하세요. (예: 현장 미팅 후 이동, 주차 위치 등)"
                      className="w-full h-14 bg-white border border-slate-200 rounded-2xl px-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Conflict Warning Banner if any */}
        {totalLiveConflicts > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 space-y-1">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>기존 배차와 일정 충돌이 감지되었습니다 ({totalLiveConflicts}건)</span>
            </div>
            <label className="flex items-center gap-2 pt-1 text-[11px] text-rose-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allowConflictOverride}
                onChange={(e) => setAllowConflictOverride(e.target.checked)}
                className="rounded border-rose-400 text-rose-600"
              />
              <span>일정 중복을 확인하였으며 예외 배정합니다.</span>
            </label>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-2 text-xs font-bold text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Banner */}
        {notificationMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{notificationMsg}</span>
          </div>
        )}
      </div>

      {/* 4. Action Buttons (Reference 1) */}
      <div className="pt-4 mt-2">
        <div className="grid grid-cols-2 gap-3">
          {/* 예약만 등록 */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              haptics.lightTap();
              handleSubmit('unassigned');
            }}
            className="w-full h-12 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] text-slate-800 font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-slate-700" />
            <span>예약만 등록</span>
          </button>

          {/* 바로 배차 */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              haptics.selection();
              handleSubmit('published');
            }}
            className="w-full h-12 bg-[#1E60F3] hover:bg-blue-600 active:scale-[0.98] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
            <span>바로 배차</span>
          </button>
        </div>

        {/* Helper Note */}
        <div className="flex items-center justify-center gap-1.5 pt-3 text-xs text-slate-400 font-medium text-center">
          <Info className="w-4 h-4 text-[#1E60F3] shrink-0" />
          <span>예약만 등록하면 미배정 대기함에 저장됩니다.</span>
        </div>
      </div>
    </div>
  );
};
