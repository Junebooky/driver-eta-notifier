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

// In-memory fallback stores strictly for unit testing / mock runtime
const inMemoryProfiles = new Map<string, DriverProfileAsset>(); // key: `${org}:${driverId}`
const inMemoryInfos = new Map<string, DriverVehicleInfoAsset>(); // key: `${org}:${driverId}:${vehicleId}:${variant}`
const inMemoryDispatchLogs: DriverInfoDispatchLog[] = [];

/**
 * Detects whether the current execution runtime is an isolated local unit test.
 * Strictly forbidden and returns false in Vercel Preview, Production, or NODE_ENV=production.
 */
export function isAssetTestRuntime(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.VERCEL === '1') return false;
  if (process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'production') return false;
  if (process.env.NODE_ENV === 'test') return true;
  if (process.argv.some((arg) => arg.includes('.test.') || arg.includes('test'))) return true;
  return false;
}

/**
 * Checks if the underlying Supabase database tables for driver/vehicle assets are migrated and ready.
 */
export async function checkDriverAssetDbReady(): Promise<{ isReady: boolean; reason?: string }> {
  if (isAssetTestRuntime()) {
    return { isReady: true };
  }

  try {
    const { error } = await supabaseAdmin
      .from('driver_profile_assets')
      .select('id')
      .limit(1);

    if (error) {
      if (
        error.code === '42P01' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('relation')
      ) {
        return {
          isReady: false,
          reason: 'driver_profile_assets 테이블이 생성되지 않았습니다. (마이그레이션 적용 대기)',
        };
      }
      return { isReady: false, reason: error.message || '데이터베이스 연결 실패' };
    }

    return { isReady: true };
  } catch (err: any) {
    return { isReady: false, reason: err?.message || 'DB 연결 확인 중 예외 발생' };
  }
}

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
 * Path pattern: vip_limousine_korea/drivers/profiles/{driver_uuid}/profile_v{version}_{timestamp}.<ext>
 * Or fallback legacy path if version options omitted: .../profile.<ext>
 */
export function getDriverProfileStoragePath(
  driverId: string,
  ext: string,
  org: string = DEFAULT_ORG,
  options?: { version?: number; timestamp?: number }
): string {
  const safeExt = ext.replace(/^\./, '').toLowerCase();
  if (options?.version) {
    const ts = options.timestamp || Date.now();
    return `${org}/drivers/profiles/${driverId}/profile_v${options.version}_${ts}.${safeExt}`;
  }
  return `${org}/drivers/profiles/${driverId}/profile.${safeExt}`;
}

/**
 * Builds canonical Storage path for Driver × Vehicle Info.
 * Path pattern: vip_limousine_korea/drivers/info/{driver_uuid}/{vehicle_uuid}/{variant}_v{version}_{timestamp}.<ext>
 * Or fallback legacy path if version options omitted: .../{variant}.<ext>
 */
export function getDriverVehicleInfoStoragePath(
  driverId: string,
  vehicleId: string,
  variant: 'pc' | 'mobile',
  ext: string,
  org: string = DEFAULT_ORG,
  options?: { version?: number; timestamp?: number }
): string {
  const safeExt = ext.replace(/^\./, '').toLowerCase();
  if (options?.version) {
    const ts = options.timestamp || Date.now();
    return `${org}/drivers/info/${driverId}/${vehicleId}/${variant}_v${options.version}_${ts}.${safeExt}`;
  }
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
export async function createSignedAssetUrl(
  filePath: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, expiresInSeconds);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch {
    // Ignore and proceed to environment check
  }

  // Only allow test fallback in isolated unit test environment
  if (isAssetTestRuntime()) {
    return `/api/hq/drivers/assets/preview?path=${encodeURIComponent(filePath)}`;
  }

  // In production / preview, return null honestly if signed URL cannot be created
  return null;
}

// -----------------------------------------------------------------------------
// Driver Profile Store Operations
// -----------------------------------------------------------------------------

export async function getDriverProfileAsset(
  driverId: string,
  org: string = DEFAULT_ORG
): Promise<DriverProfileAsset | null> {
  const isTestEnv = isAssetTestRuntime();

  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const memKey = `${org}:${driverId}`;
    const found = inMemoryProfiles.get(memKey);
    return found && found.status === 'active' ? { ...found } : null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('driver_profile_assets')
      .select('*')
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1)
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
        signedUrl: signedUrl || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch {
    // DB query failed or table not migrated yet
  }

  return null;
}

export async function saveDriverProfileAsset(
  asset: Omit<DriverProfileAsset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<DriverProfileAsset> {
  const isTestEnv = isAssetTestRuntime();
  const org = asset.organizationId || DEFAULT_ORG;
  const now = new Date().toISOString();
  const id = asset.id || crypto.randomUUID();

  // Pure unit test bypass when no live Supabase service role key is present
  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const signedUrl = await createSignedAssetUrl(asset.filePath);
    const saved: DriverProfileAsset = {
      id,
      organizationId: org,
      driverId: asset.driverId,
      driverName: asset.driverName,
      filePath: asset.filePath,
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      version: asset.version || 1,
      status: 'active',
      uploadedBy: asset.uploadedBy || '본사 관리자',
      signedUrl: signedUrl || undefined,
      createdAt: now,
      updatedAt: now,
    };
    inMemoryProfiles.set(`${org}:${asset.driverId}`, saved);
    return saved;
  }

  // Try DB persistence
  try {
    // Archive any previous active profile for this driver
    const { error: archiveError } = await supabaseAdmin
      .from('driver_profile_assets')
      .update({ status: 'archived', updated_at: now })
      .eq('organization_id', org)
      .eq('driver_id', asset.driverId)
      .eq('status', 'active');

    if (archiveError && !isTestEnv) {
      throw new Error(`이전 프로필 보관 처리 실패: ${archiveError.message}`);
    }

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

    if (error) {
      if (!isTestEnv) {
        throw new Error(`프로필 DB 저장 실패: ${error.message} (code: ${error.code})`);
      }
    } else if (data) {
      const signedUrl = await createSignedAssetUrl(data.file_path);
      const saved: DriverProfileAsset = {
        id: data.id,
        organizationId: data.organization_id,
        driverId: data.driver_id,
        driverName: asset.driverName,
        filePath: data.file_path,
        fileName: data.file_name,
        fileSize: data.file_size,
        mimeType: data.mime_type,
        width: data.width,
        height: data.height,
        version: data.version,
        status: data.status,
        uploadedBy: data.uploaded_by,
        signedUrl: signedUrl || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      return saved;
    }
  } catch (err: any) {
    if (!isTestEnv) {
      throw err;
    }
  }

  throw new Error('프로필 저장에 실패하였습니다. (DB 연결 및 테이블 상태를 확인해주세요)');
}

export async function deleteDriverProfileAsset(
  driverId: string,
  org: string = DEFAULT_ORG
): Promise<boolean> {
  const isTestEnv = isAssetTestRuntime();

  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    inMemoryProfiles.delete(`${org}:${driverId}`);
    return true;
  }

  try {
    const { error } = await supabaseAdmin
      .from('driver_profile_assets')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('status', 'active');

    if (error && !isTestEnv) {
      throw new Error(`프로필 삭제 처리 실패: ${error.message}`);
    }
  } catch (err: any) {
    if (!isTestEnv) {
      throw err;
    }
  }
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
  const isTestEnv = isAssetTestRuntime();

  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const memKey = `${org}:${driverId}:${vehicleId}:${variant}`;
    const found = inMemoryInfos.get(memKey);
    return found && found.status === 'active' ? { ...found } : null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('driver_vehicle_info_assets')
      .select('*')
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('vehicle_id', vehicleId)
      .eq('variant', variant)
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1)
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
        signedUrl: signedUrl || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  } catch {
    // Table not ready or DB error
  }

  return null;
}

export async function saveDriverVehicleInfoAsset(
  asset: Omit<DriverVehicleInfoAsset, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<DriverVehicleInfoAsset> {
  const isTestEnv = isAssetTestRuntime();
  const org = asset.organizationId || DEFAULT_ORG;
  const now = new Date().toISOString();
  const id = asset.id || crypto.randomUUID();

  // Pure unit test bypass when no live Supabase service role key is present
  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const signedUrl = await createSignedAssetUrl(asset.filePath);
    const saved: DriverVehicleInfoAsset = {
      id,
      organizationId: org,
      driverId: asset.driverId,
      driverName: asset.driverName,
      vehicleId: asset.vehicleId,
      vehiclePlate: asset.vehiclePlate,
      vehicleModel: asset.vehicleModel,
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
      signedUrl: signedUrl || undefined,
      createdAt: now,
      updatedAt: now,
    };
    inMemoryInfos.set(`${org}:${asset.driverId}:${asset.vehicleId}:${asset.variant}`, saved);
    return saved;
  }

  try {
    // Archive previous active asset for this variant
    const { error: archiveError } = await supabaseAdmin
      .from('driver_vehicle_info_assets')
      .update({ status: 'archived', updated_at: now })
      .eq('organization_id', org)
      .eq('driver_id', asset.driverId)
      .eq('vehicle_id', asset.vehicleId)
      .eq('variant', asset.variant)
      .eq('status', 'active');

    if (archiveError && !isTestEnv) {
      throw new Error(`이전 차량 Info 보관 처리 실패: ${archiveError.message}`);
    }

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

    if (error) {
      if (!isTestEnv) {
        throw new Error(`차량 Info DB 저장 실패: ${error.message} (code: ${error.code})`);
      }
    } else if (data) {
      const signedUrl = await createSignedAssetUrl(data.file_path);
      const saved: DriverVehicleInfoAsset = {
        id: data.id,
        organizationId: data.organization_id,
        driverId: data.driver_id,
        driverName: asset.driverName,
        vehicleId: data.vehicle_id,
        vehiclePlate: asset.vehiclePlate,
        vehicleModel: asset.vehicleModel,
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
        signedUrl: signedUrl || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      return saved;
    }
  } catch (err: any) {
    if (!isTestEnv) {
      throw err;
    }
  }

  throw new Error('차량 Info 저장에 실패하였습니다. (DB 연결 및 테이블 상태를 확인해주세요)');
}

export async function deleteDriverVehicleInfoAsset(
  driverId: string,
  vehicleId: string,
  variant: 'pc' | 'mobile',
  org: string = DEFAULT_ORG
): Promise<boolean> {
  const isTestEnv = isAssetTestRuntime();

  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    inMemoryInfos.delete(`${org}:${driverId}:${vehicleId}:${variant}`);
    return true;
  }

  try {
    const { error } = await supabaseAdmin
      .from('driver_vehicle_info_assets')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('organization_id', org)
      .eq('driver_id', driverId)
      .eq('vehicle_id', vehicleId)
      .eq('variant', variant)
      .eq('status', 'active');

    if (error && !isTestEnv) {
      throw new Error(`차량 Info 삭제 처리 실패: ${error.message}`);
    }
  } catch (err: any) {
    if (!isTestEnv) {
      throw err;
    }
  }
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
  const isTestEnv = isAssetTestRuntime();
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

  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    inMemoryDispatchLogs.unshift(record);
    return record;
  }

  try {
    const { error } = await supabaseAdmin.from('driver_info_dispatch_logs').insert({
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

    if (error && !isTestEnv) {
      throw new Error(`발송 이력 DB 기록 실패: ${error.message} (code: ${error.code})`);
    }
  } catch (err: any) {
    if (!isTestEnv) {
      throw err;
    }
  }

  return record;
}

export async function getLatestDispatchLogForBooking(
  bookingId: string,
  org: string = DEFAULT_ORG
): Promise<DriverInfoDispatchLog | null> {
  const isTestEnv = isAssetTestRuntime();

  if (isTestEnv && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const found = inMemoryDispatchLogs.find((l) => l.bookingId === bookingId && l.organizationId === org);
    return found || null;
  }

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

  return null;
}

/**
 * Resets in-memory stores for clean testing.
 */
export function resetInMemoryAssetStore(): void {
  inMemoryProfiles.clear();
  inMemoryInfos.clear();
  inMemoryDispatchLogs.length = 0;
}
