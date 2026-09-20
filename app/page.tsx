'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { useLocation } from '@/hooks/useLocation';
import { Header } from '@/components/Header';
import { ProfileModal } from '@/components/ProfileModal';
import { PresetButtons } from '@/components/PresetButtons';
import { RouteInfoCard } from '@/components/RouteInfoCard';
import { ReportTemplateSelector } from '@/components/ReportTemplateSelector';
import { ActionPanel } from '@/components/ActionPanel';
import { Toast } from '@/components/Toast';
import { LocationPreset, ReportMode, RouteEstimate } from '@/types';
import { PRESET_LOCATIONS } from '@/utils/presets';
import { generateReportText } from '@/utils/reportGenerator';
import { initKakaoSDK } from '@/utils/kakao';

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

  const [destination, setDestination] = useState<LocationPreset>(PRESET_LOCATIONS[0]);
  const [reportMode, setReportMode] = useState<ReportMode>('DEPARTURE');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  
  // Route estimation state
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize Kakao SDK on mount
  useEffect(() => {
    initKakaoSDK();
  }, []);

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
        console.warn('Route estimate fetch failed, fallback to mock data:', err);
        const durationMinutes = 70;
        const now = new Date();
        const etaTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
        const hours = String(etaTime.getHours()).padStart(2, '0');
        const minutes = String(etaTime.getMinutes()).padStart(2, '0');

        setRouteEstimate({
          distanceKm: 62.4,
          durationMinutes,
          etaFormatted: `${hours}:${minutes} (약 70분 소요)`,
          trafficSummary: '모의 계산',
          isMock: true,
        });
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

  // Handle Preset Destination Click
  const handleSelectDestination = (preset: LocationPreset) => {
    setDestination(preset);
    saveRecentPreset(preset); // Update recent preset for underground GPS fallback
    setToastMessage(`목적지 변경: [${preset.shortName}]`);
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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400 font-bold text-sm">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>관제 런처 시스템 로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 pb-10 flex flex-col items-center">
      {/* 480px Mobile Viewport Container */}
      <div className="w-full max-w-[480px] min-h-screen flex flex-col justify-between border-x border-zinc-850 shadow-2xl bg-zinc-950">
        
        {/* Top Header with Quick Navi Selector & Vehicle Info */}
        <Header
          profile={profile}
          onOpenProfileModal={() => setIsProfileModalOpen(true)}
          onSelectNavi={(prov) => {
            setPreferredNavi(prov);
            setToastMessage(`주력 내비게이션 [${prov.toUpperCase()}] 변경됨`);
          }}
        />

        {/* Main Dashboard Content */}
        <div className="flex-1 p-4 space-y-4">
          
          {/* VIP Destination Presets Grid */}
          <PresetButtons
            selectedDestination={destination}
            onSelectDestination={handleSelectDestination}
          />

          {/* Route Estimation & GPS Status */}
          <RouteInfoCard
            origin={origin}
            destination={destination}
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

          {/* Report Template Selector & Live Preview */}
          <ReportTemplateSelector
            currentMode={reportMode}
            onSelectMode={(mode) => setReportMode(mode)}
            reportPreviewText={reportPreviewText}
          />

          {/* 1-Sec Fast Pass & Kakao Share Action Panel */}
          <ActionPanel
            defaultNavi={profile.defaultNavi}
            destination={destination}
            reportText={reportPreviewText}
            onShowToast={(msg) => setToastMessage(msg)}
          />
        </div>

        {/* Cockpit Footer */}
        <footer className="px-4 py-3 text-center text-[11px] text-zinc-600 font-semibold border-t border-zinc-900 bg-zinc-950">
          PROTOCOL COCKPIT v1.4 • VIP DRIVER SMART LAUNCHER
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

      {/* Feedback Toast Notification */}
      <Toast
        message={toastMessage}
        onClose={() => setToastMessage(null)}
      />
    </main>
  );
}
