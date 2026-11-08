'use client';

import { useEffect, useState } from 'react';
import { mergeFleetRegistry, type FleetRegistryRecord } from '@/utils/fleetVehicleRegistry';
import type { VipRealVehicle } from '@/utils/vehicleData';

export interface HqFleetRegistryState {
  vehicles: VipRealVehicle[];
  loading: boolean;
  error: string | null;
}

/** The server-owned cockpit.vehicles inventory, shared by email revisions and HQ.
 * No browser-cache or hardcoded fallback: archived plates stay archived.
 */
export function useHqFleetRegistry(enabled = true): HqFleetRegistryState {
  const [state, setState] = useState<HqFleetRegistryState>({
    vehicles: [], loading: enabled, error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ vehicles: [], loading: false, error: null });
      return;
    }
    let active = true;
    let requestId = 0;
    const refresh = async () => {
      const id = ++requestId;
      setState(previous => ({ ...previous, loading: true }));
      try {
        const response = await fetch('/api/fleet/registry', { cache: 'no-store' });
        const data = await response.json().catch(() => ({})) as { ok?: boolean; records?: FleetRegistryRecord[]; error?: string };
        if (!response.ok || data.ok !== true || !Array.isArray(data.records)) {
          throw new Error(data.error || '차량 등록부를 불러오지 못했습니다.');
        }
        if (active && id === requestId) {
          setState({ vehicles: mergeFleetRegistry(data.records), loading: false, error: null });
        }
      } catch (error) {
        if (active && id === requestId) {
          setState({
            vehicles: [], loading: false,
            error: error instanceof Error ? error.message : '차량 등록부 조회 실패',
          });
        }
      }
    };
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('vip_hq_fleet_updated', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('vip_hq_fleet_updated', onFocus);
    };
  }, [enabled]);

  return state;
}
