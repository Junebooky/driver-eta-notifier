import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cleanDriverIdentity, cleanVehicleIdentity } from '@/utils/dispatchConflictDetector';

export interface CockpitAuthSession {
  userId: string;
  org: 'vip_limousine_korea';
  role: 'hq_admin' | 'driver';
  driverId?: string;
  driverName?: string;
  vehicleNo?: string;
  carNumber?: string;
  issuedAt: number;
  expiresAt: number;
}

const AUTH_SECRET =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SESSION_SECRET ||
  'cockpit-vip-limo-secret-key-salt-2026';

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
  const now = Math.floor(Date.now() / 1000);
  const fullSession: CockpitAuthSession = {
    ...payload,
    org: 'vip_limousine_korea',
    issuedAt: now,
    expiresAt: now + ttlSeconds,
  };

  const payloadJson = JSON.stringify(fullSession);
  const encodedPayload = base64UrlEncode(payloadJson);

  const hmac = crypto.createHmac('sha256', AUTH_SECRET);
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
    const parts = trimmed.split('.');
    if (parts.length !== 3) return null;

    const [, encodedPayload, providedSig] = parts;

    const hmac = crypto.createHmac('sha256', AUTH_SECRET);
    hmac.update(`cockpit_s1.${encodedPayload}`);
    const expectedSig = hmac.digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
      return null;
    }

    try {
      const parsed: CockpitAuthSession = JSON.parse(base64UrlDecode(encodedPayload));
      const now = Math.floor(Date.now() / 1000);
      if (parsed.expiresAt && parsed.expiresAt < now) {
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
      const appMeta = data.user.app_metadata || {};
      const userMeta = data.user.user_metadata || {};
      const org = appMeta.org || userMeta.org;
      const role = appMeta.cockpit_role || userMeta.cockpit_role || 'driver';

      if (org !== 'vip_limousine_korea') {
        return null;
      }

      return {
        userId: data.user.id,
        org: 'vip_limousine_korea',
        role: role === 'hq_admin' ? 'hq_admin' : 'driver',
        driverId: appMeta.driver_id || userMeta.driver_id,
        driverName: appMeta.driver_name || userMeta.driver_name,
        vehicleNo: appMeta.vehicle_no || userMeta.vehicle_no,
        carNumber: appMeta.car_number || userMeta.car_number,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600 * 24,
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
      return decodeURIComponent(match[1].trim());
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
 *
 * NOTE: P0 requirement:
 * "인증 설정이 없는 개발 환경에서도 무조건 접근을 허용하지 않는다."
 * Every API caller must present a verified token.
 */
export async function verifyServerAuth(
  req: Request | NextRequest,
  requiredRole?: 'hq_admin' | 'driver'
): Promise<AuthVerificationResult> {
  const token = extractAuthToken(req);

  if (!token) {
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
    // If hq_admin is required, a driver token is strictly forbidden
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
 * Drivers can only access schedules specifically assigned to their name, vehicle, or ID.
 */
export function driverCanAccessSchedule(
  session: CockpitAuthSession,
  schedule: Record<string, any>
): boolean {
  if (session.role === 'hq_admin') return true;

  if (session.role !== 'driver') return false;

  // Unassigned bookings are invisible and untouchable by drivers
  if (schedule.vehicle_no === '미배정' || schedule.dispatch_status === 'unassigned' || schedule.dispatch_status === 'draft') {
    return false;
  }

  const sDriverName = cleanDriverIdentity(schedule.driver_name);
  const sDriverId = schedule.driver_id;
  const sVehiclePlate = cleanVehicleIdentity(schedule.vehicle_plate || schedule.car_number);
  const sVehicleNo = cleanVehicleIdentity(schedule.vehicle_no);

  const sessionDriverName = cleanDriverIdentity(session.driverName);
  const sessionDriverId = session.driverId;
  const sessionVehicleNo = cleanVehicleIdentity(session.vehicleNo);
  const sessionCarNumber = cleanVehicleIdentity(session.carNumber);

  if (sessionDriverName && sDriverName && sessionDriverName === sDriverName) return true;
  if (sessionDriverId && sDriverId && sessionDriverId === sDriverId) return true;
  if (sessionCarNumber && sVehiclePlate && sessionCarNumber === sVehiclePlate) return true;
  if (sessionVehicleNo && sVehicleNo && sessionVehicleNo === sVehicleNo) return true;

  return false;
}
