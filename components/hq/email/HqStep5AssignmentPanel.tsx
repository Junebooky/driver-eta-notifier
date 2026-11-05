'use client';

import React, { useState } from 'react';
import { CarFront, Check, ChevronRight, CircleHelp, Loader2, Plus, Trash2, UserRound } from 'lucide-react';
import type { AvailableVehicleItem } from '@/utils/availabilityEngine';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import { driverSupportsEnglish } from './HqDriverSelectModal';
import { getVerifiedVehiclePhoto, HqVehicleSelectModal } from './HqVehicleSelectModal';
import type { VehicleSlotAssignment } from './HqStep2BookingDetailView';

interface HqStep5AssignmentPanelProps {
  slots: VehicleSlotAssignment[];
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
  slots, vehicles, loading, fleetError, language, onLanguageChange, onUpdateSlots,
  onSelectDriver, onRequestHelp, onConfirm, isDispatching,
}) => {
  const [vehiclePickerIndex, setVehiclePickerIndex] = useState<number | null>(null);
  const selectedDriverIds = slots.map((slot) => slot.driver?.id).filter((id): id is string => Boolean(id));
  const uniqueDrivers = new Set(selectedDriverIds).size === selectedDriverIds.length;
  const allAssigned = !loading && !fleetError && uniqueDrivers && slots.length > 0 && slots.every((slot) => {
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
          <h3 className="text-[16px] font-semibold tracking-tight text-slate-900">차량과 기사님을 선택해 주세요</h3>
          <p className="mt-1 text-xs font-normal text-slate-500">
            실제 차량관리·기사관리 정보와 일정별 예약 가능 여부를 기준으로 배정합니다.
          </p>
        </div>
        <button type="button" onClick={addSlot} disabled={isDispatching || !onUpdateSlots}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40">
          <Plus className="h-4 w-4 text-slate-400" strokeWidth={1.8} /> 차량 추가
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="mr-1 font-normal text-slate-500">기사 언어</span>
        {([
          { value: 'any' as const, label: '무관' },
          { value: 'english' as const, label: '영어 가능' },
        ]).map((item) => (
          <button key={item.value} type="button" aria-pressed={language === item.value}
            onClick={() => onLanguageChange(item.value)}
            className={`rounded-full px-3.5 py-2 font-medium transition-colors ${language === item.value
              ? 'bg-slate-200/70 text-slate-800'
              : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
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
          const sharedCard = 'group min-w-0 w-full rounded-xl bg-white p-3.5 text-left transition-colors hover:bg-slate-100/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-300 sm:p-4';
          return (
            <div key={slot.slotIndex} className="rounded-2xl bg-slate-50/70 p-3.5 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <span className="text-[13px] font-semibold text-slate-800">{index + 1}호차</span>
                {slots.length > 1 && (
                  <button type="button" onClick={() => removeSlot(index)} aria-label={`${index + 1}호차 삭제`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600">
                    <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button type="button" disabled={isDispatching} onClick={() => setVehiclePickerIndex(index)} className={`${sharedCard} disabled:cursor-not-allowed disabled:opacity-60`}>
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <CarFront className="h-4 w-4 text-slate-400" strokeWidth={1.7} /> 차량 선택
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" strokeWidth={1.7} />
                  </div>
                  <div className="mt-3 flex min-h-[66px] items-center gap-3">
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                      {slot.vehiclePlate ? (
                        <img src={getVerifiedVehiclePhoto(slot.vehiclePlate)}
                          alt={realVehicle?.model || slot.vehicleModel} className="h-full w-full object-contain" />
                      ) : (
                        <CarFront className="h-7 w-7 text-slate-300" strokeWidth={1.4} aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-800">
                        {realVehicle?.modelShort || (slot.vehiclePlate ? slot.vehicleModel : '차량을 선택해 주세요')}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{slot.vehiclePlate || '차량관리에서 선택'}</p>
                      {slot.vehiclePlate && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {loading ? '가용성 확인 중' : availability?.isAvailable ? '예약 가능' : availability ? '해당 일정 예약 불가' : '가용성 확인 필요'}
                        </p>
                      )}
                    </div>
                  </div>
                </button>

                <button type="button" disabled={isDispatching} onClick={() => onSelectDriver(slot.slotIndex, language)} className={`${sharedCard} disabled:cursor-not-allowed disabled:opacity-60`}>
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.7} /> 기사님 선택
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" strokeWidth={1.7} />
                  </div>
                  <div className="mt-3 flex min-h-[66px] items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50">
                      {driver?.avatarUrl ? (
                        <img src={driver.avatarUrl} alt={driver.name} className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-6 w-6 text-slate-300" strokeWidth={1.4} aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-800">
                        {driver ? `${driver.name} 기사님` : '기사님을 선택해 주세요'}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {driver ? driver.affiliation || '소속 미등록' : '기사관리에서 선택'}
                      </p>
                      {driver && (
                        <p className="mt-1 text-[11px] text-slate-500">
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

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CircleHelp className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.7} />
          <span>배정이 어렵다면 대표 계정에 요청할 수 있어요.</span>
        </div>
        <button type="button" onClick={onRequestHelp} disabled={!onRequestHelp || isDispatching}
          className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40">
          도움 요청하기
        </button>
      </div>

      {fleetError && <p role="alert" className="px-1 text-xs text-slate-500">차량 가용성 확인 실패: {fleetError}</p>}
      {loading && <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> 차량 가용성 확인 중
      </p>}
      {!allAssigned && !loading && !fleetError && (
        <p className="text-center text-xs text-slate-500">차량과 기사님을 모두 지정하면 배차를 확정할 수 있습니다.</p>
      )}
      <button type="button" onClick={onConfirm} disabled={!allAssigned || isDispatching}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1E60F3] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1855DB] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
        {isDispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={1.9} />}
        {isDispatching ? '배차 저장 중...' : '배차 확정 및 알림 전송'}
      </button>

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
