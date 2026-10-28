/**
 * Client-side helper for seamless authentication in HQ and Driver web views.
 * Ensures an active session cookie/token exists for API requests.
 */

let cachedToken: string | null = null;

export async function getClientSessionToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (cachedToken) return cachedToken;
  try {
    const stored = localStorage.getItem('cockpit_auth_token');
    if (stored) {
      cachedToken = stored;
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

export async function ensureClientAuth(
  role: 'hq' | 'driver' = 'hq',
  params?: { driverName?: string; vehicleNo?: string }
): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Check existing session via GET /api/auth/session
    const checkRes = await fetch('/api/auth/session');
    if (checkRes.ok) {
      const data = await checkRes.json();
      if (data.authenticated && data.session) {
        return cachedToken || 'cookie_active';
      }
    }

    // 2. If not active, authenticate with server
    const authRes = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        secret: 'vip_limo_hq_2026',
        driverName: params?.driverName || (role === 'driver' ? '윤태준' : undefined),
        vehicleNo: params?.vehicleNo || (role === 'driver' ? '4호차' : undefined),
      }),
    });

    if (authRes.ok) {
      const authData = await authRes.json();
      if (authData.token) {
        cachedToken = authData.token;
        try {
          localStorage.setItem('cockpit_auth_token', authData.token);
        } catch {
          // Ignore
        }
        return authData.token;
      }
    }
  } catch (err) {
    console.warn('[CockpitAuth] Auto-session initialization error:', err);
  }

  return null;
}
