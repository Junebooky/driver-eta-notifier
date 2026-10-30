import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  parseAndVerifyToken,
  signCockpitSession,
  extractAuthToken,
  CockpitAuthSession,
  isDevAuthAllowed,
  DEV_ACCOUNTS,
  DevAccountKey,
} from '@/lib/auth/serverAuth';
import { cleanDriverIdentity } from '@/utils/dispatchConflictDetector';

export const dynamic = 'force-dynamic';

/**
 * GET: Validates existing token and returns active session data.
 * In local dev mode (DEV_AUTH_ENABLED=true), if no session exists,
 * automatically issues a dev admin session so local testing is never blocked.
 */
export async function GET(req: NextRequest) {
  try {
    const isDev = isDevAuthAllowed();
    const token = extractAuthToken(req);

    if (token) {
      const session = await parseAndVerifyToken(token);
      if (session) {
        return NextResponse.json({
          ok: true,
          authenticated: true,
          session,
          isDevAllowed: isDev,
        });
      }
    }

    // In local development, seamlessly auto-issue HQ Admin session
    if (isDev) {
      const devAdmin = DEV_ACCOUNTS.admin;
      const autoToken = signCockpitSession(devAdmin, 60 * 60 * 24 * 7);

      const res = NextResponse.json({
        ok: true,
        authenticated: true,
        session: devAdmin,
        isDevAutoLogin: true,
        isDevAllowed: true,
      });

      res.cookies.set('cockpit_session', autoToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });

      return res;
    }

    // In Preview / Production: Strictly return 401 unauthenticated
    return NextResponse.json(
      { ok: false, authenticated: false, isDevAllowed: false, error: '활성화된 세션이 없습니다.' },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST: Handles session switching (dev mode) and credential-based logins.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, target, role, secret, driverName, vehicleNo } = body;
    const isDev = isDevAuthAllowed();

    // 1. Instant Dev Account Switcher (Localhost only)
    if (action === 'dev_switch' || body.accountKey) {
      if (!isDev) {
        return NextResponse.json(
          {
            ok: false,
            error: '개발용 계정 전환은 외부/운영 환경에서 비활성화되어 있습니다. (403 Forbidden)',
          },
          { status: 403 }
        );
      }

      const key = (target || body.accountKey || 'admin') as DevAccountKey;
      const selectedAccount = DEV_ACCOUNTS[key] || DEV_ACCOUNTS.admin;
      const token = signCockpitSession(selectedAccount, 60 * 60 * 24 * 7);

      const res = NextResponse.json({
        ok: true,
        authenticated: true,
        switchedTo: key,
        session: selectedAccount,
        isDevAllowed: true,
      });

      res.cookies.set('cockpit_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });

      return res;
    }

    // 2. Logout Action
    if (action === 'logout') {
      const res = NextResponse.json({ ok: true, authenticated: false });
      res.cookies.set('cockpit_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
      });
      return res;
    }

    // 3. HQ Admin Login (Production credential-based)
    if (role === 'hq' || role === 'hq_admin') {
      const configuredHqSecret = (process.env.HQ_ADMIN_SECRET || '').trim();

      if (!configuredHqSecret) {
        return NextResponse.json(
          {
            ok: false,
            error: '서버에 본사 관리자 비밀키(HQ_ADMIN_SECRET)가 구성되지 않았습니다. Vercel 환경 변수 설정을 확인해주세요.',
          },
          { status: 500 }
        );
      }

      const providedSecret = (secret || '').trim();
      if (!providedSecret) {
        return NextResponse.json(
          { ok: false, error: '본사 관리자 비밀키를 입력해주세요.' },
          { status: 400 }
        );
      }

      if (providedSecret !== configuredHqSecret) {
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

      const token = signCockpitSession(sessionPayload, 60 * 60 * 24 * 14);

      const res = NextResponse.json({
        ok: true,
        role: 'hq_admin',
        session: sessionPayload,
      });

      res.cookies.set('cockpit_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 14,
      });

      return res;
    }

    // 4. Driver Login (Verified against cockpit.drivers table and production PIN)
    if (role === 'driver') {
      if (!isDev) {
        const configuredPin = process.env.DRIVER_LOGIN_PIN;
        const providedPin = (body.pin || body.password || body.secret || '').trim();
        if (!configuredPin) {
          return NextResponse.json(
            { ok: false, error: '서버에 기사 인증 PIN(DRIVER_LOGIN_PIN)이 설정되지 않아 로그인이 차단되었습니다.' },
            { status: 500 }
          );
        }
        if (!providedPin || providedPin !== configuredPin.trim()) {
          return NextResponse.json(
            { ok: false, error: '기사 전용 인증 번호(PIN)가 올바르지 않거나 입력되지 않았습니다.' },
            { status: 403 }
          );
        }
      }

      if (!driverName?.trim() || !vehicleNo?.trim()) {
        return NextResponse.json(
          { ok: false, error: '기사 성함과 정확한 차량번호가 필요합니다.' },
          { status: 400 }
        );
      }

      const cleanName = cleanDriverIdentity(driverName);
      let query = supabaseAdmin.from('drivers').select('*');
      if (cleanName) {
        query = query.eq('driver_name', cleanName);
      }
      const { data: candidates, error: driverErr } = await query.limit(100);
      const drivers = (candidates || []).filter(d => d.vehicle_no === vehicleNo.trim() || d.car_number?.replace(/\s/g,'') === vehicleNo.replace(/\s/g,''));

      if (driverErr || !drivers || drivers.length === 0) {
        return NextResponse.json(
          { ok: false, error: '등록된 소속 기사 정보를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (drivers.length !== 1) return NextResponse.json({ ok: false, error: '동일한 이름의 기사가 여러 명입니다. 정확한 차량번호를 함께 입력해 주세요.' }, { status: 409 });
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

      const token = signCockpitSession(sessionPayload, 60 * 60 * 24 * 30);

      const res = NextResponse.json({
        ok: true,
        role: 'driver',
        driver: matched,
        session: sessionPayload,
      });

      res.cookies.set('cockpit_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });

      return res;
    }

    return NextResponse.json(
      { ok: false, error: '지원하지 않는 역할 또는 요청 형식입니다.' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
