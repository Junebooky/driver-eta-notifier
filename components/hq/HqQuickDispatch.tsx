'use client';

import React, { useState, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import {
  Car,
  Calendar,
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

export interface HqQuickDispatchProps {
  onCreateBooking: (
    booking: Partial<HqBooking> | Partial<HqBooking>[],
    isDraft: boolean
  ) => void;
  onOpenGroupDispatchModal?: () => void;
  onOpenLoadBookingModal?: () => void;
}

// 20 Registered Real VIP Fleet Vehicles with manufacturer stripped for UI
const VEHICLE_OPTIONS = VIP_REAL_VEHICLES.map((v) => ({
  id: v.id,
  plate: v.plate,
  modelRaw: v.model, // Raw model preserved for DB/State
  modelClean: stripManufacturerName(v.model), // Manufacturer name removed for UI
  label: `${stripManufacturerName(v.model)} (${v.plate})`,
}));

// Multi-vehicle allocation item in unified dispatch form
export interface VehicleAllocationItem {
  id: string;
  vehicleIndex: number;
  selectedDriver: string;
  selectedVehicleModel: string;
  selectedVehiclePlate: string;
  requestedLanguage: RequestedDriverLanguage;
  languageOverrideConfirmed: boolean;
  serviceMode: ServiceIncludeMode;
  // Custom itinerary override for this specific vehicle
  hasCustomItinerary: boolean;
  customPickupTime: string;
  customPickupLocation: string;
  customDestination: string;
  customNotes: string;
}

const createInitialAllocation = (
  index: number,
  defaultLang: RequestedDriverLanguage = 'ko'
): VehicleAllocationItem => ({
  id: `alloc-${Date.now()}-${index}`,
  vehicleIndex: index,
  selectedDriver: '',
  selectedVehicleModel: '',
  selectedVehiclePlate: '',
  requestedLanguage: defaultLang,
  languageOverrideConfirmed: false,
  serviceMode: 'with_driver',
  hasCustomItinerary: false,
  customPickupTime: '',
  customPickupLocation: '',
  customDestination: '',
  customNotes: '',
});

export const HqQuickDispatch: React.FC<HqQuickDispatchProps> = ({
  onCreateBooking,
}) => {
  // 1. Customer autocomplete & search
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Agency / Brand / Billing Target (Compact expandable)
  const [showAgencyFields, setShowAgencyFields] = useState(false);
  const [orderingAgency, setOrderingAgency] = useState('');
  const [endBrand, setEndBrand] = useState('');
  const [billingTarget, setBillingTarget] = useState<'ordering_agency' | 'end_brand'>('end_brand');

  // 2. Common schedule fields (entered once)
  const [pickupTime, setPickupTime] = useState('2026.10.26 14:00');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [groupEventTitle, setGroupEventTitle] = useState('');
  const [commonMemo, setCommonMemo] = useState('');
  const [commonLanguage, setCommonLanguage] = useState<RequestedDriverLanguage>('ko');

  // 3. Multi-vehicle & driver allocations (defaults to 1 vehicle)
  const [allocations, setAllocations] = useState<VehicleAllocationItem[]>([
    createInitialAllocation(1, 'ko'),
  ]);

  // 4. UI feedback
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  // Live store subscriptions for presets, driver language qualifications, and customers
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

  // Selected customer object
  const selectedCustomerObj = useMemo(() => {
    if (!selectedCustomerId) return null;
    return liveCustomers.find((c) => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, liveCustomers]);

  // Close customer dropdown on outside click
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

  // Filter customers matching input
  const filteredCustomerSuggestions = useMemo(() => {
    if (!customerName.trim()) {
      return liveCustomers.slice(0, 6);
    }
    const q = customerName.toLowerCase();
    return liveCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.primaryContactName || '').toLowerCase().includes(q) ||
        (c.department || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [customerName, liveCustomers]);

  // Handle selecting a customer from Customer Management Data
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
      if (customer.nextEvent?.title) {
        setGroupEventTitle(customer.nextEvent.title);
      } else {
        setGroupEventTitle(`${customer.name} VIP 의전`);
      }
    }

    // Auto-detect if customer prefers English-capable driver
    const prefersEnglish = (customer.preferences || []).some((p) => p.includes('영어'));
    if (prefersEnglish) {
      setCommonLanguage('en');
      setAllocations((prev) =>
        prev.map((a) => ({ ...a, requestedLanguage: 'en' }))
      );
    }
  };

  // Change common requested language
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

  // Add another vehicle allocation
  const handleAddVehicleAllocation = () => {
    haptics.selection();
    const nextIndex = allocations.length + 1;
    setAllocations((prev) => [
      ...prev,
      createInitialAllocation(nextIndex, commonLanguage),
    ]);
  };

  // Remove vehicle allocation
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

  // Update specific vehicle allocation
  const handleUpdateAllocation = (
    id: string,
    field: keyof VehicleAllocationItem,
    value: any
  ) => {
    setAllocations((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        // Auto-select matching vehicle if driver is selected
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

        // Auto-extract plate if vehicle is selected
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

        // Clear driver if vehicle_only is selected
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

  // Form submission (Supports single or multi-vehicle group dispatch + language verification + pricing snapshot)
  const handleSubmit = (isDraft: boolean) => {
    if (!customerName.trim() && !isDraft) {
      alert('고객명을 입력하거나 고객 관리에서 선택해 주세요.');
      return;
    }

    // Check if any vehicle requesting 'en' has a non-English driver without admin confirmation
    if (!isDraft) {
      for (const alloc of allocations) {
        if (alloc.serviceMode === 'with_driver' && alloc.requestedLanguage === 'en' && alloc.selectedDriver) {
          const cleanName = alloc.selectedDriver.replace(/\s*기사$/, '').trim();
          const drv = liveDriverProfiles.find((d) => d.name === cleanName);
          if (drv && !drv.isEnglishVerified && !alloc.languageOverrideConfirmed) {
            alert(
              `${alloc.vehicleIndex}호차: 영어 가능 기사가 요청되었으나 한국어 전용 기사(${drv.name})가 선택되었습니다.\n영어가 가능한 기사로 변경하거나 '관리자 예외 배정 확인'을 체크해 주세요.`
            );
            return;
          }
        }
      }
    }

    const totalVehicles = allocations.length;
    const isMultiVehicleGroup = totalVehicles > 1;
    const sharedEventId = `ev-${Date.now()}`;
    const sharedGroupId = isMultiVehicleGroup ? `grp-${Date.now()}` : undefined;
    const sharedGroupName =
      groupEventTitle.trim() ||
      `${customerName.trim()} ${isMultiVehicleGroup ? `VIP 단체 배차 (${totalVehicles}대)` : 'VIP 배차'}`;

    const createdBookings: Partial<HqBooking>[] = allocations.map((alloc, idx) => {
      const vehicleNum = idx + 1;
      const cleanDriverName = alloc.selectedDriver.replace(/\s*기사$/, '').trim();
      const matchedDriver = liveDriverProfiles.find(
        (d) => d.name === cleanDriverName || d.id === cleanDriverName
      );
      const matchedVehicle = VEHICLE_OPTIONS.find(
        (v) =>
          v.modelRaw === alloc.selectedVehicleModel ||
          v.modelClean === alloc.selectedVehicleModel
      );

      const resolvedPlate =
        alloc.selectedVehiclePlate ||
        matchedVehicle?.plate ||
        matchedDriver?.plate ||
        (alloc.selectedDriver ? '배정완료' : '미배정');

      const resolvedModel =
        alloc.selectedVehicleModel ||
        matchedVehicle?.modelRaw ||
        matchedDriver?.defaultVehicleRaw ||
        '-';

      // Use individual override if enabled, otherwise inherit common schedule
      const resolvedPickupTime =
        alloc.hasCustomItinerary && alloc.customPickupTime.trim()
          ? alloc.customPickupTime.slice(-5)
          : pickupTime.slice(-5) || '14:00';

      const resolvedPickupLoc =
        alloc.hasCustomItinerary && alloc.customPickupLocation.trim()
          ? alloc.customPickupLocation
          : pickupLocation || '서울 강남';

      const resolvedDest =
        alloc.hasCustomItinerary && alloc.customDestination.trim()
          ? alloc.customDestination
          : destination || '인천공항 T1';

      const combinedNotes = [
        commonMemo.trim(),
        alloc.customNotes.trim() ? `[${vehicleNum}호차 특이사항] ${alloc.customNotes.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' / ');

      // Capture immutable pricing snapshot at dispatch time using live presets & driver profiles
      const pricingSnapshot = createBookingPricingSnapshot({
        vehicleModel: resolvedModel,
        driverName: cleanDriverName,
        serviceMode: alloc.serviceMode,
        requestedLanguage: alloc.requestedLanguage,
        customer: selectedCustomerObj,
        vehiclePresets: liveVehiclePresets,
        driverProfiles: liveDriverProfiles,
      });

      return {
        id: `b-live-${Date.now()}-${vehicleNum}`,
        bookingNo: `#261028-${String(vehicleNum).padStart(3, '0')}`,
        customerName: customerName.trim() || '신규 고객 예약',
        customerId: selectedCustomerId || `cust-${Date.now()}`,
        orderingAgency: orderingAgency.trim() || undefined,
        endBrand: endBrand.trim() || customerName.trim() || undefined,
        eventId: sharedEventId,
        eventName: sharedGroupName,
        billingTarget: orderingAgency.trim() ? billingTarget : 'end_brand',
        billingTargetName:
          orderingAgency.trim() && billingTarget === 'ordering_agency'
            ? `${orderingAgency.trim()} 귀하`
            : `${customerName.trim()} 귀하`,
        pickupTime: resolvedPickupTime,
        pickupDate: '2026. 10. 26',
        pickupLocation: resolvedPickupLoc,
        destination: resolvedDest,
        driverName:
          alloc.serviceMode === 'vehicle_only'
            ? '차량만 대여'
            : cleanDriverName || alloc.selectedDriver || '-',
        driverPhone: matchedDriver?.phone,
        driverIsEnglishVerified: matchedDriver?.isEnglishVerified,
        vehicleModel: resolvedModel,
        vehiclePlate: resolvedPlate,
        dispatchStatus:
          isDraft || (!alloc.selectedDriver && alloc.serviceMode === 'with_driver')
            ? '작성 중'
            : '배차 완료',
        driverAck:
          isDraft || (!alloc.selectedDriver && alloc.serviceMode === 'with_driver')
            ? '-'
            : '미확인',
        customerBrochure: '미발송',
        notes: combinedNotes || undefined,
        isToday: true,
        isDispatchTarget: true,
        // Group linkage fields
        groupId: sharedGroupId,
        groupName: isMultiVehicleGroup ? sharedGroupName : undefined,
        groupTotalVehicles: totalVehicles,
        groupVehicleIndex: vehicleNum,
        // Language & Pricing Snapshot
        requestedLanguage: alloc.requestedLanguage,
        languageOverrideConfirmed: alloc.languageOverrideConfirmed,
        serviceMode: alloc.serviceMode,
        appliedPricingSnapshot: pricingSnapshot,
      };
    });

    // Automatically generate & sync an invoice draft (EventSettlementReport) in settlementStorage
    const fallbackCustomer: HqCustomer = selectedCustomerObj || {
      id: selectedCustomerId || `cust-${Date.now()}`,
      name: customerName.trim() || '신규 고객사',
      tier: 'VIP',
      isFavorite: false,
      primaryContactName: '전담 담당자',
      contactCountExtra: 0,
      recentSnippet: '신규 배차 생성',
      mainPhone: '010-0000-0000',
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
      eventDate: '2026. 10. 26 (월)',
      location: pickupLocation || '서울 강남',
      bookings: createdBookings as HqBooking[],
      orderingAgency: orderingAgency.trim() || undefined,
      billingTarget: orderingAgency.trim() ? billingTarget : 'end_brand',
      billingTargetName:
        orderingAgency.trim() && billingTarget === 'ordering_agency'
          ? `${orderingAgency.trim()} 귀하`
          : `${fallbackCustomer.name} 귀하`,
      status: 'draft',
    });

    haptics.successPulse();

    if (createdBookings.length === 1) {
      onCreateBooking(createdBookings[0], isDraft);
    } else {
      onCreateBooking(createdBookings, isDraft);
    }

    if (isDraft) {
      setNotificationMsg(
        isMultiVehicleGroup
          ? `총 ${totalVehicles}대 배차 초안 및 임시 단가 스냅샷이 저장되었습니다.`
          : '배차 초안 및 단가 스냅샷이 저장되었습니다.'
      );
    } else {
      setNotificationMsg(
        isMultiVehicleGroup
          ? `총 ${totalVehicles}대 배차가 발송되었습니다. 각 배정 기사님 Cockpit으로 전송되었습니다.`
          : `배차가 발송되었습니다. ${allocations[0]?.selectedDriver || '기사'} Cockpit으로 전송되었습니다.`
      );
    }

    setTimeout(() => {
      setNotificationMsg(null);
      setCustomerName('');
      setSelectedCustomerId(null);
      setOrderingAgency('');
      setEndBrand('');
      setPickupLocation('');
      setDestination('');
      setGroupEventTitle('');
      setCommonMemo('');
      setCommonLanguage('ko');
      setAllocations([createInitialAllocation(1, 'ko')]);
    }, 2800);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between select-none">
      {/* 1. Header: Icon + Title & Total Vehicle Counter */}
      <div>
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 border border-blue-100/60">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                빠른 배차 생성
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                고객·행사 연동 및 언어 매칭 통합 배차
              </p>
            </div>
          </div>

          {allocations.length > 1 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs">
              <Users className="w-3.5 h-3.5" />
              <span>총 {allocations.length}대 그룹</span>
            </span>
          )}
        </div>

        {/* 2. Unified Form Layout */}
        <div className="space-y-3.5 text-xs mt-3.5">
          {/* Row 1: 고객사 검색·연동 * | 픽업 일시 * */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Customer Search Autocomplete */}
            <div className="relative" ref={customerDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-[#1E60F3]" />
                  <span>고객사</span>
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
                  }}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  placeholder="고객사명 검색 (예: CHANEL, BMW, 신세계)"
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

              {/* Autocomplete Dropdown List from Customer Management */}
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

                          {c.nextEvent?.location && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px] shrink-0 font-medium text-right">
                              {c.nextEvent.location}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-slate-400 text-[11px]">
                      일치하는 등록 고객사가 없습니다. 직접 입력으로 진행됩니다.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Common Pickup Time */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                공통 픽업 일시 <span className="text-[#1E60F3]">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  placeholder="예: 2026.10.26 14:00"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Agency / End Brand Toggle (발주 대행사 · 최종 브랜드 · 청구처 구분) */}
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

          {/* Row 2: 공통 픽업 위치 * | 공통 목적지 * */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                공통 픽업 위치 (출발지) <span className="text-[#1E60F3]">*</span>
              </label>
              <input
                type="text"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="예: 서울 강남 / 조선팰리스"
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
                onChange={(e) => setDestination(e.target.value)}
                placeholder="예: 인천공항 T1 / 코엑스"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Row 3: 요청 기사 언어 * | 행사/프로젝트명 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Globe className="w-3 h-3 text-[#1E60F3]" />
                <span>요청 기사 언어</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg">
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
                placeholder="예: VIP 컬렉션 프리뷰 의전"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* English Request Surcharge Notice (No arbitrary surcharge) */}
          {commonLanguage === 'en' && (
            <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-2 text-[11px] text-blue-800">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">영어 가능 검증 기사 우선 매칭 활성화:</span>{' '}
                영어 서비스 자격이 검증된 기사(윤태준, 김민수, 박서연, 최영식)가 우선 표시됩니다. 고객사 영어 할증 요금은 미정이므로 임의 가산하지 않습니다.
              </div>
            </div>
          )}

          {/* Row 4: 공통 요청 메모 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700">공통 요청 메모</label>
              <span className="text-[10px] text-slate-400 font-medium">{commonMemo.length}/100</span>
            </div>
            <input
              type="text"
              maxLength={100}
              value={commonMemo}
              onChange={(e) => setCommonMemo(e.target.value)}
              placeholder="공통 준비사항 및 특이사항 입력"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 3. Section: 기사 & 차량 배정 (Multiple Allocations supported) */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>배정 차량 ({allocations.length}대)</span>
              </span>

              {/* [+ 기사·차량 추가] 버튼 */}
              <button
                type="button"
                onClick={handleAddVehicleAllocation}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border border-blue-200 text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>기사·차량 추가</span>
              </button>
            </div>

            {/* List of Allocation Cards */}
            <div className="space-y-2.5">
              {allocations.map((alloc, idx) => {
                const sortedDrivers = getSortedDriversForLanguage(
                  alloc.requestedLanguage,
                  liveDriverProfiles
                );
                const cleanSelectedDriver = alloc.selectedDriver.replace(/\s*기사$/, '').trim();
                const selectedDriverObj = liveDriverProfiles.find(
                  (d) => d.name === cleanSelectedDriver
                );
                const hasLanguageMismatch =
                  alloc.serviceMode === 'with_driver' &&
                  alloc.requestedLanguage === 'en' &&
                  selectedDriverObj &&
                  !selectedDriverObj.isEnglishVerified;

                // Live pricing preview for HQ admin
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

                return (
                  <div
                    key={alloc.id}
                    className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/80 space-y-2.5 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-[#1E60F3] text-white flex items-center justify-center text-[10px] font-black">
                          {idx + 1}
                        </span>
                        <span>
                          {idx === 0
                            ? '1호차 (메인 차량)'
                            : `${idx + 1}호차 추가 배차`}
                        </span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {/* Per-vehicle Service Mode: 기사 포함 vs 차량만 */}
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

                        {/* Per-vehicle Language selector when multiple vehicles exist */}
                        {allocations.length > 1 && (
                          <select
                            value={alloc.requestedLanguage}
                            onChange={(e) =>
                              handleUpdateAllocation(
                                alloc.id,
                                'requestedLanguage',
                                e.target.value as RequestedDriverLanguage
                              )
                            }
                            className="px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-700 cursor-pointer"
                            title="차량별 요청 언어"
                          >
                            <option value="ko">한국어</option>
                            <option value="en">영어 가능</option>
                            <option value="other">기타 언어</option>
                          </select>
                        )}

                        {allocations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVehicleAllocation(alloc.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="차량 배정 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Driver & Vehicle Selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {/* 기사 선택 (영어 가능 기사 우선 정렬) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          {alloc.serviceMode === 'vehicle_only'
                            ? '기사 배정 (차량만 대여)'
                            : alloc.requestedLanguage === 'en'
                            ? '기사 선택 (영어 가능 우선)'
                            : '기사 선택'}{' '}
                          {alloc.serviceMode === 'with_driver' && (
                            <span className="text-[#1E60F3]">*</span>
                          )}
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
                              ? '기사 미배정 (차량만 대여)'
                              : '기사 선택'}
                          </option>
                          {sortedDrivers.map(({ driver }) => (
                            <option key={driver.id} value={`${driver.name} 기사`}>
                              {driver.isEnglishVerified ? '[영어검증] ' : '[한국어] '}
                              {driver.name} 기사 ({stripManufacturerName(driver.defaultVehicleRaw)} ·{' '}
                              {driver.plate})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 차량 선택: 제조사명 제거된 모델명 중심 표시 */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          차량 선택 (모델명 중심) <span className="text-[#1E60F3]">*</span>
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
                          <option value="">차량 선택</option>
                          {VEHICLE_OPTIONS.map((v) => (
                            <option key={v.id} value={v.modelRaw}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Language Mismatch Warning & Admin Exception Confirmation */}
                    {hasLanguageMismatch && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-900 space-y-1.5">
                        <div className="flex items-start gap-1.5 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            요청 언어(영어 가능) 미충족: {selectedDriverObj?.name} 기사는 한국어 서비스 전용입니다.
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
                          <span>[관리자 확인] 요청 언어 불일치 예외 배정을 승인합니다.</span>
                        </label>
                      </div>
                    )}

                    {/* Live Preset / Contract Pricing Preview Chip (HQ Admin Only) */}
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
                              : '요금 미등록(확인필요)'}
                          </span>
                        </div>
                        <div className="text-slate-500 font-semibold">
                          인건비:{' '}
                          <strong className="text-slate-800">
                            {alloc.serviceMode === 'vehicle_only'
                              ? '₩0 (차량만)'
                              : formatKRW(previewLabor.driverLaborCost)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* 차량별 개별 일정 오버라이드 Accordion */}
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
                            <span>개별 일정 접기 (공통 일정 사용)</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            <span>+ 이 차량의 픽업 시간·위치 개별 수정</span>
                          </>
                        )}
                      </button>

                      {/* Collapsed state indicator */}
                      {!alloc.hasCustomItinerary && (
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
                          공통 일정 적용: {pickupTime.slice(-5) || '14:00'} |{' '}
                          {pickupLocation || '출발지'} → {destination || '도착지'}
                        </p>
                      )}

                      {/* Expanded custom itinerary inputs */}
                      {alloc.hasCustomItinerary && (
                        <div className="mt-2 p-2.5 bg-white rounded-lg border border-slate-200/80 space-y-2 text-xs animate-in fade-in duration-150">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                개별 픽업 시간
                              </label>
                              <input
                                type="text"
                                value={alloc.customPickupTime}
                                onChange={(e) =>
                                  handleUpdateAllocation(
                                    alloc.id,
                                    'customPickupTime',
                                    e.target.value
                                  )
                                }
                                placeholder={pickupTime.slice(-5) || '14:00'}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 text-xs font-medium"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                개별 픽업 위치
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
                                개별 목적지
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
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              차량별 탑승객 / 개별 요청
                            </label>
                            <input
                              type="text"
                              value={alloc.customNotes}
                              onChange={(e) =>
                                handleUpdateAllocation(alloc.id, 'customNotes', e.target.value)
                              }
                              placeholder="예: VIP 본인 탑승 / 수행원 3명 탑승"
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

          {/* Info Notice Box */}
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p>
              배차 발송 시 적용 단가가 스냅샷으로 보존되며, 각 기사님에게는 본인 일정만 전달됩니다. (고객사 단가 및 회사 수익 정보는 기사에게 비공개)
            </p>
          </div>
        </div>
      </div>

      {/* Success Notification Feedback */}
      {notificationMsg && (
        <div className="my-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2 text-xs font-bold text-blue-800 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-[#1E60F3] shrink-0" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* 4. Action Buttons: 임시저장 | 배차 발송 */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            handleSubmit(true);
          }}
          className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer text-center"
        >
          임시저장
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.selection();
            handleSubmit(false);
          }}
          className="py-2.5 px-4 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          <span>
            {allocations.length > 1
              ? `배차 발송 (${allocations.length}대)`
              : '배차 발송'}
          </span>
        </button>
      </div>
    </div>
  );
};
