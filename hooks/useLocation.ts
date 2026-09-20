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

  const requestGpsLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      const fallback = getRecentPresetFallback();
      setCurrentLocation(fallback);
      setIsUndergroundFallback(true);
      setGpsErrorMsg('브라우저 GPS 미지지원. 최근 거점으로 대체');
      return;
    }

    setIsLocating(true);
    setGpsErrorMsg(null);

    // Set 4 second timeout for underground parking response
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: LocationPreset = {
          id: 'gps_current',
          name: '현 위치 (GPS)',
          shortName: '현 위치',
          lat: latitude,
          lng: longitude,
          category: 'CUSTOM',
          address: `GPS 수신 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
        };
        setCurrentLocation(gpsLocation);
        setIsUndergroundFallback(false);
        setIsLocating(false);
      },
      (error) => {
        console.warn('GPS Error (Underground Parking):', error.message);
        const fallback = getRecentPresetFallback();
        setCurrentLocation(fallback);
        setIsUndergroundFallback(true);
        setIsLocating(false);
        setGpsErrorMsg(`지하/음영지역 (GPS 수신 불가) → 최근 거점[${fallback.shortName}] 자동 지정`);
      },
      {
        enableHighAccuracy: true,
        timeout: 4000,
        maximumAge: 30000,
      }
    );
  }, [getRecentPresetFallback]);

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
