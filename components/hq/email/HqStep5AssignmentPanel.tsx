'use client';

import React, { useState } from 'react';
import { CarFront, Check, ChevronRight, CircleHelp, Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import type { AvailableVehicleItem } from '@/utils/availabilityEngine';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { getUnconfirmedEmailRouteStops } from '@/utils/emailRoutePlaceVerification';
import { HqRoutePlaceVerification } from './HqRoutePlaceVerification';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import { driverSupportsEnglish } from './HqDriverSelectModal';
import { getVerifiedVehiclePhoto, HqVehicleSelectModal } from './HqVehicleSelectModal';
import type { VehicleSlotAssignment } from './HqStep2BookingDetailView';

interface HqStep5AssignmentPanelProps {
  slots: VehicleSlotAssignment[];
  draft?: HqEmailExtractedDraft | null;
  onUpdateDraft?: (draft: HqEmailExtractedDraft) => void;
  vehicles?: AvailableVehicleItem[];
  loading: boolean;
  fleetError?: string;
  language: 'any' | 'english';
  onLanguageChange: (value: 'any' | 'english') => void;
  onUpdateSlots?: (slots: VehicleSlotAssignment[]) => void;
  onSelectDriver: (index: number, language: 'any' | 'english') => void;
  onRequestHelp?: () => void;
  onConfirm: () => void;
  isDispatching: boolean;
}

const findVehicle = (plate?: string) =>
  VIP_REAL_VEHICLES.find((item) => item.plate.replace(/\s/g, '') === plate?.replace(/\s/g, ''));

export const HqStep5AssignmentPanel: React.FC<HqStep5AssignmentPanelProps> = ({
  slots, draft, onUpdateDraft, vehicles, loading, fleetError, language, onLanguageChange, onUpdateSlots,
  onSelectDriver, onRequestHelp, onConfirm, isDispatching,
}) => {
  const [vehiclePickerIndex, setVehiclePickerIndex] = useState<number | null>(null);
  const selectedDriverIds = slots.map((slot) => slot.driver?.id).filter((id): id is string => Boolean(id));
  const uniqueDrivers = new Set(selectedDriverIds).size === selectedDriverIds.length;
  const unconfirmedStops = draft ? getUnconfirmedEmailRouteStops(draft) : [];
  const allPlacesConfirmed = Boolean(draft) && unconfirmedStops.length === 0;
  const allAssigned = allPlacesConfirmed && !loading && !fleetError && uniqueDrivers && slots.length > 0 && slots.every((slot) => {
    const vehicle = vehicles?.find((item) => item.plate === slot.vehiclePlate);
    return Boolean(vehicle?.isAvailable && slot.driver && (language !== 'english' || driverSupportsEnglish(slot.driver)));
  });
  const chooseVehicle = (index: number, vehicle: AvailableVehicleItem) => {
    if (!vehicle.isAvailable || !onUpdateSlots ||
      slots.some((slot, i) => i !== index && slot.vehiclePlate === vehicle.plate)) return;
    onUpdateSlots(slots.map((slot, i) => {
      if (i !== index || slot.vehiclePlate === vehicle.plate) return slot;
      // Revalidate the driver explicitly whenever the assigned vehicle changes.
      return { ...slot, vehiclePlate: vehicle.plate, vehicleModel: vehicle.model, driver: null, status: 'unassigned' };
    }));
    setVehiclePickerIndex(null);
  };
  const addSlot = () => onUpdateSlots?.([
    ...slots,
    { slotIndex: slots.length, vehicleModel: '차량 미지정', driver: null, status: 'unassigned' },
  ]);
  const removeSlot = (index: number) => {
    if (slots.length < 2) return;
    onUpdateSlots?.(slots.filter((_, i) => i !== index).map((slot, slotIndex) => ({ ...slot, slotIndex })));
  };

  return (
    <section className="space-y-5" aria-label="차량과 기사님 배정">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black tracking-tight text-slate-900">차량과 기사님을 선택해 주세요</h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            실제 차량관리·기사관리 정보와 일정별 예약 가능 여부를 기준으로 배정합니다.
          </p>
        </div>
        <button type="button" onClick={addSlot} disabled={isDispatching || !onUpdateSlots}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#1E60F3] hover:underline transition-colors cursor-pointer disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> 차량 추가
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="mr-1 text-xs font-medium text-slate-500">기사 언어</span>
        {([
          { value: 'any' as const, label: '무관' },
          { value: 'english' as const, label: '영어 가능' },
        ]).map((item) => (
          <button key={item.value} type="button" aria-pressed={language === item.value}
            onClick={() => onLanguageChange(item.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${language === item.value
              ? 'bg-[#1E60F3] text-white shadow-2xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {slots.map((slot, index) => {
          const realVehicle = findVehicle(slot.vehiclePlate);
          const availability = vehicles?.find((item) => item.plate === slot.vehiclePlate);
          const driver = slot.driver;
          const languageMismatch = Boolean(language === 'english' && driver && !driverSupportsEnglish(driver));
          const cardClass = 'group min-w-0 w-full rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-4 text-left transition-all hover:border-blue-200 hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[115px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-300';
          return (
            <div key={slot.slotIndex} className="rounded-2xl sm:rounded-3xl bg-slate-50/70 p-4 sm:p-5 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-sm font-black text-slate-900">{index + 1}호차</span>
                {slots.length > 1 && (
                  <button type="button" onClick={() => removeSlot(index)} aria-label={`${index + 1}호차 삭제`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600 cursor-pointer">
                    <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button type="button" disabled={isDispatching} onClick={() => setVehiclePickerIndex(index)} className={`${cardClass} disabled:cursor-not-allowed disabled:opacity-60`}>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      차량 선택
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50/80 border border-blue-100 text-[#1E60F3]">
                      {slot.vehiclePlate ? (
                        <img src={getVerifiedVehiclePhoto(slot.vehiclePlate)}
                          alt={realVehicle?.model || slot.vehicleModel} className="h-full w-full object-contain" />
                      ) : (
                        <img
                          src="/images/icons/vehicles/icon_vehicle.png"
                          alt="차량"
                          className="h-7 w-7 object-contain"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {realVehicle?.modelShort || (slot.vehiclePlate ? slot.vehicleModel : '차량을 선택해 주세요')}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-medium text-slate-400">{slot.vehiclePlate || '차량관리에서 선택'}</p>
                      {slot.vehiclePlate && (
                        <p className={`mt-0.5 text-[11px] font-bold ${availability?.isAvailable ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {loading ? '가용성 확인 중' : availability?.isAvailable ? '예약 가능' : availability ? '해당 일정 예약 불가' : '가용성 확인 필요'}
                        </p>
                      )}
                    </div>
                  </div>
                </button>

                <button type="button" disabled={isDispatching} onClick={() => onSelectDriver(slot.slotIndex, language)} className={`${cardClass} disabled:cursor-not-allowed disabled:opacity-60`}>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-800">
                    <span className="inline-flex items-center gap-1.5">
                      기사님 선택
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50/80 border border-blue-100 text-[#1E60F3]">
                      {driver?.avatarUrl ? (
                        <img src={driver.avatarUrl} alt={driver.name} className="h-full w-full object-cover" />
                      ) : (
                        <img
                          src="/images/icons/drivers/icon_driver.png"
                          alt="기사님"
                          className="h-7 w-7 object-contain"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {driver ? `${driver.name} 기사님` : '기사님을 선택해 주세요'}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-medium text-slate-400">
                        {driver ? driver.affiliation || '소속 미등록' : '기사관리에서 선택'}
                      </p>
                      {driver && (
                        <p className="mt-0.5 text-[11px] font-bold text-blue-600">
                          {languageMismatch ? '영어 가능 기사 재선택 필요' :
                            driverSupportsEnglish(driver) ? '한국어 · 영어 가능' : '한국어'}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {draft && <HqRoutePlaceVerification draft={draft} onUpdateDraft={onUpdateDraft} disabled={isDispatching} />}

      <div className="flex items-center justify-between px-1 py-1 text-xs">
        <div className="flex items-center gap-2 text-slate-500 font-medium">
          <CircleHelp className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.7} />
          <span>배정이 어렵다면 대표 계정에 요청할 수 있어요.</span>
        </div>
        <button type="button" onClick={onRequestHelp} disabled={!onRequestHelp || isDispatching}
          className="font-bold text-[#1E60F3] hover:underline transition-colors cursor-pointer disabled:opacity-40">
          도움 요청하기
        </button>
      </div>

      {fleetError && <p role="alert" className="px-1 text-xs text-rose-600 font-bold">차량 가용성 확인 실패: {fleetError}</p>}
      {loading && <p className="flex items-center gap-2 px-1 text-xs text-slate-500 font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> 차량 가용성 확인 중
      </p>}
      <div className="space-y-2 pt-1">
        <p className="text-center text-xs text-slate-500 font-medium">
          {unconfirmedStops.length > 0
            ? `위 운행 경로에서 미확정 장소 ${unconfirmedStops.length}곳의 TMAP 주소를 먼저 확인해 주세요.`
            : '차량과 기사님을 모두 지정하면 배차를 확정할 수 있습니다.'}
        </p>
        <button type="button" onClick={onConfirm} disabled={!allAssigned || isDispatching}
          className="w-full py-3.5 sm:py-4 rounded-2xl bg-[#1E60F3] hover:bg-blue-600 active:scale-98 text-white text-sm font-bold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none">
          {isDispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[2.5]" />}
          <span>{isDispatching ? '배차 저장 중...' : '배차 확정 및 알림 전송'}</span>
        </button>
      </div>

      <HqVehicleSelectModal
        isOpen={vehiclePickerIndex !== null && !isDispatching}
        onClose={() => setVehiclePickerIndex(null)}
        vehicles={vehicles}
        loading={loading}
        error={fleetError}
        slotNumber={(vehiclePickerIndex ?? 0) + 1}
        selectedPlate={vehiclePickerIndex !== null ? slots[vehiclePickerIndex]?.vehiclePlate : undefined}
        excludedPlates={slots.filter((_, i) => i !== vehiclePickerIndex).map((slot) => slot.vehiclePlate).filter((plate): plate is string => Boolean(plate))}
        onSelect={(vehicle) => { if (vehiclePickerIndex !== null) chooseVehicle(vehiclePickerIndex, vehicle); }}
      />
    </section>
  );
};
