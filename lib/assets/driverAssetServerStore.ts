import { supabaseAdmin } from '@/lib/supabase/server';
import {
  AssetMimeType,
  AssetUploadValidationResult,
  DriverInfoDispatchLog,
  DriverInfoDispatchSnapshot,
  DriverProfileAsset,
  DriverVehicleAssetBundle,
  DriverVehicleInfoAsset,
} from '@/types/driverVehicleAsset';
import { resolveVehicleEntity } from '@/utils/vehicleData';

export const BUCKET_NAME = 'cockpit-assets';
export const DEFAULT_ORG = 'vip_limousine_korea';
export const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

// In-memory fallback stores for local testing / mock runtime
const inMemoryProfiles = new Map<string, DriverProfileAsset>(); // key: `${org}:${driverId}`
const inMemoryInfos = new Map<string, DriverVehicleInfoAsset>(); // key: `${org}:${driverId}:${vehicleId}:${variant}`
const inMemoryDispatchLogs: DriverInfoDispatchLog[] = [];

/**
 * Normalizes file extension safely.
 */
export function normalizeExtension(fileName: string, mimeType?: string): string {
  const parts = fileName.split('.');
  const ext = (parts.length > 1 ? parts.pop() : '')?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

/**
 * Builds canonical Storage path for Driver Profile.
 * Path pattern: vip_limousine_korea/drivers/profiles/{driver_uuid}/profile.<ext>
 */
export function getDriverProfileStoragePath(
  driverId: string,
  ext: string,
  org: string = DEFAULT_ORG
): string {
  const safeExt = ext.replace(/^\./, '').toLowerCase();
  return `${org}/drivers/profiles/${driverId}/profile.${safeExt}`;
}

/**
 * Builds canonical Storage path for Driver × Vehicle Info.
 * Path pattern: vip_limousine_korea/drivers/info/{driver_uuid}/{vehicle_uuid}/{variant}.<ext>
 */
export function getDriverVehicleInfoStoragePath(
  driverId: string,
  vehicleId: string,
  variant: 'pc' | 'mobile',
  ext: string,
  org: string = DEFAULT_ORG
): string {
  const safeExt = ext.replace(/^\./, '').toLowerCase();
  return `${org}/drivers/info/${driverId}/${vehicleId}/${variant}.${safeExt}`;
}

/**
 * Validates uploaded image metadata and orientation.
 */
export function validateAssetUpload(params: {
  assetType: 'profile' | 'info';
  variant?: 'pc' | 'mobile';
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
}): AssetUploadValidationResult {
  const { assetType, variant, fileSize, mimeType, width, height } = params;

  if (fileSize <= 0) {
    return { valid: false, error: '빈 파일은 업로드할 수 없습니다.' };
  }

  if (fileSize > MAX_ASSET_SIZE_BYTES) {
    return {
      valid: false,
      error: `파일 크기(${Math.round(fileSize / (1024 * 1024))}MB)가 최대 허용 크기(10MB)를 초과합니다.`,
    };
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `지원하지 않는 파일 형식(${mimeType})입니다. JPG, PNG, WEBP, PDF 형식만 업로드 가능합니다.`,
    };
  }

  // Dimension & orientation checks
  if (width && height) {
    if (assetType === 'info') {
      if (variant === 'pc') {
        if (width < height) {
          return {
            valid: true,
            warning: 'PC 안내자료는 가로형(16:9 권장) 이미지를 권장합니다. 현재 세로형 이미지가 감지되었습니다.',
            recommendedRatio: '16:9 가로형 (예: 1920x1080)',
          };
        }
      } else if (variant === 'mobile') {
        if (height < width) {
          return {
            valid: true,
            warning: '모바일 안내자료는 세로형(9:16 권장) 이미지를 권장합니다. 현재 가로형 이미지가 감지되었습니다.',
            recommendedRatio: '9:16 세로형 (예: 1080x1920)',
          };
        }
      }
    } else if (assetType === 'profile') {
      const ratio = width / height;
      if (ratio < 0.6 || ratio > 1.4) {
        return {
          valid: true,
          warning: '기사 프로필 사진은 1:1 정사각형 또는 3:4 인물 증명 비율을 권장합니다.',
          recommendedRatio: '1:1 또는 3:4 인물 증명 사진',
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Generates an expiring signed URL from Supabase Storage.
 */
export async function createSignedAssetUrl(filePath: string, expiresInSeconds: number = 3600): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, expiresInSeconds);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch {
    // Ignore and fallback
  }

  // Fallback direct preview URL path
  return `/api/hq/drivers/assets/preview?path=${encodeURIComponent(filePath)}`;
}

// -----------------------------------------------------------------------------
// Driver Profile Store Operations
// -----------------------------------------------------------------------------

export async function getDriverProfileAsset(
  driverId: string,
  org: string = DEFAULT_ORG
): Promise<DriverProfileAsset | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('driver_profile_assets')
      .select('*')
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('status', 'active')
      .maybeSingle();

    if (!error && data) {
      const signedUrl = await createSignedAssetUrl(data.file_path);
      return {
        id: data.id,
        organizationId: data.organization_id,
        driverId: data.driver_id,
        filePath: data.file_path,
        fileName: data.file_name,
        fileSize: data.file_size,
        mimeType: data.mime_type,
        width: data.width,
        height: data.height,
        version: data.version || 1,
        status: data.status,
        uploadedBy: data.uploaded_by,
        signedUrl,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch {
    // DB table might not exist yet before migration
  }

  // Fallback to in-memory store
  const memKey = `${org}:${driverId}`;
  const found = inMemoryProfiles.get(memKey);
  if (found && found.status === 'active') {
    return { ...found };
  }
  return null;
}

export async function saveDriverProfileAsset(
  asset: Omit<DriverProfileAsset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<DriverProfileAsset> {
  const org = asset.organizationId || DEFAULT_ORG;
  const now = new Date().toISOString();
  const id = asset.id || crypto.randomUUID();

  // Try DB persistence
  try {
    // Archive any previous active profile for this driver
    await supabaseAdmin
      .from('driver_profile_assets')
      .update({ status: 'archived', updated_at: now })
      .eq('organization_id', org)
      .eq('driver_id', asset.driverId)
      .eq('status', 'active');

    const { data, error } = await supabaseAdmin
      .from('driver_profile_assets')
      .insert({
        id,
        organization_id: org,
        driver_id: asset.driverId,
        file_path: asset.filePath,
        file_name: asset.fileName,
        file_size: asset.fileSize,
        mime_type: asset.mimeType,
        width: asset.width,
        height: asset.height,
        version: asset.version || 1,
        status: 'active',
        uploaded_by: asset.uploadedBy || '본사 관리자',
      })
      .select('*')
      .single();

    if (!error && data) {
      const signedUrl = await createSignedAssetUrl(data.file_path);
      const saved: DriverProfileAsset = {
        id: data.id,
        organizationId: data.organization_id,
        driverId: data.driver_id,
        filePath: data.file_path,
        fileName: data.file_name,
        fileSize: data.file_size,
        mimeType: data.mime_type,
        width: data.width,
        height: data.height,
        version: data.version,
        status: data.status,
        uploadedBy: data.uploaded_by,
        signedUrl,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      inMemoryProfiles.set(`${org}:${asset.driverId}`, saved);
      return saved;
    }
  } catch {
    // Fallback if table not ready
  }

  const saved: DriverProfileAsset = {
    id,
    organizationId: org,
    driverId: asset.driverId,
    filePath: asset.filePath,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    version: asset.version || 1,
    status: 'active',
    uploadedBy: asset.uploadedBy || '본사 관리자',
    signedUrl: await createSignedAssetUrl(asset.filePath),
    createdAt: now,
    updatedAt: now,
  };
  inMemoryProfiles.set(`${org}:${asset.driverId}`, saved);
  return saved;
}

export async function deleteDriverProfileAsset(
  driverId: string,
  org: string = DEFAULT_ORG
): Promise<boolean> {
  try {
    await supabaseAdmin
      .from('driver_profile_assets')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('status', 'active');
  } catch {
    // Ignore DB error
  }
  inMemoryProfiles.delete(`${org}:${driverId}`);
  return true;
}

// -----------------------------------------------------------------------------
// Driver × Vehicle Info Store Operations
// -----------------------------------------------------------------------------

export async function getDriverVehicleInfoAsset(
  driverId: string,
  vehicleId: string,
  variant: 'pc' | 'mobile',
  org: string = DEFAULT_ORG
): Promise<DriverVehicleInfoAsset | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('driver_vehicle_info_assets')
      .select('*')
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('vehicle_id', vehicleId)
      .eq('variant', variant)
      .eq('status', 'active')
      .maybeSingle();

    if (!error && data) {
      const signedUrl = await createSignedAssetUrl(data.file_path);
      return {
        id: data.id,
        organizationId: data.organization_id,
        driverId: data.driver_id,
        vehicleId: data.vehicle_id,
        variant: data.variant,
        filePath: data.file_path,
        fileName: data.file_name,
        fileSize: data.file_size,
        mimeType: data.mime_type,
        width: data.width,
        height: data.height,
        version: data.version || 1,
        status: data.status,
        uploadedBy: data.uploaded_by,
        signedUrl,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch {
    // Table not ready
  }

  const memKey = `${org}:${driverId}:${vehicleId}:${variant}`;
  const found = inMemoryInfos.get(memKey);
  if (found && found.status === 'active') {
    return { ...found };
  }
  return null;
}

export async function saveDriverVehicleInfoAsset(
  asset: Omit<DriverVehicleInfoAsset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<DriverVehicleInfoAsset> {
  const org = asset.organizationId || DEFAULT_ORG;
  const now = new Date().toISOString();
  const id = asset.id || crypto.randomUUID();

  try {
    // Archive previous active asset for this variant
    await supabaseAdmin
      .from('driver_vehicle_info_assets')
      .update({ status: 'archived', updated_at: now })
      .eq('organization_id', org)
      .eq('driver_id', asset.driverId)
      .eq('vehicle_id', asset.vehicleId)
      .eq('variant', asset.variant)
      .eq('status', 'active');

    const { data, error } = await supabaseAdmin
      .from('driver_vehicle_info_assets')
      .insert({
        id,
        organization_id: org,
        driver_id: asset.driverId,
        vehicle_id: asset.vehicleId,
        variant: asset.variant,
        file_path: asset.filePath,
        file_name: asset.fileName,
        file_size: asset.fileSize,
        mime_type: asset.mimeType,
        width: asset.width,
        height: asset.height,
        version: asset.version || 1,
        status: 'active',
        uploaded_by: asset.uploadedBy || '본사 관리자',
      })
      .select('*')
      .single();

    if (!error && data) {
      const signedUrl = await createSignedAssetUrl(data.file_path);
      const saved: DriverVehicleInfoAsset = {
        id: data.id,
        organizationId: data.organization_id,
        driverId: data.driver_id,
        vehicleId: data.vehicle_id,
        variant: data.variant,
        filePath: data.file_path,
        fileName: data.file_name,
        fileSize: data.file_size,
        mimeType: data.mime_type,
        width: data.width,
        height: data.height,
        version: data.version,
        status: data.status,
        uploadedBy: data.uploaded_by,
        signedUrl,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      inMemoryInfos.set(`${org}:${asset.driverId}:${asset.vehicleId}:${asset.variant}`, saved);
      return saved;
    }
  } catch {
    // Fallback
  }

  const saved: DriverVehicleInfoAsset = {
    id,
    organizationId: org,
    driverId: asset.driverId,
    vehicleId: asset.vehicleId,
    variant: asset.variant,
    filePath: asset.filePath,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    version: asset.version || 1,
    status: 'active',
    uploadedBy: asset.uploadedBy || '본사 관리자',
    signedUrl: await createSignedAssetUrl(asset.filePath),
    createdAt: now,
    updatedAt: now,
  };
  inMemoryInfos.set(`${org}:${asset.driverId}:${asset.vehicleId}:${asset.variant}`, saved);
  return saved;
}

export async function deleteDriverVehicleInfoAsset(
  driverId: string,
  vehicleId: string,
  variant: 'pc' | 'mobile',
  org: string = DEFAULT_ORG
): Promise<boolean> {
  try {
    await supabaseAdmin
      .from('driver_vehicle_info_assets')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('vehicle_id', vehicleId)
      .eq('variant', variant)
      .eq('status', 'active');
  } catch {
    // Ignore DB error
  }
  inMemoryInfos.delete(`${org}:${driverId}:${vehicleId}:${variant}`);
  return true;
}

/**
 * Loads the complete asset bundle for a specific (driver, vehicle) pair.
 */
export async function getDriverVehicleBundle(
  driverId: string,
  vehiclePlateOrId: string,
  fallbackModel?: string,
  org: string = DEFAULT_ORG
): Promise<DriverVehicleAssetBundle> {
  const veh = resolveVehicleEntity(vehiclePlateOrId, fallbackModel);
  const [profile, pcInfo, mobileInfo] = await Promise.all([
    getDriverProfileAsset(driverId, org),
    getDriverVehicleInfoAsset(driverId, veh.uuid, 'pc', org),
    getDriverVehicleInfoAsset(driverId, veh.uuid, 'mobile', org),
  ]);

  return {
    driverId,
    driverName: profile?.driverName || '',
    vehicleId: veh.uuid,
    vehiclePlate: veh.plate,
    vehicleModel: veh.model,
    profile,
    pcInfo,
    mobileInfo,
    isReadyForCustomerDispatch: Boolean(pcInfo || mobileInfo),
    isFullyComplete: Boolean(pcInfo && mobileInfo),
  };
}

// -----------------------------------------------------------------------------
// Dispatch Logs & Snapshots
// -----------------------------------------------------------------------------

export async function recordInfoDispatchLog(
  log: Omit<DriverInfoDispatchLog, 'id' | 'dispatchedAt'> & { id?: string; dispatchedAt?: string }
): Promise<DriverInfoDispatchLog> {
  const id = log.id || crypto.randomUUID();
  const org = log.organizationId || DEFAULT_ORG;
  const now = log.dispatchedAt || new Date().toISOString();

  const record: DriverInfoDispatchLog = {
    ...log,
    id,
    organizationId: org,
    dispatchedAt: now,
    createdAt: now,
  };

  try {
    await supabaseAdmin.from('driver_info_dispatch_logs').insert({
      id,
      organization_id: org,
      booking_id: log.bookingId,
      driver_id: log.driverId,
      driver_name: log.driverName,
      vehicle_id: log.vehicleId,
      vehicle_plate: log.vehiclePlate,
      vehicle_model: log.vehicleModel,
      profile_asset_id: log.profileAssetId || null,
      pc_info_asset_id: log.pcInfoAssetId || null,
      mobile_info_asset_id: log.mobileInfoAssetId || null,
      channel: log.channel,
      recipient: log.recipient,
      dispatched_by: log.dispatchedBy,
      dispatched_at: now,
      snapshot: log.snapshot,
      notes: log.notes || null,
    });
  } catch {
    // Table not ready
  }

  inMemoryDispatchLogs.unshift(record);
  return record;
}

export async function getLatestDispatchLogForBooking(
  bookingId: string,
  org: string = DEFAULT_ORG
): Promise<DriverInfoDispatchLog | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('driver_info_dispatch_logs')
      .select('*')
      .eq('organization_id', org)
      .eq('booking_id', bookingId)
      .order('dispatched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        organizationId: data.organization_id,
        bookingId: data.booking_id,
        driverId: data.driver_id,
        driverName: data.driver_name,
        vehicleId: data.vehicle_id,
        vehiclePlate: data.vehicle_plate,
        vehicleModel: data.vehicle_model,
        profileAssetId: data.profile_asset_id,
        pcInfoAssetId: data.pc_info_asset_id,
        mobileInfoAssetId: data.mobile_info_asset_id,
        channel: data.channel,
        recipient: data.recipient,
        dispatchedBy: data.dispatched_by,
        dispatchedAt: data.dispatched_at,
        snapshot: data.snapshot,
        notes: data.notes,
        createdAt: data.created_at,
      };
    }
  } catch {
    // Table not ready
  }

  const found = inMemoryDispatchLogs.find((l) => l.bookingId === bookingId && l.organizationId === org);
  return found || null;
}

/**
 * Resets in-memory stores for clean testing.
 */
export function resetInMemoryAssetStore(): void {
  inMemoryProfiles.clear();
  inMemoryInfos.clear();
  inMemoryDispatchLogs.length = 0;
}
