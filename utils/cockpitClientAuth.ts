/**
 * Client-side authentication and session management helper.
 * Uses secure HttpOnly cookies (credentials: 'include') and eliminates localStorage tokens.
 */

export interface ClientSessionInfo {
  authenticated: boolean;
  role?: 'hq_admin' | 'driver';
  userId?: string;
  driverName?: string;
  vehicleNo?: string;
  displayName?: string;
  isDevAllowed?: boolean;
}

let sessionCache: ClientSessionInfo | null = null;
let sessionCheck: Promise<ClientSessionInfo> | null = null;
let generation=0;
let lastSessionCheckTime = 0;
const SESSION_CACHE_TTL_MS = 15_000; // 15s cache to avoid rapid duplicate session queries

/**
 * Checks or initializes the active session via server-signed HttpOnly cookie.
 * In local dev mode (DEV_AUTH_ENABLED=true), the server seamlessly auto-issues
 * an HQ Admin session on localhost.
 */
export async function ensureClientAuth(
  _role?: 'hq' | 'driver',
  _params?: { driverName?: string; vehicleNo?: string }
): Promise<ClientSessionInfo> {
  if (typeof window === 'undefined') {
    return { authenticated: false };
  }

  const now = Date.now();
  if (sessionCache && sessionCache.authenticated && now - lastSessionCheckTime < SESSION_CACHE_TTL_MS) {
    return sessionCache;
  }

  if (sessionCheck) return sessionCheck;
  const currentGeneration=generation;
  sessionCheck=(async()=>{
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
    });

    if (res.ok) {
      const data = await res.json();
      if (generation !== currentGeneration) return {authenticated:false};
      if (data.authenticated && data.session) {
        lastSessionCheckTime = Date.now();
        sessionCache = {
          authenticated: true,
          role: data.session.role,
          userId: data.session.userId,
          driverName: data.session.driverName,
          vehicleNo: data.session.vehicleNo,
          displayName: data.session.displayName || data.session.driverName,
          isDevAllowed: Boolean(data.isDevAllowed),
        };
        return sessionCache;
      }
    }
  } catch (err) {
    console.warn('[CockpitAuth] Failed to verify session:', err);
  }

  if (generation !== currentGeneration) return {authenticated:false};
  sessionCache = { authenticated: false };
  lastSessionCheckTime = 0;
  return sessionCache;
  })().finally(()=>{if(generation===currentGeneration)sessionCheck=null;});
  return sessionCheck;
}

/**
 * Clears client state and session caches.
 */
export function purgeLocalCaches() {
  generation++;
  sessionCheck=null;
  sessionCache = null;
  lastSessionCheckTime = 0;
  if (typeof window === 'undefined') return;
  try {
    // Clean any lingering legacy localStorage keys
    localStorage.removeItem('cockpit_auth_token');
    localStorage.removeItem('cockpit_schedules_cache');
    localStorage.removeItem('cockpit_offline_actions');
    localStorage.removeItem('cockpit_submitted_driving_logs_v1');
    localStorage.removeItem('cockpit_hq_expenses_v2');
    sessionStorage.clear();
  } catch {
    // Ignore storage errors
  }
}

/**
 * Switches the active development test profile (admin, driver_a, driver_b).
 * Only works when DEV_AUTH_ENABLED=true on localhost.
 */
export async function switchDevAccount(target: 'admin' | 'driver_a' | 'driver_b'): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        action: 'dev_switch',
        target,
      }),
    });

    if (res.ok) {
      // Purge cached state to avoid any cross-driver data leakage
      purgeLocalCaches();
      sessionCache = null;
      return true;
    }
  } catch (err) {
    console.error('[CockpitAuth] Dev switch failed:', err);
  }
  return false;
}

/**
 * Logs out and clears active session cookie.
 */
export async function logoutClientSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'logout' }),
    });
    purgeLocalCaches();
    return response.ok;
  } catch {
    // Ignore
  }

  purgeLocalCaches();
  sessionCache = null;
  return false;
}
