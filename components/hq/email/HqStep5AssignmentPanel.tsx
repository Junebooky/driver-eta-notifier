'use client';

import React, { useState } from 'react';
import { Check, ChevronRight, CircleHelp, Loader2, Plus, Trash2 } from 'lucide-react';
import type { AvailableVehicleItem } from '@/utils/availabilityEngine';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { getUnconfirmedEmailRouteStops } from '@/utils/emailRoutePlaceVerification';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import { driverSupportsEnglish } from './HqDriverSelectModal';
import { emailFlightAssignmentIssues } from '@/utils/emailDispatchPlan';
import { HqFlightAssignmentSection } from './HqFlightAssignmentSection';
import { getVerifiedVehiclePhoto, HqVehicleSelectModal } from './HqVehicleSelectModal';
import { HqBadge, HqButton, HqCard, HqIconButton, HqSegmentedTabs } from '@/components/hq/ui';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import type { VehicleSlotAssignment } from './HqStep2BookingDetailView';

interface HqStep5AssignmentPanelProps {
  slots: VehicleSlotAssignment[];
  draft?: HqEmailExtractedDraft | null;
  onUpdateDraft?: (draft: HqEmailExtractedDraft) => void;
  vehicles?: AvailableVehicleItem[];
  loading: boolean;
  fleetError?: string;
  fleetNotice?: string;
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
  slots, draft, onUpdateDraft, vehicles, loading, fleetError, fleetNotice, language, onLanguageChange, onUpdateSlots,
  onSelectDriver, onRequestHelp, onConfirm, isDispatching,
}) => {
  const [vehiclePickerIndex, setVehiclePickerIndex] = useState<number | null>(null);
  const selectedDriverIds = slots.map((slot) => slot.driver?.id).filter((id): id is string => Boolean(id));
  const uniqueDrivers = new Set(selectedDriverIds).size === selectedDriverIds.length;
  const unconfirmedStops = draft ? getUnconfirmedEmailRouteStops(draft) : [];
  const allPlacesConfirmed = Boolean(draft) && unconfirmedStops.length === 0;
  const flightIssues = draft ? emailFlightAssignmentIssues(draft, slots) : [];
  const allAssigned = flightIssues.length === 0 && allPlacesConfirmed && !loading && !fleetError && uniqueDrivers && slots.length > 0 && slots.every((slot) => {
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
    <section className="space-y-4" aria-label="차량과 기사님 배정">
      <HqCard className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] sm:text-base font-black tracking-tight text-[#17233B]">차량과 기사님을 선택해 주세요</h3>
            <p className="mt-0.5 text-xs font-medium text-[#61728A]">
              실제 차량관리·기사관리 정보와 일정별 예약 가능 여부를 기준으로 배정합니다.
            </p>
          </div>
          <HqButton
            variant="subtle"
            size="sm"
            onClick={addSlot}
            disabled={isDispatching || !onUpdateSlots}
            className="text-[#1E60F3]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
            <span>차량 추가</span>
          </HqButton>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#61728A]">기사 언어 조건</span>
          <HqSegmentedTabs
            aria-label="기사 언어 조건"
            value={language}
            onValueChange={(value) => onLanguageChange(value as 'any' | 'english')}
            tabs={[
              { id: 'any', label: '무관' },
              { id: 'english', label: '영어 가능' },
            ]}
          />
        </div>

        <div className="space-y-3">
          {slots.map((slot, index) => {
            const realVehicle = findVehicle(slot.vehiclePlate);
            const availability = vehicles?.find((item) => item.plate === slot.vehiclePlate);
            const driver = slot.driver;
            const languageMismatch = Boolean(language === 'english' && driver && !driverSupportsEnglish(driver));
            const pickerClass =
              'group min-w-0 w-full rounded-[18px] bg-[#FAFBFD] border border-[#E1E7F0]/80 p-3.5 sm:p-4 text-left transition-all hover:bg-white hover:border-[#1E60F3]/35 hover:shadow-[0_6px_18px_rgba(30,96,243,0.08)] cursor-pointer flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/35';

            return (
              <div key={slot.slotIndex} className="space-y-2">
                {slots.length > 1 && (
                  <div className="flex items-center justify-between gap-3 px-1">
                    <HqBadge tone="neutral">{index + 1}호차</HqBadge>
                    <HqIconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSlot(index)}
                      aria-label={`${index + 1}호차 삭제`}
                    >
                      <Trash2 className="h-4 w-4 text-[#73839D]" strokeWidth={1.7} />
                    </HqIconButton>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={isDispatching}
                    onClick={() => setVehiclePickerIndex(index)}
                    className={`${pickerClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-13 w-13 sm:h-14 sm:w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#EEF3FF] border border-[#DCE6FF] text-[#1E60F3]">
                        {slot.vehiclePlate ? (
                          <img
                            src={getVerifiedVehiclePhoto(slot.vehiclePlate)}
                            alt={realVehicle?.model || slot.vehicleModel}
                            className="h-full w-full object-contain p-1"
                          />
                        ) : (
                          <img
                            src="/images/icons/vehicles/icon_vehicle.png"
                            alt="차량"
                            className="h-7 w-7 sm:h-8 sm:w-8 object-contain"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-[14px] sm:text-[15px] font-bold text-[#17233B] tracking-tight">
                          {realVehicle?.modelShort || (slot.vehiclePlate ? slot.vehicleModel : '차량을 선택해 주세요')}
                        </p>
                        <p className="truncate text-xs font-medium text-[#73839D]">{slot.vehiclePlate || '차량관리에서 선택'}</p>
                        {slot.vehiclePlate && (
                          <div className="pt-0.5">
                            <HqBadge tone={availability?.isAvailable ? 'selected' : availability ? 'warning' : 'neutral'}>
                              {loading ? '가용성 확인 중' : availability?.isAvailable ? '예약 가능' : availability ? '해당 일정 예약 불가' : '가용성 확인 필요'}
                            </HqBadge>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4.5 w-4.5 text-[#8FA0B8] transition-transform group-hover:translate-x-0.5 shrink-0" strokeWidth={1.8} />
                  </button>

                  <button
                    type="button"
                    disabled={isDispatching}
                    onClick={() => onSelectDriver(slot.slotIndex, language)}
                    className={`${pickerClass} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-13 w-13 sm:h-14 sm:w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#EEF3FF] border border-[#DCE6FF] text-[#1E60F3]">
                        {driver?.avatarUrl ? (
                          <img src={driver.avatarUrl} alt={driver.name} className="h-full w-full object-cover" />
                        ) : (
                          <img
                            src="/images/icons/drivers/icon_driver.png"
                            alt="기사님"
                            className="h-7 w-7 sm:h-8 sm:w-8 object-contain"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-[14px] sm:text-[15px] font-bold text-[#17233B] tracking-tight">
                          {driver ? `${driver.name} 기사님` : '기사님을 선택해 주세요'}
                        </p>
                        <p className="truncate text-xs font-medium text-[#73839D]">
                          {driver ? driver.affiliation || '소속 미등록' : '기사관리에서 선택'}
                        </p>
                        {driver && (
                          <div className="pt-0.5">
                            <HqBadge tone={languageMismatch ? 'critical' : 'selected'}>
                              {languageMismatch ? '영어 가능 기사 재선택 필요' :
                                driverSupportsEnglish(driver) ? '한국어 · 영어 가능' : '한국어'}
                            </HqBadge>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4.5 w-4.5 text-[#8FA0B8] transition-transform group-hover:translate-x-0.5 shrink-0" strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-[#FAFBFD] px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-[#61728A] font-medium">
            <CircleHelp className="h-4 w-4 shrink-0 text-[#8FA0B8]" strokeWidth={1.7} />
            <span>배정이 어렵다면 대표 계정에 요청할 수 있어요.</span>
          </div>
          <HqButton
            variant="ghost"
            size="sm"
            onClick={onRequestHelp}
            disabled={!onRequestHelp || isDispatching}
            className="min-h-8 px-2.5 text-[#1E60F3]"
          >
            도움 요청하기
          </HqButton>
        </div>

        {!fleetError && fleetNotice && <HqInlineFeedback message={fleetNotice} tone="info" />}
        {fleetError && <HqInlineFeedback message={`차량 가용성 확인 실패: ${fleetError}`} tone="error" />}
        {loading && (
          <p className="flex items-center gap-2 px-1 text-xs text-[#61728A] font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-[#1E60F3]" /> 차량 가용성 확인 중
          </p>
        )}

        <div className="space-y-2.5 pt-1">
          {unconfirmedStops.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[13px] bg-[#FFF9F1] px-3.5 py-2.5 text-xs text-[#8E633F]">
              <span className="font-medium">
                미확정 장소 {unconfirmedStops.length}곳의 TMAP 주소를 먼저 확정해 주세요.
              </span>
              <a
                href="#email-route-place-verification"
                className="font-bold text-[#1E60F3] underline underline-offset-2 shrink-0"
              >
                아래 운행 경로에서 확인
              </a>
            </div>
          ) : (
            <p className="text-center text-xs text-[#73839D] font-medium">
              차량과 기사님을 모두 지정하면 배차를 확정할 수 있습니다.
            </p>
          )}
          <HqButton
            variant="primary"
            size="lg"
            loading={isDispatching}
            disabled={!allAssigned || isDispatching}
            onClick={onConfirm}
            className="w-full"
          >
            {isDispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[2.5]" />}
            <span>{isDispatching ? '배차 저장 중...' : '배차 확정 및 알림 전송'}</span>
          </HqButton>
        </div>
      </HqCard>

      {draft && (
        <HqFlightAssignmentSection
          draft={draft}
          slots={slots}
          onUpdateSlots={onUpdateSlots}
          onUpdateDraft={onUpdateDraft}
          disabled={isDispatching}
        />
      )}

      <HqVehicleSelectModal
        isOpen={vehiclePickerIndex !== null && !isDispatching}
        onClose={() => setVehiclePickerIndex(null)}
        vehicles={vehicles}
        loading={loading}
        error={fleetError}
        notice={!fleetError ? fleetNotice : undefined}
        slotNumber={(vehiclePickerIndex ?? 0) + 1}
        selectedPlate={vehiclePickerIndex !== null ? slots[vehiclePickerIndex]?.vehiclePlate : undefined}
        excludedPlates={slots.filter((_, i) => i !== vehiclePickerIndex).map((slot) => slot.vehiclePlate).filter((plate): plate is string => Boolean(plate))}
        onSelect={(vehicle) => { if (vehiclePickerIndex !== null) chooseVehicle(vehiclePickerIndex, vehicle); }}
      />
    </section>
  );
};
