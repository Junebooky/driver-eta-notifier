import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VIP_REAL_VEHICLES,
  getVehicleImage,
  findVipVehicle,
} from '@/utils/vehicleData';

test('VIP Real Vehicles - Model Image Mapping Policy (Issue #10)', async (t) => {
  await t.test('1. Total 20 canonical VIP fleet vehicles registered with images', () => {
    assert.equal(VIP_REAL_VEHICLES.length, 20);
    for (const v of VIP_REAL_VEHICLES) {
      const img = getVehicleImage(v);
      assert.ok(img, `Vehicle ${v.plate} must have a non-empty image path`);
      assert.equal(typeof img, 'string');
    }
  });

  await t.test('2. Sprinter 519 CDI (6 vehicles) all share sprinter_519.webp', () => {
    const plates519 = [
      '703서 2658',
      '70호 3864',
      '71두 3338',
      '73호 2553',
      '71두 3285',
      '711하 1058',
    ];
    for (const plate of plates519) {
      const veh = findVipVehicle(plate);
      assert.ok(veh, `Plate ${plate} must exist in VIP_REAL_VEHICLES`);
      const img = getVehicleImage(veh);
      assert.equal(img, '/images/vehicles/sprinter_519.webp');
    }
  });

  await t.test('3. Sprinter 319 CDI & Tourer (3 vehicles) share sprinter_319.webp', () => {
    const plates319 = ['125호 9982', '700호 1458', '125호 8040'];
    for (const plate of plates319) {
      const veh = findVipVehicle(plate);
      assert.ok(veh, `Plate ${plate} must exist in VIP_REAL_VEHICLES`);
      const img = getVehicleImage(veh);
      assert.equal(img, '/images/vehicles/sprinter_319.webp');
    }
  });

  await t.test('4. Hyundai Staria Limousine (4 vehicles) share staria.webp', () => {
    const platesStaria = ['125호 7665', '125호 9037', '142호 8407', '116허 1514'];
    for (const plate of platesStaria) {
      const veh = findVipVehicle(plate);
      assert.ok(veh, `Plate ${plate} must exist in VIP_REAL_VEHICLES`);
      const img = getVehicleImage(veh);
      assert.equal(img, '/images/vehicles/staria.webp');
    }
  });

  await t.test('5. Benz S560 (1 vehicle: 01호 3343) uses s560.webp', () => {
    const veh = findVipVehicle('01호 3343');
    assert.ok(veh);
    assert.equal(getVehicleImage(veh), '/images/vehicles/s560.webp');
  });

  await t.test('6. Genesis GV80 (1 vehicle: 203호 5947) uses gv80.webp', () => {
    const veh = findVipVehicle('203호 5947');
    assert.ok(veh);
    assert.equal(getVehicleImage(veh), '/images/vehicles/gv80.webp');
  });

  await t.test('7. Genesis G90L (116호 1336 / 208호 2269) uses g90_lwb.webp', () => {
    const vehG90L = findVipVehicle('116호 1336') || findVipVehicle('208호 2269');
    assert.ok(vehG90L);
    assert.equal(getVehicleImage(vehG90L), '/images/vehicles/g90_lwb.webp');
  });

  await t.test('8. Genesis G90 Black (102부 4280, 125호 8839) use g90_black.webp', () => {
    const veh4280 = findVipVehicle('102부 4280');
    const veh8839 = findVipVehicle('125호 8839');
    assert.ok(veh4280);
    assert.ok(veh8839);
    assert.equal(getVehicleImage(veh4280), '/images/vehicles/g90_black.webp');
    assert.equal(getVehicleImage(veh8839), '/images/vehicles/g90_black.webp');
  });

  await t.test('9. Kia Carnival Hi-Limousine (193호 5336) uses carnival_high.webp and 101호 7681 uses fallback placeholder', () => {
    const veh7681 = findVipVehicle('101호 7681');
    const veh5336 = findVipVehicle('193호 5336');
    assert.ok(veh7681);
    assert.ok(veh5336);
    assert.equal(getVehicleImage(veh5336), '/images/vehicles/carnival_high.webp');
    assert.equal(getVehicleImage(veh7681), '/images/thumb_carnival.jpg');
  });

  await t.test('10. Physical WebP asset files exist on disk in public/images/vehicles', () => {
    const publicVehiclesDir = path.join(process.cwd(), 'public', 'images', 'vehicles');
    const requiredFiles = [
      'sprinter_519.webp',
      'sprinter_319.webp',
      'staria.webp',
      's560.webp',
      'g90_lwb.webp',
      'g90_black.webp',
      'gv80.webp',
      'carnival_high.webp',
    ];
    for (const f of requiredFiles) {
      const fullPath = path.join(publicVehiclesDir, f);
      assert.ok(fs.existsSync(fullPath), `Required WebP file ${f} must exist in ${publicVehiclesDir}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 10000, `${f} must not be empty (actual: ${stats.size} bytes)`);
    }
  });
});
