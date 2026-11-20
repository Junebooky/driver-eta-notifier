'use client';

import { useEffect, useMemo, useState } from 'react';
import { CarFront, ChevronRight, ImageOff } from 'lucide-react';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqBadge, HqButton, HqSearchInput, HqSegmentedTabs, type HqTabOption } from '@/components/hq/ui';
import type { DispatchCardCoverageSlot } from '@/lib/dispatchCards/dispatchCardCoverage';
import type { VipRealVehicle } from '@/utils/vehicleData';
import { groupDriverCardVehicles } from '@/utils/driverDispatchCardVehicles';

interface Props {
  isOpen: boolean;
  driverName: string;
  slots: readonly DispatchCardCoverageSlot[];
  vehicles: readonly VipRealVehicle[];
  onClose: () => void;
  onView: (slot: DispatchCardCoverageSlot) => void;
  onCreate: (slot: DispatchCardCoverageSlot) => void;
}

/** Mobile-first vehicle picker. A car is ONE row, not separate PC/mobile rows. */
export function HqDriverCardPickerModal({
  isOpen, driverName, slots, vehicles, onClose, onView, onCreate,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (isOpen) {
      setSelectedCategory('all');
      setQuery('');
    }
  }, [isOpen]);

  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return slots;
    const byId = new Map(vehicles.map(vehicle => [vehicle.uuid, vehicle]));
    return slots.filter(slot => {
      const vehicle = byId.get(slot.vehicleId);
      return slot.plate.toLocaleLowerCase().includes(term) ||
        (vehicle?.model || '').toLocaleLowerCase().includes(term);
    });
  }, [slots, vehicles, query]);

  const groups = useMemo(() => groupDriverCardVehicles(matches, vehicles), [matches, vehicles]);

  const categoryTabs: HqTabOption[] = useMemo(() => [
    { id: 'all', label: '전체', count: matches.length },
    ...groups.map(group => ({
      id: group.key,
      label: group.label,
      count: group.entries.length,
    })),
  ], [groups, matches.length]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !groups.some(group => group.key === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [groups, selectedCategory]);

  const visibleGroups = useMemo(
    () => (selectedCategory === 'all' ? groups : groups.filter(group => group.key === selectedCategory)),
    [groups, selectedCategory],
  );

  const completed = slots.filter(slot => slot.pc && slot.mobile).length;

  return <HqModal isOpen={isOpen} onClose={onClose}
    title={driverName + ' 배차카드'}
    subtitle={'완료 ' + completed + '대 · 전체 ' + slots.length + '대'}
    className="max-w-[640px] h-[min(680px,88dvh)]"
    footer={<HqButton variant="subtle" onClick={onClose}>닫기</HqButton>}>
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-x-hidden">
      <div className="shrink-0 space-y-3">
        <HqSearchInput
          aria-label="배차카드 차량번호 또는 차종 검색"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          placeholder="차량번호 또는 차종 검색"
        />

        {groups.length > 0 && (
          <HqSegmentedTabs
            variant="underline"
            aria-label="배차카드 차종 카테고리"
            value={selectedCategory}
            onValueChange={setSelectedCategory}
            tabs={categoryTabs}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 space-y-4">
        {!visibleGroups.length && <p className="py-12 text-center text-[13px] text-[#8290A3]">
          {slots.length ? '검색된 차량이 없습니다.' : '등록된 차량이 없습니다.'}
        </p>}

        {visibleGroups.map(group => <section key={group.key} className="space-y-2">
          {selectedCategory === 'all' && (
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[13px] font-semibold text-[#243750]">{group.label}</h3>
              <span className="text-[11px] text-[#8290A3]">{group.entries.length}대</span>
            </div>
          )}
          <div className="overflow-hidden rounded-[16px] bg-white shadow-[0_3px_15px_rgba(35,49,78,0.055)]">
            {group.entries.map(({ slot, status, modelLabel }, index) => {
              const ready = status !== 'photos_missing';
              const missing = status === 'missing';
              const statusText = status === 'complete' ? '완료' : status === 'partial' ? '일부 등록' :
                ready ? '미등록' : '이미지 미준비';
              return <button key={slot.vehicleId} type="button" disabled={!ready}
                onClick={() => missing ? onCreate(slot) : onView(slot)}
                aria-label={modelLabel + ' ' + slot.plate + ' ' + statusText + (missing ? ' 카드 만들기' : ' 카드 보기')}
                className={'flex min-h-[67px] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-65 ' + (index ? 'border-t border-[#F0F3F6] ' : '') + (ready ? 'hover:bg-[#F8FAFD]' : '')}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F6F8FA]">
                  {ready ? <CarFront className="size-[19px] text-[#64748B]" /> :
                    <ImageOff className="size-[18px] text-[#9AA6B5]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[#74849A]">{modelLabel}</span>
                  <span className="mt-0.5 block truncate text-[14px] font-semibold text-[#243750]">{slot.plate}</span>
                </span>
                <HqBadge tone={status === 'complete' ? 'selected' : status === 'partial' ? 'warning' : 'neutral'}>
                  {statusText}
                </HqBadge>
                {ready && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[#A5B1BF]" />}
              </button>;
            })}
          </div>
        </section>)}
      </div>

      <p className="shrink-0 text-[11px] leading-relaxed text-[#8290A3]">
        완료·일부 등록 차량은 미리보기와 PC·모바일 통합 공유로 이동합니다.
        미등록 차량은 카드 만들기로, 이미지 미준비 차량은 사진 등록 후 이용할 수 있습니다.
      </p>
    </div>
  </HqModal>;
}
