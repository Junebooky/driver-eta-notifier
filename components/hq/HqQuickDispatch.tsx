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
  BellRing,
  MessageSquareText,
  ExternalLink,
  Image as ImageIcon,
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
import { HqPlaceSearchInput } from './HqPlaceSearchInput';
import { TossDateRangePicker } from '@/components/common/TossDateRangePicker';
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
import { createRetryableJsonMutation, quickDispatchIntent } from '@/utils/retryableJsonMutation';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { VEHICLE_STATUS_LABELS } from '@/utils/fleetVehicleStatus';
import { useFleetAvailability } from '@/hooks/useFleetAvailability';
import { validateDispatchInterval } from '@/utils/dispatchInterval';

export interface HqQuickDispatchProps {
  existingBookings?: HqBooking[];
  onSavedBookings?: () => Promise<void> | void;
  onCreateBooking?: (
    booking: Partial<HqBooking> | Partial<HqBooking>[],
    isDraft: boolean
  ) => void;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  initialBooking?: HqBooking | null;
  onRemindDriver?: (booking: HqBooking) => Promise<void> | void;
  onOpenCustomerMessage?: (booking: HqBooking) => void;
  onOpenDriverVehicleInfo?: (booking: HqBooking) => void;
  onOpenDetailModal?: (booking: HqBooking) => void;
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
    <svg className={`${className} text-[#1E60F3] shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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

function BrandFilledNoteIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <div className={`${className} rounded-md bg-[#1E60F3] text-white flex items-center justify-center shrink-0 shadow-2xs`}>
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6h16v2.5H4zm0 5h16v2.5H4zm0 5h16v2.5H4z" />
      </svg>
    </div>
  );
}

export const HqQuickDispatch: React.FC<HqQuickDispatchProps> = ({
  existingBookings = [],
  onSavedBookings,
  onCreateBooking,
  isModal = false,
  isOpen = true,
  onClose,
  initialBooking = null,
  onRemindDriver,
  onOpenCustomerMessage,
  onOpenDriverVehicleInfo,
  onOpenDetailModal,
}) => {
  // 1. Customer Selection
  const [customerName, setCustomerName] = useState(() => initialBooking?.customerName || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(() => initialBooking?.customerId || null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // 2. Date Range State (Single Day vs Multiple Days)
  const [pickupDate, setPickupDate] = useState(() => initialBooking?.pickupDate || getKstTodayDateStr());
  const [pickupEndDate, setPickupEndDate] = useState<string>(() => initialBooking?.endDate || initialBooking?.pickupDate || getKstTodayDateStr());

  // 3. Pickup Time State
  const [pickupTimeOnly, setPickupTimeOnly] = useState(() => initialBooking?.pickupTime || '09:00');
  const [endTime, setEndTime] = useState(() => initialBooking?.endTime || '');
  const excludeScheduleId = initialBooking?.scheduleId || initialBooking?.id;
  const fleet = useFleetAvailability(pickupDate, pickupTimeOnly, pickupEndDate || pickupDate, endTime, excludeScheduleId);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const timePickerRef = useRef<HTMLDivElement>(null);

  // 4. Locations
  const [pickupLocation, setPickupLocation] = useState(() => initialBooking?.pickupLocation || '');
  const [destination, setDestination] = useState(() => initialBooking?.destination || '');

  // 5. Vehicle Model Selection
  const [selectedVehicleModel, setSelectedVehicleModel] = useState(() => (initialBooking?.vehicleModel && initialBooking.vehicleModel !== '-' ? initialBooking.vehicleModel : ''));

  // 6. Additional Info Accordion & Fields
  // Extra Info Accordion Open/Closed State (default collapsed per Reference 1)
  const [isExtraInfoOpen, setIsExtraInfoOpen] = useState(false);
  const [commonLanguage, setCommonLanguage] = useState<RequestedDriverLanguage>(() => initialBooking?.requestedLanguage || 'ko');
  const [commonFlightNumber, setCommonFlightNumber] = useState(() => initialBooking?.flightNumber || '');
  const [commonPassengerCount, setCommonPassengerCount] = useState<number>(() => initialBooking?.passengerCount || 1);
  const [commonPassengerName, setCommonPassengerName] = useState(() => initialBooking?.passengerName || '');
  const [commonPassengerPhone, setCommonPassengerPhone] = useState(() => initialBooking?.passengerPhone || '');
  const [commonMemo, setCommonMemo] = useState(() => initialBooking?.notes || '');

  // Allocations (1 to N vehicles)
  const [allocations, setAllocations] = useState<VehicleAllocationItem[]>(() => {
    if (initialBooking) {
      const cleanModel = initialBooking.vehicleModel && initialBooking.vehicleModel !== '-' ? initialBooking.vehicleModel : '';
      const cleanPlate = initialBooking.vehiclePlate && initialBooking.vehiclePlate !== '미배정' ? initialBooking.vehiclePlate : '';
      return [{
        id: `alloc-init-${initialBooking.id}`,
        vehicleIndex: 1,
        selectedDriver: initialBooking.driverId || '',
        selectedVehicleModel: cleanModel,
        selectedVehiclePlate: cleanPlate,
        requestedLanguage: initialBooking.requestedLanguage || 'ko',
        languageOverrideConfirmed: false,
        serviceMode: initialBooking.serviceMode || 'with_driver',
        hasCustomItinerary: false,
        customPassengerName: initialBooking.passengerName || '',
        customPassengerPhone: initialBooking.passengerPhone || '',
        customFlightNumber: initialBooking.flightNumber || '',
        customPickupTime: initialBooking.pickupTime || '',
        customPickupLocation: initialBooking.pickupLocation || '',
        customDestination: initialBooking.destination || '',
        customNotes: initialBooking.notes || '',
      }];
    }
    return [createInitialAllocation(1, 'ko', false)];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMutation]=useState(()=>createRetryableJsonMutation('cockpit_pending_quick_dispatch'));
  const submitLock=useRef(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReminding, setIsReminding] = useState(false);
  const [remindSuccess, setRemindSuccess] = useState(false);

  // Sync state when initialBooking prop changes
  useEffect(() => {
    if (initialBooking) {
      setCustomerName(initialBooking.customerName || '');
      setSelectedCustomerId(initialBooking.customerId || null);
      setPickupDate(initialBooking.pickupDate || getKstTodayDateStr());
      setPickupEndDate(initialBooking.endDate || initialBooking.pickupDate || getKstTodayDateStr());
      setPickupTimeOnly(initialBooking.pickupTime || '09:00');
      setEndTime(initialBooking.endTime || '');
      setPickupLocation(initialBooking.pickupLocation || '');
      setDestination(initialBooking.destination || '');
      const cleanModel = initialBooking.vehicleModel && initialBooking.vehicleModel !== '-' ? initialBooking.vehicleModel : '';
      setSelectedVehicleModel(cleanModel);
      setCommonPassengerName(initialBooking.passengerName || '');
      setCommonPassengerPhone(initialBooking.passengerPhone || '');
      setCommonFlightNumber(initialBooking.flightNumber || '');
      setCommonMemo(initialBooking.notes || '');
      setCommonPassengerCount(initialBooking.passengerCount || 1);
      const lang = initialBooking.requestedLanguage || 'ko';
      setCommonLanguage(lang);

      let driverId = initialBooking.driverId || '';
      if (!driverId && initialBooking.driverName && initialBooking.driverName !== '-' && fleet.data?.drivers) {
        const match = fleet.data.drivers.find(d => d.name === initialBooking.driverName);
        if (match) driverId = match.id;
      }
      const cleanPlate = initialBooking.vehiclePlate && initialBooking.vehiclePlate !== '미배정' ? initialBooking.vehiclePlate : '';

      setAllocations([
        {
          id: `alloc-init-${initialBooking.id}`,
          vehicleIndex: 1,
          selectedDriver: driverId,
          selectedVehicleModel: cleanModel,
          selectedVehiclePlate: cleanPlate,
          requestedLanguage: lang,
          languageOverrideConfirmed: false,
          serviceMode: initialBooking.serviceMode || 'with_driver',
          hasCustomItinerary: false,
          customPassengerName: initialBooking.passengerName || '',
          customPassengerPhone: initialBooking.passengerPhone || '',
          customFlightNumber: initialBooking.flightNumber || '',
          customPickupTime: initialBooking.pickupTime || '',
          customPickupLocation: initialBooking.pickupLocation || '',
          customDestination: initialBooking.destination || '',
          customNotes: initialBooking.notes || '',
        }
      ]);
    } else {
      setCustomerName('');
      setSelectedCustomerId(null);
      setPickupDate(getKstTodayDateStr());
      setPickupEndDate(getKstTodayDateStr());
      setPickupTimeOnly('09:00');
      setEndTime('');
      setPickupLocation('');
      setDestination('');
      setSelectedVehicleModel('');
      setCommonPassengerName('');
      setCommonPassengerPhone('');
      setCommonFlightNumber('');
      setCommonMemo('');
      setCommonPassengerCount(1);
      setCommonLanguage('ko');
      setAllocations([createInitialAllocation(1, 'ko', false)]);
    }
    setErrorMsg(null);
    setNotificationMsg(null);
  }, [initialBooking]);

  // Sync driverId if fleet.data.drivers loads asynchronously
  useEffect(() => {
    if (initialBooking && initialBooking.driverName && initialBooking.driverName !== '-' && fleet.data?.drivers) {
      const match = fleet.data.drivers.find(d => d.name === initialBooking.driverName);
      if (match) {
        setAllocations(prev => prev.map((a, idx) => idx === 0 && !a.selectedDriver ? { ...a, selectedDriver: match.id } : a));
      }
    }
  }, [fleet.data?.drivers, initialBooking]);

  // Modal ESC key listener
  useEffect(() => {
    if (!isModal || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModal, isOpen, onClose]);

  const handleRemindClick = async () => {
    if (!initialBooking || !onRemindDriver || isReminding) return;
    setIsReminding(true);
    try {
      await onRemindDriver(initialBooking);
      haptics.successPulse();
      setRemindSuccess(true);
      setTimeout(() => setRemindSuccess(false), 3000);
    } catch {
      haptics.errorAlert();
      setErrorMsg('기사 재알림 전송 실패: 네트워크 상태를 확인해 주세요.');
    } finally {
      setIsReminding(false);
    }
  };

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
      if (timePickerRef.current && !timePickerRef.current.contains(target)) {
        setIsTimePickerOpen(false);
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

  // Time picker handler
  const handleSelectTime = (hhmm: string) => {
    haptics.selection();
    setPickupTimeOnly(hhmm);
    setIsTimePickerOpen(false);
  };

  const allocationConflictsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const allocation of allocations) {
      const messages: string[] = [];
      const vehicle = fleet.data?.vehicles.find(v => v.plate === allocation.selectedVehiclePlate);
      const driver = fleet.data?.drivers.find(d => d.id === allocation.selectedDriver);
      if (vehicle && !vehicle.isAvailable) messages.push(vehicle.unavailabilityReason || '선택 기간에 차량 예약이 있습니다.');
      if (allocation.serviceMode !== 'vehicle_only' && driver && !driver.isAvailable) messages.push(driver.unavailabilityReason || '선택 기간에 기사 배차가 있습니다.');
      if (allocation.selectedVehiclePlate && allocations.some(a => a.id !== allocation.id && a.selectedVehiclePlate === allocation.selectedVehiclePlate)) messages.push('동일 차량이 여러 행에 선택되어 있습니다.');
      if (allocation.serviceMode !== 'vehicle_only' && allocation.selectedDriver && allocations.some(a => a.id !== allocation.id && a.serviceMode !== 'vehicle_only' && a.selectedDriver === allocation.selectedDriver)) messages.push('동일 기사가 여러 행에 선택되어 있습니다.');
      map[allocation.id] = messages;
    }
    return map;
  }, [allocations, fleet.data]);
  const totalLiveConflicts = Object.values(allocationConflictsMap).reduce((sum, messages) => sum + messages.length, 0);

  // Submit Handler: 'unassigned' (예약만 등록) or 'published' (바로 배차)
  const submit = async (mode: 'unassigned' | 'published') => {
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

    if (mode === 'published') {
      if (totalLiveConflicts > 0) { setErrorMsg('선택 기간의 기사·차량 충돌을 먼저 해결해 주세요.'); return; }
      const error = validateDispatchInterval({ date: pickupDate, pickupTime: pickupTimeOnly, endDate: pickupEndDate || pickupDate, endTime, dispatchStatus: mode });
      if (error) { setErrorMsg(error); return; }
      if (!fleet.data) { setErrorMsg(fleet.error || '선택한 기간의 가용성 확인이 필요합니다.'); return; }
      for (const allocation of allocations) {
        if (!fleet.data.vehicles.some(v => v.plate === allocation.selectedVehiclePlate && v.isAvailable)
          || (allocation.serviceMode !== 'vehicle_only' && !fleet.data.drivers.some(d => d.id === allocation.selectedDriver && d.isAvailable && (allocation.requestedLanguage !== 'en' || d.isEnglishVerified)))) {
          setErrorMsg('각 차량의 정확한 번호판과 가능한 기사를 직접 선택해 주세요.'); return;
        }
      }
    }

    const isEditMode = Boolean(initialBooking);
    const totalVehicles = allocations.length;
    const isMultiVehicleGroup = totalVehicles > 1;
    const sharedEventId = (isEditMode && initialBooking?.eventId) || `ev-${Date.now()}`;
    const sharedGroupId = isMultiVehicleGroup
      ? (isEditMode && initialBooking?.groupId ? initialBooking.groupId : `grp-${Date.now()}`)
      : undefined;
    const sharedGroupName = `${customerName.trim()} ${isMultiVehicleGroup ? `VIP 단체 의전 (${totalVehicles}대)` : 'VIP 의전'}`;

    const isMultiDay = Boolean(pickupEndDate && pickupEndDate !== pickupDate);
    const dateRangeLabel = formatDateRangeDisplay(pickupDate, pickupEndDate);

    const payloadItems = allocations.map((alloc, idx) => {
      const vehicleNum = idx + 1;

      const matchedDriver = fleet.data?.drivers.find(d => d.id === alloc.selectedDriver);
      const cleanDrv = mode === 'published' && alloc.serviceMode !== 'vehicle_only' ? matchedDriver?.name || '' : '';
      const resolvedPlate = mode === 'unassigned' ? '' : alloc.selectedVehiclePlate;
      const matchedVehicle = VIP_REAL_VEHICLES.find(v => v.plate === resolvedPlate);
      const resolvedModel = matchedVehicle?.model || alloc.selectedVehicleModel || selectedVehicleModel;

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
      const fallbackBookingNo = isMultiVehicleGroup
        ? `#${dateCompact}-${randSuffix}-${vehicleNum}`
        : `#${dateCompact}-${randSuffix}`;

      const bookingNo = (isEditMode && initialBooking?.bookingNo) ? initialBooking.bookingNo : fallbackBookingNo;
      const scheduleId = (isEditMode && (initialBooking?.scheduleId || initialBooking?.id)) ? (initialBooking.scheduleId || initialBooking.id) : undefined;
      const expectedVersion = isEditMode ? initialBooking?.version : undefined;

      return {
        scheduleId,
        expectedVersion,
        bookingNo,
        customerName: customerName.trim(),
        customerId: selectedCustomerId || undefined,
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
        endTime: endTime || undefined,
        vehicleId: matchedVehicle?.uuid,
        origin: pickupLocation.trim(),
        destination: destination.trim(),
        passengerName: resolvedPassengerName,
        passengerPhone: resolvedPassengerPhone,
        passengerCount: Math.max(1, commonPassengerCount || 1),
        flightNumber: resolvedFlightNumber,
        notes: combinedNotes || undefined,
        dispatchStatus: mode,
        allowUnverified: true,
        publishedBy: isEditMode
          ? (mode === 'unassigned' ? '사모님(예약수정)' : '대표님(배차확정)')
          : (mode === 'unassigned' ? '사모님(예약접수)' : '대표님(배차확정)'),
        requestedLanguage: alloc.requestedLanguage,
        languageOverrideConfirmed: alloc.languageOverrideConfirmed,
        serviceMode: alloc.serviceMode,
        appliedPricingSnapshot: pricingSnapshot,
      };
    });

    setIsSubmitting(true);
    try {
      await ensureClientAuth('hq');
      const res = await saveMutation.send('/api/schedules/dispatch',{items:payloadItems},{intent:quickDispatchIntent(payloadItems)});
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
          id: selectedCustomerId || 'unlinked-customer',
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
          isEditMode
            ? '예약 정보가 수정되어 배차 대기함에 반영되었습니다.'
            : isMultiVehicleGroup
            ? `전화 예약 ${totalVehicles}대가 [배차 대기함(미배정)]에 등록되었습니다. 대표님 스마트폰에서 바로 배차 확정할 수 있습니다.`
            : `전화 예약이 [배차 대기함(미배정)]에 등록되었습니다. 대표님 스마트폰에서 차량·기사를 배정할 수 있습니다.`
        );
      } else {
        setNotificationMsg(
          isEditMode
            ? '배차가 확정되어 담당 기사님의 Driver Cockpit에 즉시 반영되었습니다!'
            : isMultiVehicleGroup
            ? `총 ${totalVehicles}대 배차가 확정되어 각 담당 기사님의 Driver Cockpit에 즉시 반영되었습니다!`
            : `배차가 확정되어 담당 기사님의 Driver Cockpit에 즉시 반영되었습니다!`
        );
      }

      if (isModal) {
        setTimeout(() => {
          onClose?.();
        }, 1200);
      }

      // Reset form cleanly if not in edit modal mode
      if (!isEditMode) {
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
        setIsExtraInfoOpen(false);
        setAllocations([createInitialAllocation(1, 'ko', false)]);
      }

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

  const handleSubmit=async(mode:'unassigned'|'published')=>{
    if(submitLock.current)return;submitLock.current=true;
    try{await submit(mode);}finally{submitLock.current=false;}
  };

  if (isModal && !isOpen) return null;

  const content = (
    <div
      className={`@container bg-white select-none flex flex-col justify-between ${
        isModal
          ? 'w-full'
          : 'border border-slate-200/90 rounded-[24px] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)]'
      }`}
    >
      <div>
        {/* 1. Header */}
        <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#EBF3FF] text-[#1E60F3] flex items-center justify-center shrink-0 shadow-2xs">
              <BrandFilledCarIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  {initialBooking ? '예약 · 배차 수정' : '빠른 예약 · 배차'}
                </h2>
                {initialBooking && (
                  <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-blue-50 text-[#1E60F3] border border-blue-200">
                    {initialBooking.bookingNo}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-normal leading-relaxed mt-0.5 truncate">
                {initialBooking
                  ? '일정을 변경하거나 차량과 기사님을 바로 배정해요'
                  : '필수 정보만 입력하고 예약하거나 바로 배차하세요.'}
              </p>
            </div>
          </div>

          {isModal && onClose && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer transition-colors shrink-0"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Connected Booking Action & Status Bar (Only in Edit/Row-Click Mode) */}
        {initialBooking && (
          <div className="mt-3.5 mb-2 rounded-2xl bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-white border border-blue-200/90 p-3.5 sm:p-4 shadow-2xs">
            {/* Top Row: Identity and Real-time Statuses */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-blue-100/90">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-800">
                  {initialBooking.customerName}
                </span>
                {initialBooking.passengerName && initialBooking.passengerName !== initialBooking.customerName && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    (탑승: {initialBooking.passengerName})
                  </span>
                )}
                {initialBooking.driverName && initialBooking.driverName !== '-' && (
                  <span className="text-[11px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    기사: {initialBooking.driverName}
                  </span>
                )}
                {initialBooking.vehiclePlate && initialBooking.vehiclePlate !== '미배정' && (
                  <span className="text-[11px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    차량: {initialBooking.vehiclePlate} ({stripManufacturerName(initialBooking.vehicleModel)})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* 배차 상태 Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                    initialBooking.dispatchStatus === '배차 완료'
                      ? 'bg-[#1E60F3] text-white shadow-xs'
                      : initialBooking.dispatchStatus === '재확인 필요'
                      ? 'bg-indigo-600 text-white'
                      : initialBooking.dispatchStatus === '취소'
                      ? 'bg-slate-200 text-slate-600 line-through'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  <span>{initialBooking.dispatchStatus}</span>
                  {initialBooking.version && initialBooking.version > 1 && (
                    <span className="text-[10px] opacity-80 font-mono">v{initialBooking.version}</span>
                  )}
                </span>

                {/* 기사 확인 현황 Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    initialBooking.driverAck === '확인완료'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : initialBooking.driverAck === '재확인 필요'
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}
                >
                  {initialBooking.driverAck === '확인완료' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>
                    {initialBooking.driverAck === '확인완료'
                      ? '확인 완료'
                      : initialBooking.driverAck === '재확인 필요'
                      ? '재확인 대기'
                      : '확인 대기'}
                  </span>
                  {initialBooking.driverAckTime && (
                    <span className="text-[10px] text-slate-500 font-normal">
                      ({initialBooking.driverAckTime})
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Bottom Row: Connected Actions */}
            <div className="pt-2.5 flex flex-wrap items-center gap-2">
              {/* 1. 기사 미확인 재알림 전송 */}
              {onRemindDriver && (
                <button
                  type="button"
                  onClick={handleRemindClick}
                  disabled={isReminding}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 ${
                    remindSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-white'
                  }`}
                  title="담당 기사 스마트폰 Cockpit으로 즉시 확인 요청 알림을 재전송합니다"
                >
                  <BellRing className={`w-3.5 h-3.5 ${isReminding ? 'animate-bounce' : ''}`} />
                  <span>{remindSuccess ? '다시 알림 전송됨!' : isReminding ? '전송 중...' : '기사님께 다시 알리기'}</span>
                </button>
              )}

              {/* 2. 고객사 자동 안내메시지 */}
              {onOpenCustomerMessage && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    onOpenCustomerMessage(initialBooking);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1E60F3] hover:bg-blue-600 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                  title="고객사 자동 안내문자 (배차확정·기사정보·출발도착 알림) 확인 및 발송"
                >
                  <MessageSquareText className="w-3.5 h-3.5" />
                  <span>
                    고객 안내문자 보내기
                    {initialBooking.pendingCustomerTrigger ? ' (준비완료)' : ''}
                  </span>
                </button>
              )}

              {/* 3. Info 고객 안내자료 */}
              {onOpenDriverVehicleInfo && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    onOpenDriverVehicleInfo(initialBooking);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                  title="고객 안내용 기사 프로필 & 차량 안내장 카드 확인 및 이미지 다운로드"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-[#1E60F3]" />
                  <span>안내 카드 확인</span>
                </button>
              )}

              {/* 4. 전체 상세 / 배정 보기 */}
              {onOpenDetailModal && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    onOpenDetailModal(initialBooking);
                  }}
                  className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="전체 배정표 및 세부사항 확인"
                >
                  <span>전체 배정표 보기</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. Main Form Fields */}
        <div className="space-y-3.5 mt-1">
          {/* 고객사 · 예약자 * */}
          <div className="relative" ref={customerDropdownRef}>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              고객사 · 예약자 <span className="text-red-500 font-bold ml-0.5">*</span>
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

          {/* 출발 날짜 * & 출발 시간 * (2 Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 출발 날짜 */}
            <TossDateRangePicker
              label="출발 날짜"
              required
              startDate={pickupDate}
              endDate={pickupEndDate}
              onChangeRange={(start, end) => {
                setPickupDate(start);
                setPickupEndDate(end);
              }}
              heightClass="h-12"
            />

            {/* 출발 시간 */}
            <div className="relative" ref={timePickerRef}>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                출발 시간 <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setIsTimePickerOpen((prev) => !prev);
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
                    주요 출발 시간 선택
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

          <div className="space-y-3 rounded-xl border border-slate-200 p-3 bg-slate-50/50">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <div>
                <span className="text-xs font-black text-slate-900">차량 및 기사 배차</span>
                <span className="ml-1.5 text-[11px] text-slate-400 font-medium">실제 배차 확정 시 선택</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">차량 수:</span>
                <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={handleDecrementVehicle}
                    disabled={allocations.length <= 1}
                    className="w-7 h-7 rounded bg-blue-50/80 hover:bg-blue-100 text-[#1E60F3] font-black flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    aria-label="차량 감소"
                  >
                    <Minus className="w-3.5 h-3.5 stroke-[3]" />
                  </button>

                  <span className="w-9 text-xs font-black text-slate-900 text-center">
                    {allocations.length}대
                  </span>

                  <button
                    type="button"
                    onClick={handleIncrementVehicle}
                    className="w-7 h-7 rounded bg-blue-50/80 hover:bg-blue-100 text-[#1E60F3] font-black flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                    aria-label="차량 증가"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                </div>
              </div>
            </div>

            <label className="block text-xs font-bold text-slate-700">
              도착 예상 시간 (필수)
              <input
                type="time"
                aria-label="도착 예상 시간"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-3 bg-white"
              />
            </label>
            {endTime && (
              <p className="text-xs text-slate-500">
                {fleet.error || (fleet.loading ? '선택 기간의 가용성을 확인하고 있습니다.' : '복귀 여유 시간 60분이 포함되어 있어요')}
              </p>
            )}

            {allocations.map((allocation, index) => (
              <div key={allocation.id} className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1 border-t border-slate-200/50">
                <label className="text-xs font-bold text-slate-700">
                  {allocations.length > 1 ? `${index + 1}번 배정 차량` : '배정 차량'}
                  <select
                    aria-label={allocations.length > 1 ? `${index + 1}번 배정 차량 번호판` : '배정 차량 번호판'}
                    value={allocation.selectedVehiclePlate}
                    onChange={(e) => {
                      const plate = e.target.value;
                      const vMatch = fleet.data?.vehicles.find((v) => v.plate === plate) || VIP_REAL_VEHICLES.find((v) => v.plate === plate);
                      setAllocations((prev) =>
                        prev.map((a) =>
                          a.id === allocation.id
                            ? {
                                ...a,
                                selectedVehiclePlate: plate,
                                selectedVehicleModel: vMatch?.model || a.selectedVehicleModel,
                              }
                            : a
                        )
                      );
                      if (vMatch?.model) {
                        setSelectedVehicleModel(vMatch.model);
                      }
                    }}
                    className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-2 bg-white"
                    disabled={!fleet.data}
                  >
                    <option value="">실차 선택</option>
                    {fleet.data?.vehicles.map((v) => (
                      <option key={v.uuid} value={v.plate} disabled={!v.isAvailable}>
                        {v.model} · {v.plate} · {VEHICLE_STATUS_LABELS[v.currentStatus]}
                        {v.isAvailable ? '' : ' (예약 불가)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-700">
                  {allocations.length > 1 ? `${index + 1}번 담당 기사님` : '담당 기사님'}
                  <select
                    aria-label={allocations.length > 1 ? `${index + 1}번 담당 기사님` : '담당 기사님'}
                    value={allocation.selectedDriver}
                    onChange={(e) =>
                      setAllocations((prev) =>
                        prev.map((a) =>
                          a.id === allocation.id ? { ...a, selectedDriver: e.target.value } : a
                        )
                      )
                    }
                    className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-2 bg-white"
                    disabled={!fleet.data || allocation.serviceMode === 'vehicle_only'}
                  >
                    <option value="">기사 선택</option>
                    {fleet.data?.drivers.map((d) => (
                      <option
                        key={d.id}
                        value={d.id}
                        disabled={!d.isAvailable || (allocation.requestedLanguage === 'en' && !d.isEnglishVerified)}
                      >
                        {d.name} · {d.phone}
                        {d.isAvailable ? '' : ' (배차 불가)'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>

          {/* 출발지 * & 도착지 * (2 Columns with TMAP Search) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 출발지 */}
            <HqPlaceSearchInput
              label="출발지"
              required
              value={pickupLocation}
              onChange={(val) => {
                setPickupLocation(val);
                setErrorMsg(null);
              }}
              placeholder="위치 검색 또는 입력"
              icon="mapPin"
            />

            {/* 도착지 */}
            <HqPlaceSearchInput
              label="도착지"
              required
              value={destination}
              onChange={(val) => {
                setDestination(val);
                setErrorMsg(null);
              }}
              placeholder="목적지 검색 또는 입력"
              icon="flag"
            />
          </div>

          {/* 3. 추가 정보 (선택사항) Accordion (Reference 1 & 2 - Compact Harmony) */}
          <div className="pt-0.5">
            {!isExtraInfoOpen ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setIsExtraInfoOpen(true);
                }}
                className="bg-[#F5F8FF] border border-blue-100 hover:border-blue-200 rounded-xl p-2.5 sm:p-3 flex items-center justify-between cursor-pointer hover:bg-blue-50/70 transition-all shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EAF2FF] text-[#1E60F3] flex items-center justify-center shrink-0">
                    <BrandFilledDocumentIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                      추가 전달사항 (선택)
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      탑승객 정보, 항공편명, 특별 요청사항을 적어주세요
                    </p>
                  </div>
                </div>

                <div className="w-7 h-7 rounded-full flex items-center justify-center text-slate-600">
                  <ChevronDown className="w-4 h-4 stroke-[2.2]" />
                </div>
              </div>
            ) : (
              <div className="bg-[#FAFBFD] border border-blue-100/90 rounded-2xl p-2.5 sm:p-3 shadow-2xs space-y-2 animate-in slide-in-from-top-2 duration-200">
                {/* Accordion Header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    haptics.lightTap();
                    setIsExtraInfoOpen(false);
                  }}
                  className="flex items-center justify-between cursor-pointer select-none pb-0.5 px-0.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#EAF2FF] text-[#1E60F3] flex items-center justify-center shrink-0">
                      <BrandFilledDocumentIcon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                        추가 전달사항 (선택)
                      </h3>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 font-normal">
                        탑승객 정보, 항공편명, 특별 요청사항을 적어주세요
                      </p>
                    </div>
                  </div>

                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors">
                    <ChevronUp className="w-4 h-4 stroke-[2.2]" />
                  </div>
                </div>

                {/* Row 1: Sub-Card 1 (기사 언어 조건) & Sub-Card 2 (항공편 정보) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Sub-Card 1: 기사 언어 조건 */}
                  <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-xl p-2 sm:p-2.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <BrandFilledGlobeIcon className="w-3.5 h-3.5 text-[#1E60F3]" />
                      <span className="text-xs font-bold text-slate-800">기사 언어 조건</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCommonLanguageChange("ko")}
                        className={`h-9 sm:h-10 rounded-lg flex items-center justify-center gap-1 px-1.5 transition-all cursor-pointer ${
                          commonLanguage === "ko"
                            ? "bg-[#EAF2FF] border-2 border-[#1E60F3] text-[#1E60F3] shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-white shadow-2xs border border-slate-200/60 text-xs">
                          🇰🇷
                        </span>
                        <span className="text-xs font-bold whitespace-nowrap">무관</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCommonLanguageChange("en")}
                        className={`h-9 sm:h-10 rounded-lg flex items-center justify-center gap-1 px-1.5 transition-all cursor-pointer ${
                          commonLanguage === "en"
                            ? "bg-[#EAF2FF] border-2 border-[#1E60F3] text-[#1E60F3] shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-white shadow-2xs border border-slate-200/60 text-xs">
                          🇺🇸
                        </span>
                        <span className="text-xs font-bold whitespace-nowrap">영어 가능</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-Card 2: 항공편 정보 */}
                  <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-xl p-2 sm:p-2.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-4 h-4 rounded bg-[#E2EDFE] flex items-center justify-center text-[#1E60F3] shrink-0">
                        <BrandFilledPlaneIcon className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">항공편 정보</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap shrink-0">항공편명</span>
                      <input
                        type="text"
                        value={commonFlightNumber}
                        onChange={(e) => setCommonFlightNumber(e.target.value)}
                        placeholder="예: KE082"
                        className="w-full h-9 sm:h-10 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 transition-all min-w-0"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Sub-Card 3 (탑승객 정보) */}
                <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-xl p-2 sm:p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <BrandFilledUsersIcon className="w-3.5 h-3.5 text-[#1E60F3]" />
                    <span className="text-xs font-bold text-slate-800">탑승객 정보</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
                    {/* 탑승객 수 */}
                    <div className="h-9 sm:h-10 bg-white border border-slate-200 rounded-lg px-2 flex items-center justify-between shadow-2xs">
                      <span className="text-[11px] sm:text-xs font-bold text-slate-800 whitespace-nowrap">탑승객 수</span>
                      <div className="flex items-center gap-1 bg-[#F1F6FD] rounded px-1 py-0.5">
                        <button
                          type="button"
                          onClick={() => setCommonPassengerCount((prev) => Math.max(0, prev - 1))}
                          className="w-4 h-4 sm:w-5 sm:h-5 rounded bg-white hover:bg-slate-100 text-slate-600 font-bold flex items-center justify-center cursor-pointer shadow-2xs transition-colors"
                        >
                          <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                        <span className="text-xs font-black text-slate-900 px-1 min-w-3 text-center">
                          {commonPassengerCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCommonPassengerCount((prev) => prev + 1)}
                          className="w-4 h-4 sm:w-5 sm:h-5 rounded bg-[#1E60F3] hover:bg-blue-600 text-white font-bold flex items-center justify-center cursor-pointer shadow-2xs transition-colors"
                        >
                          <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>

                    {/* 탑승객명 */}
                    <input
                      type="text"
                      value={commonPassengerName}
                      onChange={(e) => setCommonPassengerName(e.target.value)}
                      placeholder="탑승객명 (홍길동)"
                      className="w-full h-9 sm:h-10 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 transition-all min-w-0"
                    />

                    {/* 탑승객 번호 */}
                    <input
                      type="tel"
                      value={commonPassengerPhone}
                      onChange={(e) => setCommonPassengerPhone(e.target.value)}
                      placeholder="연락처 (010-1234-5678)"
                      className="w-full h-9 sm:h-10 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 transition-all min-w-0"
                    />
                  </div>
                </div>

                {/* Row 3: Sub-Card 4 (추가 요청사항) */}
                <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-xl p-2 sm:p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <BrandFilledNoteIcon className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                        추가 요청사항
                      </span>
                    </div>
                    <input
                      type="text"
                      value={commonMemo}
                      onChange={(e) => setCommonMemo(e.target.value)}
                      placeholder="요청사항을 입력하세요 (예: 미팅 후 이동, 주차 위치 등)"
                      className="w-full h-9 sm:h-10 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 transition-all flex-1 min-w-0"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Conflict Warning Banner if any */}
        {totalLiveConflicts > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white space-y-1 shadow-sm">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>기존 배차와 일정 중복이 감지되었습니다 ({totalLiveConflicts}건)</span>
            </div>
            <p className="pt-1 text-[11px] text-amber-300 font-semibold">
              기존 일정과 겹쳐 바로 배차가 비활성화되었습니다. 일정을 변경하거나 예약만 등록을 이용해 주세요.
            </p>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-700 flex items-start gap-2 text-xs font-bold text-white shadow-sm">
            <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
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

      {saveMutation.hasPending && <button type="button" className="rounded-xl border border-blue-200 p-3 text-sm text-blue-700" disabled={isSubmitting} onClick={async()=>{setIsSubmitting(true);try{const response=await saveMutation.retry();const data=await response.json();if(!response.ok)throw new Error(data.error || '저장 결과 확인 실패');window.location.reload();}catch(error){setErrorMsg(error instanceof Error?error.message:'확인 실패');}finally{setIsSubmitting(false);}}}>이전 저장 결과 확인</button>}
      {/* 4. Action Buttons */}
      <div className="pt-4 mt-2">
        <div className="grid grid-cols-2 gap-3">
          {/* 예약만 등록 / 예약 수정 저장 */}
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
            <span>{initialBooking ? '수정 내용만 저장' : '예약만 등록'}</span>
          </button>

          {/* 바로 배차 / 배차 확정 */}
          <button
            type="button"
            disabled={isSubmitting || !fleet.data || Boolean(fleet.error) || totalLiveConflicts > 0}
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
            <span>{initialBooking ? '배차 확정하고 기사님께 보내기' : '바로 배차'}</span>
          </button>
        </div>

        {/* Helper Note */}
        <div className="flex items-center justify-center gap-1.5 pt-3 text-xs text-slate-400 font-medium text-center">
          <Info className="w-4 h-4 text-[#1E60F3] shrink-0" />
          <span>
            {initialBooking
              ? '배차 확정 시 담당 기사의 Cockpit에 즉시 반영되며 기사 확인 상태가 관리됩니다.'
              : '예약만 등록하면 미배정 대기함에 저장됩니다.'}
          </span>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initialBooking ? '예약 · 배차 수정' : '빠른 예약 · 배차'}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            haptics.lightTap();
            onClose?.();
          }
        }}
      >
        <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-5 sm:p-7 flex flex-col justify-between my-auto animate-in zoom-in-95 duration-150">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
