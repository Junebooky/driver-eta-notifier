'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { useLocation } from '@/hooks/useLocation';
import { Header } from '@/components/Header';
import { ProfileModal } from '@/components/ProfileModal';
import { OriginDestinationSelector } from '@/components/OriginDestinationSelector';
import { PresetButtons } from '@/components/PresetButtons';
import { CustomPresetModal } from '@/components/CustomPresetModal';
import { RouteInfoCard } from '@/components/RouteInfoCard';
import { ReportTemplateSelector } from '@/components/ReportTemplateSelector';
import { ActionPanel } from '@/components/ActionPanel';
import { Toast } from '@/components/Toast';
import { A2HSBanner } from '@/components/A2HSBanner';
import { LocationPreset, ReportMode, RouteEstimate } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { generateReportText } from '@/utils/reportGenerator';
import { calculateHaversineEstimate } from '@/utils/navigation';

const CUSTOM_PRESETS_KEY = 'protocol_cockpit_custom_presets_v1';

export default function Home() {
  const { profile, isLoaded, updateProfile, setPreferredNavi } = useDriverProfile();
  const {
    currentLocation: origin,
    setCurrentLocation: setOrigin,
    isLocating,
    isUndergroundFallback,
    gpsErrorMsg,
    requestGpsLocation,
    saveRecentPreset,
  } = useLocation();

  // Selection target mode: 'origin' or 'destination' (default: 'destination')
  const [selectionTarget, setSelectionTarget] = useState<'origin' | 'destination'>('destination');

  // Custom Presets State
  const [customPresets, setCustomPresets] = useState<LocationPreset[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Load Custom Presets from LocalStorage on mount
  useEffect(() => {
    try {
      const savedPresets = localStorage.getItem(CUSTOM_PRESETS_KEY);
      if (savedPresets) {
        setCustomPresets(JSON.parse(savedPresets));
      }
    } catch (e) {
      console.warn('Failed to load presets from storage:', e);
    }
  }, []);

  // Save Custom Presets to LocalStorage
  const saveCustomPresetsToStorage = (updated: LocationPreset[]) => {
    setCustomPresets(updated);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save custom presets:', e);
    }
  };

  const handleAddCustomPreset = (newPreset: LocationPreset) => {
    const updated = [newPreset, ...customPresets];
    saveCustomPresetsToStorage(updated);
    if (selectionTarget === 'origin') {
      setOrigin(newPreset);
    } else {
      setDestination(newPreset);
    }
    setToastMessage(`커스텀 거점 [${newPreset.shortName}] 추가 완료`);
  };

  const handleDeleteCustomPreset = (id: string) => {
    const updated = customPresets.filter((p) => p.id !== id);
    saveCustomPresetsToStorage(updated);
    if (destination.id === id) {
      setDestination(DEFAULT_PRESET_LOCATIONS[0]);
    }
    if (origin.id === id) {
      setOrigin(DEFAULT_PRESET_LOCATIONS[2]);
    }
    setToastMessage('커스텀 거점이 삭제되었습니다.');
  };

  // Combine Default Presets + Custom Presets
  const allPresets = useMemo(() => {
    return [...DEFAULT_PRESET_LOCATIONS, ...customPresets];
  }, [customPresets]);

  const [destination, setDestination] = useState<LocationPreset>(DEFAULT_PRESET_LOCATIONS[0]);
  const [reportMode, setReportMode] = useState<ReportMode>('DEPARTURE');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Route estimation state
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch route duration & ETA from API
  const fetchRouteEstimate = useCallback(
    async (start: LocationPreset, end: LocationPreset) => {
      setIsLoadingRoute(true);
      try {
        const res = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startLat: start.lat,
            startLng: start.lng,
            endLat: end.lat,
            endLng: end.lng,
          }),
        });

        if (res.ok) {
          const data: RouteEstimate = await res.json();
          setRouteEstimate(data);
        } else {
          throw new Error('Route API response not ok');
        }
      } catch (err) {
        console.warn('Route estimate fetch failed, fallback to haversine estimate:', err);
        const fallbackEstimate = calculateHaversineEstimate(start.lat, start.lng, end.lat, end.lng);
        setRouteEstimate(fallbackEstimate);
      } finally {
        setIsLoadingRoute(false);
      }
    },
    []
  );

  // Fetch route when origin or destination changes
  useEffect(() => {
    if (origin && destination) {
      fetchRouteEstimate(origin, destination);
    }
  }, [origin, destination, fetchRouteEstimate]);

  // Handle Preset Selection mapped to current target (origin or destination)
  const handleSelectPreset = (preset: LocationPreset) => {
    if (selectionTarget === 'origin') {
      setOrigin(preset);
      saveRecentPreset(preset);
      setToastMessage(`출발지: [${preset.shortName}] 지정됨`);
    } else {
      setDestination(preset);
      saveRecentPreset(preset);
      setToastMessage(`목적지: [${preset.shortName}] 지정됨`);
    }
  };

  // Bidirectional Swap UX (⇄)
  const handleSwapOriginDestination = () => {
    const prevOrigin = origin;
    const prevDestination = destination;
    setOrigin(prevDestination);
    setDestination(prevOrigin);
    setToastMessage(`출발지 ⇄ 목적지 맞교환: [${prevDestination.shortName}] ↔ [${prevOrigin.shortName}]`);
  };

  // Pre-calculated Report Text synchronously updated (Guarantees Safari User Gesture Compliance)
  const reportPreviewText = useMemo(() => {
    return generateReportText({
      profile,
      origin,
      destination,
      etaFormatted: routeEstimate?.etaFormatted || '약 70분 후',
      mode: reportMode,
    });
  }, [profile, origin, destination, routeEstimate, reportMode]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-slate-500 font-bold text-sm">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>관제 런처 시스템 로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-10 flex flex-col items-center bg-[#F8FAFC] text-slate-900">
      {/* 480px Mobile Viewport Container */}
      <div className="w-full max-w-[480px] min-h-screen flex flex-col justify-between border-x border-slate-200 shadow-sm bg-[#F8FAFC]">
        {/* Top Header with Safe Area Inset & Minimal Navi Switcher */}
        <Header
          profile={profile}
          onOpenProfileModal={() => setIsProfileModalOpen(true)}
          onSelectNavi={(prov) => {
            setPreferredNavi(prov);
            setToastMessage(`주력 내비게이션 [${prov.toUpperCase()}] 변경됨`);
          }}
        />

        {/* Add to Home Screen Guidance Banner */}
        <A2HSBanner />

        {/* Main Dashboard Content */}
        <div className="flex-1 p-3.5 space-y-3">
          {/* 1. Origin / Destination Separate Selection & Bidirectional Swap (⇄) UX */}
          <OriginDestinationSelector
            origin={origin}
            destination={destination}
            selectionTarget={selectionTarget}
            onSelectTarget={(target) => setSelectionTarget(target)}
            onSwap={handleSwapOriginDestination}
          />

          {/* 2. Simplified High-Density Preset Chips Grid */}
          <PresetButtons
            presets={allPresets}
            selectedOriginId={origin?.id}
            selectedDestinationId={destination?.id}
            onSelectPreset={handleSelectPreset}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onDeleteCustomPreset={handleDeleteCustomPreset}
          />

          {/* 3. Route Estimation & ETA Status */}
          <RouteInfoCard
            routeEstimate={routeEstimate}
            isLoadingRoute={isLoadingRoute}
            isLocating={isLocating}
            isUndergroundFallback={isUndergroundFallback}
            gpsErrorMsg={gpsErrorMsg}
            onRequestGps={requestGpsLocation}
            onRefreshRoute={() => {
              fetchRouteEstimate(origin, destination);
              setToastMessage('ETA 및 실시간 경로를 재계산했습니다.');
            }}
          />

          {/* 4. Report Template Selector */}
          <ReportTemplateSelector
            currentMode={reportMode}
            onSelectMode={(mode) => setReportMode(mode)}
            reportPreviewText={reportPreviewText}
          />

          {/* 5. 1-Sec Fast Pass & Kakao Share Action Panel */}
          <ActionPanel
            defaultNavi={profile.defaultNavi}
            origin={origin}
            destination={destination}
            routeEstimate={routeEstimate}
            reportText={reportPreviewText}
            onShowToast={(msg) => setToastMessage(msg)}
          />
        </div>

        {/* Cockpit Footer */}
        <footer className="px-4 py-3 text-center text-[11px] font-semibold border-t border-slate-200 bg-white text-slate-500">
          PROTOCOL COCKPIT v2.6 • VIP DRIVER SMART LAUNCHER
        </footer>
      </div>

      {/* Driver Profile Edit Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={profile}
        onSave={(updated) => {
          updateProfile(updated);
          setToastMessage('드라이버 프로필이 저장되었습니다.');
        }}
      />

      {/* Custom VIP Preset Add Modal */}
      <CustomPresetModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPreset={handleAddCustomPreset}
      />

      {/* Feedback Toast Notification */}
      <Toast
        message={toastMessage}
        onClose={() => setToastMessage(null)}
      />
    </main>
  );
}
