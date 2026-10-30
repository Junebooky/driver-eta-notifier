/**
 * VIP LIMOUSINE KOREA — Driver Profile & Driver × Vehicle Info Asset Types
 * 
 * Strict Single Source of Truth:
 * - Driver ID is cockpit.drivers.id (UUID).
 * - Vehicle ID is immutable RFC 4122 UUID.
 * - Profile: 1 photo per driver (independent of vehicle).
 * - Info: 1 PC horizontal image + 1 Mobile vertical image per (driver_id, vehicle_id) pair.
 * - Private Supabase Storage bucket: 'cockpit-assets'.
 */

export type AssetMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf';

export interface DriverProfileAsset {
  id: string; // UUID
  organizationId: 'vip_limousine_korea' | string;
  driverId: string; // cockpit.drivers.id (UUID)
  driverName?: string;
  filePath: string; // vip_limousine_korea/drivers/profiles/{driver_uuid}/profile.<ext>
  fileName: string; // Original uploaded file name
  fileSize: number; // Bytes
  mimeType: AssetMimeType | string;
  width?: number;
  height?: number;
  version: number;
  status: 'active' | 'archived' | 'superseded';
  uploadedBy: string;
  signedUrl?: string; // Expiring signed URL for preview/download
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicleInfoAsset {
  id: string; // UUID
  organizationId: 'vip_limousine_korea' | string;
  driverId: string; // cockpit.drivers.id (UUID)
  driverName?: string;
  vehicleId: string; // Immutable RFC 4122 vehicle UUID
  vehiclePlate?: string;
  vehicleModel?: string;
  variant: 'pc' | 'mobile';
  filePath: string; // vip_limousine_korea/drivers/info/{driver_uuid}/{vehicle_uuid}/pc.<ext> or mobile.<ext>
  fileName: string; // Original uploaded file name
  fileSize: number; // Bytes
  mimeType: AssetMimeType | string;
  width?: number;
  height?: number;
  version: number;
  status: 'active' | 'archived' | 'superseded';
  uploadedBy: string;
  signedUrl?: string; // Expiring signed URL for preview/download
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicleAssetBundle {
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  profile: DriverProfileAsset | null;
  pcInfo: DriverVehicleInfoAsset | null;
  mobileInfo: DriverVehicleInfoAsset | null;
  isReadyForCustomerDispatch: boolean; // true only if pcInfo or mobileInfo exists
  isFullyComplete: boolean; // true if both pcInfo and mobileInfo exist
  mismatchWithBooking?: boolean;
}

export interface DriverInfoDispatchSnapshot {
  bookingId: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  pcInfoAssetId?: string | null;
  mobileInfoAssetId?: string | null;
  profileAssetId?: string | null;
  pcFilePath?: string;
  mobileFilePath?: string;
  dispatchedAt: string;
  dispatchedBy: string;
  channel: 'sms' | 'email' | 'manual_copy' | 'download';
  recipient: string;
  status: 'sent' | 'downloaded' | 'prepared';
}

export interface DriverInfoDispatchLog {
  id: string;
  organizationId: string;
  bookingId: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  profileAssetId?: string | null;
  pcInfoAssetId?: string | null;
  mobileInfoAssetId?: string | null;
  channel: 'sms' | 'email' | 'manual_copy' | 'download';
  recipient: string;
  dispatchedBy: string;
  dispatchedAt: string;
  snapshot: DriverInfoDispatchSnapshot;
  notes?: string;
  createdAt?: string;
}

export interface AssetUploadValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  recommendedRatio?: string;
}
