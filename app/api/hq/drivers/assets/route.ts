import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin, verifyServerAuth } from '@/lib/auth/serverAuth';
import {
  deleteDriverProfileAsset,
  deleteDriverVehicleInfoAsset,
  getDriverProfileAsset,
  getDriverVehicleBundle,
  getDriverVehicleInfoAsset,
} from '@/lib/assets/driverAssetServerStore';
import { resolveVehicleEntity } from '@/utils/vehicleData';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hq/drivers/assets
 * Retrieves assets for a driver, vehicle, or composite bundle.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const driverId = searchParams.get('driverId');
    const vehicleIdParam = searchParams.get('vehicleId');
    const vehiclePlate = searchParams.get('vehiclePlate');
    const type = searchParams.get('type') || 'bundle'; // 'bundle' | 'profile' | 'info'
    const variant = searchParams.get('variant') as 'pc' | 'mobile' | null;

    if (!driverId) {
      return NextResponse.json(
        { ok: false, error: '기사 고유 식별자(driverId UUID)가 필요합니다.' },
        { status: 400 }
      );
    }

    // Role-based boundary: drivers can only inspect their own assets
    if (auth.session.role === 'driver') {
      const sessionDriverId = auth.session.driverId || auth.session.userId;
      if (sessionDriverId !== driverId) {
        return NextResponse.json(
          { ok: false, error: '본인 프로필 및 차량 Info만 조회할 수 있습니다. (403 Forbidden)' },
          { status: 403 }
        );
      }
    }

    const org = auth.session.org || 'vip_limousine_korea';

    if (type === 'profile') {
      const profile = await getDriverProfileAsset(driverId, org);
      return NextResponse.json({ ok: true, profile });
    }

    const resolvedVehicle = vehicleIdParam || vehiclePlate
      ? resolveVehicleEntity(vehicleIdParam || vehiclePlate!)
      : null;

    if (type === 'info') {
      if (!resolvedVehicle) {
        return NextResponse.json(
          { ok: false, error: '차량 식별자(vehicleId 또는 vehiclePlate)가 필요합니다.' },
          { status: 400 }
        );
      }
      if (variant) {
        const info = await getDriverVehicleInfoAsset(driverId, resolvedVehicle.uuid, variant, org);
        return NextResponse.json({ ok: true, info });
      }
      const [pcInfo, mobileInfo] = await Promise.all([
        getDriverVehicleInfoAsset(driverId, resolvedVehicle.uuid, 'pc', org),
        getDriverVehicleInfoAsset(driverId, resolvedVehicle.uuid, 'mobile', org),
      ]);
      return NextResponse.json({ ok: true, pcInfo, mobileInfo });
    }

    // Default: 'bundle'
    if (!resolvedVehicle) {
      const profile = await getDriverProfileAsset(driverId, org);
      return NextResponse.json({
        ok: true,
        bundle: {
          driverId,
          driverName: profile?.driverName || '',
          vehicleId: '',
          vehiclePlate: '',
          vehicleModel: '',
          profile,
          pcInfo: null,
          mobileInfo: null,
          isReadyForCustomerDispatch: false,
          isFullyComplete: false,
        },
      });
    }

    const bundle = await getDriverVehicleBundle(driverId, resolvedVehicle.uuid, undefined, org);
    return NextResponse.json({ ok: true, bundle });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '자료 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/hq/drivers/assets
 * Archives or removes a profile or info asset. Requires HQ Admin.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const payload = await req.json().catch(() => ({}));
    const { type, driverId, vehicleId, vehiclePlate, variant } = payload;

    if (!driverId || typeof driverId !== 'string') {
      return NextResponse.json(
        { ok: false, error: '기사 식별자(driverId)가 필요합니다.' },
        { status: 400 }
      );
    }

    const org = auth.session.org || 'vip_limousine_korea';

    if (type === 'profile') {
      await deleteDriverProfileAsset(driverId, org);
      return NextResponse.json({ ok: true, message: '기사 프로필 사진이 삭제(보관)되었습니다.' });
    }

    if (type === 'info') {
      const effVehicle = resolveVehicleEntity(vehicleId || vehiclePlate);
      if (!variant || (variant !== 'pc' && variant !== 'mobile')) {
        return NextResponse.json(
          { ok: false, error: '삭제할 규격(variant: pc 또는 mobile)이 필요합니다.' },
          { status: 400 }
        );
      }
      await deleteDriverVehicleInfoAsset(driverId, effVehicle.uuid, variant, org);
      return NextResponse.json({
        ok: true,
        message: `${effVehicle.plate} 차량의 ${variant.toUpperCase()} 안내자료가 삭제(보관)되었습니다.`,
      });
    }

    return NextResponse.json(
      { ok: false, error: '유효한 type(profile 또는 info)이 필요합니다.' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '자료 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
