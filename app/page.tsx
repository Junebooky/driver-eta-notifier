'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDriverProfile, getOrCreateDeviceUuid, getStoredVehicleProfile } from '@/hooks/useDriverProfile';
import { useLocation } from '@/hooks/useLocation';
import { Header } from '@/components/Header';
import { ProfileModal, parseVehicleDetails } from '@/components/ProfileModal';
import { AdminPinModal } from '@/components/AdminPinModal';
import { OriginDestinationSelector } from '@/components/OriginDestinationSelector';
import { QuickActionBar } from '@/components/QuickActionBar';
import { CustomPresetModal } from '@/components/CustomPresetModal';
import { RouteInfoCard } from '@/components/RouteInfoCard';
import { ReportTemplateSelector } from '@/components/ReportTemplateSelector';
import { ActionPanel } from '@/components/ActionPanel';
import { A2HSBanner } from '@/components/A2HSBanner';
import { DepartureTimePickerModal } from '@/components/DepartureTimePickerModal';
import { PredictionResultSheet } from '@/components/PredictionResultSheet';
import { GasStationModal } from '@/components/GasStationModal';
import { FlightModal } from '@/components/FlightModal';
import { VehicleInspectionModal } from '@/components/VehicleInspectionModal';
import { LocationSearchModal, SelectedLocationData } from '@/components/LocationSearchModal';
import { RoadviewModal } from '@/components/RoadviewModal';
import { ScheduleTab } from '@/components/ScheduleTab';
import { Navigation, Calendar } from 'lucide-react';
import { ScheduleItem, scheduleToPresets } from '@/data/ferrariSchedules';
import { PredictionResult } from '@/app/api/route/prediction/route';
import { LocationPreset, ReportMode, RouteEstimate, HomeLocation, GasStation, FlightType } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { FLEET_PRESET_DRIVERS, getPresetPassengerName } from '@/utils/constants';
import { generateReportText } from '@/utils/reportGenerator';
import { calculateHaversineEstimate, getEtaString, launchNavigationApp } from '@/utils/navigation';
import { haptics } from '@/utils/haptics';

export const getPresetsStorageKey = (vehicleNo?: string) => {
  const v = vehicleNo?.match(/(\d+호차)/)?.[1] || (vehicleNo ? vehicleNo.trim() : '4호차');
  return `cockpit_presets_${v}`;
};

export function deduplicatePresets(list: LocationPreset[]): LocationPreset[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  return list.filter((p) => {
    if (!p || !p.id) return false;
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);

    const vKey = `${p.name}___${p.vehicle_no || p.vehicleNo || 'common'}`;
    if (seenNames.has(vKey)) return false;
    seenNames.add(vKey);

    return true;
  });
}

const ADMIN_MODE_KEY = 'protocol_cockpit_admin_mode_v1';
const LAST_ROUTE_STORAGE_KEY = 'cockpit_last_route';

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

  // Selection target mode: 'origin', 'destination', or 'waypoint' (default: 'destination')
  const [selectionTarget, setSelectionTarget] = useState<'origin' | 'destination' | 'waypoint'>('destination');

  // Ordered Presets State (combining defaults + customs with permanent order persistence)
  const [presets, setPresets] = useState<LocationPreset[]>(DEFAULT_PRESET_LOCATIONS);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<LocationPreset | null>(null);

  // Ephemeral newly added preset ID for temporary cobalt blue border highlight
  const [newlyAddedPresetId, setNewlyAddedPresetId] = useState<string | null>(null);

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

  // Vehicle Inspection (Receipt / Daily / Return) Modal State (No-DB / Pure LocalStorage)
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false);
  const [inspectionInitialMode, setInspectionInitialMode] = useState<'pickup' | 'daily' | 'return' | 'receipt'>('pickup');

  // Standalone Location Search & Preset Modal State
  const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);

  // Roadview Modal State
  const [isRoadviewModalOpen, setIsRoadviewModalOpen] = useState(false);

  // Active vehicle identifier (e.g. '4호차', '1호차')
  const currentVehicleNo = useMemo(() => {
    return profile.vehicleNo?.match(/(\d+호차)/)?.[1] || '4호차';
  }, [profile.vehicleNo]);

  // Fetch Presets with Vehicle Isolation (Common Master + Vehicle's Custom Presets)
  const fetchPresetsForVehicle = useCallback(async (vNo: string) => {
    const cleanV = vNo.match(/(\d+호차)/)?.[1] || vNo || '4호차';
    const storageKey = getPresetsStorageKey(cleanV);
    const orderKey = `cockpit_presets_order_${cleanV}`;

    const applyOrder = (list: LocationPreset[]) => {
      try {
        const orderStr = localStorage.getItem(orderKey);
        if (orderStr) {
          const ids: string[] = JSON.parse(orderStr);
          if (Array.isArray(ids) && ids.length > 0) {
            const indexMap = new Map(ids.map((id, i) => [id, i]));
            return [...list].sort((a, b) => {
              const posA = indexMap.has(a.id) ? indexMap.get(a.id)! : 999;
              const posB = indexMap.has(b.id) ? indexMap.get(b.id)! : 999;
              return posA - posB;
            });
          }
        }
      } catch (e) { }
      return list;
    };

    // 1. Load from vehicle-isolated localStorage first for instant UI response
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const deduped = applyOrder(deduplicatePresets(parsed));
          setPresets(deduped);
          if (deduped.length !== parsed.length) {
            localStorage.setItem(storageKey, JSON.stringify(deduped));
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load presets from vehicle storage:', e);
    }

    // 2. Fetch from API with vehicle_no parameter (Supabase cockpit.presets SSOT) with 3.5s timeout guard
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(`/api/presets?vehicle_no=${encodeURIComponent(cleanV)}`, {
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(3500)
          : controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.presets && Array.isArray(data.presets)) {
          setPresets((prev) => {
            const serverPresets: LocationPreset[] = data.presets;
            const merged = serverPresets.map((sp) => {
              const localMatch = prev.find((lp) => lp.id === sp.id);
              if (localMatch) {
                // 기사가 설정한 축약 name이 fullName으로 역전되지 않도록 가드 보강
                let safeName = localMatch.name?.trim();
                if (sp.name && sp.name.trim() !== '') {
                  const spName = sp.name.trim();
                  if (spName.length <= 8) {
                    safeName = spName;
                  } else if (!safeName) {
                    safeName = spName.slice(0, 8);
                  }
                }
                if (!safeName) {
                  safeName = (sp.fullName || localMatch.fullName || '거점').slice(0, 8);
                }

                const safeFullName = sp.fullName || sp.full_name || localMatch.fullName || localMatch.full_name || sp.name || safeName;

                return {
                  ...localMatch,
                  ...sp,
                  name: safeName,
                  shortName: safeName,
                  fullName: safeFullName,
                };
              }
              const displayN = sp.name && sp.name.length <= 8
                ? sp.name
                : (sp.fullName ? sp.fullName.slice(0, 8) : '거점');
              return {
                ...sp,
                name: displayN,
                shortName: displayN,
                fullName: sp.fullName || sp.full_name || sp.name,
              };
            });
            const deduped = applyOrder(deduplicatePresets(merged));
            try {
              localStorage.setItem(storageKey, JSON.stringify(deduped));
            } catch (e) {}
            return deduped;
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch presets for vehicle from API (timeout or network):', err);
    } finally {
      clearTimeout(timeoutId);
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
    } catch (e) { }
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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          try {
            const dRes = await fetch(`/api/driver?vehicle_no=${encodeURIComponent(profile.vehicleNo)}`, {
              signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                ? AbortSignal.timeout(3500)
                : controller.signal,
            });
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
          } finally {
            clearTimeout(timeoutId);
          }
        }
      } catch (err) {
        console.warn('Supabase remote driver sync skipped/unavailable (timeout or network):', err);
      }
    }

    if (isLoaded) {
      syncDriverProfile();
    }
  }, [isLoaded, profile.vehicleNo, profile.driverName, profile.phone]);

  // Save Presets to LocalStorage (Isolated by current vehicle)
  const savePresetsToStorage = (updated: LocationPreset[]) => {
    const deduped = deduplicatePresets(updated);
    setPresets(deduped);
    try {
      localStorage.setItem(getPresetsStorageKey(currentVehicleNo), JSON.stringify(deduped));
      localStorage.setItem(`cockpit_presets_order_${currentVehicleNo}`, JSON.stringify(deduped.map((p) => p.id)));
    } catch (e) {
      console.warn('Failed to save ordered presets:', e);
    }
  };

  const handleToggleAdmin = (status: boolean) => {
    setIsAdmin(status);
    try {
      localStorage.setItem(ADMIN_MODE_KEY, String(status));
    } catch (e) { }
  };

  const handleOpenAddModal = () => {
    setNewlyAddedPresetId(null);
    setEditingPreset(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (preset: LocationPreset) => {
    setNewlyAddedPresetId(null);
    setEditingPreset(preset);
    setIsAddModalOpen(true);
  };

  const handleAddCustomPreset = async (newPreset: LocationPreset) => {
    let currentIsAdmin = isAdmin;
    try {
      if (!currentIsAdmin && typeof window !== 'undefined') {
        currentIsAdmin = localStorage.getItem(ADMIN_MODE_KEY) === 'true';
      }
    } catch (e) { }

    const isPresetCommon = Boolean(
      currentIsAdmin ||
      newPreset.isCommon ||
      newPreset.type === 'common' ||
      newPreset.isGlobal ||
      (!newPreset.vehicle_no && !newPreset.vehicleNo)
    );
    const cleanVehicle = isPresetCommon ? null : currentVehicleNo;

    const finalizedPreset: LocationPreset = {
      ...newPreset,
      type: isPresetCommon ? 'common' : 'personal',
      isCommon: isPresetCommon,
      isGlobal: isPresetCommon,
      driverId: isPresetCommon ? null : (profile.id || getOrCreateDeviceUuid()),
      vehicle_no: cleanVehicle,
      vehicleNo: cleanVehicle,
      createdAt: newPreset.createdAt || new Date().toISOString(),
    };

    const existingIndex = presets.findIndex(
      (p) =>
        (p.id && p.id === finalizedPreset.id) ||
        (p.name === finalizedPreset.name && (p.vehicle_no === finalizedPreset.vehicle_no || (!p.vehicle_no && isPresetCommon)))
    );

    let updated: LocationPreset[];
    if (existingIndex >= 0) {
      updated = [...presets];
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...finalizedPreset,
        id: updated[existingIndex].id,
      };
    } else if (isPresetCommon) {
      // [태스크 2] 공통 거점 등록 시 기존 공통 거점들 중 맨 끝(개인 거점들 시작 직전)에 삽입하여 1페이지 전진 배치
      const isCommonPreset = (p: LocationPreset) =>
        Boolean(p.isCommon || p.type === 'common' || p.isGlobal || (!p.vehicle_no && !p.vehicleNo));

      let insertIndex = 0;
      for (let i = presets.length - 1; i >= 0; i--) {
        if (isCommonPreset(presets[i])) {
          insertIndex = i + 1;
          break;
        }
      }
      const copy = [...presets];
      copy.splice(insertIndex, 0, finalizedPreset);
      updated = deduplicatePresets(copy);
    } else {
      updated = deduplicatePresets([...presets, finalizedPreset]);
    }

    const reindexed = updated.map((p, idx) => ({ ...p, order: idx }));
    savePresetsToStorage(reindexed);
    setPresets(reindexed);
    setNewlyAddedPresetId(finalizedPreset.id);

    if (selectionTarget === 'origin') {
      setOrigin(finalizedPreset);
    } else {
      setDestination(finalizedPreset);
    }

    // Supabase Sync with vehicle_no (Strict Rule: common presets have vehicle_no: null) with 3.5s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...finalizedPreset,
          vehicle_no: isPresetCommon ? null : currentVehicleNo,
        }),
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(3500)
          : controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.preset) {
          const syncedPreset: LocationPreset = {
            ...data.preset,
            name: finalizedPreset.name,
            shortName: finalizedPreset.shortName || finalizedPreset.name,
            fullName: finalizedPreset.fullName || data.preset.fullName || data.preset.full_name,
            type: isPresetCommon ? 'common' : (data.preset.type || 'personal'),
            isCommon: isPresetCommon ? true : Boolean(data.preset.isCommon),
            isGlobal: isPresetCommon ? true : Boolean(data.preset.isGlobal),
            vehicle_no: isPresetCommon ? null : (data.preset.vehicle_no || currentVehicleNo),
            vehicleNo: isPresetCommon ? null : (data.preset.vehicleNo || currentVehicleNo),
          };
          setPresets((prev) => {
            const synced = prev.map((p) =>
              p.id === finalizedPreset.id || (p.name === syncedPreset.name && p.vehicle_no === syncedPreset.vehicle_no)
                ? syncedPreset
                : p
            );
            const deduped = deduplicatePresets(synced);
            try {
              localStorage.setItem(getPresetsStorageKey(currentVehicleNo), JSON.stringify(deduped));
            } catch (e) { }
            return deduped;
          });
        }
      }
    } catch (e) {
      console.warn('Failed to sync new preset to Supabase (timeout or network):', e);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleUpdatePreset = async (updatedPreset: LocationPreset) => {
    let currentIsAdmin = isAdmin;
    try {
      if (!currentIsAdmin && typeof window !== 'undefined') {
        currentIsAdmin = localStorage.getItem(ADMIN_MODE_KEY) === 'true';
      }
    } catch (e) { }

    const isPresetCommon = Boolean(
      currentIsAdmin ||
      updatedPreset.isCommon ||
      updatedPreset.type === 'common' ||
      updatedPreset.isGlobal ||
      (!updatedPreset.vehicle_no && !updatedPreset.vehicleNo)
    );
    const cleanVehicle = isPresetCommon ? null : (updatedPreset.vehicle_no || currentVehicleNo);

    const finalizedPreset: LocationPreset = {
      ...updatedPreset,
      name: updatedPreset.name.trim(),
      shortName: (updatedPreset.shortName || updatedPreset.name).trim(),
      fullName: (updatedPreset.fullName || updatedPreset.name).trim(),
      type: isPresetCommon ? 'common' : 'personal',
      isCommon: isPresetCommon,
      isGlobal: isPresetCommon,
      vehicle_no: cleanVehicle,
      vehicleNo: cleanVehicle || undefined,
    };

    // 1) 낙관적 로컬 상태 및 localStorage 즉시 반영
    setPresets((prev) => {
      const next = prev.map((p) => (p.id === finalizedPreset.id ? finalizedPreset : p));
      savePresetsToStorage(next);
      return next;
    });

    if (destination.id === finalizedPreset.id) {
      setDestination(finalizedPreset);
    }
    if (origin.id === finalizedPreset.id) {
      setOrigin(finalizedPreset);
    }

    // 2) 서버 비동기 UPDATE (PUT /api/presets) 전송 with 3.5s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch('/api/presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...finalizedPreset,
          vehicle_no: isPresetCommon ? null : currentVehicleNo,
        }),
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(3500)
          : controller.signal,
      });

      if (res.ok) {
        const serverData = await res.json();
        const resPreset = serverData.preset || serverData;
        // 서버 응답 수신 시, 클라이언트에서 수정한 표시 이름 강제 보존하여 롤백 방지
        setPresets((prev) => {
          const synced = prev.map((p) => {
            if (p.id === finalizedPreset.id) {
              return {
                ...p,
                ...resPreset,
                name: finalizedPreset.name, // 클라이언트에서 수정한 표시 이름 ('SGBAC') 강제 보존!
                shortName: finalizedPreset.shortName || finalizedPreset.name,
                fullName: finalizedPreset.fullName || resPreset.full_name || resPreset.fullName || p.fullName,
              };
            }
            return p;
          });
          savePresetsToStorage(synced);
          return synced;
        });
      }
    } catch (error) {
      console.warn('Failed to sync updated preset to server (timeout or network):', error);
    } finally {
      clearTimeout(timeoutId);
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

    let currentIsAdmin = isAdmin;
    try {
      if (!currentIsAdmin && typeof window !== 'undefined') {
        currentIsAdmin = localStorage.getItem(ADMIN_MODE_KEY) === 'true';
      }
    } catch (e) { }

    // Supabase Sync with vehicle_no and admin permission check with 3.5s timeout
    const deleteController = new AbortController();
    const deleteTimeoutId = setTimeout(() => deleteController.abort(), 3500);
    try {
      const adminParam = currentIsAdmin ? '&is_admin=true' : '';
      await fetch(`/api/presets?id=${encodeURIComponent(id)}&vehicle_no=${encodeURIComponent(currentVehicleNo)}${adminParam}`, {
        method: 'DELETE',
        headers: {
          ...(currentIsAdmin ? { 'x-is-admin': 'true' } : {}),
        },
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(3500)
          : deleteController.signal,
      });
    } catch (e) {
      console.warn('Failed to delete preset from Supabase (timeout or network):', e);
    } finally {
      clearTimeout(deleteTimeoutId);
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

    if (destination?.id === 'slot_home') {
      setDestination({
        id: 'slot_home',
        name: homeData.name || '자택',
        shortName: '자택',
        lat: homeData.lat,
        lng: homeData.lng,
        category: 'HOME',
        address: homeData.address,
      });
    }
    if (origin?.id === 'slot_home') {
      setOrigin({
        id: 'slot_home',
        name: homeData.name || '자택',
        shortName: '자택',
        lat: homeData.lat,
        lng: homeData.lng,
        category: 'HOME',
        address: homeData.address,
      });
    }

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
  const [waypoints, setWaypoints] = useState<LocationPreset[]>([]);
  const [editingWaypointIndex, setEditingWaypointIndex] = useState<number>(-1);
  const [waypointInsertIndex, setWaypointInsertIndex] = useState<number | null>(null);
  const [adminWaypoints, setAdminWaypoints] = useState<LocationPreset[]>([]);
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const isRouteRestoredRef = useRef(false);

  const [activeTab, setActiveTab] = useState<'drive' | 'schedule'>('drive');
  const [reportMode, setReportMode] = useState<ReportMode>('DEPARTURE');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingStage, setOnboardingStage] = useState<'splash' | 'sheet' | null>(null);

  // [태스크 1 & 2] Hydration-Safe 마운트 시 복원 로직 (다중 경유지 및 단일 경유지 하위 호환)
  useEffect(() => {
    try {
      const savedRoute = localStorage.getItem(LAST_ROUTE_STORAGE_KEY);
      if (savedRoute) {
        const parsed = JSON.parse(savedRoute);
        if (parsed.origin) setOrigin(parsed.origin);
        if (parsed.destination) setDestination(parsed.destination);
        if (Array.isArray(parsed.waypoints)) {
          setWaypoints(parsed.waypoints);
        } else if (parsed.waypoint) {
          setWaypoints([parsed.waypoint]);
        }
        if (parsed.adminWaypoints) setAdminWaypoints(parsed.adminWaypoints);
        if (typeof parsed.isAdminRoute === 'boolean') setIsAdminRoute(parsed.isAdminRoute);
      }
    } catch (error) {
      console.warn('[Cockpit] 최근 경로 로드 실패 (기본값 유지):', error);
    } finally {
      isRouteRestoredRef.current = true;
    }
  }, [setOrigin]);

  // [태스크 1 & 2] 상태 변경 시 자동 영속화 (다중 경유지 배열 직렬화)
  useEffect(() => {
    if (!isRouteRestoredRef.current) return;
    if (origin || destination) {
      try {
        localStorage.setItem(
          LAST_ROUTE_STORAGE_KEY,
          JSON.stringify({
            origin,
            destination,
            waypoints: waypoints || [],
            waypoint: waypoints && waypoints[0] ? waypoints[0] : null,
            adminWaypoints: adminWaypoints || [],
            isAdminRoute: Boolean(isAdminRoute),
          })
        );
      } catch (error) {
        console.error('[Cockpit] 최근 경로 저장 실패:', error);
      }
    }
  }, [origin, destination, waypoints, adminWaypoints, isAdminRoute]);

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

  // Fetch route duration & ETA from API with dynamic client clock calculation with 3.5s timeout guard
  const fetchRouteEstimate = useCallback(
    async (start: LocationPreset, end: LocationPreset, waypoints: LocationPreset[] = []) => {
      setIsLoadingRoute(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const validWaypoints = (waypoints || []).filter(
          (w) => w && typeof w.lat === 'number' && typeof w.lng === 'number' && (w.lat !== 0 || w.lng !== 0)
        );
        const passListParam =
          validWaypoints.length > 0
            ? `&passList=${validWaypoints.map((w) => `${w.lng},${w.lat}`).join('_')}`
            : '';
        const url = `/api/route?startX=${start.lng}&startY=${start.lat}&endX=${end.lng}&endY=${end.lat}&startName=${encodeURIComponent(
          start.shortName || start.name
        )}&endName=${encodeURIComponent(end.shortName || end.name)}${passListParam}`;

        const res = await fetch(url, {
          signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(3500)
            : controller.signal,
        });
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
        console.warn('Falling back to haversine estimate (timeout or network):', err?.message);
        const validWaypoints = (waypoints || []).filter(
          (w) => w && typeof w.lat === 'number' && typeof w.lng === 'number' && (w.lat !== 0 || w.lng !== 0)
        );
        const fallback = calculateHaversineEstimate(
          start.lat,
          start.lng,
          end.lat,
          end.lng,
          validWaypoints.map((w) => ({ lat: w.lat, lng: w.lng }))
        );
        setRouteEstimate(fallback);
      } finally {
        clearTimeout(timeoutId);
        setIsLoadingRoute(false);
      }
    },
    []
  );

  // Fetch AI Prediction for future departure time (Isolated simulation only) with 3.5s timeout guard
  const fetchPrediction = useCallback(
    async (targetDate: Date, start: LocationPreset, end: LocationPreset) => {
      setIsLoadingPrediction(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch('/api/route/prediction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            departure: { name: start.shortName || start.name, lat: start.lat, lng: start.lng },
            destination: { name: end.shortName || end.name, lat: end.lat, lng: end.lng },
            predictionTime: targetDate.toISOString(),
          }),
          signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(3500)
            : controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Prediction API error ${res.status}`);
        }
        const data: PredictionResult = await res.json();
        setPredictionResult(data);
      } catch (err: any) {
        console.warn('Prediction fetch error (timeout or network):', err);
      } finally {
        clearTimeout(timeoutId);
        setIsLoadingPrediction(false);
      }
    },
    []
  );

  // Recalculate route whenever origin, destination, or waypoints change (Strictly Real-time TMAP)
  useEffect(() => {
    if (origin && destination) {
      const effectiveWaypoints =
        isAdminRoute && adminWaypoints.length > 0
          ? adminWaypoints
          : waypoints.filter((w) => w && w.lat && w.lng && (w.lat !== 0 || w.lng !== 0));
      fetchRouteEstimate(origin, destination, effectiveWaypoints);
    }
  }, [
    origin?.lat,
    origin?.lng,
    destination?.lat,
    destination?.lng,
    waypoints,
    adminWaypoints,
    isAdminRoute,
    fetchRouteEstimate,
  ]);

  // Waypoint Add, Select & Remove handlers (Supporting up to 5 multi-waypoints with index-based insert)
  const handleAddWaypoint = (afterIndex?: number) => {
    if (waypoints.length >= 5) return;
    const targetIndex = typeof afterIndex === 'number' ? afterIndex + 1 : waypoints.length;
    setWaypointInsertIndex(targetIndex);
    setEditingWaypointIndex(-1);
    setSelectionTarget('waypoint');
    setIsLocationSearchOpen(true);
  };

  const handleSelectWaypoint = (index: number) => {
    setWaypointInsertIndex(null);
    setEditingWaypointIndex(index);
    setSelectionTarget('waypoint');
    setIsLocationSearchOpen(true);
  };

  const handleRemoveWaypoint = (index: number) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
    setIsAdminRoute(false);
    setWaypointInsertIndex(null);
    if (selectionTarget === 'waypoint') {
      setSelectionTarget('destination');
    }
  };

  // Handle Departure Time selection from Wheel Picker (Simulation Preview Only)
  const handleConfirmDepartureTime = (date: Date) => {
    setSimulationDepartureDate(date);
    setIsTimePickerOpen(false);
    setIsPredictionSheetOpen(true);
    if (origin && destination) {
      fetchPrediction(date, origin, destination);
    }
  };

  // Helper to insert or update waypoint (with index-based splice support)
  const applyWaypointSelection = (resolvedPreset: LocationPreset) => {
    if (editingWaypointIndex >= 0 && editingWaypointIndex < waypoints.length) {
      setWaypoints((prev) => {
        const copy = [...prev];
        copy[editingWaypointIndex] = resolvedPreset;
        return copy;
      });
    } else {
      setWaypoints((prev) => {
        const next = [...prev];
        if (typeof waypointInsertIndex === 'number' && waypointInsertIndex >= 0 && waypointInsertIndex <= next.length) {
          next.splice(waypointInsertIndex, 0, resolvedPreset);
        } else {
          next.push(resolvedPreset);
        }
        return next.slice(0, 5); // 최대 5개 상한 방어
      });
    }
    setIsAdminRoute(false);
    setEditingWaypointIndex(-1);
    setWaypointInsertIndex(null);
    setSelectionTarget('destination');
  };

  // Handle Preset Button Click
  const handleSelectPreset = (preset: LocationPreset) => {
    setNewlyAddedPresetId(null);
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
    } else if (selectionTarget === 'waypoint') {
      applyWaypointSelection(resolvedPreset);
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

    if (selectionTarget === 'origin') {
      setOrigin(gasPreset);
      setSelectionTarget('destination');
    } else if (selectionTarget === 'waypoint') {
      applyWaypointSelection(gasPreset);
    } else {
      setDestination(gasPreset);
      setSelectionTarget('destination');
    }
  };

  // Select flight airport terminal as destination (Origin strictly preserved)
  const handleSelectFlightDestination = (preset: LocationPreset) => {
    if (selectionTarget === 'origin') {
      setOrigin(preset);
      setSelectionTarget('destination');
    } else if (selectionTarget === 'waypoint') {
      applyWaypointSelection(preset);
    } else {
      setDestination(preset);
      setSelectionTarget('destination');
    }
  };

  // Handler for selecting location from standalone LocationSearchModal
  const handleSelectLocationFromSearch = (loc: SelectedLocationData) => {
    const resolvedPreset: LocationPreset = {
      id: loc.id || `loc_${Date.now()}`,
      name: loc.name,
      shortName: loc.shortName || loc.name.slice(0, 8),
      lat: loc.lat,
      lng: loc.lng,
      category: loc.category || 'CUSTOM',
      address: loc.address,
    };

    if (selectionTarget === 'origin') {
      setOrigin(resolvedPreset);
      saveRecentPreset(resolvedPreset);
      setSelectionTarget('destination');
    } else if (selectionTarget === 'waypoint') {
      applyWaypointSelection(resolvedPreset);
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

  // Schedule Tab Action Handlers
  const handleSelectRouteFromSchedule = useCallback(
    (originPreset: LocationPreset, destinationPreset: LocationPreset, schedule?: ScheduleItem) => {
      setOrigin(originPreset);
      setDestination(destinationPreset);
      const isSchedAdmin = Boolean(schedule?.isAdminRoute);
      const schedAdminWps = schedule?.adminWaypoints || schedule?.waypoints || [];
      setIsAdminRoute(isSchedAdmin);
      setAdminWaypoints(schedAdminWps);
      setWaypoints([]);
      fetchRouteEstimate(originPreset, destinationPreset, isSchedAdmin ? schedAdminWps : []);
      setActiveTab('drive');
      haptics.success();
    },
    [setOrigin, setDestination, fetchRouteEstimate]
  );

  const handleNavigateForSchedule = useCallback(
    (schedule: ScheduleItem) => {
      const { originPreset, destinationPreset, adminWaypoints: rawAdminWps, isAdminRoute: rawIsAdmin } = scheduleToPresets(schedule);
      const isSchedAdmin = Boolean(rawIsAdmin);
      const schedAdminWps: LocationPreset[] = rawAdminWps || [];
      setOrigin(originPreset);
      setDestination(destinationPreset);
      setIsAdminRoute(isSchedAdmin);
      setAdminWaypoints(schedAdminWps);
      setWaypoints([]);
      fetchRouteEstimate(originPreset, destinationPreset, isSchedAdmin ? schedAdminWps : []);

      let naviWaypoints: Array<{ name: string; lat: number; lng: number }> = [];
      if (isSchedAdmin) {
        // Admin Route Sequence: Driver Realtime GPS ➔ Official Origin ➔ Admin Waypoints ➔ Destination
        naviWaypoints = [
          { name: originPreset.shortName || originPreset.name, lat: originPreset.lat, lng: originPreset.lng },
          ...schedAdminWps.map((w) => ({ name: w.shortName || w.name, lat: w.lat, lng: w.lng })),
        ];
      }

      launchNavigationApp(
        profile.defaultNavi,
        { name: destinationPreset.name, lat: destinationPreset.lat, lng: destinationPreset.lng },
        undefined, // Realtime GPS starting point
        naviWaypoints
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
          <p className="text-sm text-slate-500 font-normal leading-relaxed">
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
          <div className="px-4 py-2 bg-blue-600 text-white text-sm font-bold flex items-center justify-between shadow-sm animate-fade-in">
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

        {/* Top Segmented Navigation: [ 운행 ] | [ 스케줄 ] (Matches ReportTemplateSelector tab size) */}
        <div className="px-3.5 pt-2.5 pb-1 bg-white shrink-0">
          <div className="w-full bg-slate-100/90 p-1 rounded-full relative flex items-center select-none shadow-inner">
            {/* Sliding Indicator Pill */}
            <div
              className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-full bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${activeTab === 'drive' ? 'translate-x-0' : 'translate-x-full'
                }`}
            />

            {/* Drive Tab Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('drive');
              }}
              className="flex-1 py-2.5 rounded-full z-10 flex items-center justify-center space-x-2 cursor-pointer transition-colors duration-300"
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${activeTab === 'drive' ? 'bg-white/20 text-white' : 'text-slate-400'
                  }`}
              >
                <Navigation className={`w-3 h-3 ${activeTab === 'drive' ? 'text-white fill-white' : 'text-slate-400'}`} />
              </div>
              <span
                className={`text-base tracking-tight transition-colors duration-300 ${activeTab === 'drive' ? 'text-white font-black' : 'text-slate-500 font-semibold'
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
              className="flex-1 py-2.5 rounded-full z-10 flex items-center justify-center space-x-2 cursor-pointer transition-colors duration-300 relative"
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${activeTab === 'schedule' ? 'bg-white/20 text-white' : 'text-slate-400'
                  }`}
              >
                <Calendar className={`w-3 h-3 ${activeTab === 'schedule' ? 'text-white' : 'text-slate-400'}`} />
              </div>
              <span
                className={`text-base tracking-tight transition-colors duration-300 ${activeTab === 'schedule' ? 'text-white font-black' : 'text-slate-500 font-semibold'
                  }`}
              >
                스케줄
              </span>
            </button>
          </div>
        </div>

        {/* Tab View Switch: [운행 대시보드] vs [배차 스케줄] */}
        {activeTab === 'drive' ? (
          <div className="flex-1 p-3.5 space-y-3 animate-fade-in">
            {/* 1. Origin / Destination Separate Selection & Bidirectional Swap (⇄) UX + Top 4 Quick Utility Bar */}
            <OriginDestinationSelector
              origin={origin}
              destination={destination}
              waypoints={waypoints}
              adminWaypoints={adminWaypoints}
              isAdminRoute={isAdminRoute}
              selectionTarget={selectionTarget}
              onSelectTarget={(target) => setSelectionTarget(target)}
              onSelectOrigin={() => setSelectionTarget('origin')}
              onSelectDestination={() => setSelectionTarget('destination')}
              onSelectWaypoint={(index) => handleSelectWaypoint(index)}
              onAddWaypoint={handleAddWaypoint}
              onRemoveWaypoint={handleRemoveWaypoint}
              onSwap={handleSwapOriginDestination}
              onOpenSearchModal={(target, wpIndex) => {
                setSelectionTarget(target);
                if (target === 'waypoint') {
                  setEditingWaypointIndex(typeof wpIndex === 'number' ? wpIndex : -1);
                  setWaypointInsertIndex(null);
                }
                setIsLocationSearchOpen(true);
              }}
              onOpenInspectionModal={() => setIsInspectionModalOpen(true)}
              onOpenFlightModal={() => setIsFlightModalOpen(true)}
              onOpenGasModal={() => setIsGasModalOpen(true)}
              onOpenPresetModal={handleOpenAddModal}
            />

            {/* 2. Standalone 5-Column Quick Action Bar */}
            <QuickActionBar
              onOpenInspectionModal={() => setIsInspectionModalOpen(true)}
              onOpenPresetModal={handleOpenAddModal}
              onOpenAddModal={handleOpenAddModal}
              onOpenGasModal={() => setIsGasModalOpen(true)}
              onOpenFlightModal={() => setIsFlightModalOpen(true)}
              onOpenRoadviewModal={() => setIsRoadviewModalOpen(true)}
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
                  const effectiveWaypoints = isAdminRoute && adminWaypoints.length > 0
                    ? adminWaypoints
                    : (waypoints && waypoints.length > 0 ? waypoints : []);
                  fetchRouteEstimate(origin, destination, effectiveWaypoints);
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
              waypoints={waypoints}
              adminWaypoints={adminWaypoints}
              isAdminRoute={isAdminRoute}
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
              presets={presets}
              onOpenProfileModal={() => setIsProfileModalOpen(true)}
              onSelectRouteForCockpit={handleSelectRouteFromSchedule}
              onOpenPredictionForSchedule={handleOpenPredictionForSchedule}
              onNavigateForSchedule={handleNavigateForSchedule}
              onOpenFlightModal={handleOpenFlightModalFromSchedule}
              onSwitchVehicle={(vNo) => {
                const hochaMatch = vNo.match(/(\d+)호차/);
                const cleanVNo = hochaMatch ? `${hochaMatch[1]}호차` : (vNo.includes('호차') ? vNo.trim() : `${vNo.trim()}호차`);
                const matchedPreset = FLEET_PRESET_DRIVERS.find(
                  (p) => p.vehicleNo === cleanVNo || p.hocha === cleanVNo.replace(/[^0-9]/g, '')
                );
                const storedPassenger = getStoredVehicleProfile(cleanVNo)?.passengerName;
                const effectivePassenger =
                  storedPassenger !== undefined
                    ? (storedPassenger?.trim() || null)
                    : (matchedPreset?.passengerName?.trim() || null);

                if (matchedPreset) {
                  const fullVehicle = `${matchedPreset.vehicleNo} ${matchedPreset.carNumber}`;
                  updateProfile({
                    vehicleNo: fullVehicle,
                    carNumber: matchedPreset.carNumber,
                    driverName: matchedPreset.driverName,
                    phone: matchedPreset.phone,
                    mobile: matchedPreset.phone,
                    passengerName: effectivePassenger,
                    defaultNavi: matchedPreset.defaultNavi,
                  });
                  // Background sync with Supabase
                  const deviceUuid = profile.id || getOrCreateDeviceUuid();
                  fetch('/api/driver', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: deviceUuid,
                      vehicle_no: matchedPreset.vehicleNo,
                      vehicleNo: fullVehicle,
                      driver_name: matchedPreset.driverName,
                      car_number: matchedPreset.carNumber,
                      phone: matchedPreset.phone,
                      passenger_name: effectivePassenger,
                      default_navi: matchedPreset.defaultNavi,
                    }),
                  }).catch((err) => console.warn('Supabase driver background sync failed:', err));
                } else {
                  // Fallback: fetch dynamically from API so different vehicle never retains old driver name
                  fetch(`/api/driver?vehicle_no=${encodeURIComponent(cleanVNo)}`)
                    .then((res) => res.json())
                    .then((data) => {
                      if (data?.driver) {
                        const d = data.driver;
                        const fullVehicle = d.car_number ? `${d.vehicle_no} ${d.car_number}` : d.vehicle_no;
                        const apiPassenger = d.passenger_name || storedPassenger || getPresetPassengerName(cleanVNo);
                        updateProfile({
                          vehicleNo: fullVehicle,
                          carNumber: d.car_number || undefined,
                          driverName: d.driver_name || '',
                          phone: d.phone || '',
                          mobile: d.phone || '',
                          passengerName: apiPassenger,
                          defaultNavi: d.default_navi || 'tmap',
                        });
                      } else {
                        updateProfile({ vehicleNo: cleanVNo, passengerName: effectivePassenger });
                      }
                    })
                    .catch(() => updateProfile({ vehicleNo: cleanVNo, passengerName: effectivePassenger }));
                }
                fetchPresetsForVehicle(cleanVNo);
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
          // Sync profile to Supabase with vehicle_no & car_number & passenger_name
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
              passenger_name: updated.passengerName !== undefined
                ? (updated.passengerName ? updated.passengerName.trim() || null : null)
                : (profile.passengerName ? profile.passengerName.trim() || null : null),
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
        presets={presets}
        onReorderPresets={handleReorderPresets}
        onDeletePreset={handleDeleteCustomPreset}
        onAddPreset={handleAddCustomPreset}
        presetToEdit={editingPreset}
        onUpdatePreset={handleUpdatePreset}
        isAdmin={isAdmin}
        homeLocation={profile.homeLocation}
        vehicleNo={currentVehicleNo}
        onOpenHomeModal={() => {
          setIsAddModalOpen(false);
          setIsHomeModalOpen(true);
        }}
        newlyAddedPresetId={newlyAddedPresetId}
        onClearHighlight={() => setNewlyAddedPresetId(null)}
      />

      {/* Home Location Address Registration Modal */}
      <CustomPresetModal
        isOpen={isHomeModalOpen}
        onClose={() => setIsHomeModalOpen(false)}
        onAddPreset={() => { }}
        isHomeMode={true}
        homeLocation={profile.homeLocation}
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

      {/* Vehicle Inspection (Receipt & Return) Modal (Pure Client-Side / localStorage Math) */}
      <VehicleInspectionModal
        isOpen={isInspectionModalOpen}
        onClose={() => setIsInspectionModalOpen(false)}
        profile={profile}
        profilePlateNumber={profile.plateNumber}
        initialMode={inspectionInitialMode}
      />

      {/* Standalone Location Search & Preset Modal */}
      <LocationSearchModal
        isOpen={isLocationSearchOpen}
        onClose={() => {
          setIsLocationSearchOpen(false);
          setWaypointInsertIndex(null);
        }}
        target={selectionTarget}
        presets={presets}
        homeLocation={profile.homeLocation}
        currentSelectedId={
          selectionTarget === 'origin'
            ? origin?.id
            : selectionTarget === 'waypoint'
            ? (editingWaypointIndex >= 0 && editingWaypointIndex < waypoints.length
                ? waypoints[editingWaypointIndex]?.id
                : undefined)
            : destination?.id
        }
        onSelectLocation={handleSelectLocationFromSearch}
        onOpenHomeModal={() => setIsHomeModalOpen(true)}
        onOpenManagePresets={() => {
          setIsAddModalOpen(true);
        }}
        onTogglePresetFavorite={(preset, action) => {
          if (action === 'remove') {
            handleDeleteCustomPreset(preset.id);
          } else if (action === 'add') {
            handleAddCustomPreset(preset);
          }
        }}
      />

      {/* On-Site Roadview & Entry Route Inspection Modal */}
      <RoadviewModal
        isOpen={isRoadviewModalOpen}
        onClose={() => setIsRoadviewModalOpen(false)}
        currentDestination={destination}
        presets={presets}
        homeLocation={profile.homeLocation}
      />

    </main>
  );
}
