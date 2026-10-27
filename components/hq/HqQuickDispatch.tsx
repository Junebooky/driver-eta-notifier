'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  MapPin,
  X,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';
import { VIP_REAL_VEHICLES, stripManufacturerName } from '@/utils/vehicleData';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { HqCustomer } from '@/types/customerHq';

export interface HqQuickDispatchProps {
  onCreateBooking: (
    booking: Partial<HqBooking> | Partial<HqBooking>[],
    isDraft: boolean
  ) => void;
  onOpenGroupDispatchModal?: () => void;
  onOpenLoadBookingModal?: () => void;
}

// 7 Registered Real Fleet Drivers
interface DriverOption {
  id: string;
  name: string;
  phone: string;
  defaultVehicleRaw: string;
  plate: string;
}

const DRIVER_OPTIONS: DriverOption[] = [
  { id: '윤태준', name: '윤태준 기사', phone: '010-8842-1920', defaultVehicleRaw: '현대 스타리아 리무진', plate: '116허 1514' },
  { id: '김민수', name: '김민수 기사', phone: '010-3829-4821', defaultVehicleRaw: '벤츠 S560', plate: '01호 3343' },
  { id: '이재훈', name: '이재훈 기사', phone: '010-9182-3746', defaultVehicleRaw: '기아 카니발 하이리무진', plate: '193호 5336' },
  { id: '박서연', name: '박서연 기사', phone: '010-7281-9304', defaultVehicleRaw: '제네시스 G90 리무진', plate: '102부 4280' },
  { id: '정태훈', name: '정태훈 기사', phone: '010-5542-1928', defaultVehicleRaw: '벤츠 스프린터 519 CDI', plate: '703서 2658' },
  { id: '최영식', name: '최영식 기사', phone: '010-2341-9876', defaultVehicleRaw: '벤츠 스프린터 투어러 (319 CDI)', plate: '125호 9982' },
  { id: '이준호', name: '이준호 기사', phone: '010-8831-2940', defaultVehicleRaw: '제네시스 GV80', plate: '203호 5947' },
];

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
  // Custom itinerary override for this specific vehicle
  hasCustomItinerary: boolean;
  customPickupTime: string;
  customPickupLocation: string;
  customDestination: string;
  customNotes: string;
}

const createInitialAllocation = (index: number): VehicleAllocationItem => ({
  id: `alloc-${Date.now()}-${index}`,
  vehicleIndex: index,
  selectedDriver: '',
  selectedVehicleModel: '',
  selectedVehiclePlate: '',
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

  // 2. Common schedule fields (entered once)
  const [pickupTime, setPickupTime] = useState('2026.10.26 14:00');
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [groupEventTitle, setGroupEventTitle] = useState('');
  const [commonMemo, setCommonMemo] = useState('');

  // 3. Multi-vehicle & driver allocations (defaults to 1 vehicle)
  const [allocations, setAllocations] = useState<VehicleAllocationItem[]>([
    createInitialAllocation(1),
  ]);

  // 4. UI feedback
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

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
      return INITIAL_HQ_CUSTOMERS.slice(0, 6);
    }
    const q = customerName.toLowerCase();
    return INITIAL_HQ_CUSTOMERS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.primaryContactName.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [customerName]);

  // Handle selecting a customer from Customer Management Data
  const handleSelectCustomer = (customer: HqCustomer) => {
    haptics.lightTap();
    setCustomerName(customer.name);
    setSelectedCustomerId(customer.id);
    setIsCustomerDropdownOpen(false);

    // Auto-populate pickup location if empty and next event exists
    if (!pickupLocation.trim() && customer.nextEvent?.location) {
      setPickupLocation(customer.nextEvent.location);
    }

    // Auto-populate group event title if empty and event exists
    if (!groupEventTitle.trim()) {
      if (customer.nextEvent?.title) {
        setGroupEventTitle(customer.nextEvent.title);
      } else {
        setGroupEventTitle(`${customer.name} VIP 의전`);
      }
    }
  };

  // Add another vehicle allocation
  const handleAddVehicleAllocation = () => {
    haptics.selection();
    const nextIndex = allocations.length + 1;
    setAllocations((prev) => [...prev, createInitialAllocation(nextIndex)]);
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
          const drv = DRIVER_OPTIONS.find((d) => d.name === value || d.id === value);
          if (drv) {
            return {
              ...item,
              selectedDriver: drv.name,
              selectedVehicleModel: drv.defaultVehicleRaw,
              selectedVehiclePlate: drv.plate,
            };
          }
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

        return { ...item, [field]: value };
      })
    );
  };

  // Form submission (Supports single or multi-vehicle group dispatch)
  const handleSubmit = (isDraft: boolean) => {
    if (!customerName.trim() && !isDraft) {
      alert('고객명을 입력하거나 고객 관리에서 선택해 주세요.');
      return;
    }

    const totalVehicles = allocations.length;
    const isMultiVehicleGroup = totalVehicles > 1;
    const sharedGroupId = isMultiVehicleGroup ? `grp-${Date.now()}` : undefined;
    const sharedGroupName =
      groupEventTitle.trim() ||
      `${customerName.trim()} ${isMultiVehicleGroup ? `VIP 단체 배차 (${totalVehicles}대)` : 'VIP 배차'}`;

    const createdBookings: Partial<HqBooking>[] = allocations.map((alloc, idx) => {
      const vehicleNum = idx + 1;
      const matchedDriver = DRIVER_OPTIONS.find(
        (d) => d.name === alloc.selectedDriver || d.id === alloc.selectedDriver
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

      return {
        customerName: customerName.trim() || '신규 고객 예약',
        customerId: selectedCustomerId || undefined,
        pickupTime: resolvedPickupTime,
        pickupDate: '2026. 10. 26',
        pickupLocation: resolvedPickupLoc,
        destination: resolvedDest,
        driverName: alloc.selectedDriver || '-',
        driverPhone: matchedDriver?.phone,
        vehicleModel: resolvedModel,
        vehiclePlate: resolvedPlate,
        dispatchStatus: isDraft || !alloc.selectedDriver ? '작성 중' : '배차 완료',
        driverAck: isDraft || !alloc.selectedDriver ? '-' : '미확인',
        customerBrochure: '미발송',
        notes: combinedNotes || undefined,
        isToday: true,
        isDispatchTarget: true,
        // Group linkage fields
        groupId: sharedGroupId,
        groupName: isMultiVehicleGroup ? sharedGroupName : undefined,
        groupTotalVehicles: totalVehicles,
        groupVehicleIndex: vehicleNum,
      };
    });

    haptics.successPulse();

    // Call create handler (supports single or array)
    if (createdBookings.length === 1) {
      onCreateBooking(createdBookings[0], isDraft);
    } else {
      onCreateBooking(createdBookings, isDraft);
    }

    if (isDraft) {
      setNotificationMsg(
        isMultiVehicleGroup
          ? `총 ${totalVehicles}대 배차 초안이 임시저장되었습니다.`
          : '배차 초안이 임시저장되었습니다.'
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
      setPickupLocation('');
      setDestination('');
      setGroupEventTitle('');
      setCommonMemo('');
      setAllocations([createInitialAllocation(1)]);
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
                단일 및 다중 차량 그룹 통합 배차
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

          {/* Row 3: 행사/그룹명 (선택) & 공통 메모 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              {allocations.map((alloc, idx) => (
                <div
                  key={alloc.id}
                  className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/80 space-y-2.5 transition-all"
                >
                  <div className="flex items-center justify-between">
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

                  {/* Driver & Vehicle Selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {/* 기사 선택 */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        기사 선택 <span className="text-[#1E60F3]">*</span>
                      </label>
                      <select
                        value={alloc.selectedDriver}
                        onChange={(e) =>
                          handleUpdateAllocation(alloc.id, 'selectedDriver', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="">기사 선택</option>
                        {DRIVER_OPTIONS.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name} ({stripManufacturerName(d.defaultVehicleRaw)} · {d.plate})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 차량 선택: 제조사명 제거된 모델명 중심 표시 (Requirement 3 ②) */}
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

                  {/* 차량별 개별 일정 오버라이드 Accordion */}
                  <div className="pt-1">
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
              ))}
            </div>
          </div>

          {/* Info Notice Box */}
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p>
              배차 발송 시 각 기사님에게 본인 배정 일정만 Cockpit으로 개별 전달되며, 본사 관리자 화면에서는 하나의 그룹으로 묶여 통합 관리됩니다.
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
