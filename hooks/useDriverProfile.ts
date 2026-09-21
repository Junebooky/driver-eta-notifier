'use client';

import { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';

const STORAGE_KEY = 'protocol_cockpit_driver_profile_v1';
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

const DEFAULT_PROFILE: DriverProfile = {
  id: '',
  vehicleNo: '',
  driverName: '',
  passengerName: '',
  defaultNavi: 'tmap',
  targetChatRoom: '',
};

export function useDriverProfile() {
  const [profile, setProfile] = useState<DriverProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const deviceUuid = getOrCreateDeviceUuid();
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setProfile((prev) => ({
          ...prev,
          id: deviceUuid,
          ...parsed,
          defaultNavi: parsed.defaultNavi || 'tmap',
          passengerName: parsed.passengerName !== undefined ? parsed.passengerName : prev.passengerName,
        }));
      } else {
        setProfile((prev) => ({
          ...prev,
          id: deviceUuid,
        }));
      }
    } catch (e) {
      console.warn('Failed to load profile from localStorage:', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const updateProfile = (newProfile: Partial<DriverProfile>) => {
    setProfile((prev) => {
      const updated = {
        ...prev,
        ...newProfile,
        id: prev.id || getOrCreateDeviceUuid(),
        defaultNavi: newProfile.defaultNavi || prev.defaultNavi || 'tmap',
        passengerName:
          newProfile.passengerName !== undefined
            ? newProfile.passengerName
            : prev.passengerName,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
