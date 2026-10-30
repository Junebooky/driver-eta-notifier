import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cleanVehicleIdentity } from '@/utils/dispatchConflictDetector';

export const dynamic = 'force-dynamic';

// In-process server cache for vehicle status overrides and admin memos
const serverVehicleStatusOverrides: Record<string, '대기 중' | '운행 중' | '정비 중'> = {};
const serverVehicleAdminMemos: Record<string, string> = {};
const serverVehicleColors: Record<string, string> = {};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    return NextResponse.json({
      ok: true,
      statuses: serverVehicleStatusOverrides,
      memos: serverVehicleAdminMemos,
      colors: serverVehicleColors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || '차량 상태 조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const { vehicleId, plate, status, memo, color } = body;

    if (!vehicleId && !plate) {
      return NextResponse.json(
        { ok: false, error: '차량 식별자(vehicleId 또는 plate)가 필요합니다.' },
        { status: 400 }
      );
    }

    const key = vehicleId || cleanVehicleIdentity(plate);

    if (status) {
      if (!['대기 중', '운행 중', '정비 중'].includes(status)) {
        return NextResponse.json(
          { ok: false, error: '유효한 운영 상태(대기 중, 운행 중, 정비 중)를 지정해 주세요.' },
          { status: 400 }
        );
      }
      serverVehicleStatusOverrides[key] = status;
      if (plate) {
        serverVehicleStatusOverrides[cleanVehicleIdentity(plate)] = status;
      }
    }

    if (memo !== undefined) {
      serverVehicleAdminMemos[key] = memo;
      if (plate) {
        serverVehicleAdminMemos[cleanVehicleIdentity(plate)] = memo;
      }
    }

    if (color !== undefined) {
      serverVehicleColors[key] = color;
      if (plate) {
        serverVehicleColors[cleanVehicleIdentity(plate)] = color;
      }
    }

    return NextResponse.json({
      ok: true,
      vehicleId: key,
      status: serverVehicleStatusOverrides[key],
      memo: serverVehicleAdminMemos[key],
      color: serverVehicleColors[key],
      statuses: serverVehicleStatusOverrides,
      memos: serverVehicleAdminMemos,
      colors: serverVehicleColors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || '차량 상태 저장 실패' },
      { status: 500 }
    );
  }
}
