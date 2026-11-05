'use client';

import React, { useState } from 'react';
import { ArrowRight, CarFront, Check, ChevronRight, HelpCircle, Loader2, Plus, Trash2, UserRound, X } from 'lucide-react';
import type { AvailableVehicleItem } from '@/utils/availabilityEngine';
import { VIP_REAL_VEHICLES, getVehicleImage } from '@/utils/vehicleData';
import { driverSupportsEnglish } from './HqDriverSelectModal';
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

const getKnownVehicle = (plate?: string) => VIP_REAL_VEHICLES.find((v) => v.plate === plate);
const getVerifiedVehiclePhoto = (plate?: string): string => {
  const vehicle = getKnownVehicle(plate);
  // Legacy thumbnail screenshots are not accepted as official vehicle photos.
  if (!vehicle || !vehicle.imageUrl || /\/thumb_/.test(vehicle.imageUrl)) {
    return '/images/vehicle_photo_pending.svg';
  }
  return getVehicleImage(vehicle);
};

export const HqStep5AssignmentPanel: React.FC<HqStep5AssignmentPanelProps> = ({
  slots, vehicles, loading, fleetError, language, onLanguageChange, onUpdateSlots,
  onSelectDriver, onRequestHelp, onConfirm, isDispatching,
}) => {
  const [vehiclePickerIndex, setVehiclePickerIndex] = useState<number | null>(null);
  const allAssigned = slots.length > 0 && slots.every((slot) => {
    const actualVehicle = vehicles?.find((vehicle) => vehicle.plate === slot.vehiclePlate);
    return Boolean(actualVehicle?.isAvailable && slot.driver && (language !== 'english' || driverSupportsEnglish(slot.driver)));
  });
  const chooseVehicle = (index: number, vehicle: AvailableVehicleItem) => {
    if (!vehicle.isAvailable) return;
    onUpdateSlots?.(slots.map((slot, slotIndex) => slotIndex === index
      ? { ...slot, vehiclePlate: vehicle.plate, vehicleModel: vehicle.model }
      : slot
    ));
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
    <section className="space-y-5" aria-label="차량과 기사 배정">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-900">차량과 기사님을 선택해 주세요</h3>
          <p className="mt-1 text-xs text-slate-500">실제 차량관리·기사관리 정보와 예약 가능 여부를 기준으로 배정합니다.</p>
        </div>
        <button type="button" onClick={addSlot} disabled={isDispatching || !onUpdateSlots}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" /> 차량 추가
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="mr-1 text-slate-500">기사 언어</span>
        <button type="button" onClick={() => onLanguageChange('any')}
          className={`rounded-lg px-3 py-2 font-medium transition-colors ${language === 'any' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
          무관
        </button>
        <button type="button" onClick={() => onLanguageChange('english')}
          className={`rounded-lg px-3 py-2 font-medium transition-colors ${language === 'english' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
          영어 가능
        </button>
      </div>

      <div className="space-y-3">
        {slots.map((slot, index) => {
          const realVehicle = getKnownVehicle(slot.vehiclePlate);
          const availability = vehicles?.find((vehicle) => vehicle.plate === slot.vehiclePlate);
          const driver = slot.driver;
          const languageMismatch = language === 'english' && driver && !driverSupportsEnglish(driver);
          const photo = getVerifiedVehiclePhoto(slot.vehiclePlate);

          return (
            <div key={slot.slotIndex} className="rounded-2xl bg-slate-50/70 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{index + 1}호차</span>
                {slots.length > 1 && (
                  <button type="button" onClick={() => removeSlot(index)} aria-label={`${index + 1}호차 삭제`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setVehiclePickerIndex(index)}
                  className="min-w-0 rounded-xl bg-white p-3 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-slate-400">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1.5"><CarFront className="h-4 w-4" /> 차량 선택</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                      <img src={photo} alt={realVehicle ? realVehicle.model : '차량 미선택'}
                        className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-800">{realVehicle?.modelShort || (slot.vehiclePlate ? slot.vehicleModel : '차량을 선택해 주세요')}</p>
                      <p className="mt-1 text-xs text-slate-500">{slot.vehiclePlate || '차량번호 미지정'}</p>
                      {availability && (
                        <p className="mt-1 text-[11px] text-slate-500">{availability.isAvailable ? '예약 가능' : '해당 일정 예약 불가'}</p>
                      )}
                    </div>
                  </div>
                </button>
                <button type="button" onClick={() => onSelectDriver(slot.slotIndex, language)}
                  className="min-w-0 rounded-xl bg-white p-3 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-slate-400">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1.5"><UserRound className="h-4 w-4" /> 기사님 선택</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-medium text-slate-500">
                      {driver?.avatarUrl
                        ? <img src={driver.avatarUrl} alt={driver.name} className="h-full w-full object-cover" />
                        : driver ? driver.name.slice(0, 1) : <UserRound className="h-6 w-6" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800">{driver ? `${driver.name} 기사님` : '기사님을 선택해 주세요'}</p>
                      {driver ? (
                        <>
                          <p className="mt-1 truncate text-xs text-slate-500">{driver.affiliation || '소속 미등록'}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{driverSupportsEnglish(driver) ? '한국어 · 영어 가능' : '한국어'}</p>
                          {languageMismatch && <p className="mt-1 text-[11px] text-slate-700">영어 가능 기사 선택 필요</p>}
                        </>
                      ) : <p className="mt-1 text-xs text-slate-500">기사관리 프로필에서 선택</p>}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>배정에 도움이 필요하신가요? 대표 계정에서 이어서 배정할 수 있습니다.</span>
        </div>
        <button type="button" onClick={onRequestHelp} disabled={!onRequestHelp || isDispatching}
          className="rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
          도움 요청하기
        </button>
      </div>
      {fleetError && <p role="alert" className="text-xs text-slate-600">차량 가용성 확인 실패: {fleetError}</p>}
      {loading && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 차량 가용성 확인 중</p>}
      {!allAssigned && !loading && <p className="text-center text-xs text-slate-500">모든 차량과 기사님을 지정하면 배차를 확정할 수 있습니다.</p>}
      <button type="button" onClick={onConfirm} disabled={!allAssigned || isDispatching}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1E60F3] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1855DB] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
        {isDispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {isDispatching ? '배차 저장 중...' : '배차 확정 및 알림 전송'}
      </button>

      {vehiclePickerIndex !== null && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/35 p-0 sm:items-center sm:p-5"
          onClick={(event) => { if (event.target === event.currentTarget) setVehiclePickerIndex(null); }}>
          <section role="dialog" aria-modal="true" aria-label="차량 선택"
            className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">차량 선택</h3>
                <p className="mt-1 text-xs text-slate-500">차량관리 등록 차량 · 전체 일정 가용성 기준</p>
              </div>
              <button type="button" onClick={() => setVehiclePickerIndex(null)}
                aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-5">
              {!vehicles && <p className="p-6 text-center text-sm text-slate-500">{fleetError || '차량 가용성을 조회하고 있습니다.'}</p>}
              {vehicles?.length === 0 && <p className="p-6 text-center text-sm text-slate-500">등록된 차량이 없습니다.</p>}
              {vehicles?.map((vehicle) => {
                const known = getKnownVehicle(vehicle.plate);
                const selected = slots[vehiclePickerIndex]?.vehiclePlate === vehicle.plate;
                const taken = slots.some((slot, i) => i !== vehiclePickerIndex && slot.vehiclePlate === vehicle.plate);
                return (
                  <button key={vehicle.uuid} type="button" disabled={!vehicle.isAvailable || taken}
                    onClick={() => chooseVehicle(vehiclePickerIndex, vehicle)}
                    className={`flex min-h-20 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? 'bg-slate-100' : 'hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-45`}>
                    <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                      <img src={getVerifiedVehiclePhoto(vehicle.plate)}
                        alt={vehicle.model} className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{known?.model || vehicle.model}</p>
                      <p className="mt-1 text-xs text-slate-500">{vehicle.plate} {known?.capacity ? `· ${known.capacity}` : ''}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{taken ? '다른 호차에서 선택됨' : vehicle.isAvailable ? '예약 가능' : '해당 일정 예약 불가'}</p>
                    </div>
                    {selected ? <Check className="h-5 w-5 shrink-0 text-slate-700" /> : <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </section>
  );
};
