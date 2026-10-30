import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  BUCKET_NAME,
  createSignedAssetUrl,
  getDriverProfileStoragePath,
  getDriverVehicleInfoStoragePath,
  normalizeExtension,
  saveDriverProfileAsset,
  saveDriverVehicleInfoAsset,
  validateAssetUpload,
} from '@/lib/assets/driverAssetServerStore';
import { resolveVehicleEntity } from '@/utils/vehicleData';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hq/drivers/assets/upload
 * Multipart form data upload endpoint for Driver Profile and Info assets.
 * Requires HQ Admin authentication.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const assetType = formData.get('assetType') as 'profile' | 'info' | null;
    const driverId = formData.get('driverId') as string | null;
    const driverName = (formData.get('driverName') as string | null) || undefined;
    const vehicleIdParam = formData.get('vehicleId') as string | null;
    const vehiclePlate = formData.get('vehiclePlate') as string | null;
    const vehicleModel = formData.get('vehicleModel') as string | null;
    const variant = formData.get('variant') as 'pc' | 'mobile' | null;
    const width = Number(formData.get('width')) || undefined;
    const height = Number(formData.get('height')) || undefined;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: '업로드할 파일이 전달되지 않았습니다.' },
        { status: 400 }
      );
    }

    if (!assetType || (assetType !== 'profile' && assetType !== 'info')) {
      return NextResponse.json(
        { ok: false, error: '자료 유형(assetType: profile 또는 info)을 지정해주세요.' },
        { status: 400 }
      );
    }

    if (!driverId || typeof driverId !== 'string') {
      return NextResponse.json(
        { ok: false, error: '기사 식별자(driverId UUID)가 필요합니다.' },
        { status: 400 }
      );
    }

    const mimeType = file.type || 'image/png';
    const validation = validateAssetUpload({
      assetType,
      variant: variant || undefined,
      fileSize: file.size,
      mimeType,
      width,
      height,
    });

    if (!validation.valid) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    const org = auth.session.org || 'vip_limousine_korea';
    const originalFileName = file.name || (assetType === 'profile' ? 'profile.png' : `${variant || 'info'}.png`);
    const ext = normalizeExtension(originalFileName, mimeType);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let storagePath: string;
    let savedAsset: any;

    if (assetType === 'profile') {
      storagePath = getDriverProfileStoragePath(driverId, ext, org);

      // Upload to Supabase Storage bucket 'cockpit-assets'
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadErr) {
        console.warn('[Profile Upload] Supabase Storage upload error:', uploadErr.message);
      }

      savedAsset = await saveDriverProfileAsset({
        organizationId: org,
        driverId,
        driverName,
        filePath: storagePath,
        fileName: originalFileName,
        fileSize: file.size,
        mimeType,
        width,
        height,
        version: 1,
        status: 'active',
        uploadedBy: auth.session.displayName || '본사 관리자',
      });
    } else {
      // Info asset
      if (!variant || (variant !== 'pc' && variant !== 'mobile')) {
        return NextResponse.json(
          { ok: false, error: '차량 Info 업로드 시 규격(variant: pc 또는 mobile)이 필수입니다.' },
          { status: 400 }
        );
      }

      const effVehicle = resolveVehicleEntity(vehicleIdParam || vehiclePlate || '', vehicleModel || undefined);
      storagePath = getDriverVehicleInfoStoragePath(driverId, effVehicle.uuid, variant, ext, org);

      // Upload to Supabase Storage bucket 'cockpit-assets'
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadErr) {
        console.warn('[Info Upload] Supabase Storage upload error:', uploadErr.message);
      }

      savedAsset = await saveDriverVehicleInfoAsset({
        organizationId: org,
        driverId,
        driverName,
        vehicleId: effVehicle.uuid,
        vehiclePlate: effVehicle.plate,
        vehicleModel: effVehicle.model,
        variant,
        filePath: storagePath,
        fileName: originalFileName,
        fileSize: file.size,
        mimeType,
        width,
        height,
        version: 1,
        status: 'active',
        uploadedBy: auth.session.displayName || '본사 관리자',
      });
    }

    const signedUrl = await createSignedAssetUrl(storagePath);
    savedAsset.signedUrl = signedUrl;

    return NextResponse.json({
      ok: true,
      asset: savedAsset,
      warning: validation.warning,
      storagePath,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '자료 업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

