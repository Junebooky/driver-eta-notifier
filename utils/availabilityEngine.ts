import { readFleetOperations, FleetOperation } from '@/lib/fleet/operationsStore';
import { scheduleOverlapsInterval } from '@/utils/dispatchInterval';
/**
 * VIP Limousine Korea - Fleet & Chauffeur Availability Engine
 *
 * Checks vehicle and driver availability against real Supabase schedules,
 * maintenance windows, driver schedules/leave, English qualifications,
 * and overnight time overlaps.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import {
  VIP_REAL_VEHICLES,
  mapVehicleToUiCategory,
  VehicleUiCategoryKey,
  VehicleChargingSpecs,
  formatChargingPortSummary,
} from '@/utils/vehicleData';
import { DEFAULT_DRIVER_PROFILES } from '@/utils/settlementCalculator';
import {
  cleanDriverIdentity,
  cleanVehicleIdentity,
  normalizeDateToIso,
  normalizeTimeHHmm,
  timeHHmmToMinutes,
  shiftIsoDate,
  parseKstDateTimeToMs,
  isDateTimeOverlapping,
  isDateTimeIntervalOverlapping,
} from '@/utils/dispatchConflictDetector';

export {
  shiftIsoDate,
  parseKstDateTimeToMs,
  isDateTimeOverlapping,
  isDateTimeIntervalOverlapping,
};
import { HqVehicleClassStatus } from '@/types/hq';

export const DEFAULT_TURNAROUND_BUFFER_MINUTES = 60;

export interface AvailabilityQuery {
  startDate: string;        // 'YYYY-MM-DD'
  startTime: string;        // 'HH:mm'
  endDate?: string;         // 'YYYY-MM-DD', defaults to startDate
  endTime: string;          // 'HH:mm'
  requiredLanguage?: 'ko' | 'en' | 'other';
  category?: VehicleUiCategoryKey;
  excludeScheduleId?: string; // When editing an existing schedule
}

export interface VehicleScheduleSummary {
  scheduleId: string;
  startDate: string;
  pickupTime: string;
  endDate: string;
  endTime?: string;
  customerName?: string;
  route?: string;
  operationStatus?: string;
}

export interface AvailableVehicleItem {
  id: string;
  uuid?: string;
  plate: string;
  model: string;
  category: 'sprinter' | 'van' | 'sedan';
  uiCategory: 'sedan' | 'suv' | 'van' | 'sprinter';
  capacity: string;
  isAvailable: boolean;
  unavailabilityReason?: string;
  currentStatus: 'available' | 'maintenance' | 'in_service' | 'unavailable' | 'unknown';
  requestedIntervalStatus: 'available' | 'booked' | 'maintenance' | 'unconfirmed_time';
  conflictingTrip?: {
    scheduleId: string;
    customerName: string;
    route: string;
    timeSpan: string;
  };
  activeSchedules?: VehicleScheduleSummary[];
  defaultDriverName?: string;
  defaultDriverPhone?: string;
  isEnglishVerified?: boolean;
  chargingSpecs?: VehicleChargingSpecs;
}

export interface AvailableDriverItem {
  id: string;
  name: string;
  phone: string;
  plate: string;
  model: string;
  isAvailable: boolean;
  isEnglishVerified: boolean;
  languageLabel: string;
  unavailabilityReason?: string;
  conflictingTrip?: {
    scheduleId: string;
    customerName: string;
    route: string;
    timeSpan: string;
  };
}

export interface UiCategoryCountItem {
  key: VehicleUiCategoryKey;
  label: string;
  totalCount: number;
  availableCount: number;
}

export interface FleetAvailabilityResult {
  query: AvailabilityQuery;
  totalFleetCount: number;
  availableCount: number;
  maintenanceCount: number;
  inServiceCount: number;
  vehicleClasses: HqVehicleClassStatus[];
  uiCategories: UiCategoryCountItem[];
  vehicles: AvailableVehicleItem[];
  drivers: AvailableDriverItem[];
}

/** Real DB failures propagate. Fixture injection is explicit and never changes production behavior. */
export async function checkFleetAvailability(
  query: AvailabilityQuery,
  options?: { injectedSchedules?: any[]; injectedDrivers?: any[]; injectedOperations?: FleetOperation[] }
): Promise<FleetAvailabilityResult> {
  const startDate = normalizeDateToIso(query.startDate);
  const endDate = normalizeDateToIso(query.endDate || query.startDate);
  const start = parseKstDateTimeToMs(startDate, query.startTime);
  const end = parseKstDateTimeToMs(endDate, query.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('유효한 시작·종료 일시를 입력해 주세요.');
  let dbDrivers = options?.injectedDrivers;
  if (dbDrivers === undefined) {
    const { data, error } = await supabaseAdmin.from('drivers').select('*').neq('vehicle_no', '미배정');
    if (error || !data) throw new Error('기사 목록을 조회할 수 없습니다.');
    dbDrivers = data;
  }
  let schedules = options?.injectedSchedules;
  if (schedules === undefined) {
    const { data, error } = await supabaseAdmin.from('schedules').select('*');
    if (error || !data) throw new Error('가용성 DB 스케줄을 조회할 수 없습니다.');
    schedules = data;
  }
  const operations = options?.injectedOperations ?? (options?.injectedSchedules !== undefined ? [] : await readFleetOperations());
  const activeSchedules = schedules.filter(s => {
    if (s.id === query.excludeScheduleId || s.status === 'completed' || s.status === 'cancelled') return false;
    const status = s.dispatch_status || s.schedule_meta?.dispatchStatus || (['draft','unassigned'].includes(s.status) ? s.status : 'published');
    return status === 'published' && (!s.org_id || s.org_id === 'vip_limousine_korea');
  });
  const summary = (s: any): VehicleScheduleSummary => ({
    scheduleId: s.id, startDate: normalizeDateToIso(s.date), pickupTime: normalizeTimeHHmm(s.pickup_time),
    endDate: normalizeDateToIso(s.end_date || s.date), endTime: normalizeTimeHHmm(s.end_time) || undefined,
    customerName: s.schedule_meta?.customerName || s.passenger_name || '고객사',
    route: `${s.origin || ''} → ${s.destination || ''}`, operationStatus: s.operation_status,
  });
  const overlaps = (s: any) => scheduleOverlapsInterval(summary(s), query, DEFAULT_TURNAROUND_BUFFER_MINUTES);
  const now = Date.now();
  const vehicleItems: AvailableVehicleItem[] = VIP_REAL_VEHICLES.map(v => {
    const operation = operations.find(o => o.vehicle_id === v.uuid);
    const vRows = activeSchedules.filter(s => (v.uuid && (s.vehicle_id || s.schedule_meta?.vehicleId) === v.uuid)
      || cleanVehicleIdentity(s.vehicle_plate || s.schedule_meta?.vehiclePlate || s.vehicle_no) === cleanVehicleIdentity(v.plate));
    const conflicting = vRows.find(overlaps);
    const isDriving = vRows.some(s => ['in_transit','boarded'].includes(s.operation_status)
      && parseKstDateTimeToMs(s.date,s.pickup_time) <= now
      && (!s.end_time || parseKstDateTimeToMs(s.end_date || s.date,s.end_time) > now));
    const maintenance = operation?.status === '정비 중';
    return {
      id: v.id, uuid: v.uuid, plate: v.plate, model: v.model,
      category: v.category as AvailableVehicleItem['category'], uiCategory: mapVehicleToUiCategory(v), capacity: v.capacity,
      isAvailable: !maintenance && !conflicting,
      currentStatus: maintenance ? 'maintenance' : isDriving || operation?.status === '운행 중' ? 'in_service' : operation?.status === '대기 중' ? 'available' : 'unknown',
      requestedIntervalStatus: maintenance ? 'maintenance' : conflicting ? conflicting.end_time ? 'booked' : 'unconfirmed_time' : 'available',
      unavailabilityReason: maintenance ? '차량 정비 중' : conflicting ? conflicting.end_time ? '기존 배차와 충돌' : '기존 배차 종료시간 미확정 (관리자 확인 필요)' : undefined,
      activeSchedules: vRows.map(summary), chargingSpecs: v.chargingSpecs,
      conflictingTrip: conflicting ? { scheduleId: conflicting.id, customerName: summary(conflicting).customerName || '',
        route: summary(conflicting).route || '', timeSpan: `${conflicting.date} ${conflicting.pickup_time} ~ ${conflicting.end_time || '종료 미정'}` } : undefined,
    };
  });
  const driverItems: AvailableDriverItem[] = dbDrivers.map(p => {
    const conflicting = activeSchedules.find(s => {
      if (s.schedule_meta?.serviceMode === 'vehicle_only' || s.service_mode === 'vehicle_only') return false;
      const driverId = s.driver_id || s.schedule_meta?.driverId;
      const same = driverId ? driverId === p.id : cleanDriverIdentity(s.driver_name || s.schedule_meta?.driverName) === cleanDriverIdentity(p.driver_name);
      return same && overlaps(s);
    });
    const qualified = query.requiredLanguage !== 'en' || p.english_available === true;
    return { id: p.id, name: p.driver_name, phone: p.phone || '', plate: p.car_number || '', model: p.vehicle_model || '',
      isAvailable: !conflicting && qualified, isEnglishVerified: p.english_available === true,
      languageLabel: p.english_available ? '영어 가능' : '무관',
      unavailabilityReason: conflicting ? '기존 배차와 충돌' : !qualified ? '영어 가능 여부 확인 필요' : undefined,
    };
  });
  // 5. Aggregate category counts
  const totalFleetCount = vehicleItems.length;
  const maintenanceCount = vehicleItems.filter((v) => v.currentStatus === 'maintenance').length;
  const inServiceCount = vehicleItems.filter((v) => v.currentStatus === 'in_service').length;
  const availableCount = vehicleItems.filter((v) => v.isAvailable).length;

  const categories = [
    { id: 'cat-sprinter', name: '벤츠 스프린터', key: 'sprinter' },
    { id: 'cat-staria', name: '스타리아 리무진', key: 'staria' },
    { id: 'cat-carnival', name: '카니발 하이리무진', key: 'carnival' },
    { id: 'cat-genesis', name: '제네시스 (G90/GV80)', key: 'genesis' },
    { id: 'cat-s-class', name: '벤츠 S클래스 (S560)', key: 's_class' },
  ];

  const vehicleClasses: HqVehicleClassStatus[] = categories.map((c) => {
    const list = vehicleItems.filter((v) => (v as any).rawCategory === c.key || v.category === c.key);
    const catTotal = list.length;
    const catAvail = list.filter((v) => v.isAvailable).length;
    const catActive = catTotal - catAvail;
    return {
      id: c.id,
      className: c.name,
      totalCount: catTotal,
      activeCount: catActive,
      availableCount: catAvail,
    };
  });

  // 6. Strict 4 UI Categories (전체, 세단, SUV, 밴, 스프린터)
  const uiCatDefs: Array<{ key: VehicleUiCategoryKey; label: string }> = [
    { key: 'all', label: '전체' },
    { key: 'sedan', label: '세단' },
    { key: 'suv', label: 'SUV' },
    { key: 'van', label: '밴' },
    { key: 'sprinter', label: '스프린터' },
  ];

  const uiCategories: UiCategoryCountItem[] = uiCatDefs.map((def) => {
    const list = def.key === 'all'
      ? vehicleItems
      : vehicleItems.filter((v) => v.uiCategory === def.key);
    return {
      key: def.key,
      label: def.label,
      totalCount: list.length,
      availableCount: list.filter((v) => v.isAvailable).length,
    };
  });

  return {
    query,
    totalFleetCount,
    availableCount,
    maintenanceCount,
    inServiceCount,
    vehicleClasses,
    uiCategories,
    vehicles: vehicleItems,
    drivers: driverItems,
  };
}
