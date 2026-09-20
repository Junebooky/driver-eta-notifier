'use client';

import { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';

const STORAGE_KEY = 'protocol_cockpit_driver_profile_v1';

const DEFAULT_PROFILE: DriverProfile = {
  vehicleNo: '4호차',
  driverName: '윤태준',
  passengerName: 'SOFYAN 외 1명',
  defaultNavi: 'tmap',
};

export function useDriverProfile() {
  const [profile, setProfile] = useState<DriverProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setProfile((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.warn('Failed to load profile from localStorage:', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const updateProfile = (newProfile: Partial<DriverProfile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...newProfile };
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
