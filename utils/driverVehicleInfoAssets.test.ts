import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUCKET_NAME,
  DEFAULT_ORG,
  MAX_ASSET_SIZE_BYTES,
  getDriverProfileStoragePath,
  getDriverVehicleInfoStoragePath,
  normalizeExtension,
  validateAssetUpload,
  saveDriverProfileAsset,
  getDriverProfileAsset,
  deleteDriverProfileAsset,
  saveDriverVehicleInfoAsset,
  getDriverVehicleInfoAsset,
  getDriverVehicleBundle,
  recordInfoDispatchLog,
  getLatestDispatchLogForBooking,
  resetInMemoryAssetStore,
} from '@/lib/assets/driverAssetServerStore';
import {
  VIP_REAL_VEHICLES,
  getDeterministicVehicleUuid,
  resolveVehicleEntity,
} from '@/utils/vehicleData';

test('Driver & Vehicle Info Assets Suite', async (t) => {
  t.beforeEach(() => {
    resetInMemoryAssetStore();
  });

  await t.test('1. Same-name driver disambiguation & UUID isolation', async () => {
    // Two distinct drivers with the exact same name "배선만"
    const driverId1 = '14d0fe38-4054-402c-bfb3-84472add9cd0';
    const driverId2 = 'f5d55d4c-9256-4fb2-a967-8533cbe4c802';

    // Upload profile for driver 1
    const p1 = await saveDriverProfileAsset({
      organizationId: DEFAULT_ORG,
      driverId: driverId1,
      driverName: '배선만 (1호차)',
      filePath: getDriverProfileStoragePath(driverId1, 'jpg'),
      fileName: 'baeseonman_photo.jpg',
      fileSize: 102400,
      mimeType: 'image/jpeg',
      version: 1,
      status: 'active',
      uploadedBy: '본사 관리자',
    });

    // Check driver 1 has profile
    const fetched1 = await getDriverProfileAsset(driverId1);
    assert.ok(fetched1);
    assert.equal(fetched1.id, p1.id);
    assert.equal(fetched1.driverId, driverId1);
    assert.equal(fetched1.fileName, 'baeseonman_photo.jpg');

    // Driver 2 must have NULL profile (zero cross-driver leakage)
    const fetched2 = await getDriverProfileAsset(driverId2);
    assert.equal(fetched2, null, 'Driver 2 must not inherit Driver 1 profile even with same name');
  });

  await t.test('2. Single driver driving multiple vehicles: distinct Info, shared single Profile', async () => {
    const driverId = 'b6aac740-002e-4a5c-ac49-0ac71e765340'; // 윤태준
    const driverName = '윤태준';

    // 1 Profile for Yoon
    await saveDriverProfileAsset({
      organizationId: DEFAULT_ORG,
      driverId,
      driverName,
      filePath: getDriverProfileStoragePath(driverId, 'png'),
      fileName: 'yoon_profile.png',
      fileSize: 85000,
      mimeType: 'image/png',
      version: 1,
      status: 'active',
      uploadedBy: '본사 관리자',
    });

    // Vehicle 1: Genesis G90 LWB (116허 1336)
    const vehG90 = resolveVehicleEntity('116허 1336', '제네시스 G90 LWB');
    // Vehicle 2: Mercedes Sprinter 519 CDI (703서 2658)
    const vehSprinter = resolveVehicleEntity('703서 2658', '벤츠 스프린터 519 CDI');

    assert.notEqual(vehG90.uuid, vehSprinter.uuid, 'G90 and Sprinter must have distinct UUIDs');

    // Upload Info for G90 (PC & Mobile)
    await saveDriverVehicleInfoAsset({
      organizationId: DEFAULT_ORG,
      driverId,
      driverName,
      vehicleId: vehG90.uuid,
      variant: 'pc',
      filePath: getDriverVehicleInfoStoragePath(driverId, vehG90.uuid, 'pc', 'png'),
      fileName: 'yoon_g90_pc.png',
      fileSize: 250000,
      mimeType: 'image/png',
      version: 1,
      status: 'active',
      uploadedBy: '본사 관리자',
    });
    await saveDriverVehicleInfoAsset({
      organizationId: DEFAULT_ORG,
      driverId,
      driverName,
      vehicleId: vehG90.uuid,
      variant: 'mobile',
      filePath: getDriverVehicleInfoStoragePath(driverId, vehG90.uuid, 'mobile', 'png'),
      fileName: 'yoon_g90_mobile.png',
      fileSize: 180000,
      mimeType: 'image/png',
      version: 1,
      status: 'active',
      uploadedBy: '본사 관리자',
    });

    // Upload Info for Sprinter (PC only so far)
    await saveDriverVehicleInfoAsset({
      organizationId: DEFAULT_ORG,
      driverId,
      driverName,
      vehicleId: vehSprinter.uuid,
      variant: 'pc',
      filePath: getDriverVehicleInfoStoragePath(driverId, vehSprinter.uuid, 'pc', 'png'),
      fileName: 'yoon_sprinter_pc.png',
      fileSize: 310000,
      mimeType: 'image/png',
      version: 1,
      status: 'active',
      uploadedBy: '본사 관리자',
    });

    // Fetch bundle for G90
    const bundleG90 = await getDriverVehicleBundle(driverId, '116허 1336');
    assert.equal(bundleG90.profile?.fileName, 'yoon_profile.png');
    assert.equal(bundleG90.pcInfo?.fileName, 'yoon_g90_pc.png');
    assert.equal(bundleG90.mobileInfo?.fileName, 'yoon_g90_mobile.png');
    assert.equal(bundleG90.isFullyComplete, true);

    // Fetch bundle for Sprinter
    const bundleSprinter = await getDriverVehicleBundle(driverId, '703서 2658');
    assert.equal(bundleSprinter.profile?.fileName, 'yoon_profile.png');
    assert.equal(bundleSprinter.pcInfo?.fileName, 'yoon_sprinter_pc.png');
    assert.equal(bundleSprinter.mobileInfo, null, 'Sprinter mobile is not yet uploaded');
    assert.equal(bundleSprinter.isReadyForCustomerDispatch, true);
    assert.equal(bundleSprinter.isFullyComplete, false);
  });

  await t.test('3. Same vehicle model with different plates remain completely isolated', async () => {
    const driverId = 'b6aac740-002e-4a5c-ac49-0ac71e765340';
    // Both are Mercedes Sprinter 519 CDI
    const plateA = '703서 2658';
    const plateB = '70호 3864';

    const vehA = resolveVehicleEntity(plateA);
    const vehB = resolveVehicleEntity(plateB);

    assert.notEqual(vehA.uuid, vehB.uuid, 'Same vehicle model with different plates must have different UUIDs');

    // Upload PC for Plate A
    await saveDriverVehicleInfoAsset({
      organizationId: DEFAULT_ORG,
      driverId,
      vehicleId: vehA.uuid,
      variant: 'pc',
      filePath: getDriverVehicleInfoStoragePath(driverId, vehA.uuid, 'pc', 'png'),
      fileName: 'sprinter_2658_pc.png',
      fileSize: 220000,
      mimeType: 'image/png',
      version: 1,
      status: 'active',
      uploadedBy: '본사 관리자',
    });

    const infoA = await getDriverVehicleInfoAsset(driverId, vehA.uuid, 'pc');
    assert.ok(infoA);
    assert.equal(infoA.fileName, 'sprinter_2658_pc.png');

    const infoB = await getDriverVehicleInfoAsset(driverId, vehB.uuid, 'pc');
    assert.equal(infoB, null, 'Plate B must not see Plate A assets');
  });

  await t.test('4. Identical original file names do NOT collide due to UUID storage paths', () => {
    const driver1 = '11111111-1111-4111-8111-111111111111';
    const driver2 = '22222222-2222-4222-8222-222222222222';
    const vehicle1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const vehicle2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    // Same original file name "info.png"
    const pathPC1 = getDriverVehicleInfoStoragePath(driver1, vehicle1, 'pc', 'png');
    const pathMobile1 = getDriverVehicleInfoStoragePath(driver1, vehicle1, 'mobile', 'png');
    const pathPC2 = getDriverVehicleInfoStoragePath(driver2, vehicle2, 'pc', 'png');

    assert.notEqual(pathPC1, pathMobile1, 'PC and Mobile must have distinct paths even in same vehicle');
    assert.notEqual(pathPC1, pathPC2, 'Different drivers and vehicles must have distinct paths');
    assert.match(pathPC1, /^vip_limousine_korea\/drivers\/info\/11111111-1111-4111-8111-111111111111\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\/pc\.png$/);
    assert.match(pathMobile1, /^vip_limousine_korea\/drivers\/info\/11111111-1111-4111-8111-111111111111\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\/mobile\.png$/);
  });

  await t.test('5. Dispatch gatekeeping: Unassigned and Unregistered Info block sending', async () => {
    const bookingId = 'sch-unregistered-001';
    const driverId = '4e6c683e-2afd-4d07-b563-83bb2fe74c48'; // 정태훈
    const vehiclePlate = '703서 2658';

    // No Info registered for this driver + vehicle yet
    const bundle = await getDriverVehicleBundle(driverId, vehiclePlate);
    assert.equal(bundle.isReadyForCustomerDispatch, false, 'Should not be ready when 0 info assets exist');

    // Register PC info
    const veh = resolveVehicleEntity(vehiclePlate);
    await saveDriverVehicleInfoAsset({
      organizationId: DEFAULT_ORG,
      driverId,
      vehicleId: veh.uuid,
      variant: 'pc',
      filePath: getDriverVehicleInfoStoragePath(driverId, veh.uuid, 'pc', 'png'),
      fileName: 'jeong_2658_pc.png',
      fileSize: 190000,
      mimeType: 'image/png',
      version: 1,
      status: 'active',
      uploadedBy: '본사 관리자',
    });

    const bundleAfter = await getDriverVehicleBundle(driverId, vehiclePlate);
    assert.equal(bundleAfter.isReadyForCustomerDispatch, true, 'Ready for dispatch now that PC info exists');

    // Record immutable dispatch snapshot
    const dispatchLog = await recordInfoDispatchLog({
      organizationId: DEFAULT_ORG,
      bookingId,
      driverId,
      driverName: '정태훈',
      vehicleId: veh.uuid,
      vehiclePlate: veh.plate,
      vehicleModel: veh.model,
      pcInfoAssetId: bundleAfter.pcInfo?.id,
      channel: 'manual_copy',
      recipient: '010-9999-8888',
      dispatchedBy: '본사 관리자',
      snapshot: {
        bookingId,
        driverId,
        driverName: '정태훈',
        vehicleId: veh.uuid,
        vehiclePlate: veh.plate,
        vehicleModel: veh.model,
        pcInfoAssetId: bundleAfter.pcInfo?.id,
        pcFilePath: bundleAfter.pcInfo?.filePath,
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: '본사 관리자',
        channel: 'manual_copy',
        recipient: '010-9999-8888',
        status: 'sent',
      },
    });

    assert.ok(dispatchLog.id);
    const retrieved = await getLatestDispatchLogForBooking(bookingId);
    assert.ok(retrieved);
    assert.equal(retrieved.driverName, '정태훈');
    assert.equal(retrieved.vehiclePlate, '703서 2658');
  });

  await t.test('6. Post-dispatch mismatch detection when vehicle or driver is changed', async () => {
    const bookingId = 'sch-mismatch-test-002';
    const initialDriverId = '13235bfe-af44-4756-8660-2883899c6b4e'; // 김민수
    const initialPlate = '01호 3343'; // 벤츠 S560
    const vehInitial = resolveVehicleEntity(initialPlate);

    // Initial dispatch log
    await recordInfoDispatchLog({
      organizationId: DEFAULT_ORG,
      bookingId,
      driverId: initialDriverId,
      driverName: '김민수',
      vehicleId: vehInitial.uuid,
      vehiclePlate: vehInitial.plate,
      vehicleModel: vehInitial.model,
      channel: 'email',
      recipient: 'client@vip.com',
      dispatchedBy: '본사 관리자',
      snapshot: {
        bookingId,
        driverId: initialDriverId,
        driverName: '김민수',
        vehicleId: vehInitial.uuid,
        vehiclePlate: vehInitial.plate,
        vehicleModel: vehInitial.model,
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: '본사 관리자',
        channel: 'email',
        recipient: 'client@vip.com',
        status: 'sent',
      },
    });

    const log = await getLatestDispatchLogForBooking(bookingId);
    assert.ok(log);

    // Scenario A: Same driver and vehicle -> No mismatch
    const sameDriver = initialDriverId;
    const samePlate = initialPlate;
    const isDriverMismatchA = sameDriver !== log.snapshot.driverId;
    const isVehicleMismatchA = samePlate.replace(/\s+/g, '') !== log.snapshot.vehiclePlate.replace(/\s+/g, '');
    assert.equal(isDriverMismatchA || isVehicleMismatchA, false);

    // Scenario B: Vehicle reassigned to Staria (116허 1514)
    const newPlate = '116허 1514';
    const isVehicleMismatchB = newPlate.replace(/\s+/g, '') !== log.snapshot.vehiclePlate.replace(/\s+/g, '');
    assert.equal(isVehicleMismatchB, true, 'Vehicle change must be flagged as mismatch against frozen dispatch snapshot');
  });

  await t.test('7. Asset upload validation: limits, formats, and orientation warnings', () => {
    // 1. Oversized file (>10MB)
    const over10MB = validateAssetUpload({
      assetType: 'profile',
      fileSize: MAX_ASSET_SIZE_BYTES + 1024,
      mimeType: 'image/jpeg',
    });
    assert.equal(over10MB.valid, false);
    assert.match(over10MB.error!, /10MB/);

    // 2. Disallowed MIME type
    const badMime = validateAssetUpload({
      assetType: 'profile',
      fileSize: 50000,
      mimeType: 'application/x-executable',
    });
    assert.equal(badMime.valid, false);
    assert.match(badMime.error!, /지원하지 않는 파일 형식/);

    // 3. PC Info with vertical aspect ratio -> warning
    const pcVertical = validateAssetUpload({
      assetType: 'info',
      variant: 'pc',
      fileSize: 200000,
      mimeType: 'image/png',
      width: 1080,
      height: 1920, // vertical
    });
    assert.equal(pcVertical.valid, true);
    assert.ok(pcVertical.warning?.includes('가로형'));

    // 4. Mobile Info with horizontal aspect ratio -> warning
    const mobileHorizontal = validateAssetUpload({
      assetType: 'info',
      variant: 'mobile',
      fileSize: 200000,
      mimeType: 'image/png',
      width: 1920,
      height: 1080, // horizontal
    });
    assert.equal(mobileHorizontal.valid, true);
    assert.ok(mobileHorizontal.warning?.includes('세로형'));

    // 5. Valid PC horizontal
    const pcGood = validateAssetUpload({
      assetType: 'info',
      variant: 'pc',
      fileSize: 250000,
      mimeType: 'image/png',
      width: 1920,
      height: 1080,
    });
    assert.equal(pcGood.valid, true);
    assert.equal(pcGood.warning, undefined);
  });

  await t.test('8. Deterministic Vehicle UUID resolution matching 20 fleet vehicles', () => {
    assert.equal(VIP_REAL_VEHICLES.length, 20);

    for (const v of VIP_REAL_VEHICLES) {
      assert.ok(v.uuid, `Vehicle ${v.plate} must have non-empty uuid`);
      assert.match(
        v.uuid,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        `Vehicle ${v.plate} UUID must be valid RFC 4122 v4`
      );
      // Resolved entity must match
      const resolved = resolveVehicleEntity(v.plate);
      assert.equal(resolved.uuid, v.uuid);
    }

    // External / ad-hoc vehicle plate
    const customPlate = '116허 1336';
    const customUuid1 = getDeterministicVehicleUuid(customPlate);
    const customUuid2 = getDeterministicVehicleUuid(customPlate);
    assert.equal(customUuid1, customUuid2, 'Ad-hoc vehicle UUID must be deterministic');
    assert.match(customUuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
