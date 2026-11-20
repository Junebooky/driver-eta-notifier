'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CarFront, ChevronRight } from 'lucide-react';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqBadge, HqButton, HqSearchInput, HqSegmentedTabs, type HqTabOption } from '@/components/hq/ui';
import type { DispatchCardCoverage, DispatchCardCoverageSlot } from '@/lib/dispatchCards/dispatchCardCoverage';
import type { HqDriverSummary } from '@/types/driverHq';
import { mapVehicleToUiCategory } from '@/utils/vehicleData';
import {
  DRIVER_CARD_CATEGORY_ORDER,
  DRIVER_CARD_GROUP_LABELS,
  type DriverCardGroupKey,
} from '@/utils/driverDispatchCardVehicles';

/** Find a dispatch card by plate first, then choose its chauffeur. */
interface Props {
  isOpen: boolean;
  coverage: DispatchCardCoverage;
  drivers: readonly HqDriverSummary[];
  onClose: () => void;
  onView: (driverId: string, plate: string) => void;
  onCreate: (driver: HqDriverSummary, vehicleId: string) => void;
}
export function HqDispatchCardQuickFindModal({ isOpen, coverage, drivers, onClose, onView, onCreate }: Props) {
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [driverQuery, setDriverQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [showUnregistered, setShowUnregistered] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedCategory('all');
    }
  }, [isOpen]);

  const vehicle = coverage.vehicles.find(item => item.uuid === vehicleId);

  const searchedVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toLocaleLowerCase();
    return coverage.vehicles.filter(item =>
      item.plate.toLocaleLowerCase().includes(q) || item.model.toLocaleLowerCase().includes(q));
  }, [coverage.vehicles, vehicleQuery]);

  const categoryTabs: HqTabOption[] = useMemo(() => {
    const counts = new Map<DriverCardGroupKey, number>();
    for (const item of searchedVehicles) {
      const cat: DriverCardGroupKey = mapVehicleToUiCategory(item);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return [
      { id: 'all', label: '전체', count: searchedVehicles.length },
      ...DRIVER_CARD_CATEGORY_ORDER.flatMap(key => {
        const count = counts.get(key);
        return count ? [{ id: key, label: DRIVER_CARD_GROUP_LABELS[key], count }] : [];
      }),
    ];
  }, [searchedVehicles]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !categoryTabs.some(tab => tab.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoryTabs, selectedCategory]);

  const vehicles = useMemo(() => {
    if (selectedCategory === 'all') return searchedVehicles;
    return searchedVehicles.filter(item => mapVehicleToUiCategory(item) === selectedCategory);
  }, [searchedVehicles, selectedCategory]);

  const driverById = useMemo(() => new Map(drivers.map(driver => [driver.id, driver])), [drivers]);
  const driverResults = useMemo(() => {
    if (!vehicle) return [];
    const q = driverQuery.trim().toLocaleLowerCase();
    return coverage.drivers.flatMap(item => {
      const slot = item.slots.find(entry => entry.vehicleId === vehicle.uuid);
      if (!slot || (!item.name.toLocaleLowerCase().includes(q))) return [];
      const count = Number(slot.pc) + Number(slot.mobile);
      if (!showUnregistered && !count) return [];
      return [{ driver: item, slot, count }];
    }).sort((a, b) => b.count - a.count || a.driver.name.localeCompare(b.driver.name, 'ko'));
  }, [coverage.drivers, vehicle, driverQuery, showUnregistered]);

  const savedDrivers = vehicle ? coverage.drivers.filter(item => {
    const slot = item.slots.find(entry => entry.vehicleId === vehicle.uuid);
    return Boolean(slot && (slot.pc || slot.mobile));
  }).length : 0;

  const choose = (driverId: string, slot: DispatchCardCoverageSlot) => {
    if (slot.pc || slot.mobile) { onView(driverId, slot.plate); return; }
    if (slot.imageReady === false) return;
    const chosen = driverById.get(driverId);
    if (chosen) onCreate(chosen, slot.vehicleId);
  };

  return <HqModal isOpen={isOpen} onClose={onClose}
    title="배차카드 빠른 검색" subtitle="차량번호로 찾고, 해당 기사 카드를 공유하세요."
    icon={<img src="/images/icons/drivers/icon_driver.png" alt="" aria-hidden="true" className="size-9 shrink-0 object-contain"/>}
    className="max-w-[620px] h-[min(680px,88dvh)]" footer={<HqButton variant="subtle" onClick={onClose}>닫기</HqButton>}>
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-x-hidden">
      <div className="shrink-0 space-y-3">
        {vehicle && <button type="button" onClick={() => { setVehicleId(null); setDriverQuery(''); setShowUnregistered(false); }}
          className="inline-flex min-h-10 items-center gap-1.5 text-[12px] font-semibold text-[#60728B]">
          <ArrowLeft className="size-4" /> 차량 다시 선택
        </button>}
        <HqSearchInput
          value={vehicle ? driverQuery : vehicleQuery}
          onChange={event => vehicle ? setDriverQuery(event.target.value) : setVehicleQuery(event.target.value)}
          onClear={() => vehicle ? setDriverQuery('') : setVehicleQuery('')}
          placeholder={vehicle ? '기사 이름 검색' : '차량번호 또는 차종 검색'}
          aria-label={vehicle ? '기사 이름 검색' : '차량번호 또는 차종 검색'}
        />
        {!vehicle ? <>
          {searchedVehicles.length > 0 && (
            <HqSegmentedTabs
              variant="underline"
              aria-label="차량 카테고리 선택"
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              tabs={categoryTabs}
            />
          )}
          <p className="text-[11px] font-medium text-[#8090A4]">차량 {vehicles.length}대</p>
        </> : <>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-semibold text-[#243750]">{vehicle.model} · {vehicle.plate}</span>
            <HqBadge tone="neutral">등록 기사 {savedDrivers}명</HqBadge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#8290A3]">{showUnregistered ? '전체 기사' : '등록된 카드만'}</span>
            <button type="button" onClick={() => setShowUnregistered(value => !value)}
              className="min-h-10 px-2 text-[12px] font-semibold text-[#526680] underline underline-offset-4">
              {showUnregistered ? '등록 카드만 보기' : '미등록 기사도 보기'}
            </button>
          </div>
        </>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5">
        {!vehicle ? (
          <div className="overflow-hidden rounded-[15px] bg-white shadow-[0_3px_15px_rgba(35,49,78,0.055)]">
            {vehicles.map((item, index) => <button type="button" key={item.uuid}
              onClick={() => { setVehicleId(item.uuid); setDriverQuery(''); }}
              className={'flex min-h-[64px] w-full items-center gap-3 px-3.5 text-left hover:bg-[#F8FAFD] ' + (index ? 'border-t border-[#F0F3F6]' : '')}>
              <span className="flex size-10 items-center justify-center rounded-[12px] bg-[#F6F8FA]">
                <CarFront className="size-5 text-[#718198]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-[#8290A3]">{item.model}</span>
                <span className="block truncate text-[14px] font-semibold text-[#243750]">{item.plate}</span>
              </span>
              <ChevronRight className="size-4 text-[#9AA7B6]" />
            </button>)}
            {!vehicles.length && <p className="px-3 py-10 text-center text-[12px] text-[#8090A4]">해당 차량이 없습니다.</p>}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[15px] bg-white shadow-[0_3px_15px_rgba(35,49,78,0.055)]">
            {driverResults.map(({ driver, slot, count }, index) => {
              const current = driverById.get(driver.id);
              const label = count === 2 ? '완료' : count === 1 ? '일부 등록' :
                slot.imageReady === false ? '이미지 미준비' : '미등록';
              return <button key={driver.id} type="button"
                disabled={!current || (!count && slot.imageReady === false)}
                onClick={() => choose(driver.id, slot)}
                className={'flex min-h-[60px] w-full items-center justify-between gap-2 px-3.5 text-left hover:bg-[#F8FAFD] disabled:opacity-50 ' + (index ? 'border-t border-[#F0F3F6]' : '')}>
                <span className="truncate text-[13px] font-semibold text-[#243750]">{driver.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <HqBadge tone={count === 2 ? 'selected' : count === 1 ? 'warning' : 'neutral'}>{label}</HqBadge>
                  <ChevronRight className="size-4 text-[#9BA7B7]" />
                </span>
              </button>;
            })}
            {!driverResults.length && <p className="px-3 py-10 text-center text-[12px] text-[#8090A4]">
              {showUnregistered ? '검색된 기사가 없습니다.' : '등록된 카드가 없습니다. 미등록 기사도 보기를 선택해 주세요.'}
            </p>}
          </div>
        )}
      </div>
    </div>
  </HqModal>;
}
