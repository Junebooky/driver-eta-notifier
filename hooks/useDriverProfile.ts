'use client';

import { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { getPresetPassengerName } from '@/utils/constants';

const STORAGE_KEY = 'protocol_cockpit_driver_profile_v1';
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

export function getStoredVehicleProfile(vehicleNo: string): Partial<DriverProfile> | null {
  if (typeof window === 'undefined' || !vehicleNo) return null;
  try {
    const raw = localStorage.getItem(VEHICLE_PROFILES_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const hochaMatch = vehicleNo.match(/(\d+)호차/);
    const cleanKey = hochaMatch ? `${hochaMatch[1]}호차` : vehicleNo.trim();
    return map[cleanKey] || null;
  } catch {
    return null;
  }
}

export function setStoredVehicleProfile(vehicleNo: string, data: Partial<DriverProfile>): void {
  if (typeof window === 'undefined' || !vehicleNo) return;
  try {
    const raw = localStorage.getItem(VEHICLE_PROFILES_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const hochaMatch = vehicleNo.match(/(\d+)호차/);
    const cleanKey = hochaMatch ? `${hochaMatch[1]}호차` : vehicleNo.trim();
    map[cleanKey] = {
      ...(map[cleanKey] || {}),
      ...data,
    };
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
  passengerName: '',
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
  passengerName: 'SOYFAN 외 1명',
  defaultNavi: 'tmap',
  targetChatRoom: '',
};

export function useDriverProfile() {
  const [profile, setProfile] = useState<DriverProfile>(EMPTY_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const deviceUuid = getOrCreateDeviceUuid();
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);

        // Sanitize stale dummy data ('박의전' -> real driver profile)
        if (parsed.driverName === '박의전') {
          if (parsed.vehicleNo?.includes('1')) {
            parsed.driverName = '배선만';
            parsed.carNumber = '142호 7814';
            parsed.carNumberFront = '142호';
            parsed.carNumberBack = '7814';
            parsed.phone = '010-8806-9758';
            parsed.mobile = '010-8806-9758';
            parsed.phonePart1 = '010';
            parsed.phonePart2 = '8806';
            parsed.phonePart3 = '9758';
          } else {
            parsed.driverName = '홍승범';
          }
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          } catch {}
        }

        const resolvedPhone = parsed.phone || parsed.mobile || '';
        const initialVehicle = parsed.vehicleNo || '4호차';
        const hochaMatch = initialVehicle.match(/(\d+)호차/);
        const cleanHocha = hochaMatch ? `${hochaMatch[1]}호차` : initialVehicle;
        const storedForVehicle = getStoredVehicleProfile(cleanHocha);
        const resolvedPassenger =
          parsed.passengerName !== undefined && parsed.passengerName !== ''
            ? parsed.passengerName
            : storedForVehicle?.passengerName || getPresetPassengerName(cleanHocha) || '';

        setProfile((prev) => ({
          ...prev,
          id: deviceUuid,
          ...parsed,
          phone: resolvedPhone || prev.phone || '',
          mobile: resolvedPhone || prev.mobile || '',
          defaultNavi: parsed.defaultNavi || 'tmap',
          passengerName: resolvedPassenger,
        }));
      } else {
        setProfile({
          ...EMPTY_PROFILE,
          id: deviceUuid,
        });
      }
    } catch (e) {
      console.warn('Failed to load profile from localStorage:', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const updateProfile = (newProfile: Partial<DriverProfile>) => {
    setProfile((prev) => {
      const resolvedPhone =
        newProfile.phone !== undefined
          ? newProfile.phone
          : newProfile.mobile !== undefined
          ? newProfile.mobile
          : prev.phone;

      const currentVehicle = prev.vehicleNo || '4호차';
      const targetVehicle = newProfile.vehicleNo || currentVehicle;
      const targetHochaMatch = targetVehicle.match(/(\d+)호차/);
      const cleanTargetVehicle = targetHochaMatch ? `${targetHochaMatch[1]}호차` : targetVehicle.trim();
      const isSwitchingVehicle = newProfile.vehicleNo !== undefined && newProfile.vehicleNo !== prev.vehicleNo;

      let resolvedPassenger = prev.passengerName;
      if (newProfile.passengerName !== undefined) {
        resolvedPassenger = newProfile.passengerName;
      } else if (isSwitchingVehicle) {
        // When vehicle is switched without explicit passenger name, load target vehicle's isolated passenger!
        const vehicleCache = getStoredVehicleProfile(cleanTargetVehicle);
        resolvedPassenger =
          vehicleCache?.passengerName !== undefined
            ? vehicleCache.passengerName
            : getPresetPassengerName(cleanTargetVehicle) || '';
      }

      const updated: DriverProfile = {
        ...prev,
        ...newProfile,
        id: prev.id || getOrCreateDeviceUuid(),
        phone: resolvedPhone,
        mobile: resolvedPhone,
        defaultNavi: newProfile.defaultNavi || prev.defaultNavi || 'tmap',
        passengerName: resolvedPassenger,
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        if (cleanTargetVehicle) {
          setStoredVehicleProfile(cleanTargetVehicle, {
            vehicleNo: updated.vehicleNo,
            carNumber: updated.carNumber,
            driverName: updated.driverName,
            phone: updated.phone,
            passengerName: resolvedPassenger,
            defaultNavi: updated.defaultNavi,
          });
        }
      } catch (e) {
        console.warn('Failed to save profile to localStorage:', e);
      }
      return updated;
    });
  };

  const setPreferredNavi = (provider: NaviProvider) => {
    updateProfile({ defaultNavi: provider });
  };

  return {
    profile,
    isLoaded,
    updateProfile,
    setPreferredNavi,
  };
}
