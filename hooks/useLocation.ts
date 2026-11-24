'use client';

import { useState, useCallback } from 'react';
import { LocationPreset } from '@/types';
import { DEFAULT_ORIGIN } from '@/utils/presets';

const RECENT_PRESET_KEY = 'protocol_cockpit_recent_preset_v1';

export function useLocation() {
  const [currentLocation, setCurrentLocation] = useState<LocationPreset>(DEFAULT_ORIGIN);
  const [isLocating, setIsLocating] = useState(false);
  const [isUndergroundFallback, setIsUndergroundFallback] = useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);

  // Save selected preset location as recent origin fallback
  const saveRecentPreset = useCallback((preset: LocationPreset) => {
    try {
      localStorage.setItem(RECENT_PRESET_KEY, JSON.stringify(preset));
    } catch (e) {
      console.warn('Failed to save recent preset:', e);
    }
  }, []);

  const getRecentPresetFallback = useCallback((): LocationPreset => {
    try {
      const saved = localStorage.getItem(RECENT_PRESET_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load recent preset:', e);
    }
    return DEFAULT_ORIGIN;
  }, []);

  const requestGpsLocation = useCallback((onSuccess?: (loc: LocationPreset) => void) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      const fallback = getRecentPresetFallback();
      setCurrentLocation(fallback);
      setIsUndergroundFallback(true);
      setGpsErrorMsg('브라우저 GPS 미지원. 최근 거점으로 대체');
      if (onSuccess) onSuccess(fallback);
      return;
    }

    setIsLocating(true);
    setGpsErrorMsg(null);

    // Set 5 second timeout for GPS response
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let resolvedAddress = `GPS 수신 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

        try {
          const res = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.address) {
              resolvedAddress = data.address;
            }
          }
        } catch (e) {
          console.warn('Reverse geocoding error:', e);
        }

        const gpsLocation: LocationPreset = {
          id: 'gps_current',
          name: '현위치',
          shortName: '현위치',
          lat: latitude,
          lng: longitude,
          category: 'CUSTOM',
          address: resolvedAddress,
        };

        setCurrentLocation(gpsLocation);
        saveRecentPreset(gpsLocation);
        setIsUndergroundFallback(false);
        setIsLocating(false);
        if (onSuccess) onSuccess(gpsLocation);
      },
      (error) => {
        console.warn('GPS Error (Underground Parking):', error.message);
        const fallback = getRecentPresetFallback();
        setCurrentLocation(fallback);
        setIsUndergroundFallback(true);
        setIsLocating(false);
        setGpsErrorMsg(`지하/음영지역 (GPS 수신 불가) → 최근 거점[${fallback.shortName}] 자동 지정`);
        if (onSuccess) onSuccess(fallback);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000,
      }
    );
  }, [getRecentPresetFallback, saveRecentPreset]);

  return {
    currentLocation,
    setCurrentLocation,
    isLocating,
    isUndergroundFallback,
    gpsErrorMsg,
    requestGpsLocation,
    saveRecentPreset,
  };
}
