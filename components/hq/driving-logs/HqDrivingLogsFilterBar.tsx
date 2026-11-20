'use client';

import React from 'react';
import { HqDrivingLogStatus } from '@/types/drivingLogHq';
import { HqSearchInput } from '@/components/hq/ui';
import { HqDateRangePicker } from '@/components/hq/ui/HqDateRangePicker';
import { HqSearchSelect } from '@/components/hq/ui/HqSearchSelect';
import { type HqDateRange } from '@/utils/hqDateRange';
import { haptics } from '@/utils/haptics';

export interface HqDrivingLogsFilterBarProps {
  dateRange: HqDateRange;
  onChangeDateRange: (range: HqDateRange) => void;
  driverOptions: string[];
  selectedDriver: string;
  onSelectDriver: (driver: string) => void;
  vehicleOptions: string[];
  selectedVehicle: string;
  onSelectVehicle: (vehicle: string) => void;
  customerOptions: string[];
  selectedCustomer: string;
  onSelectCustomer: (customer: string) => void;
  selectedStatus: HqDrivingLogStatus | '전체';
  onSelectStatus: (status: HqDrivingLogStatus | '전체') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onExportExcel: () => void;
}

/** The same A-plan date and searchable filter controls are shared with HQ booking views. */
export const HqDrivingLogsFilterBar: React.FC<HqDrivingLogsFilterBarProps> = ({
  dateRange, onChangeDateRange, driverOptions, selectedDriver, onSelectDriver,
  vehicleOptions, selectedVehicle, onSelectVehicle,
  customerOptions, selectedCustomer, onSelectCustomer,
  selectedStatus, onSelectStatus, searchQuery, onSearchChange, onExportExcel,
}) => {
  return (
    <div className="space-y-3 rounded-[19px] bg-white p-4 shadow-[0_5px_18px_rgba(35,49,78,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <HqDateRangePicker value={dateRange} onChange={onChangeDateRange} label="운행일지" />
          <HqSearchSelect label="기사 필터" size="sm" value={selectedDriver} onChange={value => { haptics.selection(); onSelectDriver(value); }}
            placeholder="기사명 전체" options={[{ value: '전체', label: '기사명 전체' },
              ...driverOptions.map(name => ({ value: name, label: name }))]} />
          <HqSearchSelect label="차량 필터" size="sm" value={selectedVehicle} onChange={value => { haptics.selection(); onSelectVehicle(value); }}
            placeholder="차량 전체" options={[{ value: '전체', label: '차량 전체' },
              ...vehicleOptions.map(name => ({ value: name, label: name }))]} />
          <HqSearchSelect label="고객사 필터" size="sm" value={selectedCustomer} onChange={value => { haptics.selection(); onSelectCustomer(value); }}
            placeholder="고객사 전체" options={[{ value: '전체', label: '고객사 전체' },
              ...customerOptions.map(name => ({ value: name, label: name }))]} />
          <HqSearchSelect label="운행일지 상태 필터" size="sm" value={selectedStatus} onChange={value => { haptics.selection(); onSelectStatus(value as HqDrivingLogStatus | '전체'); }}
            placeholder="상태 전체" options={[
              { value: '전체', label: '상태 전체' }, { value: 'draft', label: '진행 중 (초안)' },
              { value: '검토 대기', label: '검토 대기' }, { value: '검토 중', label: '검토 중' },
              { value: '승인 완료', label: '승인 완료' }, { value: '보완 필요', label: '보완 필요' },
              { value: '반려', label: '반려' },
            ]} />
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <HqSearchInput
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            onClear={() => onSearchChange('')}
            placeholder="고객명, 기사명, 차량번호 검색"
            aria-label="운행일지 검색"
            containerClassName="flex-1 sm:w-60"
            className="sm:min-h-10 sm:h-10 rounded-[13px] bg-[#F7F9FC] focus:bg-white shadow-none"
          />
          <button type="button" onClick={onExportExcel}
            aria-label="필터링된 운행일지 Excel 다운로드" title="화면에 표시된 필터 결과만 다운로드"
            className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[#F7F9FC] transition-colors hover:bg-[#EEF2F8]">
            <img src="/images/icons/icon_excel.png" alt="" className="size-7 object-contain"/>
          </button>
        </div>
      </div>
    </div>
  );
};
