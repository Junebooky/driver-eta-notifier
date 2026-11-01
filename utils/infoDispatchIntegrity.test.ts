import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, GET } from '../app/api/hq/drivers/assets/dispatch/route';
import { supabaseAdmin } from '../lib/supabase/server';
import { signCockpitSession } from '../lib/auth/serverAuth';
import { saveDriverVehicleInfoAsset, resetInMemoryAssetStore, getLatestDispatchLogForBooking } from '../lib/assets/driverAssetServerStore';
import { mapHydratedRowToScheduleItem } from '../lib/dispatch/scheduleServerStore';
import { VIP_REAL_VEHICLES } from './vehicleData';

const driver = 'a0000000-0000-4000-8000-000000000001';
const bookingId = 'b0000000-0000-4000-8000-000000000001';
const org = 'vip_limousine_korea';
const car = VIP_REAL_VEHICLES[0];

test('Info records require the current server assignment, explicit manual evidence, and truthful schedule sync results', async () => {
  resetInMemoryAssetStore();
  const previousFrom = supabaseAdmin.from;
  let row: Record<string, unknown> = {
    id: bookingId, org_id: org, driver_id: driver, vehicle_id: car.uuid,
    vehicle_no: car.plate, vehicle_plate: car.plate, dispatch_status: 'published', version: 3,
    updated_at: '2026-11-01T00:00:00.000Z',
    schedule_meta: { driverId: driver, vehicleId: car.uuid, driverName: '서버 기사', vehiclePlate: car.plate, version: 3, dispatchStatus: 'published' },
  };
  let failUpdate = false, concurrentUpdate = false, writes = 0;
  supabaseAdmin.from = ((table: string) => {
    assert.equal(table, 'schedules');
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | undefined;
    const q = {
      select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return q; },
      update: (value: Record<string, unknown>) => { patch = value; return q; },
      maybeSingle: async () => {
        if (patch && failUpdate) return { data: null, error: { message: 'database unavailable' } };
        if (patch && concurrentUpdate) { row = { ...row, updated_at: '2026-11-02T00:00:00.000Z', version: 4 }; }
        if (!filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
        if (patch) { writes++; row = { ...row, ...patch }; }
        return { data: structuredClone(row), error: null };
      },
    };
    return q;
  }) as unknown as typeof supabaseAdmin.from;
  const request = (body: Record<string, unknown>, role: 'hq_admin' | 'driver' = 'hq_admin') =>
    new NextRequest('http://localhost/api/hq/drivers/assets/dispatch', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + signCockpitSession({ userId: driver, driverId: driver, role, org }) },
      body: JSON.stringify({ bookingId, driverId: driver, vehiclePlate: car.plate, expectedVersion: 3, channel: 'email', recipient: 'recipient@example.invalid', ...body }),
    });
  const get = (extra = '') => GET(new NextRequest('http://localhost/api/hq/drivers/assets/dispatch?bookingId=' + bookingId + extra, { headers: { authorization: 'Bearer ' + signCockpitSession({ userId: driver, role: 'hq_admin', org }) } }));
  try {
    await saveDriverVehicleInfoAsset({ organizationId: org, driverId: driver, vehicleId: car.uuid, variant: 'pc', filePath: 'fixture/info.png', fileName: 'info.png', fileSize: 10, mimeType: 'image/png', version: 1, status: 'active', uploadedBy: 'fixture' });
    assert.equal((await POST(request({}, 'driver'))).status, 403);
    assert.equal((await POST(request({}))).status, 400, 'selecting email is not proof of delivery');
    for (const invalid of [{ expectedVersion: 2 }, { driverId: 'another-driver' }, { vehiclePlate: VIP_REAL_VEHICLES[1].plate }, { vehiclePlate: '위조' + car.plateShort }]) {
      assert.equal((await POST(request({ ...invalid, isPreparationOnly: true }))).status, 409);
    }
    row.org_id = 'another-org'; assert.equal((await POST(request({ isPreparationOnly: true }))).status, 404); assert.equal((await get()).status, 404); row.org_id = org;
    assert.equal(writes, 0); assert.equal(await getLatestDispatchLogForBooking(bookingId, org), null);
    const prepared = await (await POST(request({ isPreparationOnly: true }))).json();
    assert.equal(prepared.ok, true); assert.equal(prepared.brochureStatus, '준비완료'); assert.equal(prepared.snapshot.status, 'prepared'); assert.equal(prepared.scheduleSynced, true);
    assert.equal(mapHydratedRowToScheduleItem(row).customer_brochure, '준비완료', 'the real schedule mapper reads the field written by this route');
    const manual = await (await POST(request({ manualDeliveryConfirmed: true }))).json();
    assert.equal(manual.brochureStatus, '수동 발송 기록'); assert.equal(manual.snapshot.status, 'manual_recorded');
    assert.equal(manual.snapshot.deliveryEvidence, 'operator_attested'); assert.equal(manual.snapshot.scheduleVersion, 3);
    assert.equal(mapHydratedRowToScheduleItem(row).customer_brochure, '수동 발송 기록');
    failUpdate = true;
    const partial = await (await POST(request({ isPreparationOnly: true }))).json();
    assert.equal(partial.ok, true); assert.equal(partial.scheduleSynced, false); assert.match(partial.warning, /기록은 보존/);
    assert.equal((await getLatestDispatchLogForBooking(bookingId, org))?.id, partial.log.id);
    assert.equal(mapHydratedRowToScheduleItem(row).customer_brochure, '수동 발송 기록', 'failed sync never pretends to change the dashboard');
    failUpdate = false; concurrentUpdate = true;
    const raced = await (await POST(request({ isPreparationOnly: true }))).json();
    assert.equal(raced.scheduleSynced, false); assert.equal(row.version, 4);
    const mismatch = await (await get('&currentDriverId=' + driver + '&currentVehiclePlate=' + encodeURIComponent(car.plate))).json();
    assert.equal(mismatch.hasMismatch, true, 'caller-supplied assignment cannot hide a changed booking version');
  } finally { supabaseAdmin.from = previousFrom; resetInMemoryAssetStore(); }
});
