'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDriverProfile, getOrCreateDeviceUuid } from '@/hooks/useDriverProfile';
import { useLocation } from '@/hooks/useLocation';
import { Header } from '@/components/Header';
import { ProfileModal, parseVehicleDetails } from '@/components/ProfileModal';
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
import { FlightModal } from '@/components/FlightModal';
import { ScheduleTab } from '@/components/ScheduleTab';
import { Navigation, Calendar } from 'lucide-react';
import { ScheduleItem, scheduleToPresets } from '@/data/ferrariSchedules';
import { PredictionResult } from '@/app/api/route/prediction/route';
import { LocationPreset, ReportMode, RouteEstimate, HomeLocation, GasStation, FlightType } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { FLEET_PRESET_DRIVERS } from '@/utils/constants';
import { generateReportText } from '@/utils/reportGenerator';
import { calculateHaversineEstimate, getEtaString, launchNavigationApp } from '@/utils/navigation';
import { haptics } from '@/utils/haptics';

export const getPresetsStorageKey = (vehicleNo?: string) => {
  const v = vehicleNo?.match(/(\d+호차)/)?.[1] || (vehicleNo ? vehicleNo.trim() : '4호차');
  return `cockpit_presets_${v}`;
};
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

  // Real-time Flight Modal State (Incheon Airport)
  const [isFlightModalOpen, setIsFlightModalOpen] = useState(false);
  const [flightModalInitialFlightId, setFlightModalInitialFlightId] = useState<string | undefined>(undefined);
  const [flightModalInitialType, setFlightModalInitialType] = useState<FlightType | undefined>(undefined);

  // Active vehicle identifier (e.g. '4호차', '1호차')
  const currentVehicleNo = useMemo(() => {
    return profile.vehicleNo?.match(/(\d+호차)/)?.[1] || '4호차';
  }, [profile.vehicleNo]);

  // Fetch Presets with Vehicle Isolation (Common Master + Vehicle's Custom Presets)
  const fetchPresetsForVehicle = useCallback(async (vNo: string) => {
    const cleanV = vNo.match(/(\d+호차)/)?.[1] || vNo || '4호차';
    const storageKey = getPresetsStorageKey(cleanV);

    // 1. Load from vehicle-isolated localStorage first for instant UI response
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPresets(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load presets from vehicle storage:', e);
    }

    // 2. Fetch from API with vehicle_no parameter (Supabase cockpit.presets SSOT)
    try {
      const res = await fetch(`/api/presets?vehicle_no=${encodeURIComponent(cleanV)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.presets && Array.isArray(data.presets)) {
          setPresets(data.presets);
          localStorage.setItem(storageKey, JSON.stringify(data.presets));
        }
      }
    } catch (err) {
      console.warn('Failed to fetch presets for vehicle from API:', err);
    }
  }, []);

  // Sync isolated presets whenever vehicle changes or profile loads
  useEffect(() => {
    if (isLoaded) {
      fetchPresetsForVehicle(currentVehicleNo);
    }
  }, [isLoaded, currentVehicleNo, fetchPresetsForVehicle]);

  // Load Admin State from LocalStorage on mount
  useEffect(() => {
    try {
      const savedAdmin = localStorage.getItem(ADMIN_MODE_KEY);
      if (savedAdmin === 'true') {
        setIsAdmin(true);
      }
    } catch (e) {}
  }, []);

  // Supabase Fleet Architecture Driver Profile Sync (Only for onboarded profiles)
  useEffect(() => {
    async function syncDriverProfile() {
      try {
        const onboarded = typeof window !== 'undefined' ? localStorage.getItem('cockpit_driver_onboarded') : null;
        // Do not auto-fetch or auto-inject 4호차 fallback if onboarding is pending or vehicleNo is not chosen yet
        if (!onboarded || !profile.vehicleNo) {
          return;
        }

        if (!profile.driverName || !profile.phone) {
          const dRes = await fetch(`/api/driver?vehicle_no=${encodeURIComponent(profile.vehicleNo)}`);
          if (dRes.ok) {
            const dData = await dRes.json();
            if (dData.driver) {
              const { vehicle_no, car_number, driver_name, phone, default_navi } = dData.driver;
              const fullVehicleNo = car_number ? `${vehicle_no} ${car_number}` : vehicle_no;
              updateProfile({
                vehicleNo: fullVehicleNo,
                carNumber: car_number || undefined,
                driverName: driver_name || profile.driverName,
                phone: phone || profile.phone,
                mobile: phone || profile.mobile,
                defaultNavi: default_navi || profile.defaultNavi || 'tmap',
              });
            }
          }
        }
      } catch (err) {
        console.warn('Supabase remote driver sync skipped/unavailable:', err);
      }
    }

    if (isLoaded) {
      syncDriverProfile();
    }
  }, [isLoaded, profile.vehicleNo, profile.driverName, profile.phone]);

  // Save Presets to LocalStorage (Isolated by current vehicle)
  const savePresetsToStorage = (updated: LocationPreset[]) => {
    setPresets(updated);
    try {
      localStorage.setItem(getPresetsStorageKey(currentVehicleNo), JSON.stringify(updated));
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
    const presetWithVehicle: LocationPreset = {
      ...newPreset,
      isGlobal: isAdmin,
      driverId: isAdmin ? null : (profile.id || getOrCreateDeviceUuid()),
      vehicle_no: currentVehicleNo,
      vehicleNo: currentVehicleNo,
    };

    const updated = [...presets, presetWithVehicle];
    savePresetsToStorage(updated);

    if (selectionTarget === 'origin') {
      setOrigin(presetWithVehicle);
    } else {
      setDestination(presetWithVehicle);
    }

    // Supabase Sync with vehicle_no
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...presetWithVehicle,
          vehicle_no: currentVehicleNo,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.preset) {
          const synced = updated.map((p) => (p.id === presetWithVehicle.id ? data.preset : p));
          savePresetsToStorage(synced);
        }
      }
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

    // Supabase Sync with vehicle_no
    try {
      await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updatedPreset,
          vehicle_no: updatedPreset.vehicle_no || currentVehicleNo,
        }),
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

    // Supabase Sync with vehicle_no for security check
    try {
      await fetch(`/api/presets?id=${encodeURIComponent(id)}&vehicle_no=${encodeURIComponent(currentVehicleNo)}`, {
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
  const [activeTab, setActiveTab] = useState<'drive' | 'schedule'>('drive');
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

  // Select gas station as destination and trigger ETA calculation (Origin strictly preserved)
  const handleSelectGasStation = (station: GasStation) => {
    const gasPreset: LocationPreset = {
      id: 'custom_gas_station',
      name: station.name,
      shortName: station.name.replace(/주유소$/, '').trim().slice(0, 8),
      lat: station.lat,
      lng: station.lng,
      category: 'GAS',
      address: station.address || `${station.name} (${station.brandName})`,
    };

    setDestination(gasPreset);
    setSelectionTarget('destination');
    if (origin) {
      fetchRouteEstimate(origin, gasPreset);
    }
  };

  // Select flight airport terminal as destination (Origin strictly preserved)
  const handleSelectFlightDestination = (preset: LocationPreset) => {
    setDestination(preset);
    setSelectionTarget('destination');
    if (origin) {
      fetchRouteEstimate(origin, preset);
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

  // Schedule Tab Action Handlers
  const handleSelectRouteFromSchedule = useCallback(
    (originPreset: LocationPreset, destinationPreset: LocationPreset) => {
      setOrigin(originPreset);
      setDestination(destinationPreset);
      fetchRouteEstimate(originPreset, destinationPreset);
      setActiveTab('drive');
      haptics.success();
    },
    [setOrigin, setDestination, fetchRouteEstimate]
  );

  const handleNavigateForSchedule = useCallback(
    (schedule: ScheduleItem) => {
      const { originPreset, destinationPreset } = scheduleToPresets(schedule);
      setOrigin(originPreset);
      setDestination(destinationPreset);
      fetchRouteEstimate(originPreset, destinationPreset);
      launchNavigationApp(
        profile.defaultNavi,
        { name: destinationPreset.name, lat: destinationPreset.lat, lng: destinationPreset.lng },
        { name: originPreset.name, lat: originPreset.lat, lng: originPreset.lng }
      );
      haptics.heavyTap();
    },
    [profile.defaultNavi, setOrigin, setDestination, fetchRouteEstimate]
  );

  const handleOpenPredictionForSchedule = useCallback(
    (schedule: ScheduleItem) => {
      const { originPreset, destinationPreset } = scheduleToPresets(schedule);
      setOrigin(originPreset);
      setDestination(destinationPreset);
      fetchRouteEstimate(originPreset, destinationPreset);

      const [year, month, day] = schedule.date.split('-').map(Number);
      const [hour, minute] = schedule.pickup_time.split(':').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const schedDate = new Date();
        schedDate.setFullYear(year, month - 1, day);
        schedDate.setHours(hour || 9, minute || 0, 0, 0);
        setSimulationDepartureDate(schedDate);
      }
      setIsTimePickerOpen(true);
      haptics.mediumTap();
    },
    [setOrigin, setDestination, fetchRouteEstimate]
  );

  const handleOpenFlightModalFromSchedule = useCallback(
    (flightId: string, type: 'arrival' | 'departure') => {
      setFlightModalInitialFlightId(flightId);
      setFlightModalInitialType(type);
      setIsFlightModalOpen(true);
      haptics.mediumTap();
    },
    []
  );

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
              <span className="w-2 h-2 rounded-full bg-blue-300 animate-ping" />
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

        {/* Top Segmented Navigation: [ 운행 ] | [ 스케줄 ] (Flawless w-[calc(50%-4px)] sliding bar) */}
        <div className="px-3.5 pt-2.5 pb-1 bg-white shrink-0">
          <div className="w-full bg-slate-100 p-1 rounded-full relative flex items-center select-none shadow-inner">
            {/* Sliding Indicator Pill */}
            <div
              className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-full bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${
                activeTab === 'drive' ? 'translate-x-0' : 'translate-x-full'
              }`}
            />

            {/* Drive Tab Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('drive');
              }}
              className="flex-1 py-2 rounded-full z-10 flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-300"
            >
              <Navigation className={`w-3.5 h-3.5 ${activeTab === 'drive' ? 'text-white fill-white' : 'text-slate-400'}`} />
              <span
                className={`text-xs tracking-tight transition-colors duration-300 ${
                  activeTab === 'drive' ? 'text-white font-black' : 'text-slate-500 font-bold hover:text-slate-800'
                }`}
              >
                운행
              </span>
            </button>

            {/* Schedule Tab Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('schedule');
              }}
              className="flex-1 py-2 rounded-full z-10 flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-300 relative"
            >
              <Calendar className={`w-3.5 h-3.5 ${activeTab === 'schedule' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-xs tracking-tight transition-colors duration-300 ${
                  activeTab === 'schedule' ? 'text-white font-black' : 'text-slate-500 font-bold hover:text-slate-800'
                }`}
              >
                스케줄
              </span>
              {activeTab !== 'schedule' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
              )}
            </button>
          </div>
        </div>

        {/* Tab View Switch: [운행 대시보드] vs [배차 스케줄] */}
        {activeTab === 'drive' ? (
          <div className="flex-1 p-3.5 space-y-3 animate-fade-in">
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
              onOpenFlightModal={() => setIsFlightModalOpen(true)}
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
        ) : (
          <div className="flex-1 p-3.5 animate-fade-in">
            <ScheduleTab
              profile={profile}
              onOpenProfileModal={() => setIsProfileModalOpen(true)}
              onSelectRouteForCockpit={handleSelectRouteFromSchedule}
              onOpenPredictionForSchedule={handleOpenPredictionForSchedule}
              onNavigateForSchedule={handleNavigateForSchedule}
              onOpenFlightModal={handleOpenFlightModalFromSchedule}
              onSwitchVehicle={(vNo) => {
                const matchedPreset = FLEET_PRESET_DRIVERS.find(
                  (p) => p.vehicleNo === vNo || p.hocha === vNo.replace(/[^0-9]/g, '')
                );
                if (matchedPreset) {
                  const fullVehicle = `${matchedPreset.vehicleNo} ${matchedPreset.carNumber}`;
                  updateProfile({
                    vehicleNo: fullVehicle,
                    carNumber: matchedPreset.carNumber,
                    driverName: matchedPreset.driverName,
                    phone: matchedPreset.phone,
                    mobile: matchedPreset.phone,
                    defaultNavi: matchedPreset.defaultNavi,
                  });
                  // Background sync with Supabase
                  const deviceUuid = profile.id || getOrCreateDeviceUuid();
                  fetch('/api/driver', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: deviceUuid,
                      vehicleNo: fullVehicle,
                      driverName: matchedPreset.driverName,
                      carNumber: matchedPreset.carNumber,
                      phone: matchedPreset.phone,
                      defaultNavi: matchedPreset.defaultNavi,
                    }),
                  }).catch((err) => console.warn('Supabase driver background sync failed:', err));
                } else {
                  // Fallback: fetch dynamically from API so different vehicle never retains old driver name
                  fetch(`/api/driver?vehicle_no=${encodeURIComponent(vNo)}`)
                    .then((res) => res.json())
                    .then((data) => {
                      if (data?.driver) {
                        const d = data.driver;
                        const fullVehicle = d.car_number ? `${d.vehicle_no} ${d.car_number}` : d.vehicle_no;
                        updateProfile({
                          vehicleNo: fullVehicle,
                          carNumber: d.car_number || undefined,
                          driverName: d.driver_name || '',
                          phone: d.phone || '',
                          mobile: d.phone || '',
                          defaultNavi: d.default_navi || 'tmap',
                        });
                      } else {
                        updateProfile({ vehicleNo: vNo });
                      }
                    })
                    .catch(() => updateProfile({ vehicleNo: vNo }));
                }
                fetchPresetsForVehicle(vNo);
              }}
            />
          </div>
        )}
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
          // Sync profile to Supabase with vehicle_no & car_number
          const { hocha: h, plateNumber: pNum } = parseVehicleDetails(updated.vehicleNo);
          const cleanVehicleNo = h ? `${h}호차` : (updated.vehicleNo || '4호차');
          fetchPresetsForVehicle(cleanVehicleNo);
          fetch('/api/driver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicle_no: cleanVehicleNo,
              car_number: pNum || undefined,
              driver_name: updated.driverName,
              phone: updated.phone || updated.mobile || undefined,
              default_navi: updated.defaultNavi ?? profile.defaultNavi,
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
        originId={origin?.id}
        defaultNavi={profile.defaultNavi}
        profile={profile}
        onSelectStation={handleSelectGasStation}
      />

      {/* Incheon Airport Real-time Flight Modal (Arrival/Departure) */}
      <FlightModal
        isOpen={isFlightModalOpen}
        onClose={() => {
          setIsFlightModalOpen(false);
          setFlightModalInitialFlightId(undefined);
          setFlightModalInitialType(undefined);
        }}
        profile={profile}
        onSelectDestination={handleSelectFlightDestination}
        initialFlightId={flightModalInitialFlightId}
        initialType={flightModalInitialType}
      />

    </main>
  );
}
