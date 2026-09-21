'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { useLocation } from '@/hooks/useLocation';
import { Header } from '@/components/Header';
import { ProfileModal } from '@/components/ProfileModal';
import { AdminPinModal } from '@/components/AdminPinModal';
import { OriginDestinationSelector } from '@/components/OriginDestinationSelector';
import { PresetButtons } from '@/components/PresetButtons';
import { CustomPresetModal } from '@/components/CustomPresetModal';
import { RouteInfoCard } from '@/components/RouteInfoCard';
import { ReportTemplateSelector } from '@/components/ReportTemplateSelector';
import { ActionPanel } from '@/components/ActionPanel';
import { A2HSBanner } from '@/components/A2HSBanner';
import { LocationPreset, ReportMode, RouteEstimate, HomeLocation } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { generateReportText } from '@/utils/reportGenerator';
import { calculateHaversineEstimate } from '@/utils/navigation';

const CUSTOM_PRESETS_KEY = 'protocol_cockpit_custom_presets_v1';
const ORDERED_PRESETS_KEY = 'protocol_cockpit_ordered_presets_v2';
const ADMIN_MODE_KEY = 'protocol_cockpit_admin_mode_v1';

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

  // Ordered Presets State (combining defaults + customs with permanent order persistence)
  const [presets, setPresets] = useState<LocationPreset[]>(DEFAULT_PRESET_LOCATIONS);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<LocationPreset | null>(null);

  // Admin PIN Mode ('1010') State
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Home Registration Modal State
  const [isHomeModalOpen, setIsHomeModalOpen] = useState(false);

  // Load Presets & Admin State from LocalStorage on mount
  useEffect(() => {
    try {
      const savedAdmin = localStorage.getItem(ADMIN_MODE_KEY);
      if (savedAdmin === 'true') {
        setIsAdmin(true);
      }

      const savedOrdered = localStorage.getItem(ORDERED_PRESETS_KEY);
      if (savedOrdered) {
        setPresets(JSON.parse(savedOrdered));
        return;
      }
      const savedCustom = localStorage.getItem(CUSTOM_PRESETS_KEY);
      if (savedCustom) {
        const parsedCustom = JSON.parse(savedCustom);
        setPresets([...DEFAULT_PRESET_LOCATIONS, ...parsedCustom]);
        return;
      }
    } catch (e) {
      console.warn('Failed to load presets from storage:', e);
    }
    setPresets(DEFAULT_PRESET_LOCATIONS);
  }, []);

  // Supabase Fleet Architecture Data Synchronization
  useEffect(() => {
    const driverId = profile.id || 'driver_4';

    async function syncSupabaseFleet() {
      try {
        // 1. Fetch Presets from Supabase
        const pRes = await fetch(`/api/presets?driverId=${driverId}`);
        if (pRes.ok) {
          const data = await pRes.json();
          if (data.presets && data.presets.length > 0) {
            setPresets(data.presets);
            localStorage.setItem(ORDERED_PRESETS_KEY, JSON.stringify(data.presets));
          }
        }

        // 2. Fetch Driver Profile & Home Location from Supabase
        const dRes = await fetch(`/api/driver?id=${driverId}`);
        if (dRes.ok) {
          const dData = await dRes.json();
          if (dData.driver) {
            const { vehicle_no, driver_name, home_location } = dData.driver;
            updateProfile({
              vehicleNo: vehicle_no || profile.vehicleNo,
              driverName: driver_name || profile.driverName,
              homeLocation: home_location || profile.homeLocation,
            });
          }
        }
      } catch (err) {
        console.warn('Supabase remote sync skipped/unavailable:', err);
      }
    }

    if (isLoaded) {
      syncSupabaseFleet();
    }
  }, [isLoaded, profile.id]);

  // Save Presets to LocalStorage
  const savePresetsToStorage = (updated: LocationPreset[]) => {
    setPresets(updated);
    try {
      localStorage.setItem(ORDERED_PRESETS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save ordered presets:', e);
    }
  };

  const handleToggleAdmin = (status: boolean) => {
    setIsAdmin(status);
    try {
      localStorage.setItem(ADMIN_MODE_KEY, String(status));
    } catch (e) {}
  };

  const handleOpenAddModal = () => {
    setEditingPreset(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (preset: LocationPreset) => {
    setEditingPreset(preset);
    setIsAddModalOpen(true);
  };

  const handleAddCustomPreset = async (newPreset: LocationPreset) => {
    const presetWithGlobal: LocationPreset = {
      ...newPreset,
      isGlobal: isAdmin,
      driverId: isAdmin ? null : (profile.id || 'driver_4'),
    };

    const updated = [...presets, presetWithGlobal];
    savePresetsToStorage(updated);

    if (selectionTarget === 'origin') {
      setOrigin(presetWithGlobal);
    } else {
      setDestination(presetWithGlobal);
    }

    // Supabase Sync
    try {
      await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(presetWithGlobal),
      });
    } catch (e) {
      console.warn('Failed to sync new preset to Supabase:', e);
    }
  };

  const handleUpdatePreset = async (updatedPreset: LocationPreset) => {
    const updated = presets.map((p) => (p.id === updatedPreset.id ? updatedPreset : p));
    savePresetsToStorage(updated);
    if (destination.id === updatedPreset.id) {
      setDestination(updatedPreset);
    }
    if (origin.id === updatedPreset.id) {
      setOrigin(updatedPreset);
    }

    // Supabase Sync
    try {
      await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPreset),
      });
    } catch (e) {
      console.warn('Failed to sync updated preset to Supabase:', e);
    }
  };

  const handleDeleteCustomPreset = async (id: string) => {
    const updated = presets.filter((p) => p.id !== id);
    savePresetsToStorage(updated);
    if (destination.id === id) {
      setDestination(DEFAULT_PRESET_LOCATIONS[0]);
    }
    if (origin.id === id) {
      setOrigin(DEFAULT_PRESET_LOCATIONS[2]);
    }

    // Supabase Sync
    try {
      await fetch(`/api/presets?id=${id}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('Failed to delete preset from Supabase:', e);
    }
  };

  const handleReorderPresets = async (reordered: LocationPreset[]) => {
    savePresetsToStorage(reordered);

    // Sync reordered array IDs to Supabase cockpit_drivers
    try {
      await fetch('/api/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profile.id || 'driver_4',
          presetOrder: reordered.map((p) => p.id),
        }),
      });
    } catch (e) {
      console.warn('Failed to sync preset order to Supabase:', e);
    }
  };

  // Register or update Home Location
  const handleSaveHomeLocation = async (homeData: HomeLocation) => {
    updateProfile({ homeLocation: homeData });

    // Supabase Sync
    try {
      await fetch('/api/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profile.id || 'driver_4',
          vehicleNo: profile.vehicleNo,
          driverName: profile.driverName,
          homeLocation: homeData,
        }),
      });
    } catch (e) {
      console.warn('Failed to sync home location to Supabase:', e);
    }
  };

  const [destination, setDestination] = useState<LocationPreset>(DEFAULT_PRESET_LOCATIONS[0]);
  const [reportMode, setReportMode] = useState<ReportMode>('DEPARTURE');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Route estimation state (initialized with immediate dynamic estimate)
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate>(() =>
    calculateHaversineEstimate(origin.lat, origin.lng, DEFAULT_PRESET_LOCATIONS[0].lat, DEFAULT_PRESET_LOCATIONS[0].lng)
  );
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);


  // Fetch route duration & ETA from API with dynamic client clock calculation
  const fetchRouteEstimate = useCallback(
    async (start: LocationPreset, end: LocationPreset) => {
      setIsLoadingRoute(true);
      try {
        const url = `/api/route?startX=${start.lng}&startY=${start.lat}&endX=${end.lng}&endY=${end.lat}&startName=${encodeURIComponent(
          start.shortName
        )}&endName=${encodeURIComponent(end.shortName)}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Route API error ${res.status}`);
        }

        const data = await res.json();
        const durationMinutes = data.durationMinutes || 45;

        // Dynamic ETA Calculation from Local Device Clock
        const now = new Date();
        const etaDate = new Date(now.getTime() + durationMinutes * 60 * 1000);
        const hours24 = etaDate.getHours();
        const hours12 = hours24 % 12 || 12;
        const minutes = String(etaDate.getMinutes()).padStart(2, '0');
        const period = hours24 >= 12 ? '오후' : '오전';
        const dynamicEtaFormatted = `${period} ${hours12}:${minutes}`;

        setRouteEstimate({
          distanceKm: data.distanceKm || 50,
          durationMinutes,
          etaFormatted: dynamicEtaFormatted,
          trafficSummary: data.trafficSummary || '원활',
          isMock: Boolean(data.isMock),
          isFallback: Boolean(data.isFallback),
          fallbackNotice: data.fallbackNotice,
          isCached: Boolean(data.isCached),
        });
      } catch (err: any) {
        console.warn('Falling back to haversine estimate:', err?.message);
        const fallback = calculateHaversineEstimate(start.lat, start.lng, end.lat, end.lng);
        setRouteEstimate(fallback);
      } finally {
        setIsLoadingRoute(false);
      }
    },
    []
  );

  // Recalculate route whenever origin or destination coordinates change
  useEffect(() => {
    if (origin && destination) {
      fetchRouteEstimate(origin, destination);
    }
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, fetchRouteEstimate]);

  // Handle Preset Button Click
  const handleSelectPreset = (preset: LocationPreset) => {
    let resolvedPreset = preset;
    // Resolve Home slot
    if (preset.id === 'slot_home') {
      if (profile.homeLocation) {
        resolvedPreset = {
          id: 'slot_home',
          name: profile.homeLocation.name || '자택',
          shortName: '자택',
          lat: profile.homeLocation.lat,
          lng: profile.homeLocation.lng,
          category: 'HOME',
          address: profile.homeLocation.address,
        };
      } else {
        setIsHomeModalOpen(true);
        return;
      }
    }

    if (selectionTarget === 'origin') {
      setOrigin(resolvedPreset);
      saveRecentPreset(resolvedPreset);
      setSelectionTarget('destination');
    } else {
      setDestination(resolvedPreset);
    }
  };

  // Bidirectional Swap UX (⇄)
  const handleSwapOriginDestination = () => {
    const currentOrigin = origin;
    const currentDestination = destination;

    setOrigin(currentDestination);
    setDestination(currentOrigin);
    saveRecentPreset(currentDestination);
  };

  // Real-time dynamic report text generated from current state
  const reportPreviewText = useMemo(() => {
    return generateReportText({
      mode: reportMode,
      profile,
      origin,
      destination,
      etaFormatted: routeEstimate?.etaFormatted,
      distanceKm: routeEstimate?.distanceKm,
      durationMinutes: routeEstimate?.durationMinutes,
    });
  }, [reportMode, profile, origin, destination, routeEstimate]);

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col items-center justify-start pb-24 selection:bg-[#1E60F3]/20">
      <div className="w-full max-w-md mx-auto min-h-screen flex flex-col bg-white shadow-xl relative border-x border-slate-200/60">
        {/* Top Header with Safe Area Inset & Navi Switcher */}
        <Header
          profile={profile}
          onOpenProfileModal={() => setIsProfileModalOpen(true)}
          onSelectNavi={(prov) => {
            setPreferredNavi(prov);
          }}
          onOpenAdminModal={() => setIsAdminModalOpen(true)}
          isAdmin={isAdmin}
        />

        {/* Add to Home Screen Guidance Banner */}
        <A2HSBanner />

        {/* Admin Mode Active Banner */}
        {isAdmin && (
          <div className="px-4 py-2 bg-blue-600 text-white text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              관리자 모드 활성화 (전사 공통 거점 등록·삭제 가능)
            </span>
            <button
              onClick={() => handleToggleAdmin(false)}
              className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[11px] font-extrabold cursor-pointer"
            >
              종료
            </button>
          </div>
        )}

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

          {/* 2. Simplified High-Density Preset Chips Grid (Slot #1 Home Fixed + 2D Hysteresis Drag) */}
          <PresetButtons
            presets={presets}
            homeLocation={profile.homeLocation}
            selectedOriginId={origin?.id}
            selectedDestinationId={destination?.id}
            isAdmin={isAdmin}
            onSelectPreset={handleSelectPreset}
            onOpenAddModal={handleOpenAddModal}
            onOpenHomeModal={() => setIsHomeModalOpen(true)}
            onEditPreset={handleOpenEditModal}
            onDeleteCustomPreset={handleDeleteCustomPreset}
            onReorderPresets={handleReorderPresets}
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
            targetChatRoom={profile.targetChatRoom}
          />
        </div>
      </div>

      {/* Driver Profile Edit Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={profile}
        onSave={(updated) => {
          updateProfile(updated);
          // Sync profile to Supabase
          fetch('/api/driver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: profile.id || 'driver_4',
              vehicleNo: updated.vehicleNo,
              driverName: updated.driverName,
            }),
          }).catch((err) => console.warn('Supabase driver profile sync error:', err));
        }}
      />

      {/* Admin Mode Master PIN ('1010') Modal */}
      <AdminPinModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        isAdmin={isAdmin}
        onToggleAdmin={handleToggleAdmin}
      />

      {/* Custom VIP Preset Add / Edit Modal */}
      <CustomPresetModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingPreset(null);
        }}
        onAddPreset={handleAddCustomPreset}
        presetToEdit={editingPreset}
        onUpdatePreset={handleUpdatePreset}
        isAdmin={isAdmin}
      />

      {/* Home Location Address Registration Modal */}
      <CustomPresetModal
        isOpen={isHomeModalOpen}
        onClose={() => setIsHomeModalOpen(false)}
        onAddPreset={() => {}}
        isHomeMode={true}
        onSaveHome={handleSaveHomeLocation}
      />

    </main>
  );
}
