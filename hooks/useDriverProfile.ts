'use client';

import { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';

export const VEHICLE_PROFILES_KEY = 'protocol_cockpit_vehicle_profiles_v1';
export const DEVICE_UUID_KEY = 'cockpit_device_uuid';
export const ONBOARDED_KEY = 'cockpit_driver_onboarded';

export function getOrCreateDeviceUuid(): string {
  if (typeof window === 'undefined') return 'driver_default';
  try {
    let uuid = localStorage.getItem(DEVICE_UUID_KEY);
    if (!uuid) {
      uuid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(DEVICE_UUID_KEY, uuid);
    }
    return uuid;
  } catch {
    return 'driver_default';
  }
}

export function getVehicleStorageKey(vehicleNo: string): string {
  const hochaMatch = vehicleNo.match(/(\d+)호차/);
  const cleanKey = hochaMatch ? `${hochaMatch[1]}호차` : vehicleNo.trim();
  return `cockpit_driver_profile_${cleanKey}`;
}

export function getStoredVehicleProfile(vehicleNo: string): Partial<DriverProfile> | null {
  if (typeof window === 'undefined' || !vehicleNo) return null;
  try {
    const hochaMatch = vehicleNo.match(/(\d+)호차/);
    const cleanKey = hochaMatch ? `${hochaMatch[1]}호차` : vehicleNo.trim();

    // 1. Direct vehicle-isolated key: cockpit_driver_profile_${cleanKey}
    const directKey = `cockpit_driver_profile_${cleanKey}`;
    const direct = localStorage.getItem(directKey);
    if (direct) {
      return JSON.parse(direct);
    }

    // 2. Also check without suffix or with raw vehicleNo
    const rawDirect = localStorage.getItem(`cockpit_driver_profile_${vehicleNo.trim()}`);
    if (rawDirect) {
      return JSON.parse(rawDirect);
    }

    // 3. Fallback to backward-compatible map
    const raw = localStorage.getItem(VEHICLE_PROFILES_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[cleanKey] || null;
  } catch {
    return null;
  }
}

export function setStoredVehicleProfile(vehicleNo: string, data: Partial<DriverProfile>): void {
  if (typeof window === 'undefined' || !vehicleNo) return;
  try {
    const hochaMatch = vehicleNo.match(/(\d+)호차/);
    const cleanKey = hochaMatch ? `${hochaMatch[1]}호차` : vehicleNo.trim();

    const existing = getStoredVehicleProfile(cleanKey) || {};
    const updated = {
      ...existing,
      ...data,
    };

    // 1. Save directly to isolated key: cockpit_driver_profile_${cleanKey}
    const directKey = `cockpit_driver_profile_${cleanKey}`;
    localStorage.setItem(directKey, JSON.stringify(updated));

    // 2. Backward compatibility map
    const raw = localStorage.getItem(VEHICLE_PROFILES_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[cleanKey] = updated;
    localStorage.setItem(VEHICLE_PROFILES_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to store vehicle profile in localStorage:', err);
  }
}

export const EMPTY_PROFILE: DriverProfile = {
  id: '',
  vehicleNo: '',
  carNumberFront: '',
  carNumberBack: '',
  carNumber: '',
  driverName: '',
  phonePart1: '010',
  phonePart2: '',
  phonePart3: '',
  phone: '',
  mobile: '',
  passengerName: null,
  defaultNavi: 'tmap',
  targetChatRoom: '',
};

export const DEFAULT_DRIVER_PROFILE: DriverProfile = {
  id: '',
  vehicleNo: '4호차',
  carNumberFront: '142호',
  carNumberBack: '7811',
  carNumber: '142호 7811',
  driverName: '윤태준',
  phonePart1: '010',
  phonePart2: '6348',
  phonePart3: '8726',
  phone: '010-6348-8726',
  mobile: '010-6348-8726',
  passengerName: null,
  defaultNavi: 'tmap',
  targetChatRoom: '',
};

export function useDriverProfile() {
  const [profile,setProfile]=useState<DriverProfile>(EMPTY_PROFILE);
  const [isLoaded,setIsLoaded]=useState(false);
  useEffect(()=>{
    const abort=new AbortController();
    (async()=>{
      try {
        const session=await ensureClientAuth();
        if (!session.authenticated || session.role !== 'driver') return;
        const response=await fetch('/api/driver',{signal:abort.signal,cache:'no-store'});
        if (!response.ok) throw new Error('프로필 조회 실패');
        const {driver}=await response.json();
        if (!driver?.id || abort.signal.aborted) return;
        setProfile({...EMPTY_PROFILE,id:driver.id,driverId:driver.id,driverName:driver.driver_name || '',
          vehicleNo:driver.vehicle_no || '',carNumber:driver.car_number || '',phone:driver.phone || '',mobile:driver.phone || '',
          passengerName:driver.passenger_name ?? null,defaultNavi:driver.default_navi || 'tmap',homeLocation:driver.driver_meta?.homeLocation || null});
        localStorage.setItem(ONBOARDED_KEY,'true');
      } catch { if(!abort.signal.aborted) console.warn('프로필을 조회하지 못했습니다.'); }
      finally {if(!abort.signal.aborted)setIsLoaded(true);}
    })();
    return ()=>abort.abort();
  },[]);
  const updateProfile=(patch:Partial<DriverProfile>)=>{
    setProfile(previous=>{
      const updated={...previous,...patch,id:previous.id || patch.id,driverId:previous.driverId || patch.driverId,
        phone:patch.phone ?? patch.mobile ?? previous.phone,mobile:patch.phone ?? patch.mobile ?? previous.mobile};
      // Personal preferences are never read from a vehicle's previous driver's browser cache.
      if(updated.driverId)try{localStorage.setItem(`cockpit_driver_${updated.driverId}_preferences`,JSON.stringify({defaultNavi:updated.defaultNavi,homeLocation:updated.homeLocation}));}catch{}
      return updated;
    });
  };
  return {profile,isLoaded,updateProfile,setPreferredNavi:(provider:NaviProvider)=>updateProfile({defaultNavi:provider})};
}
