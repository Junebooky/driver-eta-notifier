import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cleanVehicleIdentity } from '@/utils/dispatchConflictDetector';

export interface CockpitAuthSession {
  userId: string;
  org: 'vip_limousine_korea';
  role: 'hq_admin' | 'driver';
  driverId?: string;
  driverName?: string;
  vehicleNo?: string;
  carNumber?: string;
  displayName?: string;
  issuedAt: number;
  expiresAt: number;
  sessionId?: string;
}

/**
 * Checks whether local development authentication (auto-login, dev account switching) is allowed.
 * Strictly forbidden in Vercel Preview, Production, or when DEV_AUTH_ENABLED !== 'true'.
 */
export function isDevAuthAllowed(): boolean {
  if (process.env.DEV_AUTH_ENABLED !== 'true') return false;
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.VERCEL === '1') return false;
  if (process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'production') return false;
  return true;
}

/**
 * Resolves the signing secret for Cockpit tokens.
 * In non-dev environments, if no secret is configured, returns null (never use hardcoded fallbacks).
 */
export function getAuthSecret(): string | null {
  const configured =
    process.env.COCKPIT_AUTH_SECRET ||
    process.env.SESSION_SECRET;

  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }

  // Fallback secret ONLY allowed in strict local dev environment
  if (isDevAuthAllowed()) {
    return 'cockpit-dev-local-secret-key-salt-2026-strict-local-only';
  }

  return null;
}

/**
 * Standard development test profiles for instant role & driver switching on localhost.
 */
export const DEV_ACCOUNTS = {
  admin: {
    userId: 'dev_admin_hq',
    org: 'vip_limousine_korea' as const,
    role: 'hq_admin' as const,
    driverName: '본사 관리자',
    displayName: '본사 관리자 (HQ Admin)',
  },
  driver_a: {
    userId: 'dev_driver_yoon',
    org: 'vip_limousine_korea' as const,
    role: 'driver' as const,
    driverId: 'drv_yoon_01',
    driverName: '윤기사',
    vehicleNo: '7호차',
    carNumber: '서울31가7777',
    displayName: '기사 A (윤기사 · 7호차)',
  },
  driver_b: {
    userId: 'dev_driver_park',
    org: 'vip_limousine_korea' as const,
    role: 'driver' as const,
    driverId: 'drv_park_02',
    driverName: '박기사',
    vehicleNo: '8호차',
    carNumber: '서울32나8888',
    displayName: '기사 B (박기사 · 8호차)',
  },
} as const;

export type DevAccountKey = keyof typeof DEV_ACCOUNTS;

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64').toString('utf-8');
}

/**
 * Creates a cryptographically signed Cockpit session token.
 */
export function signCockpitSession(
  payload: Omit<CockpitAuthSession, 'issuedAt' | 'expiresAt'>,
  ttlSeconds: number = 60 * 60 * 24 * 7 // 7 days default
): string {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error('인증 서명 비밀키(AUTH_SECRET)가 설정되지 않았습니다.');
  }

  const now = Math.floor(Date.now() / 1000);
  const fullSession: CockpitAuthSession = {
    ...payload,
    org: 'vip_limousine_korea',
    issuedAt: now,
    expiresAt: now + ttlSeconds,
  };

  const payloadJson = JSON.stringify(fullSession);
  const encodedPayload = base64UrlEncode(payloadJson);

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`cockpit_s1.${encodedPayload}`);
  const signature = hmac.digest('base64url');

  return `cockpit_s1.${encodedPayload}.${signature}`;
}

/**
 * Parses and cryptographically validates a Cockpit session token or Supabase Auth JWT.
 */
export async function parseAndVerifyToken(token: string): Promise<CockpitAuthSession | null> {
  if (!token || typeof token !== 'string') return null;

  const trimmed = token.trim();

  // Pattern A: Signed Cockpit Session Token (cockpit_s1.<payload>.<signature>)
  if (trimmed.startsWith('cockpit_s1.')) {
    // Revoke every legacy shared-PIN/passkey token in hosted and production environments.
    if (!isDevAuthAllowed() && !(process.env.NODE_ENV === 'test' && process.env.VERCEL !== '1')) return null;
    const parts = trimmed.split('.');
    if (parts.length !== 3) return null;

    const [, encodedPayload, providedSig] = parts;
    const secret = getAuthSecret();
    if (!secret) return null;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`cockpit_s1.${encodedPayload}`);
    const expectedSig = hmac.digest('base64url');

    try {
      if (!crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
        return null;
      }
    } catch {
      return null;
    }

    try {
      const parsed: CockpitAuthSession = JSON.parse(base64UrlDecode(encodedPayload));
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(parsed.expiresAt) || !Number.isFinite(parsed.issuedAt) || parsed.expiresAt <= now || parsed.issuedAt > now + 60 || !parsed.userId || !['hq_admin', 'driver'].includes(parsed.role)) {
        return null; // Expired
      }
      if (parsed.org !== 'vip_limousine_korea') {
        return null; // Wrong organization
      }
      return parsed;
    } catch {
      return null;
    }
  }

  // Pattern B: Supabase Auth JWT (header.payload.signature)
  if (trimmed.split('.').length === 3) {
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(trimmed);
      if (error || !data.user) {
        return null;
      }
      // The provider verifies the token signature first; only server-managed metadata grants roles.
      const appMeta = data.user.app_metadata || {};
      const role = appMeta.cockpit_role;
      if (appMeta.org !== 'vip_limousine_korea' || !['hq_admin','driver'].includes(role) || appMeta.disabled === true) return null;
      const claims = JSON.parse(Buffer.from(trimmed.split('.')[1], 'base64url').toString('utf8'));
      const now = Math.floor(Date.now()/1000);
      if (claims.sub !== data.user.id || !Number.isFinite(claims.exp) || claims.exp <= now || !claims.session_id || !Number.isFinite(claims.iat)) return null;
      if (appMeta.require_mfa === true && claims.aal !== 'aal2') return null;
      const { data: active, error: sessionError } = await supabaseAdmin.rpc('is_active_auth_session', {
        p_session_id: claims.session_id, p_user_id: data.user.id,
      });
      if (sessionError || active !== true) return null;
      let driver: Record<string, string> | null = null;
      if (role === 'driver') {
        if (typeof appMeta.driver_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(appMeta.driver_id)) return null;
        const result = await supabaseAdmin.from('drivers').select('id,driver_name,vehicle_no,car_number,driver_meta').eq('id',appMeta.driver_id).maybeSingle();
        if (result.error || !result.data || result.data.driver_meta?.status === 'inactive') return null;
        driver = result.data;
      }
      return {
        userId: data.user.id, org: 'vip_limousine_korea', role,
        driverId: driver?.id, driverName: driver?.driver_name,
        vehicleNo: driver?.vehicle_no, carNumber: driver?.car_number,
        displayName: driver?.driver_name || '본사 관리자', sessionId: claims.session_id,
        issuedAt: claims.iat, expiresAt: claims.exp,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Extracts raw bearer or cookie token from Request / NextRequest.
 */
export function extractAuthToken(req: Request | NextRequest): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Custom header x-cockpit-token
  const customHeader = req.headers.get('x-cockpit-token');
  if (customHeader) {
    return customHeader.trim();
  }

  // 3. Cookie cockpit_session
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)cockpit_session=([^;]+)/);
    if (match && match[1]) {
      try { return decodeURIComponent(match[1].trim()); } catch { return null; }
    }
  }

  return null;
}

export interface AuthVerificationResult {
  ok: boolean;
  session?: CockpitAuthSession;
  error?: string;
  statusCode: number;
}

/**
 * Verifies that the incoming request has a valid, authenticated session.
 * Rejects requests when unauthenticated (401) or unauthorized (403).
 */
export async function verifyServerAuth(
  req: Request | NextRequest,
  requiredRole?: 'hq_admin' | 'driver'
): Promise<AuthVerificationResult> {
  const token = extractAuthToken(req);

  if (!token) {
    if (isDevAuthAllowed()) {
      const devAdmin = DEV_ACCOUNTS.admin;
      return {
        ok: true,
        session: {
          ...devAdmin,
          issuedAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
        },
        statusCode: 200,
      };
    }
    return {
      ok: false,
      error: '인증 토큰이 없습니다. 로그인이 필요합니다. (401 Unauthorized)',
      statusCode: 401,
    };
  }

  const session = await parseAndVerifyToken(token);
  if (!session) {
    return {
      ok: false,
      error: '유효하지 않거나 만료된 인증 토큰입니다. 다시 로그인해주세요. (401 Unauthorized)',
      statusCode: 401,
    };
  }

  if (requiredRole && session.role !== requiredRole) {
    if (requiredRole === 'hq_admin' && session.role !== 'hq_admin') {
      return {
        ok: false,
        error: '본사 관리자(HQ Admin) 전용 기능입니다. 접근이 거부되었습니다. (403 Forbidden)',
        statusCode: 403,
      };
    }
  }

  return {
    ok: true,
    session,
    statusCode: 200,
  };
}

/**
 * Helper to enforce HQ Admin permissions on sensitive endpoints.
 */
export async function requireHqAdmin(req: Request | NextRequest): Promise<AuthVerificationResult> {
  return verifyServerAuth(req, 'hq_admin');
}

/**
 * Validates whether the authenticated driver is permitted to view or mutate a schedule row.
 * Drivers can only access schedules strictly assigned to their immutable driver_id UUID.
 * Loose matching by driver_name or vehicle_plate is strictly eliminated.
 */
export function driverCanAccessSchedule(
  session: CockpitAuthSession,
  schedule: Record<string, any>
): boolean {
  if (session.role === 'hq_admin') return true;
  if (session.role !== 'driver') return false;
  if (schedule.schedule_meta?.serviceMode === 'vehicle_only') return false;

  // Unassigned bookings are invisible and untouchable by drivers
  if (
    schedule.vehicle_no === '미배정' ||
    schedule.dispatch_status === 'unassigned' ||
    schedule.dispatch_status === 'draft'
  ) {
    return false;
  }

  const sDriverId = schedule.driver_id || schedule.schedule_meta?.driverId || schedule.schedule_meta?.driver_id;
  const sessionDriverId = session.driverId || session.userId;

  if (sessionDriverId && sDriverId && sessionDriverId === sDriverId) {
    return true;
  }

  return false;
}
