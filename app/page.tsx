'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDriverProfile, getOrCreateDeviceUuid } from '@/hooks/useDriverProfile';
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
import { DepartureTimePickerModal } from '@/components/DepartureTimePickerModal';
import { PredictionResultSheet } from '@/components/PredictionResultSheet';
import { GasStationModal } from '@/components/GasStationModal';
import { PredictionResult } from '@/app/api/route/prediction/route';
import { LocationPreset, ReportMode, RouteEstimate, HomeLocation, GasStation } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { generateReportText } from '@/utils/reportGenerator';
import { calculateHaversineEstimate, getEtaString } from '@/utils/navigation';

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

  // Real-time Gas Station Modal State
  const [isGasModalOpen, setIsGasModalOpen] = useState(false);

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
    const driverId = profile.id || getOrCreateDeviceUuid();

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
            const { vehicle_no, driver_name, passenger_name, home_location } = dData.driver;
            updateProfile({
              vehicleNo: vehicle_no ?? profile.vehicleNo,
              driverName: driver_name ?? profile.driverName,
              passengerName: passenger_name ?? profile.passengerName,
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
      driverId: isAdmin ? null : (profile.id || getOrCreateDeviceUuid()),
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
          id: profile.id || getOrCreateDeviceUuid(),
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
          id: profile.id || getOrCreateDeviceUuid(),
          vehicleNo: profile.vehicleNo,
          driverName: profile.driverName,
          homeLocation: homeData,
        }),
      });
    } catch (e) {
      console.warn('Failed to sync home location to Supabase:', e);
    }
  };

  const [isInitialized, setIsInitialized] = useState(false);
  const [destination, setDestination] = useState<LocationPreset>(DEFAULT_PRESET_LOCATIONS[0]);
  const [reportMode, setReportMode] = useState<ReportMode>('DEPARTURE');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<'splash' | 'sheet' | null>(null);

  // Initialization Gate: check driver onboarding status on first launch before revealing dashboard
  useEffect(() => {
    try {
      const onboarded = localStorage.getItem('cockpit_driver_onboarded');
      if (!onboarded) {
        setIsOnboarding(true);
        setOnboardingStage('splash');
        setIsInitialized(true);
        // Phase 1: Micro Splash (2.1s) -> Phase 2: Centered Onboarding Modal
        const timer = setTimeout(() => {
          setOnboardingStage('sheet');
          setIsProfileModalOpen(true);
        }, 2100);
        return () => clearTimeout(timer);
      } else {
        setIsInitialized(true);
      }
    } catch (e) {
      console.warn('Failed to check driver onboarding status:', e);
      setIsInitialized(true);
    }
  }, []);

  // Route estimation state (initialized with immediate dynamic estimate)
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate>(() =>
    calculateHaversineEstimate(origin.lat, origin.lng, DEFAULT_PRESET_LOCATIONS[0].lat, DEFAULT_PRESET_LOCATIONS[0].lng)
  );
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Departure Time & AI Prediction State (Isolated Simulation Layer)
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isPredictionSheetOpen, setIsPredictionSheetOpen] = useState(false);
  const [simulationDepartureDate, setSimulationDepartureDate] = useState<Date>(() => new Date());
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);

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

        // Dynamic ETA Calculation from Local Device Clock (Strict 24h format HH:mm)
        const now = new Date();
        const dynamicEtaFormatted = getEtaString(durationMinutes, now);

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

  // Fetch AI Prediction for future departure time (Isolated simulation only)
  const fetchPrediction = useCallback(
    async (targetDate: Date, start: LocationPreset, end: LocationPreset) => {
      setIsLoadingPrediction(true);
      try {
        const res = await fetch('/api/route/prediction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            departure: { name: start.shortName || start.name, lat: start.lat, lng: start.lng },
            destination: { name: end.shortName || end.name, lat: end.lat, lng: end.lng },
            predictionTime: targetDate.toISOString(),
          }),
        });
        if (!res.ok) {
          throw new Error(`Prediction API error ${res.status}`);
        }
        const data: PredictionResult = await res.json();
        setPredictionResult(data);
      } catch (err: any) {
        console.warn('Prediction fetch error:', err);
      } finally {
        setIsLoadingPrediction(false);
      }
    },
    []
  );

  // Recalculate route whenever origin or destination coordinates change (Strictly Real-time TMAP)
  useEffect(() => {
    if (origin && destination) {
      fetchRouteEstimate(origin, destination);
    }
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, fetchRouteEstimate]);

  // Handle Departure Time selection from Wheel Picker (Simulation Preview Only)
  const handleConfirmDepartureTime = (date: Date) => {
    setSimulationDepartureDate(date);
    setIsTimePickerOpen(false);
    setIsPredictionSheetOpen(true);
    if (origin && destination) {
      fetchPrediction(date, origin, destination);
    }
  };

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

  // Select gas station as destination and trigger ETA calculation
  const handleSelectGasStation = (station: GasStation) => {
    const gasPreset: LocationPreset = {
      id: `gas_${station.id}`,
      name: station.name,
      shortName: station.name.replace(/주유소$/, '').trim().slice(0, 8),
      lat: station.lat,
      lng: station.lng,
      category: 'GAS',
      address: station.address || `${station.name} (${station.brandName})`,
    };

    setDestination(gasPreset);
    saveRecentPreset(gasPreset);
    if (origin) {
      fetchRouteEstimate(origin, gasPreset);
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

  // Pre-initialization & Onboarding Splash Gate: completely blocks dashboard FOUC on initial mount
  if (!isInitialized || (isOnboarding && onboardingStage === 'splash')) {
    return (
      <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex flex-col items-center max-w-xs animate-in zoom-in-95 duration-300">
          <img
            src="/cockpit_app_icon.png"
            alt="Protocol Cockpit"
            className="w-20 h-20 rounded-[20px] shadow-[0_12px_32px_rgba(30,96,243,0.22)] ring-1 ring-slate-200/80 mb-6 animate-pulse"
          />
          <h1 className="text-3xl font-extrabold text-[#1E60F3] tracking-tight mb-3">
            환영합니다!
          </h1>
          <p className="text-sm font-semibold text-slate-800 mb-1.5 leading-snug">
            VIP 의전 관제 시스템에 접속하셨습니다.
          </p>
          <p className="text-xs text-slate-500 font-normal leading-relaxed">
            원활한 이동 보고를 위해 드라이버 정보를 등록해 주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-[#F8FAFC] text-slate-800 flex flex-col items-center justify-between overflow-x-hidden selection:bg-[#1E60F3]/20">
      <div className="w-full max-w-md mx-auto min-h-dvh flex flex-col justify-between bg-white shadow-xl relative border-x border-slate-200/60 overflow-x-hidden">
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
            selectionTarget={selectionTarget}
            isAdmin={isAdmin}
            onSelectPreset={handleSelectPreset}
            onOpenAddModal={handleOpenAddModal}
            onOpenHomeModal={() => setIsHomeModalOpen(true)}
            onOpenGasModal={() => setIsGasModalOpen(true)}
            onEditPreset={handleOpenEditModal}
            onDeleteCustomPreset={handleDeleteCustomPreset}
            onReorderPresets={handleReorderPresets}
          />

          {/* 3. Route Estimation & ETA Status (Strictly Real-time TMAP) */}
          <RouteInfoCard
            routeEstimate={routeEstimate}
            isLoadingRoute={isLoadingRoute}
            isLocating={isLocating}
            isUndergroundFallback={isUndergroundFallback}
            gpsErrorMsg={gpsErrorMsg}
            onRequestGps={requestGpsLocation}
            onRefreshRoute={() => {
              if (origin && destination) {
                fetchRouteEstimate(origin, destination);
              }
            }}
            onOpenTimePicker={() => setIsTimePickerOpen(true)}
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
            profile={profile}
          />
        </div>
      </div>



      {/* Driver Profile Edit / Onboarding Modal (Centered Modal) */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setIsOnboarding(false);
          setOnboardingStage(null);
        }}
        profile={profile}
        isOnboarding={isOnboarding}
        onSave={(updated) => {
          updateProfile(updated);
          const deviceUuid = profile.id || getOrCreateDeviceUuid();
          try {
            localStorage.setItem('cockpit_driver_onboarded', 'true');
            setIsOnboarding(false);
            setOnboardingStage(null);
          } catch (e) {
            console.warn('Failed to save onboarding flag:', e);
          }
          // Sync profile to Supabase with device UUID
          fetch('/api/driver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: deviceUuid,
              vehicleNo: updated.vehicleNo,
              driverName: updated.driverName,
              passengerName: updated.passengerName,
              targetChatRoom: updated.targetChatRoom ?? profile.targetChatRoom,
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

      {/* Native Departure Time Picker Modal (4-Column Wheel Picker) */}
      <DepartureTimePickerModal
        isOpen={isTimePickerOpen}
        onClose={() => setIsTimePickerOpen(false)}
        onConfirm={handleConfirmDepartureTime}
        initialDate={simulationDepartureDate}
      />

      {/* AI Duration Prediction Result Bottom Sheet (Isolated Simulation Layer) */}
      <PredictionResultSheet
        isOpen={isPredictionSheetOpen}
        onClose={() => setIsPredictionSheetOpen(false)}
        prediction={predictionResult}
        isLoading={isLoadingPrediction}
        onOpenTimePicker={() => {
          setIsPredictionSheetOpen(false);
          setIsTimePickerOpen(true);
        }}
        selectedDate={simulationDepartureDate}
      />

      {/* Real-time Gas Station Recommendation Modal (Opinet x TMAP) */}
      <GasStationModal
        isOpen={isGasModalOpen}
        onClose={() => setIsGasModalOpen(false)}
        currentLat={origin.lat}
        currentLng={origin.lng}
        defaultNavi={profile.defaultNavi}
        profile={profile}
        onSelectStation={handleSelectGasStation}
      />

    </main>
  );
}
