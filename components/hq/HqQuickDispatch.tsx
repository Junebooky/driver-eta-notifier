'use client';

import React, { useState, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import Image from 'next/image';
import {
  Car,
  Send,
  Info,
  Check,
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
import {
  VIP_REAL_VEHICLES,
  stripManufacturerName,
  mapVehicleToUiCategory,
  getVehicleImage,
} from '@/utils/vehicleData';
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
import { formatPhoneNumber } from '@/utils/formatters';
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
import { useHqDrivers } from '@/utils/useHqDrivers';

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

export const DEFAULT_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});
export const POPULAR_TIMES = DEFAULT_TIME_OPTIONS;

/**
 * Parses user flexible time input into 24h "HH:mm" format.
 * Supports:
 * - "07:30", "14:20", "8:45"
 * - "0730", "730", "1420", "845"
 * - "오전 7:30", "오후 2:30", "오후 230", "오후 2시 30분"
 * - "7", "07", "14", "20" -> "07:00", "14:00", "20:00"
 */
export function parseFlexibleTimeInput(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isPm = /오후|pm|p\.m\./i.test(trimmed);
  const isAm = /오전|am|a\.m\./i.test(trimmed);

  const clean = trimmed.replace(/[^\d:]/g, '');
  if (!clean) return null;

  if (clean.includes(':')) {
    const parts = clean.split(':');
    let h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || '0', 10);
    if (isNaN(h) || isNaN(m) || m < 0 || m > 59) return null;
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    if (h < 0 || h > 23) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  if (clean.length === 3 || clean.length === 4) {
    const h = clean.length === 3 ? parseInt(clean.slice(0, 1), 10) : parseInt(clean.slice(0, 2), 10);
    const m = clean.length === 3 ? parseInt(clean.slice(1, 3), 10) : parseInt(clean.slice(2, 4), 10);
    if (isNaN(h) || isNaN(m) || m < 0 || m > 59) return null;
    let finalH = h;
    if (isPm && finalH < 12) finalH += 12;
    if (isAm && finalH === 12) finalH = 0;
    if (finalH < 0 || finalH > 23) return null;
    return `${String(finalH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  if (clean.length === 1 || clean.length === 2) {
    let h = parseInt(clean, 10);
    if (isNaN(h)) return null;
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    if (h < 0 || h > 23) return null;
    return `${String(h).padStart(2, '0')}:00`;
  }

  return null;
}

/**
 * Returns driver avatar profile image URL with graceful fallbacks.
 * If driver does not have a registered profile photo, falls back to default suited chauffeur profile.
 */
export function getDriverProfileImage(driver?: { id?: string; name?: string; avatarUrl?: string } | null): string {
  if (driver?.avatarUrl) return driver.avatarUrl;
  const name = driver?.name || '';
  if (name.includes('김')) return '/images/driver_kim.png';
  if (name.includes('이')) return '/images/driver_lee.png';
  if (name.includes('박')) return '/images/driver_park.png';
  if (name.includes('최')) return '/images/driver_choi.png';
  if (name.includes('정')) return '/images/driver_jung.png';
  if (name.includes('홍')) return '/images/driver_kim.png';
  if (name.includes('윤')) return '/images/driver_jung.png';
  return '/images/driver_kim.png';
}

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
 * - 당일일 시: 2026. 11. 04
 * - 여러 날 이용 시: 2026. 11. 04 ~ 11. 06
 */
export function formatDateRangeDisplay(startDateStr: string, endDateStr?: string | null): string {
  if (!startDateStr) return '날짜 선택';
  const startNormalized = normalizeDateToIso(startDateStr) || startDateStr;
  const endNormalized = endDateStr ? (normalizeDateToIso(endDateStr) || endDateStr) : startNormalized;

  const [sY, sM, sD] = startNormalized.split('-');
  if (!sY || !sM || !sD) return startDateStr;

  if (!endNormalized || startNormalized === endNormalized) {
    return `${sY}. ${sM}. ${sD}`;
  }

  const [eY, eM, eD] = endNormalized.split('-');
  if (!eY || !eM || !eD) return `${sY}. ${sM}. ${sD}`;

  if (sY === eY) {
    return `${sY}. ${sM}. ${sD} ~ ${eM}. ${eD}`;
  } else {
    return `${sY}. ${sM}. ${sD} ~ ${eY}. ${eM}. ${eD}`;
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
  const [timeInputText, setTimeInputText] = useState(() => formatTimeKoreanAmPm(initialBooking?.pickupTime || '09:00'));
  const [isInputFocused, setIsInputFocused] = useState(false);
  const selectedTimeItemRef = useRef<HTMLButtonElement>(null);
  const timeDropdownListRef = useRef<HTMLDivElement>(null);
  const [endTime, setEndTime] = useState(() => initialBooking?.endTime || '');
  const excludeScheduleId = initialBooking?.scheduleId || initialBooking?.id;
  const fleet = useFleetAvailability(pickupDate, pickupTimeOnly, pickupEndDate || pickupDate, endTime, excludeScheduleId);
  const { drivers: hqDrivers } = useHqDrivers();
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const timePickerRef = useRef<HTMLDivElement>(null);

  const timeDropdownOptions = useMemo(() => {
    if (pickupTimeOnly && !DEFAULT_TIME_OPTIONS.includes(pickupTimeOnly)) {
      return [...DEFAULT_TIME_OPTIONS, pickupTimeOnly].sort();
    }
    return DEFAULT_TIME_OPTIONS;
  }, [pickupTimeOnly]);

  useEffect(() => {
    if (!isInputFocused) {
      setTimeInputText(formatTimeKoreanAmPm(pickupTimeOnly));
    }
  }, [pickupTimeOnly, isInputFocused]);

  useEffect(() => {
    if (isTimePickerOpen) {
      const timer = setTimeout(() => {
        if (selectedTimeItemRef.current && timeDropdownListRef.current) {
          selectedTimeItemRef.current.scrollIntoView({ block: 'nearest' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isTimePickerOpen]);

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

  // 7. Card Dropdown State for Vehicle & Driver
  const [activeCardDropdown, setActiveCardDropdown] = useState<{
    allocId: string;
    type: 'vehicle' | 'driver';
  } | null>(null);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [vehicleCategoryFilter, setVehicleCategoryFilter] = useState<'all' | 'sedan' | 'suv' | 'van' | 'sprinter'>('all');
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const activeCardDropdownRef = useRef<HTMLDivElement>(null);

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
      setTimeInputText(formatTimeKoreanAmPm(initialBooking.pickupTime || '09:00'));
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

  // Sync driverId if hqDrivers or fleet.data.drivers loads asynchronously
  useEffect(() => {
    if (initialBooking && initialBooking.driverName && initialBooking.driverName !== '-') {
      const match = (hqDrivers || []).find(d => d.name === initialBooking.driverName || d.id === initialBooking.driverId) || (fleet.data?.drivers || []).find(d => d.name === initialBooking.driverName);
      if (match) {
        setAllocations(prev => prev.map((a, idx) => idx === 0 && !a.selectedDriver ? { ...a, selectedDriver: match.id } : a));
      }
    }
  }, [hqDrivers, fleet.data?.drivers, initialBooking]);

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
      if (activeCardDropdownRef.current && !activeCardDropdownRef.current.contains(target)) {
        const isTrigger = (target as HTMLElement).closest?.('[data-card-dropdown-trigger="true"]');
        if (!isTrigger) {
          setActiveCardDropdown(null);
        }
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const allVehicles = useMemo(() => {
    return VIP_REAL_VEHICLES.map((v) => {
      const live = fleet.data?.vehicles.find((fv) => fv.plate === v.plate || fv.uuid === v.uuid);
      const isAvailable = live ? live.isAvailable : true;
      const currentStatus = live ? live.currentStatus : 'available';
      const statusLabel = live ? VEHICLE_STATUS_LABELS[live.currentStatus] : '대기 중';
      const uiCategory = mapVehicleToUiCategory(v);
      const image = getVehicleImage(v);
      return {
        ...v,
        isAvailable,
        currentStatus,
        statusLabel,
        uiCategory,
        image,
      };
    });
  }, [fleet.data?.vehicles]);

  const filteredVehiclesForDropdown = useMemo(() => {
    return allVehicles.filter((v) => {
      if (vehicleCategoryFilter !== 'all' && v.uiCategory !== vehicleCategoryFilter) {
        return false;
      }
      if (vehicleSearchQuery.trim()) {
        const q = vehicleSearchQuery.toLowerCase().trim();
        const matchesPlate = v.plate.toLowerCase().includes(q);
        const matchesModel = v.model.toLowerCase().includes(q);
        const matchesBrand = v.brand.toLowerCase().includes(q);
        if (!matchesPlate && !matchesModel && !matchesBrand) return false;
      }
      return true;
    });
  }, [allVehicles, vehicleCategoryFilter, vehicleSearchQuery]);

  const allDrivers = useMemo(() => {
    // 1. Availability map from availability engine for conflict & qualification details
    const availabilityMap = new Map<string, any>();
    if (fleet.data?.drivers) {
      for (const d of fleet.data.drivers) {
        if (d.id) availabilityMap.set(d.id, d);
        if (d.name) availabilityMap.set(d.name, d);
      }
    }

    // 2. Base list is real DB drivers from useHqDrivers()
    const baseList: Array<any> =
      hqDrivers && hqDrivers.length > 0 ? hqDrivers : liveDriverProfiles;

    const mapped = baseList.map((d: any) => {
      const avail = availabilityMap.get(d.id) || availabilityMap.get(d.name);
      const isAvailable = avail !== undefined ? avail.isAvailable : true;
      const unavailabilityReason = avail?.unavailabilityReason;
      const isEnglishVerified = Boolean(
        d.englishAvailable ?? (d as any).isEnglishVerified ?? avail?.isEnglishVerified
      );
      const avatarUrl =
        d.avatarUrl || d.profileImageUrl || getDriverProfileImage(d);
      const phone = d.phone || '010-0000-0000';
      const affiliationType =
        d.affiliationType ||
        (['QA 테스트 기사', '지용주'].includes(d.name) ? 'employed' : 'freelance');

      return {
        id: d.id,
        name: d.name || d.driver_name,
        phone,
        affiliationType,
        isAvailable,
        isEnglishVerified,
        unavailabilityReason,
        avatarUrl,
        vehicleModel: d.vehicleModel || d.vehicle_model || '',
        plate: d.vehicleNo || d.carNumber || d.car_number || '',
      };
    });

    // 3. Sort: 소속(Employed) first, then available first, then alphabetically by name
    return mapped.sort((a, b) => {
      if (a.affiliationType !== b.affiliationType) {
        return a.affiliationType === 'employed' ? -1 : 1;
      }
      if (a.isAvailable !== b.isAvailable) {
        return a.isAvailable ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [hqDrivers, fleet.data?.drivers, liveDriverProfiles]);

  const filteredDriversForDropdown = useMemo(() => {
    return allDrivers.filter((d) => {
      if (driverSearchQuery.trim()) {
        const q = driverSearchQuery.toLowerCase().trim();
        const matchesName = d.name.toLowerCase().includes(q);
        const matchesPhone = (d.phone || '').replace(/-/g, '').includes(q.replace(/-/g, ''));
        if (!matchesName && !matchesPhone) return false;
      }
      return true;
    });
  }, [allDrivers, driverSearchQuery]);

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

  const handleSelectVehicle = (allocId: string, vehicle: (typeof allVehicles)[0] | null) => {
    haptics.selection();
    setAllocations((prev) =>
      prev.map((a) =>
        a.id === allocId
          ? {
              ...a,
              selectedVehiclePlate: vehicle ? vehicle.plate : '',
              selectedVehicleModel: vehicle ? vehicle.model : '',
            }
          : a
      )
    );
    if (vehicle?.model) {
      setSelectedVehicleModel(vehicle.model);
    }
    setActiveCardDropdown(null);
  };

  const handleSelectDriver = (allocId: string, driver: (typeof allDrivers)[0] | null) => {
    haptics.selection();
    setAllocations((prev) =>
      prev.map((a) =>
        a.id === allocId
          ? {
              ...a,
              selectedDriver: driver ? driver.id : '',
            }
          : a
      )
    );
    setActiveCardDropdown(null);
  };

  // Time picker handlers
  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTimeInputText(val);
    if (!isTimePickerOpen) setIsTimePickerOpen(true);

    const parsed = parseFlexibleTimeInput(val);
    if (parsed) {
      setPickupTimeOnly(parsed);
    }
  };

  const handleTimeInputBlur = () => {
    setIsInputFocused(false);
    const parsed = parseFlexibleTimeInput(timeInputText);
    if (parsed) {
      setPickupTimeOnly(parsed);
      setTimeInputText(formatTimeKoreanAmPm(parsed));
    } else {
      setTimeInputText(formatTimeKoreanAmPm(pickupTimeOnly));
    }
  };

  const handleTimeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const parsed = parseFlexibleTimeInput(timeInputText);
      if (parsed) {
        setPickupTimeOnly(parsed);
        setTimeInputText(formatTimeKoreanAmPm(parsed));
      }
      setIsTimePickerOpen(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setIsTimePickerOpen(false);
      setTimeInputText(formatTimeKoreanAmPm(pickupTimeOnly));
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSelectTime = (hhmm: string) => {
    haptics.selection();
    setPickupTimeOnly(hhmm);
    setTimeInputText(formatTimeKoreanAmPm(hhmm));
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

      const matchedDriver = allDrivers.find(d => d.id === alloc.selectedDriver || d.name === alloc.selectedDriver);
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
              {!initialBooking && (
                <p className="text-xs text-slate-400 font-normal leading-relaxed mt-0.5 truncate">
                  필수 정보만 입력하고 예약하거나 바로 배차하세요.
                </p>
              )}
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
                    · 탑승 {initialBooking.passengerName}
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

                {/* 기사 확인 현황 Badge (Tone down to calm cool gray) */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    initialBooking.driverAck === '확인완료'
                      ? 'bg-slate-100 text-slate-600 border border-slate-200/80'
                      : initialBooking.driverAck === '재확인 필요'
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}
                >
                  {initialBooking.driverAck === '확인완료' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
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
              {/* 1. 기사 미확인 재알림 전송 (Calm Slate Tone) */}
              {onRemindDriver && (
                <button
                  type="button"
                  onClick={handleRemindClick}
                  disabled={isReminding}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 ${
                    remindSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/60'
                  }`}
                  title="담당 기사 스마트폰 Cockpit으로 즉시 확인 요청 알림을 재전송합니다"
                >
                  <BellRing className={`w-3.5 h-3.5 ${isReminding ? 'animate-bounce text-[#1E60F3]' : ''}`} />
                  <span>{remindSuccess ? '다시 알림 전송됨!' : isReminding ? '전송 중...' : '기사 재알림'}</span>
                </button>
              )}

              {/* 2. 고객사 자동 안내문자 */}
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
                    안내 문자 발송
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
                  <span>배차 카드 보기</span>
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
                  className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  title="전체 배정표 및 세부사항 확인"
                >
                  <span>전체 배정표 ↗</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. Main Form Fields */}
        <div className="space-y-3.5 mt-1">
          {/* 고객사 * */}
          <div className="relative" ref={customerDropdownRef}>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              고객사 <span className="text-red-500 font-bold ml-0.5">*</span>
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
                className={`w-full h-12 bg-white border rounded-xl px-3.5 flex items-center justify-between transition-all shadow-2xs ${
                  isTimePickerOpen
                    ? 'border-[#1E60F3] ring-1 ring-[#1E60F3]'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 h-full">
                  <Clock className="w-5 h-5 text-slate-700 shrink-0" />
                  <input
                    type="text"
                    value={timeInputText}
                    onChange={handleTimeInputChange}
                    onFocus={() => {
                      setIsInputFocused(true);
                      setIsTimePickerOpen(true);
                    }}
                    onBlur={handleTimeInputBlur}
                    onKeyDown={handleTimeInputKeyDown}
                    placeholder="예: 오전 07:30 또는 0730"
                    aria-label="출발 시간 입력 및 선택"
                    className="w-full h-full bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    haptics.lightTap();
                    setIsTimePickerOpen((prev) => !prev);
                  }}
                  className="p-1 -mr-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                  aria-label="시간 목록 보기"
                >
                  <ChevronDown
                    className={`w-5 h-5 transition-transform duration-200 ${
                      isTimePickerOpen ? 'rotate-180 text-[#1E60F3]' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Time Picker Dropdown */}
              {isTimePickerOpen && (
                <div
                  ref={timeDropdownListRef}
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-2 max-h-56 overflow-y-auto animate-in fade-in duration-150 space-y-0.5"
                >
                  {timeDropdownOptions.map((time) => {
                    const isSelected = pickupTimeOnly === time;
                    return (
                      <button
                        key={time}
                        ref={isSelected ? selectedTimeItemRef : undefined}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectTime(time);
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl text-left text-sm flex items-center transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 text-[#1E60F3] font-bold'
                            : 'hover:bg-slate-50 text-slate-800 font-medium'
                        }`}
                      >
                        <span className="w-5 flex items-center justify-start shrink-0">
                          {isSelected && <Check className="w-4 h-4 text-[#1E60F3] stroke-[2.5]" />}
                        </span>
                        <span className={isSelected ? 'text-[#1E60F3] font-bold' : 'text-slate-800'}>
                          {formatTimeKoreanAmPm(time)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-3 bg-slate-50/50">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <div>
                <span className="text-xs font-black text-slate-900">차량 및 기사 배차</span>
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

            <label className="block text-xs font-bold text-slate-800">
              도착 예정 시간 <span className="text-red-500 font-bold ml-0.5">*</span>
              <input
                type="time"
                aria-label="도착 예정 시간"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-3 bg-white text-xs font-semibold"
              />
            </label>
            {endTime && (
              <p className="text-[11px] text-slate-400 font-medium mt-1">
                {fleet.error || (fleet.loading ? '선택 기간의 가용성을 확인하고 있습니다.' : '복귀 여유 60분 포함')}
              </p>
            )}

            {allocations.map((allocation, index) => {
              const isOpenVehicle =
                activeCardDropdown?.allocId === allocation.id && activeCardDropdown?.type === 'vehicle';
              const isOpenDriver =
                activeCardDropdown?.allocId === allocation.id && activeCardDropdown?.type === 'driver';

              const selectedVehicle =
                allVehicles.find((v) => v.plate === allocation.selectedVehiclePlate) ||
                (allocation.selectedVehiclePlate
                  ? {
                      plate: allocation.selectedVehiclePlate,
                      model: allocation.selectedVehicleModel || allocation.selectedVehiclePlate,
                      image: getVehicleImage({
                        plate: allocation.selectedVehiclePlate,
                        model: allocation.selectedVehicleModel,
                      }),
                      statusLabel: '대기 중',
                      currentStatus: 'available',
                    }
                  : null);

              const selectedDriver =
                allDrivers.find(
                  (d) => d.id === allocation.selectedDriver || d.name === allocation.selectedDriver
                ) ||
                (allocation.selectedDriver
                  ? {
                      id: allocation.selectedDriver,
                      name: allocation.selectedDriver,
                      phone: '010-0000-0000',
                      isAvailable: true,
                      avatarUrl: getDriverProfileImage({ name: allocation.selectedDriver }),
                    }
                  : null);

              return (
                <div
                  key={allocation.id}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-slate-200/50"
                >
                  {/* 1. 배정 차량 Selector */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      {allocations.length > 1 ? `${index + 1}번 배정 차량` : '배정 차량'}{' '}
                      <span className="text-red-500 font-bold">*</span>
                    </label>

                    <button
                      type="button"
                      data-card-dropdown-trigger="true"
                      onClick={() => {
                        haptics.lightTap();
                        if (isOpenVehicle) {
                          setActiveCardDropdown(null);
                        } else {
                          setActiveCardDropdown({ allocId: allocation.id, type: 'vehicle' });
                          setVehicleSearchQuery('');
                          setVehicleCategoryFilter('all');
                        }
                      }}
                      className={`w-full h-12 bg-white rounded-xl px-3 flex items-center justify-between transition-all cursor-pointer shadow-2xs border ${
                        isOpenVehicle
                          ? 'border-[#1E60F3] ring-1 ring-[#1E60F3]'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      aria-expanded={isOpenVehicle}
                      aria-label={allocations.length > 1 ? `${index + 1}번 배정 차량 선택` : '배정 차량 선택'}
                    >
                      {selectedVehicle ? (
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-12 h-7 relative shrink-0 flex items-center justify-center">
                            <img
                              src={selectedVehicle.image}
                              alt={selectedVehicle.model}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/images/thumb_g90.jpg';
                              }}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                            {selectedVehicle.model} · {selectedVehicle.plate}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400">
                          <Car className="w-4 h-4 shrink-0 text-slate-400" />
                          <span className="text-xs sm:text-sm font-medium">배정 차량 선택</span>
                        </div>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0 ml-2 ${
                          isOpenVehicle ? 'rotate-180 text-[#1E60F3]' : ''
                        }`}
                      />
                    </button>

                    {/* Vehicle Dropdown Popover */}
                    {isOpenVehicle && (
                      <div
                        ref={activeCardDropdownRef}
                        className="absolute left-0 top-full mt-1.5 w-full sm:min-w-[420px] max-w-[520px] z-50 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-3 animate-in fade-in duration-150"
                      >
                        {/* Top Bar: Search Input & Category Pills */}
                        <div className="flex flex-col gap-2 pb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 relative">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={vehicleSearchQuery}
                                onChange={(e) => setVehicleSearchQuery(e.target.value)}
                                placeholder="차량명 또는 차량번호 검색"
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:bg-white"
                              />
                              {vehicleSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setVehicleSearchQuery('')}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {(
                                [
                                  { key: 'all', label: '전체' },
                                  { key: 'sedan', label: '세단' },
                                  { key: 'suv', label: 'SUV' },
                                  { key: 'van', label: '밴' },
                                  { key: 'sprinter', label: '스프린터' },
                                ] as const
                              ).map((cat) => {
                                const active = vehicleCategoryFilter === cat.key;
                                return (
                                  <button
                                    key={cat.key}
                                    type="button"
                                    onClick={() => setVehicleCategoryFilter(cat.key)}
                                    className={`px-2 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                                      active
                                        ? 'bg-[#1E60F3] text-white shadow-2xs'
                                        : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                                  >
                                    {cat.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Unassign Option */}
                        {allocation.selectedVehiclePlate && (
                          <button
                            type="button"
                            onClick={() => handleSelectVehicle(allocation.id, null)}
                            className="w-full mt-1.5 mb-1 px-2.5 py-1.5 text-left text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span>배정 해제 (미배정)</span>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Vehicle List */}
                        <div className="max-h-60 overflow-y-auto space-y-1 mt-1 pr-1">
                          {filteredVehiclesForDropdown.length === 0 ? (
                            <div className="py-6 text-center text-xs text-slate-400 font-medium">
                              일치하는 차량이 없습니다
                            </div>
                          ) : (
                            filteredVehiclesForDropdown.map((v) => {
                              const isSelected = allocation.selectedVehiclePlate === v.plate;
                              return (
                                <button
                                  key={v.uuid || v.plate}
                                  type="button"
                                  onClick={() => handleSelectVehicle(allocation.id, v)}
                                  className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left ${
                                    isSelected
                                      ? 'bg-blue-50/80 border border-blue-200'
                                      : 'hover:bg-slate-50 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="w-14 h-8 relative shrink-0 flex items-center justify-center">
                                      <img
                                        src={v.image}
                                        alt={v.model}
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).src = '/images/thumb_g90.jpg';
                                        }}
                                        className="w-full h-full object-contain"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-slate-900 truncate">
                                        {v.model}
                                      </p>
                                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                                        {v.plate}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2.5 shrink-0 ml-2">
                                    <span
                                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                        v.currentStatus === 'in_service'
                                          ? 'text-amber-700 bg-amber-50'
                                          : v.currentStatus === 'maintenance'
                                          ? 'text-slate-500 bg-slate-100'
                                          : 'text-blue-600 bg-blue-50'
                                      }`}
                                    >
                                      ● {v.statusLabel || '대기 중'}
                                    </span>
                                    {isSelected && (
                                      <Check className="w-4 h-4 text-[#1E60F3] stroke-[3]" />
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. 담당 기사 Selector */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      {allocations.length > 1 ? `${index + 1}번 담당 기사` : '담당 기사'}{' '}
                      <span className="text-red-500 font-bold">*</span>
                    </label>

                    <button
                      type="button"
                      data-card-dropdown-trigger="true"
                      onClick={() => {
                        haptics.lightTap();
                        if (isOpenDriver) {
                          setActiveCardDropdown(null);
                        } else {
                          setActiveCardDropdown({ allocId: allocation.id, type: 'driver' });
                          setDriverSearchQuery('');
                        }
                      }}
                      disabled={allocation.serviceMode === 'vehicle_only'}
                      className={`w-full h-12 bg-white rounded-xl px-3 flex items-center justify-between transition-all cursor-pointer shadow-2xs border ${
                        isOpenDriver
                          ? 'border-[#1E60F3] ring-1 ring-[#1E60F3]'
                          : 'border-slate-200 hover:border-slate-300'
                      } disabled:opacity-50 disabled:pointer-events-none`}
                      aria-expanded={isOpenDriver}
                      aria-label={allocations.length > 1 ? `${index + 1}번 담당 기사 선택` : '담당 기사 선택'}
                    >
                      {selectedDriver ? (
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 shrink-0 relative bg-slate-100">
                            <img
                              src={selectedDriver.avatarUrl || getDriverProfileImage(selectedDriver)}
                              alt={selectedDriver.name}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/images/driver_kim.png';
                              }}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                            {selectedDriver.name} · {selectedDriver.phone}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400">
                          <Users className="w-4 h-4 shrink-0 text-slate-400" />
                          <span className="text-xs sm:text-sm font-medium">담당 기사 선택</span>
                        </div>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0 ml-2 ${
                          isOpenDriver ? 'rotate-180 text-[#1E60F3]' : ''
                        }`}
                      />
                    </button>

                    {/* Driver Dropdown Popover */}
                    {isOpenDriver && (
                      <div
                        ref={activeCardDropdownRef}
                        className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-full sm:min-w-[340px] md:min-w-[380px] max-w-[460px] z-50 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-3 animate-in fade-in duration-150"
                      >
                        {/* Top Search Area */}
                        <div className="pb-2.5 border-b border-slate-100">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={driverSearchQuery}
                              onChange={(e) => setDriverSearchQuery(e.target.value)}
                              placeholder="기사명 또는 연락처 검색"
                              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:bg-white"
                            />
                            {driverSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setDriverSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Unassign Option */}
                        {allocation.selectedDriver && (
                          <button
                            type="button"
                            onClick={() => handleSelectDriver(allocation.id, null)}
                            className="w-full mt-1.5 mb-1 px-2.5 py-1.5 text-left text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span>배정 해제 (미배정)</span>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Driver List */}
                        <div className="max-h-60 overflow-y-auto space-y-1 mt-1 pr-1">
                          {filteredDriversForDropdown.length === 0 ? (
                            <div className="py-6 text-center text-xs text-slate-400 font-medium">
                              일치하는 기사님이 없습니다
                            </div>
                          ) : (
                            filteredDriversForDropdown.map((d) => {
                              const isSelected =
                                allocation.selectedDriver === d.id || allocation.selectedDriver === d.name;
                              const isEnglishNeeded = allocation.requestedLanguage === 'en';
                              const isEnglishUnqualified = isEnglishNeeded && !(d as any).isEnglishVerified;
                              const isBlocked = !d.isAvailable || isEnglishUnqualified;

                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  disabled={isBlocked}
                                  onClick={() => handleSelectDriver(allocation.id, d)}
                                  className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left ${
                                    isSelected
                                      ? 'bg-blue-50/80 border border-blue-200'
                                      : isBlocked
                                      ? 'opacity-50 cursor-not-allowed border border-transparent'
                                      : 'hover:bg-slate-50 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 shrink-0 relative bg-slate-100">
                                      <img
                                        src={d.avatarUrl || getDriverProfileImage(d)}
                                        alt={d.name}
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).src = '/images/driver_kim.png';
                                        }}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-xs font-black text-slate-900 truncate">
                                          {d.name}
                                        </p>
                                        {d.affiliationType === 'employed' && (
                                          <span className="text-[10px] bg-blue-50 text-[#1E60F3] border border-blue-200/60 font-bold px-1.5 py-0.2 rounded shrink-0">
                                            소속
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                                        {d.phone}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    {!d.isAvailable ? (
                                      <span className="text-[10px] text-amber-700 bg-amber-50 font-semibold px-2 py-0.5 rounded-full">
                                        배차 불가
                                      </span>
                                    ) : isEnglishUnqualified ? (
                                      <span className="text-[10px] text-amber-700 bg-amber-50 font-semibold px-2 py-0.5 rounded-full">
                                        영어 미인증
                                      </span>
                                    ) : null}
                                    {isSelected && (
                                      <Check className="w-4 h-4 text-[#1E60F3] stroke-[3]" />
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
                      추가 정보 (선택)
                    </h3>
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
                        추가 정보 (선택)
                      </h3>
                    </div>
                  </div>

                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors">
                    <ChevronUp className="w-4 h-4 stroke-[2.2]" />
                  </div>
                </div>

                {/* Row 1: Sub-Card 1 (기사 언어 조건) & Sub-Card 2 (항공편명) */}
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
                        className={`h-9 sm:h-10 rounded-lg flex items-center justify-center gap-1.5 px-2 transition-all cursor-pointer ${
                          commonLanguage === "ko"
                            ? "bg-[#EAF2FF] border-2 border-[#1E60F3] text-[#1E60F3] shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xs">🇰🇷</span>
                        <span className="text-xs font-bold whitespace-nowrap">한국어</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCommonLanguageChange("en")}
                        className={`h-9 sm:h-10 rounded-lg flex items-center justify-center gap-1.5 px-2 transition-all cursor-pointer ${
                          commonLanguage === "en"
                            ? "bg-[#EAF2FF] border-2 border-[#1E60F3] text-[#1E60F3] shadow-xs"
                            : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xs">🇺🇸</span>
                        <span className="text-xs font-bold whitespace-nowrap">영어</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-Card 2: 항공편명 */}
                  <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-xl p-2 sm:p-2.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-4 h-4 rounded bg-[#E2EDFE] flex items-center justify-center text-[#1E60F3] shrink-0">
                        <BrandFilledPlaneIcon className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">항공편명</span>
                    </div>

                    <div className="flex items-center gap-1.5">
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
                    {/* 탑승 인원 */}
                    <div className="h-9 sm:h-10 bg-white border border-slate-200 rounded-lg px-2 flex items-center justify-between shadow-2xs">
                      <span className="text-[11px] sm:text-xs font-bold text-slate-800 whitespace-nowrap">탑승 인원</span>
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
                      onChange={(e) => setCommonPassengerPhone(formatPhoneNumber(e.target.value))}
                      placeholder="연락처 (010-1234-5678)"
                      maxLength={13}
                      className="w-full h-9 sm:h-10 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 transition-all min-w-0"
                    />
                  </div>
                </div>

                {/* Row 3: Sub-Card 4 (현장 요청사항) */}
                <div className="bg-[#F4F8FC] border border-[#E2EEF9] rounded-xl p-2 sm:p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <BrandFilledNoteIcon className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                        현장 요청사항
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
          {/* 예약만 등록 / 수정사항 저장 */}
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
            <span>{initialBooking ? '수정사항 저장' : '예약만 등록'}</span>
          </button>

          {/* 바로 배차 / 배차 확정하기 */}
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
            <span>{initialBooking ? '배차 확정하기' : '바로 배차'}</span>
          </button>
        </div>

        {/* Helper Note (Only for new reservation, completely removed in edit mode) */}
        {!initialBooking && (
          <div className="flex items-center justify-center gap-1.5 pt-3 text-xs text-slate-400 font-medium text-center">
            <Info className="w-4 h-4 text-[#1E60F3] shrink-0" />
            <span>예약만 등록하면 미배정 대기함에 저장됩니다.</span>
          </div>
        )}
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
