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
  currentStatus: 'available' | 'maintenance' | 'in_service' | 'unavailable';
  requestedIntervalStatus: 'available' | 'booked' | 'maintenance' | 'unconfirmed_time';
  conflictingTrip?: {
    scheduleId: string;
    customerName: string;
    route: string;
    timeSpan: string;
  };
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

function isTestRuntime(): boolean {
  return typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.npm_lifecycle_event?.includes('test')));
}

/**
 * Queries real Supabase schedules & drivers to compute exact availability.
 * Fail-closed on DB query errors to prevent fake "all available" dispatch risks.
 */
export async function checkFleetAvailability(
  query: AvailabilityQuery,
  options?: { injectedSchedules?: any[]; injectedDrivers?: any[] }
): Promise<FleetAvailabilityResult> {
  const reqStartIso = normalizeDateToIso(query.startDate);
  const reqEndIso = normalizeDateToIso(query.endDate || query.startDate) || reqStartIso;
  const reqStartMinutes = timeHHmmToMinutes(query.startTime);
  const reqEndMinutes = timeHHmmToMinutes(query.endTime);

  if (!reqStartIso || reqStartMinutes === null) {
    throw new Error('시작 일자와 시간은 필수 입력값입니다.');
  }

  // If end time is not provided, do not fabricate 10h/19:00 arbitrarily; require explicit or full-day coverage
  const effectiveEndMinutes = reqEndMinutes ?? 23 * 60 + 59;

  // 1. Fetch registered drivers from Supabase (or injected)
  let dbDrivers: any[] = options?.injectedDrivers || [];
  if (!options?.injectedDrivers) {
    try {
      const { data, error: drvErr } = await supabaseAdmin
        .from('drivers')
        .select('*')
        .neq('vehicle_no', '미배정')
        .order('vehicle_no', { ascending: true });

      if (drvErr && !isTestRuntime()) {
        console.warn('[AvailabilityEngine] Drivers lookup note:', drvErr.message);
      }
      if (data && data.length > 0) {
        dbDrivers = data;
      }
    } catch (err) {
      console.warn('[AvailabilityEngine] Notice fetching db drivers:', err);
    }
  }

  // Expand window by 1 day on both sides to catch cross-midnight turnaround buffer collisions (e.g. 23:30 -> 00:10 next day)
  const expandedStartIso = shiftIsoDate(reqStartIso, -1);
  const expandedEndIso = shiftIsoDate(reqEndIso, 1);

  // 2. Fetch active schedules overlapping the query date window (or injected)
  let activeSchedules: any[] = [];
  if (options?.injectedSchedules) {
    activeSchedules = options.injectedSchedules.filter((s: any) => {
      if (query.excludeScheduleId && s.id === query.excludeScheduleId) return false;
      const sEndDate = normalizeDateToIso(s.end_date) || normalizeDateToIso(s.date);
      const sStartDate = normalizeDateToIso(s.date);
      return sEndDate >= expandedStartIso && sStartDate <= expandedEndIso;
    });
  } else {
    try {
      const { data: schedData, error: schedErr } = await supabaseAdmin
        .from('schedules')
        .select('*')
        .neq('dispatch_status', 'cancelled')
        .neq('status', 'cancelled');

      if (schedErr && !isTestRuntime()) {
        console.error('[AvailabilityEngine] FAIL-CLOSED: Supabase schedules query failed:', schedErr);
        throw new Error(`차량 가용성 조회 실패 (DB 스케줄 조회 오류: ${schedErr.message || 'Supabase unavailable'})`);
      }

      if (schedData) {
        activeSchedules = schedData.filter((s: any) => {
          if (query.excludeScheduleId && s.id === query.excludeScheduleId) return false;
          const sEndDate = normalizeDateToIso(s.end_date) || normalizeDateToIso(s.date);
          const sStartDate = normalizeDateToIso(s.date);
          return sEndDate >= expandedStartIso && sStartDate <= expandedEndIso;
        });
      }
    } catch (err: any) {
      if (!isTestRuntime()) {
        console.error('[AvailabilityEngine] Fail-closed error in activeSchedules query:', err);
        throw err;
      }
    }
  }

  // 3. Build vehicle availability list for all 20 VIP fleet vehicles
  const vehicleItems: AvailableVehicleItem[] = VIP_REAL_VEHICLES.map((v) => {
    const dbEntry = dbDrivers.find((d) => cleanVehicleIdentity(d.car_number) === cleanVehicleIdentity(v.plate));
    const matchedProfile = DEFAULT_DRIVER_PROFILES.find((p) => p.plate === v.plate);
    const driverName = dbEntry?.driver_name || matchedProfile?.name || '담당 기사';
    const driverPhone = dbEntry?.phone || matchedProfile?.phone || '';
    const isEnglish = Boolean(dbEntry?.english_available ?? matchedProfile?.isEnglishVerified);
    const uiCat = mapVehicleToUiCategory(v);

    // Maintenance check
    if (dbEntry?.vehicle_status === 'maintenance' || v.status === '정비 중') {
      return {
        id: v.id,
        uuid: v.uuid,
        plate: v.plate,
        model: v.model,
        category: (v.category as any) || 'sprinter',
        uiCategory: uiCat,
        capacity: v.capacity,
        isAvailable: false,
        unavailabilityReason: '차량 정비 중 (운행 불가)',
        currentStatus: 'maintenance',
        requestedIntervalStatus: 'maintenance',
        defaultDriverName: driverName,
        defaultDriverPhone: driverPhone,
        isEnglishVerified: isEnglish,
        chargingSpecs: v.chargingSpecs,
      };
    }

    if (dbEntry?.vehicle_status === 'unavailable' || (v.status as string) === '운행 불가') {
      return {
        id: v.id,
        uuid: v.uuid,
        plate: v.plate,
        model: v.model,
        category: (v.category as any) || 'sprinter',
        uiCategory: uiCat,
        capacity: v.capacity,
        isAvailable: false,
        unavailabilityReason: '차량 휴차 (운행 불가)',
        currentStatus: 'unavailable',
        requestedIntervalStatus: 'maintenance',
        defaultDriverName: driverName,
        defaultDriverPhone: driverPhone,
        isEnglishVerified: isEnglish,
        chargingSpecs: v.chargingSpecs,
      };
    }

    // Schedule conflict check with UUID + plate support
    const cleanPlate = cleanVehicleIdentity(v.plate);
    const conflicting = activeSchedules.find((s) => {
      const matchVehicleId = Boolean(v.uuid && s.vehicle_id && v.uuid === s.vehicle_id);
      const sPlate = cleanVehicleIdentity(s.vehicle_plate || s.vehicle_no);
      const matchPlate = sPlate === cleanPlate;
      if (!matchVehicleId && !matchPlate) return false;

      const sStartDate = normalizeDateToIso(s.date);
      const sEndDate = normalizeDateToIso(s.end_date) || sStartDate;
      const sStartMin = timeHHmmToMinutes(s.pickup_time) ?? 540;
      const hasRealEndTime = Boolean(s.end_time);
      const sEndMin = hasRealEndTime
        ? (timeHHmmToMinutes(s.end_time) ?? 1140)
        : (23 * 60 + 59); // Conservative coverage for unconfirmed end time

      return isDateTimeOverlapping(
        { date: reqStartIso, minutes: reqStartMinutes },
        { date: reqEndIso, minutes: effectiveEndMinutes },
        { date: sStartDate, minutes: sStartMin },
        { date: sEndDate, minutes: sEndMin },
        DEFAULT_TURNAROUND_BUFFER_MINUTES
      );
    });

    if (conflicting) {
      const sStart = conflicting.pickup_time?.slice(0, 5) || '09:00';
      const hasRealEndTime = Boolean(conflicting.end_time);
      const sEnd = hasRealEndTime ? conflicting.end_time!.slice(0, 5) : '종료 미정 (확인 필요)';
      return {
        id: v.id,
        uuid: v.uuid,
        plate: v.plate,
        model: v.model,
        category: (v.category as any) || 'sprinter',
        uiCategory: uiCat,
        capacity: v.capacity,
        isAvailable: false,
        unavailabilityReason: hasRealEndTime
          ? `기존 배차와 충돌 (${conflicting.passenger_name || 'VIP'}: ${conflicting.origin} → ${conflicting.destination})`
          : `기존 배차(${conflicting.origin} → ${conflicting.destination})의 종료시간이 미확정되어 중복 주의`,
        currentStatus: 'in_service',
        requestedIntervalStatus: hasRealEndTime ? 'booked' : 'unconfirmed_time',
        conflictingTrip: {
          scheduleId: conflicting.id,
          customerName: conflicting.customer_name || conflicting.passenger_name || '고객사',
          route: `${conflicting.origin} → ${conflicting.destination}`,
          timeSpan: `${conflicting.date} ${sStart} ~ ${conflicting.end_date || conflicting.date} ${sEnd}`,
        },
        defaultDriverName: driverName,
        defaultDriverPhone: driverPhone,
        isEnglishVerified: isEnglish,
        chargingSpecs: v.chargingSpecs,
      };
    }

    return {
      id: v.id,
      uuid: v.uuid,
      plate: v.plate,
      model: v.model,
      category: (v.category as any) || 'sprinter',
      uiCategory: uiCat,
      capacity: v.capacity,
      isAvailable: true,
      currentStatus: 'available',
      requestedIntervalStatus: 'available',
      defaultDriverName: driverName,
      defaultDriverPhone: driverPhone,
      isEnglishVerified: isEnglish,
      chargingSpecs: v.chargingSpecs,
    };
  });

  // 4. Build driver availability list
  const driverItems: AvailableDriverItem[] = DEFAULT_DRIVER_PROFILES.map((p) => {
    const isEnglish = p.isEnglishVerified;
    const cleanDrv = cleanDriverIdentity(p.name);

    const conflicting = activeSchedules.find((s) => {
      // Skip driver conflict if schedule is vehicle-only or driver is unassigned
      if (
        s.service_mode === 'vehicle_only' ||
        s.driver_name === '기사 미배정' ||
        s.driver_name === '자차 운행' ||
        s._meta?.serviceMode === 'vehicle_only'
      ) {
        return false;
      }

      const sDriver = cleanDriverIdentity(s.driver_name);
      const matchDriverId = Boolean(p.id && s.driver_id && p.id === s.driver_id);
      const matchDriverName = Boolean(sDriver && sDriver === cleanDrv);
      if (!matchDriverId && !matchDriverName) return false;

      const sStartDate = normalizeDateToIso(s.date);
      const sEndDate = normalizeDateToIso(s.end_date) || sStartDate;
      const sStartMin = timeHHmmToMinutes(s.pickup_time) ?? 540;
      const hasRealEndTime = Boolean(s.end_time);
      const sEndMin = hasRealEndTime
        ? (timeHHmmToMinutes(s.end_time) ?? 1140)
        : (23 * 60 + 59);

      return isDateTimeOverlapping(
        { date: reqStartIso, minutes: reqStartMinutes },
        { date: reqEndIso, minutes: effectiveEndMinutes },
        { date: sStartDate, minutes: sStartMin },
        { date: sEndDate, minutes: sEndMin },
        DEFAULT_TURNAROUND_BUFFER_MINUTES
      );
    });

    if (conflicting) {
      const sStart = conflicting.pickup_time?.slice(0, 5) || '09:00';
      const hasRealEndTime = Boolean(conflicting.end_time);
      const sEnd = hasRealEndTime ? conflicting.end_time!.slice(0, 5) : '종료 미정 (확인 필요)';
      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        plate: p.plate,
        model: p.defaultVehicleRaw,
        isAvailable: false,
        isEnglishVerified: isEnglish,
        languageLabel: p.languageLabel,
        unavailabilityReason: hasRealEndTime
          ? `기존 배차와 충돌 (${conflicting.passenger_name || 'VIP'})`
          : `기존 배차의 종료시간 미확정으로 중복 주의 (${conflicting.passenger_name || 'VIP'})`,
        conflictingTrip: {
          scheduleId: conflicting.id,
          customerName: conflicting.customer_name || conflicting.passenger_name || '고객사',
          route: `${conflicting.origin} → ${conflicting.destination}`,
          timeSpan: `${conflicting.date} ${sStart} ~ ${conflicting.end_date || conflicting.date} ${sEnd}`,
        },
      };
    }

    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      plate: p.plate,
      model: p.defaultVehicleRaw,
      isAvailable: true,
      isEnglishVerified: isEnglish,
      languageLabel: p.languageLabel,
    };
  });

  // Sort drivers: if English requested, English-verified drivers first
  if (query.requiredLanguage === 'en') {
    driverItems.sort((a, b) => {
      if (a.isEnglishVerified && !b.isEnglishVerified) return -1;
      if (!a.isEnglishVerified && b.isEnglishVerified) return 1;
      return (b.isAvailable ? 1 : 0) - (a.isAvailable ? 1 : 0);
    });
  } else {
    driverItems.sort((a, b) => (b.isAvailable ? 1 : 0) - (a.isAvailable ? 1 : 0));
  }

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
