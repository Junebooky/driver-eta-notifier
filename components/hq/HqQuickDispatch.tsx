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
  CalendarCheck,
  Clock,
  Plane,
  RefreshCw,
  BellRing,
  Ban,
  MessageSquareText,
  ExternalLink,
  Image as ImageIcon,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { DispatchRouteTimeline } from '@/components/common/DispatchRouteTimeline';
import { haptics } from '@/utils/haptics';
import {
  VIP_REAL_VEHICLES,
  stripManufacturerName,
  mapVehicleToUiCategory,
  getVehicleImage,
} from '@/utils/vehicleData';
import { HqVehicleSelectModal, getVerifiedVehiclePhoto } from './email/HqVehicleSelectModal';
import { HqDriverSelectModal } from './email/HqDriverSelectModal';
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
import { HqPlaceSearchInput, type PoiResult } from './HqPlaceSearchInput';
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
import { editedBookingIdentity, resolveQuickDispatchPlaces } from '@/utils/quickDispatchContinuity';
import { driverDispatchSmsHref } from '@/utils/driverDispatchSms';
import { cancelHqQuickDispatchSchedule } from '@/utils/hqQuickDispatchCancellation';
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

export function formatDisplayDateWithDay(isoDate: string): string {
  if (!isoDate) return '-';
  const clean = normalizeDateToIso(isoDate) || isoDate;
  const parts = clean.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return isoDate;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[d.getUTCDay()];
  const y = String(parts[0]);
  const m = String(parts[1]).padStart(2, '0');
  const day = String(parts[2]).padStart(2, '0');
  return `${y}. ${m}. ${day} (${dayName})`;
}

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

  // Never invent a trip end time: an HQ operator must set it before publishing.
  const effectiveEndTime = endTime.trim();

  const excludeScheduleId = initialBooking?.scheduleId || initialBooking?.id;
  const fleet = useFleetAvailability(pickupDate, pickupTimeOnly, pickupEndDate || pickupDate, effectiveEndTime, excludeScheduleId);
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
  const [pickupPoi, setPickupPoi] = useState<PoiResult | null>(null);
  const [destinationPoi, setDestinationPoi] = useState<PoiResult | null>(null);

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

  // Sub-modal and inline editor states for Edit/Detail mode
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isEditingDateTime, setIsEditingDateTime] = useState(false);
  const [isEditingRoute, setIsEditingRoute] = useState(false);

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
  const [saveMutation] = useState(() => createRetryableJsonMutation('cockpit_pending_quick_dispatch'));
  const submitLock = useRef(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReminding, setIsReminding] = useState(false);
  const [remindSuccess, setRemindSuccess] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('고객 요청 일정 취소');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelSucceeded, setCancelSucceeded] = useState(false);
  const cancelLock = useRef(false);
  const bookingCancelled = initialBooking?.dispatchStatus === '취소' || cancelSucceeded;

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
    setPickupPoi(null);
    setDestinationPoi(null);
    setErrorMsg(null);
    setNotificationMsg(null);
    setIsCancelConfirmOpen(false);
    setCancelReason('고객 요청 일정 취소');
    setCancelSucceeded(false);
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

  const handleCancelDispatch = async () => {
    if (!initialBooking || bookingCancelled || isCancelling || isSubmitting || cancelLock.current) return;
    const targetId = initialBooking.scheduleId || (initialBooking.id.startsWith('new_') ? '' : initialBooking.id);
    if (!targetId) {
      setErrorMsg('서버에 등록된 예약만 취소할 수 있습니다.');
      return;
    }

    cancelLock.current = true;
    setIsCancelling(true);
    setErrorMsg(null);
    try {
      // The button below asks for an explicit second confirmation before this is called.
      await cancelHqQuickDispatchSchedule(targetId, cancelReason);
      setCancelSucceeded(true);
      setIsCancelConfirmOpen(false);
      setNotificationMsg('예약·배차가 취소되었습니다. 담당 기사 Cockpit에도 취소 상태가 반영됩니다.');
      haptics.warningPulse();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vip_hq_schedules_updated'));
      }
      try {
        await onSavedBookings?.();
      } catch {
        setErrorMsg('취소는 완료됐지만 배차 목록을 새로고침하지 못했습니다. 목록을 다시 열어 확인해 주세요.');
      }
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : '배차 취소 중 네트워크 오류가 발생했습니다.');
      haptics.errorAlert();
    } finally {
      cancelLock.current = false;
      setIsCancelling(false);
    }
  };

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
      setErrorMsg('기사 앱 내 확인 요청 처리에 실패했습니다. 네트워크 상태를 확인해 주세요.');
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
      if (!effectiveEndTime) {
        setErrorMsg('배차 확정 전에 실제 예정 종료 시간을 입력해 주세요. 자동으로 추정하지 않습니다.');
        return;
      }
      if (totalLiveConflicts > 0) { setErrorMsg('선택 기간의 기사·차량 충돌을 먼저 해결해 주세요.'); return; }
      const error = validateDispatchInterval({ date: pickupDate, pickupTime: pickupTimeOnly, endDate: pickupEndDate || pickupDate, endTime: effectiveEndTime, dispatchStatus: mode });
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
    const lineage = editedBookingIdentity(initialBooking, pickupLocation, destination);
    const verifiedPlaces = resolveQuickDispatchPlaces(lineage, pickupPoi, destinationPoi);
    const sharedEventId = lineage?.eventId || `ev-${Date.now()}`;
    const sharedGroupId = lineage ? lineage.groupId : isMultiVehicleGroup ? `grp-${Date.now()}` : undefined;
    const sharedGroupName = lineage?.eventName
      || `${customerName.trim()} ${isMultiVehicleGroup ? `VIP 단체 의전 (${totalVehicles}대)` : 'VIP 의전'}`;

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
        groupName: lineage ? lineage.groupName : isMultiVehicleGroup ? sharedGroupName : undefined,
        groupTotalVehicles: lineage?.groupTotalVehicles || totalVehicles,
        groupVehicleIndex: lineage?.groupVehicleIndex || vehicleNum,
        // Keep original email identity across mobile/desktop assignment and edits.
        intakeSource: lineage ? lineage.intakeSource : mode === 'unassigned' ? 'phone' : 'quick_dispatch',
        vehicleNo: resolvedPlate || undefined,
        vehicleModel: resolvedModel || undefined,
        vehiclePlate: resolvedPlate || undefined,
        driverId: matchedDriver?.id || undefined,
        driverName: cleanDrv || undefined,
        driverPhone: matchedDriver?.phone || undefined,
        date: pickupDate,
        endDate: pickupEndDate || pickupDate,
        pickupTime: pickupTimeOnly,
        endTime: effectiveEndTime,
        vehicleId: matchedVehicle?.uuid,
        origin: pickupLocation.trim(),
        destination: destination.trim(),
        ...verifiedPlaces,
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
      const res = await saveMutation.send('/api/schedules/dispatch', { items: payloadItems }, { intent: quickDispatchIntent(payloadItems) });
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
            ? '변경된 배차가 저장되었습니다. 기사 Cockpit에 표시됩니다.'
            : isMultiVehicleGroup
              ? `총 ${totalVehicles}대의 배차가 저장되었습니다. 기사 Cockpit에 표시됩니다.`
              : `배차가 저장되었습니다. 기사 Cockpit에 표시됩니다.`
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

  const handleSubmit = async (mode: 'unassigned' | 'published') => {
    if (submitLock.current || isCancelling || bookingCancelled) return;
    submitLock.current = true;
    try { await submit(mode); } finally { submitLock.current = false; }
  };

  if (isModal && !isOpen) return null;
  const driverSmsHref = initialBooking && ['배차 완료', '재확인 필요'].includes(initialBooking.dispatchStatus)
    ? driverDispatchSmsHref(initialBooking) : null;

  const firstAlloc = allocations[0];
  // A cleared/changed choice must not silently fall back to the original schedule assignment.
  const currentVehiclePlate = firstAlloc?.selectedVehiclePlate ?? initialBooking?.vehiclePlate ?? '';
  const currentVehicleModel = firstAlloc?.selectedVehicleModel ?? initialBooking?.vehicleModel ?? '';
  const currentVehiclePhoto = getVerifiedVehiclePhoto(currentVehiclePlate);
  const currentDriverId = firstAlloc?.selectedDriver ?? initialBooking?.driverId ?? '';
  const currentDriverObj = allDrivers.find(
    (d) => d.id === currentDriverId || d.name === currentDriverId
  );
  const isOriginalDriver = Boolean(currentDriverId && currentDriverId === initialBooking?.driverId);
  const currentDriverName = currentDriverObj?.name || (isOriginalDriver ? initialBooking?.driverName : '') || '기사 미배정';
  const currentDriverPhone = currentDriverObj?.phone || (isOriginalDriver ? initialBooking?.driverPhone : '') || '';
  const currentDriverAvatar = currentDriverObj?.avatarUrl || getDriverProfileImage({ name: currentDriverName });
  const isPreviouslyPublished = Boolean(
    initialBooking && ['배차 완료', '재확인 필요'].includes(initialBooking.dispatchStatus)
  );

  // All dispatch quick actions are quiet secondary actions: one consistent
  // surface, size, elevation and subtle hover. Blue is reserved for key CTAs.
  const dispatchQuickActionClass = 'inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[13px] bg-white px-3.5 text-[12px] font-semibold text-[#17233B] shadow-[0_4px_14px_rgba(35,49,78,0.055),0_1px_4px_rgba(35,49,78,0.025)] transition-[background-color,box-shadow,transform] hover:bg-[#F5F8FF] hover:shadow-[0_5px_16px_rgba(35,49,78,0.08)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:cursor-not-allowed disabled:opacity-50';
  const dispatchStatusClass = 'inline-flex min-h-7 items-center gap-1.5 rounded-full bg-[#F7F9FC] px-3 py-1 text-[11px] font-medium text-[#73839D]';

  const content = (
    <div
      className={`@container ${initialBooking ? 'hq-dispatch-info-a bg-transparent' : 'bg-white'} select-none flex flex-col justify-between ${isModal
        ? 'w-full'
        : 'border border-slate-200/90 rounded-[24px] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)]'
        }`}
    >
      <div>
        {/* 1. Header */}
        <div className="flex items-center justify-between gap-3 pb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            {initialBooking ? (
              <img
                src="/images/icons/reservations/icon_reservations.png"
                alt="배차 관리 목록"
                className="w-12 h-12 sm:w-12 sm:h-12 object-contain shrink-0 transition-transform duration-150 group-hover/dispatch:scale-110"
              />
            ) : (
              <img
                src="/images/icons/reservations/icon_reservations.png"
                alt="빠른 예약 · 배차"
                className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 select-none"
                draggable={false}
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[21px] sm:text-[23px] font-bold text-[#17233B] tracking-[-0.035em]">
                  {initialBooking ? '배차 정보' : '빠른 예약 · 배차'}
                </h2>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[#73839D]">
                {initialBooking ? '기사와 차량, 운행 일정을 확인해 보세요.' : '필수 정보만 입력하고 예약하거나 바로 배차하세요.'}
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
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6] hover:text-[#17233B] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {initialBooking ? (
          <div className="mt-1 space-y-4">
            {/* Card 1: Customer & Status Summary */}
            <div className="space-y-4 rounded-[22px] bg-white p-5 sm:p-6 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)]">
              <div className="flex items-center justify-between gap-3">
                {/* Customer & Passenger */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[17px] sm:text-[19px] font-bold text-[#17233B] tracking-[-0.025em]">
                      {customerName || initialBooking.customerName}
                    </span>
                    {(commonPassengerName || initialBooking.passengerName) && (
                      <>
                        <span className="text-slate-300 font-bold">·</span>
                        <span className="text-[13px] sm:text-[14px] font-medium text-[#4D607C]">
                          {commonPassengerName || initialBooking.passengerName}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Subtitle / Meta Line */}
                  <div className="mt-1.5 truncate text-[12px] leading-relaxed font-medium text-[#73839D]">
                    기사 {currentDriverName} · 차량 {currentVehiclePlate}
                    {currentVehicleModel ? ` (${stripManufacturerName(currentVehicleModel)})` : ''}
                    {initialBooking.driverAckTime && ` · 확인 ${initialBooking.driverAckTime}`}
                  </div>
                </div>

                {/* Badges on the right */}
                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                  {/* 배차 완료 Badge */}
                  <span className={dispatchStatusClass}>
                    {initialBooking.dispatchStatus || '배차 완료'}
                  </span>
                  {/* 기사 확인 현황 Badge */}
                  <span
                    className={dispatchStatusClass}
                  >
                    {initialBooking.driverAck === '확인완료' ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-[#1E60F3]" />
                    ) : (
                      <Clock className="size-3.5 shrink-0 text-[#95A3B9]" />
                    )}
                    <span>
                      {initialBooking.driverAck === '확인완료'
                        ? '확인 완료'
                        : initialBooking.driverAck === '재확인 필요'
                          ? '재확인 대기'
                          : '확인 대기'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Quick Action Buttons Row */}
              {(onOpenCustomerMessage || onOpenDriverVehicleInfo || driverSmsHref || onRemindDriver) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {onOpenCustomerMessage && (
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        onOpenCustomerMessage(initialBooking);
                      }}
                      className={dispatchQuickActionClass}
                    >
                      <MessageSquareText className="size-3.5 shrink-0 text-[#73839D]" />
                      <span>안내 문자</span>
                    </button>
                  )}
                  {onOpenDriverVehicleInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        onOpenDriverVehicleInfo(initialBooking);
                      }}
                      className={dispatchQuickActionClass}
                    >
                      <ImageIcon className="size-3.5 shrink-0 text-[#73839D]" />
                      <span>배차 카드</span>
                    </button>
                  )}
                  {driverSmsHref && (
                    <a
                      href={driverSmsHref}
                      className={dispatchQuickActionClass}
                    >
                      <MessageSquareText className="size-3.5 shrink-0 text-[#73839D]" />
                      <span>기사 문자</span>
                    </a>
                  )}
                  {onRemindDriver && (
                    <button
                      type="button"
                      onClick={handleRemindClick}
                      disabled={isReminding}
                      className={dispatchQuickActionClass}
                    >
                      <BellRing className={`size-3.5 shrink-0 text-[#73839D] ${isReminding ? 'animate-pulse' : ''}`} />
                      <span>{remindSuccess ? '요청 완료' : isReminding ? '요청 중' : '재요청'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Card 2: 출발일 · 출발 시간 · 종료 시간 (3 columns) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Col 1: 출발일 */}
              <TossDateRangePicker
                align="left"
                startDate={pickupDate}
                endDate={pickupEndDate}
                onChangeRange={(start, end) => {
                  setPickupDate(start);
                  setPickupEndDate(end);
                }}
                customTrigger={() => (
                  <div className="flex min-h-[88px] cursor-pointer select-none items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] transition-all hover:shadow-[0_7px_24px_rgba(35,49,78,0.08)] sm:p-5">
                    <Calendar className="w-5 h-5 text-slate-400 shrink-0" />
                    <div>
                      <div className="text-xs text-slate-400 font-medium">출발일</div>
                      <div className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
                        {formatDisplayDateWithDay(pickupDate)}
                      </div>
                    </div>
                  </div>
                )}
              />

              {/* 출발·종료 시간은 스케줄 기본값으로 채우되 직접 수정할 수 있습니다. */}
              <label className="flex min-h-[88px] items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-5">
                <Clock className="h-5 w-5 shrink-0 text-[#8290A1]" strokeWidth={1.8} />
                <div className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-[#73839D]">출발 시간</span>
                  <input
                    type="time"
                    value={pickupTimeOnly}
                    onChange={(event) => {
                      setPickupTimeOnly(event.target.value);
                      setTimeInputText(formatTimeKoreanAmPm(event.target.value));
                    }}
                    disabled={bookingCancelled || isSubmitting}
                    aria-label="출발 시간 수정"
                    className="mt-1 h-9 w-full min-w-0 rounded-[10px] bg-[#FAFBFD] px-2 text-[14px] font-semibold tabular-nums text-[#17233B] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </label>

              <label className="flex min-h-[88px] items-center gap-3 rounded-[20px] bg-white p-4 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-5">
                <Clock className="h-5 w-5 shrink-0 text-[#8290A1]" strokeWidth={1.8} />
                <div className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-[#73839D]">종료 시간</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    disabled={bookingCancelled || isSubmitting}
                    aria-label="종료 시간 수정"
                    className="mt-1 h-9 w-full min-w-0 rounded-[10px] bg-[#FAFBFD] px-2 text-[14px] font-semibold tabular-nums text-[#17233B] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </label>
            </div>

            {/* Card 3: 배정 차량 · 담당 기사 (2 columns) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Col 1: 배정 차량 */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsVehicleModalOpen(true);
                }}
                className="group flex min-h-[90px] w-full cursor-pointer items-center gap-3.5 rounded-[20px] bg-white p-4 text-left shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] transition-all hover:shadow-[0_7px_24px_rgba(35,49,78,0.08)] sm:p-5"
              >
                <div className="relative flex h-11 w-[68px] shrink-0 items-center justify-center rounded-[13px] bg-[#FAFBFD] p-1">
                  <img
                    src={currentVehiclePhoto}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-400 font-medium">배정 차량</div>
                  <div className="text-sm sm:text-base font-bold text-slate-800 tracking-tight truncate">
                    {currentVehiclePlate && currentVehiclePlate !== '미배정'
                      ? `${currentVehicleModel} · ${currentVehiclePlate}`
                      : '차량 선택'}
                  </div>
                </div>
              </button>

              {/* Col 2: 담당 기사 */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsDriverModalOpen(true);
                }}
                className="group flex min-h-[90px] w-full cursor-pointer items-center gap-3.5 rounded-[20px] bg-white p-4 text-left shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] transition-all hover:shadow-[0_7px_24px_rgba(35,49,78,0.08)] sm:p-5"
              >
                <div className="size-11 shrink-0 overflow-hidden rounded-full bg-[#F7F9FC]">
                  <img
                    src={currentDriverAvatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-400 font-medium">담당 기사</div>
                  <div className="text-sm sm:text-base font-bold text-slate-800 tracking-tight truncate">
                    {currentDriverName && currentDriverName !== '미배정'
                      ? `${currentDriverName} · ${currentDriverPhone}`
                      : '기사 선택'}
                  </div>
                </div>
              </button>
            </div>

            {/* A quiet, read-only snapshot of the saved schedule. Editing above never mutates this reference. */}
            <section aria-label="스케줄 기준 배차 정보" className="rounded-[20px] bg-[#F7F9FC] px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-[12px] font-semibold text-[#4D607C]">스케줄 기준 정보</h3>
                <p className="text-[11px] text-[#8492A4]">현재 저장된 일정 · 위 배차 정보는 별도로 수정 가능</p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[#8A97A7]">스케줄 차량</p>
                  <p className="mt-1 break-words text-[12px] font-semibold text-[#52647A]">
                    {initialBooking.vehiclePlate && initialBooking.vehiclePlate !== '미배정'
                      ? `${stripManufacturerName(initialBooking.vehicleModel || '')} · ${initialBooking.vehiclePlate}`
                      : '미배정'}
                  </p>
                  {currentVehiclePlate !== (initialBooking.vehiclePlate || '') && <p className="mt-1 text-[10px] text-[#8A97A7]">차량 변경 중</p>}
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[#8A97A7]">스케줄 출발 시간</p>
                  <p className="mt-1 text-[12px] font-semibold tabular-nums text-[#52647A]">{initialBooking.pickupTime ? formatTimeKoreanAmPm(initialBooking.pickupTime) : '미정'}</p>
                  {pickupTimeOnly !== (initialBooking.pickupTime || '') && <p className="mt-1 text-[10px] text-[#8A97A7]">출발 시간 변경 중</p>}
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[#8A97A7]">스케줄 종료 시간</p>
                  <p className="mt-1 text-[12px] font-semibold tabular-nums text-[#52647A]">{initialBooking.endTime ? formatTimeKoreanAmPm(initialBooking.endTime) : '미정'}</p>
                  {endTime !== (initialBooking.endTime || '') && <p className="mt-1 text-[10px] text-[#8A97A7]">종료 시간 변경 중</p>}
                </div>
              </div>
            </section>

            {/* Card 4: 경로 (출발지 → 도착지) */}
            <div className="space-y-4 rounded-[22px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                {/* 출발지 */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src="/images/icons/driver_ui/icon_origin.png"
                    alt="출발지"
                    className="w-6 h-6 object-contain shrink-0 select-none"
                    draggable={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-400 font-medium">출발지</div>
                    <div
                      className="text-sm sm:text-base font-bold text-slate-800 tracking-tight truncate"
                      title={pickupLocation}
                    >
                      {pickupLocation || '출발지 미정'}
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="shrink-0 px-2 sm:px-4">
                  <ArrowRight className="w-5 h-5 text-slate-300" />
                </div>

                {/* 도착지 */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src="/images/icons/driver_ui/icon_destination.png"
                    alt="도착지"
                    className="w-6 h-6 object-contain shrink-0 select-none"
                    draggable={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-400 font-medium">도착지</div>
                    <div
                      className="text-sm sm:text-base font-bold text-slate-800 tracking-tight truncate"
                      title={destination}
                    >
                      {destination || '도착지 미정'}
                    </div>
                  </div>
                </div>

                {/* 경로 변경 버튼 */}
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setIsEditingRoute((prev) => !prev);
                  }}
                  className="ml-1 min-h-9 shrink-0 cursor-pointer rounded-[12px] bg-[#F7F9FC] px-3 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EEF3FF] hover:text-[#1E60F3]"
                >
                  {isEditingRoute ? '완료' : '변경'}
                </button>
              </div>

              {/* Expanded Route Editor when user clicks '변경' */}
              {isEditingRoute && (
                <div className="space-y-3 pt-2 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <HqPlaceSearchInput
                      label="출발지"
                      value={pickupLocation}
                      isConfirmed={Boolean(pickupPoi)}
                      onChange={(val) => {
                        setPickupLocation(val);
                        setPickupPoi(null);
                        setErrorMsg(null);
                      }}
                      onSelectPoi={(poi) => {
                        setPickupLocation(poi.name);
                        setPickupPoi(poi);
                        setErrorMsg(null);
                      }}
                      placeholder="출발 장소명 또는 주소 검색"
                      icon="mapPin"
                    />
                    <HqPlaceSearchInput
                      label="도착지"
                      value={destination}
                      isConfirmed={Boolean(destinationPoi)}
                      onChange={(val) => {
                        setDestination(val);
                        setDestinationPoi(null);
                        setErrorMsg(null);
                      }}
                      onSelectPoi={(poi) => {
                        setDestination(poi.name);
                        setDestinationPoi(poi);
                        setErrorMsg(null);
                      }}
                      placeholder="도착 장소명 또는 주소 검색"
                      icon="flag"
                    />
                  </div>
                </div>
              )}

              {/* Optional Route Timeline */}
              {initialBooking?.routeWaypoints && initialBooking.routeWaypoints.length > 2 && (
                <DispatchRouteTimeline
                  waypoints={initialBooking.routeWaypoints}
                  heading="전체 운행 경로"
                  className="mt-2 rounded-[18px] bg-[#FAFBFD] p-4"
                  compact
                />
              )}
            </div>

            {/* Card 5: 추가 정보 아코디언 */}
            <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)]">
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setIsExtraInfoOpen((prev) => !prev);
                }}
                className="flex cursor-pointer select-none items-center justify-between p-5 transition-colors hover:bg-[#FAFBFD] sm:p-6"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
                    추가 정보
                  </span>
                </div>
                <div className="flex size-8 items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D]">
                  {isExtraInfoOpen ? (
                    <ChevronUp className="w-4 h-4 stroke-[2.2]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 stroke-[2.2]" />
                  )}
                </div>
              </div>

              {isExtraInfoOpen && (
                <div className="space-y-3 px-5 pb-5 pt-0 animate-in slide-in-from-top-2 duration-150 sm:px-6 sm:pb-6">
                  {/* Row 1: 기사 언어 & 항공편명 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    {/* 기사 언어 */}
                    <div className="flex flex-col justify-between rounded-[18px] bg-[#FAFBFD] p-4">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <Globe className="size-4 text-[#73839D]" strokeWidth={1.9} />
                        <span className="text-xs font-bold text-slate-700">기사 언어</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCommonLanguageChange('ko')}
                          className={`h-11 rounded-[14px] flex items-center justify-center gap-1.5 px-3 transition-all cursor-pointer ${commonLanguage === 'ko'
                            ? 'bg-[#EEF3FF] text-[#1E60F3] font-semibold'
                            : 'bg-white text-[#4D607C] hover:bg-[#F7F9FC] font-medium shadow-[0_3px_10px_rgba(35,49,78,0.045)]'
                            }`}
                        >
                          <span className="text-sm">🇰🇷</span>
                          <span className="text-xs font-bold">한국어</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCommonLanguageChange('en')}
                          className={`h-11 rounded-[14px] flex items-center justify-center gap-1.5 px-3 transition-all cursor-pointer ${commonLanguage === 'en'
                            ? 'bg-[#EEF3FF] text-[#1E60F3] font-semibold'
                            : 'bg-white text-[#4D607C] hover:bg-[#F7F9FC] font-medium shadow-[0_3px_10px_rgba(35,49,78,0.045)]'
                            }`}
                        >
                          <span className="text-sm">🇺🇸</span>
                          <span className="text-xs font-bold">영어</span>
                        </button>
                      </div>
                    </div>

                    {/* 항공편명 */}
                    <div className="flex flex-col justify-between rounded-[18px] bg-[#FAFBFD] p-4">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <Plane className="size-4 text-[#73839D]" strokeWidth={1.9} />
                        <span className="text-xs font-bold text-slate-700">항공편명</span>
                      </div>
                      <input
                        type="text"
                        value={commonFlightNumber}
                        onChange={(e) => setCommonFlightNumber(e.target.value)}
                        placeholder="예: SQ612"
                        className="h-[52px] w-full rounded-[16px] bg-white px-4 text-[14px] font-medium text-[#17233B] placeholder:text-[#95A3B9] outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 2: 탑승객 정보 */}
                  <div className="rounded-[18px] bg-[#FAFBFD] p-4">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Users className="size-4 text-[#73839D]" strokeWidth={1.9} />
                      <span className="text-xs font-bold text-slate-700">탑승객 정보</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* 탑승 인원 */}
                      <div className="flex min-h-[52px] items-center justify-between rounded-[16px] bg-white px-4">
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap">탑승 인원</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCommonPassengerCount((prev) => Math.max(0, prev - 1))}
                            className="flex size-7 cursor-pointer items-center justify-center rounded-[9px] bg-[#F7F9FC] text-[#4D607C] transition-colors hover:bg-[#EDF1F6] active:scale-95"
                          >
                            <Minus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                          <span className="text-xs font-black text-slate-900 px-1 min-w-[16px] text-center">
                            {commonPassengerCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCommonPassengerCount((prev) => prev + 1)}
                            className="flex size-7 cursor-pointer items-center justify-center rounded-[9px] bg-[#EEF3FF] text-[#1E60F3] transition-colors hover:bg-[#E2EBFF] active:scale-95"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                      {/* 탑승객명 */}
                      <input
                        type="text"
                        value={commonPassengerName}
                        onChange={(e) => setCommonPassengerName(e.target.value)}
                        placeholder="탑승객명 (홍길동)"
                        className="h-[52px] w-full rounded-[16px] bg-white px-4 text-[14px] font-medium text-[#17233B] placeholder:text-[#95A3B9] outline-none"
                      />
                      {/* 탑승객 번호 */}
                      <input
                        type="tel"
                        value={commonPassengerPhone}
                        onChange={(e) => setCommonPassengerPhone(formatPhoneNumber(e.target.value))}
                        placeholder="연락처 (010-1234-5678)"
                        className="h-[52px] w-full rounded-[16px] bg-white px-4 text-[14px] font-medium text-[#17233B] placeholder:text-[#95A3B9] outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 3: 현장 요청 */}
                  <div className="flex flex-col gap-3 rounded-[18px] bg-[#FAFBFD] p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#73839D]">
                        <FileText className="size-4 text-[#73839D]" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 whitespace-nowrap">현장 요청</span>
                    </div>
                    <input
                      type="text"
                      value={commonMemo}
                      onChange={(e) => setCommonMemo(e.target.value)}
                      placeholder="요청사항을 입력하세요 (예: 공항 피켓 영접, 미팅 후 이동 등)"
                      className="h-[52px] min-w-0 w-full flex-1 rounded-[16px] bg-white px-4 text-[14px] font-medium text-[#17233B] placeholder:text-[#95A3B9] outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 mt-1">
            {/* 고객사 * */}
            <div className="relative" ref={customerDropdownRef}>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                고객사 <span className="text-red-500 font-bold ml-0.5">*</span>
              </label>

              <div
                onClick={() => setIsCustomerDropdownOpen(true)}
                className="w-full h-11 sm:h-12 bg-white border border-slate-200 hover:border-blue-400 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-blue-100 rounded-xl px-3.5 flex items-center justify-between transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 shrink-0" />
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
                    className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>
                <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500 shrink-0" />
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
                                className={`text-[10px] px-1.5 py-0.2 rounded font-black ${c.tier === 'VIP'
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

            {/* 출발 날짜 * & 출발 시간 * & 예정 종료 시간 (Unified Input Size & Typography) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 출발 날짜 */}
              <TossDateRangePicker
                label="출발 날짜"
                required
                align="left"
                startDate={pickupDate}
                endDate={pickupEndDate}
                onChangeRange={(start, end) => {
                  setPickupDate(start);
                  setPickupEndDate(end);
                }}
                heightClass="h-11 sm:h-12"
              />

              {/* 출발 시간 (종료 시간 인풋박스와 동일한 select 스타일) */}
              <div>
                <label htmlFor="hq-dispatch-pickup-time" className="block text-xs font-bold text-slate-800 mb-1.5">
                  출발 시간 <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <div className="w-full h-11 sm:h-12 bg-white border border-slate-200 hover:border-slate-300 focus-within:border-[#1E60F3] focus-within:ring-1 focus-within:ring-[#1E60F3] rounded-xl px-3.5 flex items-center transition-all shadow-2xs">
                  <input
                    id="hq-dispatch-pickup-time"
                    type="time"
                    value={pickupTimeOnly}
                    onChange={(event) => {
                      const val = event.target.value;
                      setPickupTimeOnly(val);
                      setTimeInputText(formatTimeKoreanAmPm(val));
                    }}
                    aria-label="출발 시간 입력 및 선택"
                    className="w-full h-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 outline-none cursor-pointer"
                  />
                </div>
              </div>

              {/* 예정 종료 시간 (Unified Input Style) */}
              <div>
                <label htmlFor="hq-dispatch-end-time" className="block text-xs font-bold text-slate-800 mb-1.5">
                  종료 시간 <span className="font-medium text-slate-400 text-[11px]">(배차 시 필수)</span>
                </label>
                <div className="w-full h-11 sm:h-12 bg-white border border-slate-200 hover:border-slate-300 focus-within:border-[#1E60F3] focus-within:ring-1 focus-within:ring-[#1E60F3] rounded-xl px-3.5 flex items-center transition-all shadow-2xs">
                  <input
                    id="hq-dispatch-end-time"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    aria-label="예정 종료 시간 직접 입력"
                    className="w-full h-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 outline-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 차량 및 기사 배차 (Clean White UI, Aligned with Other Fields) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800">
                  차량 및 기사 배차
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500">차량 수:</span>
                  <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={handleDecrementVehicle}
                      disabled={allocations.length <= 1}
                      className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center transition-colors active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      aria-label="차량 감소"
                    >
                      <Minus className="w-3 h-3 stroke-[2.5]" />
                    </button>

                    <span className="w-7 text-xs font-black text-slate-900 text-center">
                      {allocations.length}대
                    </span>

                    <button
                      type="button"
                      onClick={handleIncrementVehicle}
                      className="w-6 h-6 rounded bg-[#1E60F3] hover:bg-blue-600 text-white font-black flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                      aria-label="차량 증가"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>

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
                    className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${index > 0 ? 'pt-2.5 border-t border-slate-100' : ''}`}
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
                        className={`w-full h-11 sm:h-12 bg-white rounded-xl px-3.5 flex items-center justify-between transition-all cursor-pointer shadow-2xs border ${isOpenVehicle
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
                          className={`w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0 ml-2 ${isOpenVehicle ? 'rotate-180 text-[#1E60F3]' : ''
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
                                      className={`px-2 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${active
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
                                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left ${isSelected
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
                                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${v.currentStatus === 'in_service'
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
                        className={`w-full h-11 sm:h-12 bg-white rounded-xl px-3.5 flex items-center justify-between transition-all cursor-pointer shadow-2xs border ${isOpenDriver
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
                          className={`w-4 h-4 text-slate-500 transition-transform duration-200 shrink-0 ml-2 ${isOpenDriver ? 'rotate-180 text-[#1E60F3]' : ''
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
                                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer text-left ${isSelected
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
                autoSearch={false}
                isConfirmed={Boolean(pickupPoi)}
                onChange={(val) => {
                  setPickupLocation(val);
                  setPickupPoi(null);
                  setErrorMsg(null);
                }}
                onSelectPoi={(poi) => {
                  setPickupLocation(poi.name);
                  setPickupPoi(poi);
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
                autoSearch={false}
                isConfirmed={Boolean(destinationPoi)}
                onChange={(val) => {
                  setDestination(val);
                  setDestinationPoi(null);
                  setErrorMsg(null);
                }}
                onSelectPoi={(poi) => {
                  setDestination(poi.name);
                  setDestinationPoi(poi);
                  setErrorMsg(null);
                }}
                placeholder="목적지 검색 또는 입력"
                icon="flag"
              />
            </div>

            {/* 3. 추가 정보 (선택사항) Accordion (Reference Match) */}
            <div className="pt-0.5">
              {!isExtraInfoOpen ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    haptics.lightTap();
                    setIsExtraInfoOpen(true);
                  }}
                  className="bg-white border border-slate-200/90 hover:border-blue-200 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/70 transition-all shadow-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#EBF2FE] text-[#1E60F3] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-[#1E60F3]" />
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
                <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3 animate-in slide-in-from-top-2 duration-200">
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
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#EBF2FE] text-[#1E60F3] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-[#1E60F3]" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                          추가 정보 (선택)
                        </h3>
                      </div>
                    </div>

                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors">
                      <ChevronUp className="w-4 h-4 stroke-[2.2]" />
                    </div>
                  </div>

                  {/* Row 1: Sub-Card 1 (기사 언어) & Sub-Card 2 (항공편명) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Sub-Card 1: 기사 언어 */}
                    <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <Globe className="w-4 h-4 text-[#1E60F3] stroke-[2]" />
                        <span className="text-xs font-bold text-slate-700">기사 언어</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleCommonLanguageChange("ko")}
                          className={`h-11 rounded-xl flex items-center justify-center gap-1.5 px-2 transition-all cursor-pointer ${commonLanguage === "ko"
                            ? "bg-[#EBF2FE] text-[#1E60F3] font-bold shadow-2xs"
                            : "bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 font-semibold shadow-2xs"
                            }`}
                        >
                          <span className="text-sm">🇰🇷</span>
                          <span className="text-xs font-bold whitespace-nowrap">한국어</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCommonLanguageChange("en")}
                          className={`h-11 rounded-xl flex items-center justify-center gap-1.5 px-2 transition-all cursor-pointer ${commonLanguage === "en"
                            ? "bg-[#EBF2FE] text-[#1E60F3] font-bold shadow-2xs"
                            : "bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 font-semibold shadow-2xs"
                            }`}
                        >
                          <span className="text-sm">🇺🇸</span>
                          <span className="text-xs font-bold whitespace-nowrap">영어</span>
                        </button>
                      </div>
                    </div>

                    {/* Sub-Card 2: 항공편명 */}
                    <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <Plane className="w-4 h-4 text-[#1E60F3] stroke-[2]" />
                        <span className="text-xs font-bold text-slate-700">항공편명</span>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="text"
                          value={commonFlightNumber}
                          onChange={(e) => setCommonFlightNumber(e.target.value)}
                          placeholder="예: KE082"
                          className="w-full h-11 bg-white border border-slate-200/90 rounded-xl px-3.5 text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 shadow-2xs transition-all min-w-0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Sub-Card 3 (탑승객 정보) */}
                  <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-3.5 sm:p-4">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Users className="w-4 h-4 text-[#1E60F3] stroke-[2]" />
                      <span className="text-xs font-bold text-slate-700">탑승객 정보</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* 탑승 인원 */}
                      <div className="h-11 bg-white border border-slate-200/90 rounded-xl px-3.5 flex items-center justify-between shadow-2xs">
                        <span className="text-xs font-bold text-slate-700 whitespace-nowrap">탑승 인원</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCommonPassengerCount((prev) => Math.max(0, prev - 1))}
                            className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs transition-all"
                          >
                            <Minus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                          <span className="text-xs font-black text-slate-900 px-1 min-w-[16px] text-center">
                            {commonPassengerCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCommonPassengerCount((prev) => prev + 1)}
                            className="w-6 h-6 rounded-md bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white font-bold flex items-center justify-center cursor-pointer shadow-2xs transition-all"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>

                      {/* 탑승객명 */}
                      <input
                        type="text"
                        value={commonPassengerName}
                        onChange={(e) => setCommonPassengerName(e.target.value)}
                        placeholder="탑승객명 (홍길동)"
                        className="w-full h-11 bg-white border border-slate-200/90 rounded-xl px-3.5 text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 shadow-2xs transition-all min-w-0"
                      />

                      {/* 탑승객 번호 */}
                      <input
                        type="tel"
                        value={commonPassengerPhone}
                        onChange={(e) => setCommonPassengerPhone(formatPhoneNumber(e.target.value))}
                        placeholder="연락처 (010-1234-5678)"
                        className="w-full h-11 bg-white border border-slate-200/90 rounded-xl px-3.5 text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 shadow-2xs transition-all min-w-0"
                      />
                    </div>
                  </div>

                  {/* Row 3: Sub-Card 4 (현장 요청) */}
                  <div className="flex flex-col gap-3 rounded-[18px] bg-[#FAFBFD] p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                        현장 요청
                      </span>
                    </div>
                    <input
                      type="text"
                      value={commonMemo}
                      onChange={(e) => setCommonMemo(e.target.value)}
                      placeholder="요청사항을 입력하세요 (예: 공항 피켓 영접, 미팅 후 이동 등)"
                      className="w-full h-11 bg-white border border-slate-200/90 rounded-xl px-3.5 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-1 focus:ring-blue-100 shadow-2xs transition-all flex-1 min-w-0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Conflict Warning Banner if any */}
        {totalLiveConflicts > 0 && (
          <div className="mt-3 space-y-1 rounded-[16px] bg-[#FFF9F1] p-4 text-[12px] font-medium text-[#8E633F]">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0 text-[#A8784C]" />
              <span>기존 배차와 일정 중복이 감지되었습니다 ({totalLiveConflicts}건)</span>
            </div>
            <p className="pt-1 text-[11px] text-amber-300 font-semibold">
              기존 일정과 겹쳐 바로 배차가 비활성화되었습니다. 일정을 변경하거나 예약만 등록을 이용해 주세요.
            </p>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="mt-3 flex items-start gap-2 rounded-[16px] bg-[#FFF4F2] p-4 text-[12px] font-medium text-[#A34E45]">
            <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Banner */}
        {notificationMsg && (
          <div className="mt-3 flex items-start gap-2 rounded-[16px] bg-[#EEF3FF] p-4 text-[12px] font-medium text-[#31598F]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1E60F3]" />
            <span>{notificationMsg}</span>
          </div>
        )}
      </div>

      {saveMutation.hasPending && <button type="button" className="rounded-xl border border-blue-200 p-3 text-sm text-blue-700" disabled={isSubmitting} onClick={async () => { setIsSubmitting(true); try { const response = await saveMutation.retry(); const data = await response.json(); if (!response.ok) throw new Error(data.error || '저장 결과 확인 실패'); window.location.reload(); } catch (error) { setErrorMsg(error instanceof Error ? error.message : '확인 실패'); } finally { setIsSubmitting(false); } }}>이전 저장 결과 확인</button>}
      {/* 4. Action Buttons */}
      <div className="pt-4 mt-2">
        <div className={`grid gap-3 ${isPreviouslyPublished ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {/* Save a published booking as published: never silently clear its vehicle and driver. */}
          <button
            type="button"
            disabled={isSubmitting || isCancelling || bookingCancelled || (isPreviouslyPublished && (!fleet.data || Boolean(fleet.error) || totalLiveConflicts > 0))}
            onClick={() => {
              haptics.lightTap();
              if (isPreviouslyPublished) {
                handleSubmit('published');
              } else {
                handleSubmit('unassigned');
              }
            }}
            className={`flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] px-3 text-[13px] font-semibold transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:cursor-not-allowed disabled:opacity-40 ${isPreviouslyPublished
              ? 'bg-[#1E60F3] text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] hover:bg-[#1757DC]'
              : 'bg-white text-[#17233B] shadow-[0_5px_16px_rgba(35,49,78,0.055),0_2px_5px_rgba(35,49,78,0.025)] hover:bg-[#FAFBFD]'}`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>{initialBooking ? '변경 내용 저장' : '예약만 등록'}</span>
          </button>

          {!isPreviouslyPublished && (
            <button
              type="button"
              disabled={isSubmitting || isCancelling || bookingCancelled || !fleet.data || Boolean(fleet.error) || totalLiveConflicts > 0}
              onClick={() => {
                haptics.selection();
                handleSubmit('published');
              }}
              className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-[#1E60F3] px-3 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-all hover:bg-[#1757DC] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20 disabled:cursor-not-allowed disabled:bg-[#E5EAF2] disabled:text-[#95A3B9] disabled:shadow-none"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white shrink-0" />
              ) : (
                <Send className="w-4 h-4 text-white shrink-0" />
              )}
              <span>{initialBooking ? '배차 확정' : '바로 배차'}</span>
            </button>
          )}
        </div>

        {/* Low-priority destructive action, consolidated here instead of a second detail modal. */}
        {initialBooking && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            {bookingCancelled ? (
              <p role="status" className="flex items-center justify-center gap-2 py-2 text-xs font-medium text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                취소된 예약입니다.
              </p>
            ) : !isCancelConfirmOpen ? (
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setErrorMsg(null);
                  setIsCancelConfirmOpen(true);
                }}
                disabled={isSubmitting || isCancelling}
                className="ml-auto flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[13px] px-3.5 text-[12px] font-medium text-[#73839D] transition-colors hover:bg-white hover:text-[#4D607C] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Ban className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.7} />
                배차 취소
              </button>
            ) : (
              <section aria-label="예약 취소 확인" className="space-y-3 rounded-[20px] bg-white p-4 shadow-[0_6px_20px_rgba(35,49,78,0.055)] sm:p-5">
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-800">배차를 취소할까요?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    배차를 취소하면 이 예약 일정도 취소되고 담당 기사 Cockpit에도 반영돼요. 저장하지 않은 변경 내용은 사라집니다.
                  </p>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-600">취소 사유</span>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    maxLength={240}
                    disabled={isCancelling}
                    placeholder="취소 사유를 입력해 주세요"
                    className="min-h-[52px] w-full rounded-[16px] bg-white px-4 text-[14px] font-medium text-[#17233B] shadow-[0_5px_16px_rgba(35,49,78,0.045)] outline-none placeholder:text-[#95A3B9] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20 disabled:opacity-60"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={() => { haptics.lightTap(); setIsCancelConfirmOpen(false); }}
                    className="min-h-11 rounded-[14px] bg-[#F7F9FC] text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EDF1F6] disabled:opacity-50"
                  >
                    돌아가기
                  </button>
                  <button
                    type="button"
                    disabled={isCancelling || isSubmitting}
                    onClick={handleCancelDispatch}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-[#FFF4F2] px-3 text-[12px] font-semibold text-[#A34E45] transition-colors hover:bg-[#FFE9E5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCancelling && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    {isCancelling ? '취소 처리 중…' : '배차 취소 확정'}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Helper Note (Only for new reservation, completely removed in edit mode) */}
        {!initialBooking && (
          <div className="flex items-center justify-center gap-1.5 pt-3 text-xs text-slate-400 font-medium text-center">
            <Info className="w-4 h-4 text-[#1E60F3] shrink-0" />
            <span>예약만 등록하면 미배정 대기함에 저장됩니다.</span>
          </div>
        )}
      </div>

      {/* Sub-modals for Vehicle & Driver Selection */}
      <HqVehicleSelectModal
        isOpen={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
        slotNumber={1}
        selectedPlate={currentVehiclePlate}
        vehicles={fleet.data?.vehicles}
        loading={fleet.loading}
        error={fleet.error}
        onSelect={(selectedVehicle) => {
          const matched = allVehicles.find((v) => v.plate === selectedVehicle.plate) || null;
          if (firstAlloc) {
            handleSelectVehicle(firstAlloc.id, matched || (selectedVehicle as any));
          }
          setIsVehicleModalOpen(false);
        }}
      />

      <HqDriverSelectModal
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
        initialDriverId={currentDriverId}
        drivers={hqDrivers}
        requiredLanguage={commonLanguage === 'en' ? 'english' : 'any'}
        targetDate={pickupDate}
        targetTime={pickupTimeOnly}
        onSelectDriver={(selectedDriver) => {
          const matched = allDrivers.find((d) => d.id === selectedDriver.id || d.name === selectedDriver.name) || null;
          if (firstAlloc) {
            handleSelectDriver(firstAlloc.id, matched || (selectedDriver as any));
          }
          setIsDriverModalOpen(false);
        }}
      />
    </div>
  );

  if (isModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initialBooking ? '예약 · 배차 수정' : '빠른 예약 · 배차'}
        className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#17233B]/30 p-2.5 backdrop-blur-[2px] animate-in fade-in duration-200 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            haptics.lightTap();
            onClose?.();
          }
        }}
      >
        <div className={`relative my-auto flex max-h-[94dvh] w-full flex-col justify-between overflow-y-auto overscroll-contain rounded-[24px] border-0 outline-none shadow-[0_26px_76px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.045)] animate-in zoom-in-95 duration-150 sm:max-h-[90dvh] sm:rounded-[28px] ${initialBooking ? 'max-w-[760px] bg-[#FAFBFD] p-5 sm:p-7' : 'max-w-4xl bg-white p-5 sm:p-7'}`}>
          {content}
        </div>
      </div>
    );
  }

  return content;
};
