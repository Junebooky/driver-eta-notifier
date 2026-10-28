import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  parseAndVerifyToken,
  signCockpitSession,
  extractAuthToken,
  CockpitAuthSession,
} from '@/lib/auth/serverAuth';
import { cleanDriverIdentity } from '@/utils/dispatchConflictDetector';

export const dynamic = 'force-dynamic';

const DEFAULT_HQ_SECRET = process.env.HQ_ADMIN_SECRET || 'vip_limo_hq_2026';

/**
 * GET: Validates existing token and returns active session data.
 */
export async function GET(req: NextRequest) {
  try {
    const token = extractAuthToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, authenticated: false, error: 'No active session' },
        { status: 401 }
      );
    }

    const session = await parseAndVerifyToken(token);
    if (!session) {
      return NextResponse.json(
        { ok: false, authenticated: false, error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      session,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST: Authenticates HQ admin or Driver and issues a signed session token.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { role = 'hq', secret, driverName, vehicleNo, phone } = body;

    // 1. HQ Admin Login
    if (role === 'hq' || role === 'hq_admin') {
      const isDevOrTest = process.env.NODE_ENV !== 'production';
      const providedSecret = secret || '';

      // Verify secret
      if (!isDevOrTest && providedSecret !== DEFAULT_HQ_SECRET) {
        return NextResponse.json(
          { ok: false, error: '본사 관리자 비밀키가 일치하지 않습니다.' },
          { status: 403 }
        );
      }

      const sessionPayload: Omit<CockpitAuthSession, 'issuedAt' | 'expiresAt'> = {
        userId: 'admin_hq_central',
        org: 'vip_limousine_korea',
        role: 'hq_admin',
        driverName: '본사 관리자',
      };

      const token = signCockpitSession(sessionPayload, 60 * 60 * 24 * 14); // 14 days

      const res = NextResponse.json({
        ok: true,
        role: 'hq_admin',
        token,
        session: sessionPayload,
      });

      // Set cookie for browser sessions
      res.cookies.set('cockpit_session', token, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 14,
      });

      return res;
    }

    // 2. Driver Login (Verified against cockpit.drivers table)
    if (role === 'driver') {
      if (!driverName?.trim() && !vehicleNo?.trim()) {
        return NextResponse.json(
          { ok: false, error: '기사 성함 또는 차량번호가 필요합니다.' },
          { status: 400 }
        );
      }

      const cleanName = cleanDriverIdentity(driverName);

      let query = supabaseAdmin.from('drivers').select('*');
      if (cleanName) {
        query = query.ilike('driver_name', `%${cleanName}%`);
      }
      if (vehicleNo?.trim()) {
        query = query.or(`vehicle_no.eq.${vehicleNo.trim()},car_number.eq.${vehicleNo.trim()}`);
      }

      const { data: drivers, error: driverErr } = await query.limit(5);

      if (driverErr || !drivers || drivers.length === 0) {
        return NextResponse.json(
          { ok: false, error: '등록된 소속 기사 정보를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // Pick matching driver record
      const matched = drivers[0];

      const sessionPayload: Omit<CockpitAuthSession, 'issuedAt' | 'expiresAt'> = {
        userId: `driver_${matched.id || matched.vehicle_no}`,
        org: 'vip_limousine_korea',
        role: 'driver',
        driverId: matched.id,
        driverName: matched.driver_name,
        vehicleNo: matched.vehicle_no,
        carNumber: matched.car_number,
      };

      const token = signCockpitSession(sessionPayload, 60 * 60 * 24 * 30); // 30 days for mobile app

      const res = NextResponse.json({
        ok: true,
        role: 'driver',
        token,
        driver: matched,
        session: sessionPayload,
      });

      res.cookies.set('cockpit_session', token, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      return res;
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 역할(role)입니다.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

