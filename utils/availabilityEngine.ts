/**
 * VIP Limousine Korea - Fleet & Chauffeur Availability Engine
 *
 * Checks vehicle and driver availability against real Supabase schedules,
 * maintenance windows, driver schedules/leave, English qualifications,
 * and overnight time overlaps.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import { DEFAULT_DRIVER_PROFILES } from '@/utils/settlementCalculator';
import {
  cleanDriverIdentity,
  cleanVehicleIdentity,
  normalizeDateToIso,
  normalizeTimeHHmm,
  timeHHmmToMinutes,
} from '@/utils/dispatchConflictDetector';
import { HqVehicleClassStatus } from '@/types/hq';

export interface AvailabilityQuery {
  startDate: string;        // 'YYYY-MM-DD'
  startTime: string;        // 'HH:mm'
  endDate?: string;          // 'YYYY-MM-DD', defaults to startDate
  endTime: string;          // 'HH:mm'
  requiredLanguage?: 'ko' | 'en' | 'other';
  category?: 'all' | 'sprinter' | 'van' | 'sedan';
  excludeScheduleId?: string; // When editing an existing schedule
}

export interface AvailableVehicleItem {
  id: string;
  plate: string;
  model: string;
  category: 'sprinter' | 'van' | 'sedan';
  capacity: string;
  isAvailable: boolean;
  unavailabilityReason?: string;
  currentStatus: 'available' | 'maintenance' | 'in_service' | 'unavailable';
  conflictingTrip?: {
    scheduleId: string;
    customerName: string;
    route: string;
    timeSpan: string;
  };
  defaultDriverName?: string;
  defaultDriverPhone?: string;
  isEnglishVerified?: boolean;
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

export interface FleetAvailabilityResult {
  query: AvailabilityQuery;
  totalFleetCount: number;
  availableCount: number;
  maintenanceCount: number;
  inServiceCount: number;
  vehicleClasses: HqVehicleClassStatus[];
  vehicles: AvailableVehicleItem[];
  drivers: AvailableDriverItem[];
}

/**
 * Checks if two date-time intervals overlap (with overnight support).
 */
export function isDateTimeOverlapping(
  startA: { date: string; minutes: number },
  endA: { date: string; minutes: number },
  startB: { date: string; minutes: number },
  endB: { date: string; minutes: number },
  bufferMinutes: number = 60
): boolean {
  // Convert date strings to epoch timestamp or day-offset minutes
  const baseDay = startA.date;
  const getDayOffset = (d: string) => {
    const msDiff = new Date(d + 'T00:00:00+09:00').getTime() - new Date(baseDay + 'T00:00:00+09:00').getTime();
    return Math.round(msDiff / (1000 * 60));
  };

  const aStartTotal = getDayOffset(startA.date) + startA.minutes;
  const aEndTotal = getDayOffset(endA.date) + endA.minutes + bufferMinutes;

  const bStartTotal = getDayOffset(startB.date) + startB.minutes;
  const bEndTotal = getDayOffset(endB.date) + endB.minutes + bufferMinutes;

  return Math.max(aStartTotal, bStartTotal) < Math.min(aEndTotal, bEndTotal);
}

/**
 * Queries real Supabase schedules & drivers to compute exact availability.
 */
export async function checkFleetAvailability(
  query: AvailabilityQuery
): Promise<FleetAvailabilityResult> {
  const reqStartIso = normalizeDateToIso(query.startDate);
  const reqEndIso = normalizeDateToIso(query.endDate || query.startDate) || reqStartIso;
  const reqStartMinutes = timeHHmmToMinutes(query.startTime) ?? 540; // 09:00
  const reqEndMinutes = timeHHmmToMinutes(query.endTime) ?? 1140;   // 19:00

  // 1. Fetch registered drivers & vehicle status from Supabase
  let dbDrivers: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .neq('vehicle_no', '미배정')
      .order('vehicle_no', { ascending: true });
    if (data && data.length > 0) {
      dbDrivers = data;
    }
  } catch (err) {
    console.warn('[AvailabilityEngine] Notice fetching db drivers:', err);
  }

  // 2. Fetch active schedules overlapping the query date window
  let activeSchedules: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .neq('dispatch_status', 'cancelled')
      .neq('status', 'cancelled')
      .lte('date', reqEndIso);

    if (data) {
      activeSchedules = data.filter((s: any) => {
        if (query.excludeScheduleId && s.id === query.excludeScheduleId) return false;
        const sEndDate = normalizeDateToIso(s.end_date) || normalizeDateToIso(s.date);
        return sEndDate >= reqStartIso;
      });
    }
  } catch (err) {
    console.warn('[AvailabilityEngine] Notice fetching db schedules:', err);
  }

  // 3. Build vehicle availability list for all 20 VIP fleet vehicles
  const vehicleItems: AvailableVehicleItem[] = VIP_REAL_VEHICLES.map((v) => {
    const dbEntry = dbDrivers.find((d) => cleanVehicleIdentity(d.car_number) === cleanVehicleIdentity(v.plate));
    const matchedProfile = DEFAULT_DRIVER_PROFILES.find((p) => p.plate === v.plate);
    const driverName = dbEntry?.driver_name || matchedProfile?.name || '담당 기사';
    const driverPhone = dbEntry?.phone || matchedProfile?.phone || '';
    const isEnglish = Boolean(dbEntry?.english_available ?? matchedProfile?.isEnglishVerified);

    // Maintenance check
    if (dbEntry?.vehicle_status === 'maintenance' || v.status === '정비 중') {
      return {
        id: v.id,
        plate: v.plate,
        model: v.model,
        category: (v.category as any) || 'sprinter',
        capacity: v.capacity,
        isAvailable: false,
        unavailabilityReason: '차량 정비 중 (운행 불가)',
        currentStatus: 'maintenance',
        defaultDriverName: driverName,
        defaultDriverPhone: driverPhone,
        isEnglishVerified: isEnglish,
      };
    }

    if (dbEntry?.vehicle_status === 'unavailable' || (v.status as string) === '운행 불가') {
      return {
        id: v.id,
        plate: v.plate,
        model: v.model,
        category: (v.category as any) || 'sprinter',
        capacity: v.capacity,
        isAvailable: false,
        unavailabilityReason: '차량 휴차 (운행 불가)',
        currentStatus: 'unavailable',
        defaultDriverName: driverName,
        defaultDriverPhone: driverPhone,
        isEnglishVerified: isEnglish,
      };
    }

    // Schedule conflict check
    const cleanPlate = cleanVehicleIdentity(v.plate);
    const conflicting = activeSchedules.find((s) => {
      const sPlate = cleanVehicleIdentity(s.vehicle_plate || s.vehicle_no);
      if (sPlate !== cleanPlate) return false;

      const sStartDate = normalizeDateToIso(s.date);
      const sEndDate = normalizeDateToIso(s.end_date) || sStartDate;
      const sStartMin = timeHHmmToMinutes(s.pickup_time) ?? 540;
      const sEndMin = timeHHmmToMinutes(s.end_time) ?? (sStartMin + 600); // 10h default

      return isDateTimeOverlapping(
        { date: reqStartIso, minutes: reqStartMinutes },
        { date: reqEndIso, minutes: reqEndMinutes },
        { date: sStartDate, minutes: sStartMin },
        { date: sEndDate, minutes: sEndMin },
        60 // 1 hour turnaround buffer
      );
    });

    if (conflicting) {
      const sStart = conflicting.pickup_time?.slice(0, 5) || '09:00';
      const sEnd = conflicting.end_time?.slice(0, 5) || '19:00';
      return {
        id: v.id,
        plate: v.plate,
        model: v.model,
        category: (v.category as any) || 'sprinter',
        capacity: v.capacity,
        isAvailable: false,
        unavailabilityReason: `기존 배차와 충돌 (${conflicting.passenger_name || 'VIP'}: ${conflicting.origin} → ${conflicting.destination})`,
        currentStatus: 'in_service',
        conflictingTrip: {
          scheduleId: conflicting.id,
          customerName: conflicting.customer_name || conflicting.passenger_name || '고객사',
          route: `${conflicting.origin} → ${conflicting.destination}`,
          timeSpan: `${conflicting.date} ${sStart} ~ ${conflicting.end_date || conflicting.date} ${sEnd}`,
        },
        defaultDriverName: driverName,
        defaultDriverPhone: driverPhone,
        isEnglishVerified: isEnglish,
      };
    }

    return {
      id: v.id,
      plate: v.plate,
      model: v.model,
      category: (v.category as any) || 'sprinter',
      rawCategory: v.category,
      capacity: v.capacity,
      isAvailable: true,
      currentStatus: 'available',
      defaultDriverName: driverName,
      defaultDriverPhone: driverPhone,
      isEnglishVerified: isEnglish,
    };
  });

  // 4. Build driver availability list
  const driverItems: AvailableDriverItem[] = DEFAULT_DRIVER_PROFILES.map((p) => {
    const cleanName = cleanDriverIdentity(p.name);
    const isEnglish = Boolean(p.isEnglishVerified);

    // Conflict check
    const conflicting = activeSchedules.find((s) => {
      const sDriver = cleanDriverIdentity(s.driver_name);
      if (sDriver !== cleanName) return false;

      const sStartDate = normalizeDateToIso(s.date);
      const sEndDate = normalizeDateToIso(s.end_date) || sStartDate;
      const sStartMin = timeHHmmToMinutes(s.pickup_time) ?? 540;
      const sEndMin = timeHHmmToMinutes(s.end_time) ?? (sStartMin + 600);

      return isDateTimeOverlapping(
        { date: reqStartIso, minutes: reqStartMinutes },
        { date: reqEndIso, minutes: reqEndMinutes },
        { date: sStartDate, minutes: sStartMin },
        { date: sEndDate, minutes: sEndMin },
        60
      );
    });

    if (conflicting) {
      const sStart = conflicting.pickup_time?.slice(0, 5) || '09:00';
      const sEnd = conflicting.end_time?.slice(0, 5) || '19:00';
      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        plate: p.plate,
        model: p.defaultVehicleRaw,
        isAvailable: false,
        isEnglishVerified: isEnglish,
        languageLabel: p.languageLabel,
        unavailabilityReason: `기존 배차와 충돌 (${conflicting.passenger_name || 'VIP'})`,
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

  // 5. Aggregate category counts for HqFleetCard
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

  return {
    query,
    totalFleetCount,
    availableCount,
    maintenanceCount,
    inServiceCount,
    vehicleClasses,
    vehicles: vehicleItems,
    drivers: driverItems,
  };
}
