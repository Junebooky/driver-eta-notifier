'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CarFront, Check, Search } from 'lucide-react';
import type { AvailableVehicleItem } from '@/utils/availabilityEngine';
import { VIP_REAL_VEHICLES, getVehicleImage } from '@/utils/vehicleData';
import { useHqFleetRegistry } from '@/hooks/useHqFleetRegistry';
import { emailVehicleChoices } from '@/utils/emailWorkflowReview';
import { HqButton, HqInput, HqSegmentedTabs } from '@/components/hq/ui';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';

const normalized = (value?: string | null) => (value || '').normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();
export const getVerifiedVehiclePhoto = (plate?: string): string => {
  const vehicle = VIP_REAL_VEHICLES.find((item) => normalized(item.plate) === normalized(plate));
  return vehicle?.imageUrl && !/\/thumb_|\/car_phone_|\/car_g90|\/car_sprinter/i.test(vehicle.imageUrl)
    ? getVehicleImage(vehicle) : '/images/vehicle_photo_pending.svg';
};
const FILTERS = [
  { id: 'all', label: '전체' }, { id: 'sedan', label: '세단' }, { id: 'suv', label: 'SUV' },
  { id: 'van', label: '밴' }, { id: 'sprinter', label: '스프린터' },
];
export interface HqVehicleSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles?: AvailableVehicleItem[];
  loading: boolean;
  error?: string;
  slotNumber: number;
  selectedPlate?: string;
  excludedPlates?: string[];
  onSelect: (vehicle: AvailableVehicleItem) => void;
}

const VehiclePickerContent: React.FC<HqVehicleSelectModalProps> = ({
  isOpen, onClose, vehicles, loading, error, slotNumber, selectedPlate, excludedPlates = [], onSelect,
}) => {
  const registry = useHqFleetRegistry(isOpen);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [availableOnly, setAvailableOnly] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const close = useCallback(() => onCloseRef.current(), []);
  useEffect(() => {
    if (!isOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; };
  }, [isOpen]);
  const pendingReason = error || (loading ? '일정별 가용성 확인 중' : '시작·종료 날짜와 시간을 먼저 확인해 주세요.');
  const choices = useMemo(() => emailVehicleChoices(registry.vehicles, error || loading ? undefined : vehicles, pendingReason), [registry.vehicles, vehicles, error, loading, pendingReason]);
  const filtered = useMemo(() => choices.filter(vehicle => {
    const reserved = excludedPlates.some(plate => normalized(plate) === normalized(vehicle.plate));
    if (category !== 'all' && vehicle.uiCategory !== category) return false;
    if (availableOnly && (!vehicle.isAvailable || reserved)) return false;
    const known = registry.vehicles.find(item => item.uuid === vehicle.uuid);
    return !query || [vehicle.model, vehicle.plate, vehicle.capacity, known?.modelShort, known?.plateShort, known?.categoryLabel]
      .some(word => normalized(word).includes(normalized(query)));
  }), [choices, category, availableOnly, query, excludedPlates, registry.vehicles]);
  return <HqModal isOpen={isOpen} onClose={close} title="차량 선택" subtitle={`${slotNumber}호차 · 차량관리 등록부`}
    className="max-w-lg" footer={<p className="w-full text-center text-xs text-[#73839D]">등록된 실차만 표시 · 일정 확인 후 배정할 수 있습니다.</p>}>
    <div className="space-y-4">
      <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400"/>
        <HqInput type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="차량 검색" placeholder="차종, 차량번호 검색" className="w-full" style={{ paddingLeft: 40 }} />
      </div>
      <HqSegmentedTabs tabs={FILTERS} value={category} onValueChange={setCategory} aria-label="차종 필터" />
      <div className="flex items-center justify-between gap-3 text-xs text-[#61728A]">
        <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={availableOnly} onChange={event => setAvailableOnly(event.target.checked)}/>예약 가능한 차량만</label>
        <span aria-live="polite">{filtered.length}대</span>
      </div>
      <HqInlineFeedback message={registry.error || error || (!vehicles && !loading ? pendingReason : null)} tone={registry.error || error ? 'error' : 'info'}/>
      {registry.loading && <p role="status" className="text-xs text-[#73839D]">차량 등록부를 불러오고 있습니다.</p>}
      <div className="space-y-2" aria-label="차량 목록">
        {filtered.map(vehicle => {
          const selected = normalized(vehicle.plate) === normalized(selectedPlate);
          const reserved = excludedPlates.some(plate => normalized(plate) === normalized(vehicle.plate));
          const canChoose = vehicle.isAvailable && !reserved && !loading && !registry.loading && !registry.error && !error;
          return <button key={vehicle.uuid || vehicle.plate} type="button" disabled={!canChoose} aria-pressed={selected}
            onClick={() => { if (canChoose) onSelect(vehicle); }}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl p-3.5 text-left transition-colors disabled:cursor-not-allowed ${selected ? 'bg-[#EEF3FF]' : 'bg-white shadow-[var(--hq-shadow-control)] hover:bg-[#F7F9FC]'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <img src={getVerifiedVehiclePhoto(vehicle.plate)} alt="" className="h-12 w-14 shrink-0 object-contain"/>
              <div className="min-w-0"><p className="truncate text-sm font-bold text-[#17233B]">{vehicle.model}</p>
                <p className="mt-0.5 text-xs text-[#73839D]">{vehicle.plate} · {vehicle.capacity}</p>
                <p className="mt-1 text-[11px] text-[#73839D]">{reserved ? '다른 호차에 배정됨' : vehicle.isAvailable ? '예약 가능' : vehicle.unavailabilityReason || '가용성 확인 필요'}</p>
              </div>
            </div>
            {selected ? <Check className="size-4 shrink-0 text-[#1E60F3]" aria-label="선택한 차량"/> : canChoose ? <ArrowRight className="size-4 shrink-0 text-slate-400"/> : null}
          </button>;
        })}
        {!registry.loading && !registry.error && filtered.length === 0 && <div className="space-y-3 py-8 text-center">
          <CarFront className="mx-auto size-8 text-slate-300"/>
          <p className="text-sm text-[#73839D]">{registry.vehicles.length ? '조건에 맞는 차량이 없습니다.' : '차량관리에 등록된 차량이 없습니다.'}</p>
          {registry.vehicles.length > 0 && <HqButton size="sm" onClick={() => { setQuery(''); setCategory('all'); setAvailableOnly(false); }}>전체 차량 보기</HqButton>}
        </div>}
      </div>
    </div>
  </HqModal>;
};

/** Mount per opening so search resets intentionally; polling never resets a user's filters. */
export const HqVehicleSelectModal: React.FC<HqVehicleSelectModalProps> = props =>
  props.isOpen ? <VehiclePickerContent {...props} /> : null;
