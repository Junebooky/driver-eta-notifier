if (process.env.RUN_ISOLATED_E2E !== 'true') throw new Error('Set RUN_ISOLATED_E2E=true only for an isolated test application and database.');
import assert from 'node:assert';
import { executeSupabaseSql } from '../scripts/supabase-sql.mjs';
import { evaluateDispatchEscalationAlerts } from './unackAlertEngine';
import { generateCustomerNotificationDraft } from './customerMessageGenerator';
import { matchHipassTransactions, parseHipassText } from './hipassReconciler';
import { HqBooking } from '../types/hq';
import { signCockpitSession } from '../lib/auth/serverAuth';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const HQ_TOKEN = signCockpitSession({
  userId: 'test_admin_hq_p3',
  org: 'vip_limousine_korea',
  role: 'hq_admin',
  driverName: '본사 관리자',
});

const DRIVER_YOON_TOKEN = signCockpitSession({
  userId: 'test_driver_yoon_p3',
  org: 'vip_limousine_korea',
  role: 'driver',
  driverName: '윤태준',
  vehicleNo: '4호차',
  carNumber: '116허 1514',
});

const DRIVER_KIM_TOKEN = signCockpitSession({
  userId: 'test_driver_kim',
  org: 'vip_limousine_korea',
  role: 'driver',
  driverName: '김민수',
  carNumber: '01호 3343',
});

const DRIVER_PARK_TOKEN = signCockpitSession({
  userId: 'test_driver_park',
  org: 'vip_limousine_korea',
  role: 'driver',
  driverName: '박서연',
  carNumber: '102부 4280',
});

async function api(path: string, options: RequestInit = {}, token?: string | null) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const authToken = token === undefined ? HQ_TOKEN : token;
  const authHeaders: Record<string, string> = {};
  if (authToken) {
    authHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

console.log('================================================================');
console.log('🚀 Phase 3 Operational Automation & Live Supabase E2E Verification');
console.log('================================================================\n');

async function runPhase3Tests() {
  const scheduleIdsToClean: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // Scenario 1: Unacknowledged Dispatch Auto-Tracking & Escalation Engine
    // ------------------------------------------------------------------------
    console.log('[Scenario 1] Unacknowledged Dispatch Escalation Engine (4-Stage KST Math)');
    {
      // Fix reference KST time: 2026-11-15 10:00:00+09:00
      const refNowMs = Date.parse('2026-11-15T10:00:00+09:00');
      const published40mAgo = new Date(refNowMs - 40 * 60 * 1000).toISOString();
      const published5mAgo = new Date(refNowMs - 5 * 60 * 1000).toISOString();

      const mockBookings: HqBooking[] = [
        {
          id: 'b-imminent',
          scheduleId: 'b-imminent',
          bookingNo: '#261115-101',
          no: 1,
          customerName: 'CHANEL Korea',
          pickupDate: '2026-11-15',
          pickupTime: '10:35', // 35 mins away -> MUST be 'critical'
          pickupLocation: '인천공항 제2터미널',
          destination: '조선팰리스 강남',
          driverName: '박준혁 기사',
          vehicleModel: '벤츠 S580',
          vehiclePlate: '01호 3343',
          dispatchStatus: '배차 완료',
          driverAck: '미확인',
          customerBrochure: '미발송',
          publishedAt: published5mAgo,
          isToday: true,
        },
        {
          id: 'b-delayed',
          scheduleId: 'b-delayed',
          bookingNo: '#261115-102',
          no: 2,
          customerName: 'Ferrari VIP',
          pickupDate: '2026-11-15',
          pickupTime: '16:00', // 6h away, but published 40m ago -> MUST be 'urgent'
          pickupLocation: '그랜드 하얏트 서울',
          destination: '김포공항 비즈니스센터',
          driverName: '정태훈 기사',
          vehicleModel: '카니발 하이리무진',
          vehiclePlate: '193호 5336',
          dispatchStatus: '배차 완료',
          driverAck: '미확인',
          customerBrochure: '미발송',
          publishedAt: published40mAgo,
          isToday: true,
        },
        {
          id: 'b-unassigned',
          scheduleId: 'b-unassigned',
          bookingNo: '#261115-103',
          no: 3,
          customerName: 'BMW Korea',
          pickupDate: '2026-11-15',
          pickupTime: '11:10', // 70m away & unassigned -> MUST be 'critical' omission risk
          pickupLocation: '서울역 VIP 라운지',
          destination: '영종도 드라이빙센터',
          driverName: '-',
          vehicleModel: '-',
          vehiclePlate: '미배정',
          dispatchStatus: '미배정',
          driverAck: '-',
          customerBrochure: '미발송',
          isToday: true,
        },
      ];

      const summary = evaluateDispatchEscalationAlerts(mockBookings, refNowMs);
      assert.strictEqual(summary.criticalCount, 2, 'Must detect 2 critical alerts (imminent unacked + imminent unassigned)');
      assert.strictEqual(summary.urgentCount, 1, 'Must detect 1 urgent delayed unacked alert');
      assert.strictEqual(summary.imminentUnackedCount, 1);
      assert.strictEqual(summary.omissionRiskCount, 1);

      const imminentAlert = summary.alerts.find((a) => a.bookingId === 'b-imminent');
      assert.ok(imminentAlert);
      assert.strictEqual(imminentAlert.severity, 'critical');
      assert.strictEqual(imminentAlert.pickupCountdownLabel, '픽업 35분 전');
      console.log('  ✅ 4-stage KST escalation severity & pickup countdown verified.');
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Customer Auto-Prepared Notification Generator (KO & EN)
    // ------------------------------------------------------------------------
    console.log('\n[Scenario 2] Customer Auto-Prepared Message Templates (KO/EN, 3 Triggers)');
    {
      const sampleBooking: HqBooking = {
        id: 'b-msg-1',
        bookingNo: '#261120-777',
        no: 1,
        customerName: 'Louis Vuitton Korea',
        passengerName: 'Mr. Bernard',
        pickupDate: '2026-11-20',
        pickupTime: '14:30',
        pickupLocation: '인천국제공항 T2',
        destination: '신라호텔 서울',
        flightNumber: 'AF264',
        driverName: '윤태준 기사',
        driverPhone: '010-6348-8726',
        vehicleModel: '메르세데스-벤츠 스프린터 519 CDI',
        vehiclePlate: '703서 2658',
        previousDriverName: '김민수',
        previousVehiclePlate: '01호 3343',
        dispatchStatus: '배차 완료',
        driverAck: '확인완료',
        customerBrochure: '미발송',
        operationStatus: 'arrived_pickup',
        operationUpdatedAt: '2026-11-20T05:18:00.000Z', // 14:18 KST
      };

      const koConfirmed = generateCustomerNotificationDraft({
        booking: sampleBooking,
        trigger: 'dispatch_confirmed',
        language: 'ko',
      });
      assert.ok(koConfirmed.smsBody.includes('703서 2658'), 'SMS must include vehicle plate');
      assert.ok(koConfirmed.smsBody.includes('윤태준'), 'SMS must include driver name');
      assert.ok(koConfirmed.emailSubject.includes('배차 확정 안내'), 'Subject must reflect dispatch confirmation');

      const enChanged = generateCustomerNotificationDraft({
        booking: sampleBooking,
        trigger: 'driver_changed',
        language: 'en',
      });
      assert.ok(enChanged.emailBody.includes('김민수 / 01호 3343'), 'Driver change email must include previous assignment');
      assert.ok(enChanged.emailBody.includes('703서 2658'), 'Driver change email must include updated plate');

      const koArrived = generateCustomerNotificationDraft({
        booking: sampleBooking,
        trigger: 'arrived_pickup',
        language: 'ko',
      });
      assert.ok(koArrived.smsBody.includes('픽업지 도착'), 'Arrival SMS must state pickup arrival');
      assert.ok(koArrived.smsBody.includes('14:18 현장 도착 대기 중'), 'Arrival SMS must include KST arrival timestamp');
      console.log('  ✅ Dispatch Confirmed / Driver Changed / Pickup Arrived (KO & EN) message drafts verified.');
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Live Supabase E2E — Dispatch -> Remind -> Ack -> Driver Change -> Arrival -> Admin Notify
    // ------------------------------------------------------------------------
    console.log('\n[Scenario 3] Live Supabase E2E: Dispatch -> Remind -> Driver Ack -> Arrival -> Customer Notify');
    let liveScheduleId = '';
    const testDate = '2026-12-18';
    {
      // 3-A. Create confirmed dispatch
      const createRes = await api('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          customerName: '[TEST] Phase3 VIP Auto-Track',
          passengerName: '테스트 임원',
          passengerPhone: '010-9999-0001',
          date: testDate,
          pickupTime: '15:00',
          origin: '인천국제공항 제1터미널',
          destination: '서울 신라호텔',
          driverName: '김민수',
          driverPhone: '010-1111-2222',
          vehiclePlate: '01호 3343',
          vehicleModel: '벤츠 S560',
          dispatchStatus: 'published',
          allowUnverified: true,
          allowConflictOverride: true,
        }),
      });
      assert.strictEqual(createRes.status, 200, `Dispatch create failed: ${JSON.stringify(createRes.data)}`);
      assert.ok(createRes.data.ok && createRes.data.schedule?.id);
      liveScheduleId = createRes.data.schedule.id;
      scheduleIdsToClean.push(liveScheduleId);

      assert.strictEqual(
        createRes.data.schedule.pending_customer_trigger,
        'dispatch_confirmed',
        'Newly confirmed dispatch must auto-prepare dispatch_confirmed trigger (without auto-sending)'
      );
      assert.strictEqual(
        (createRes.data.schedule.customer_notifications || []).length,
        0,
        'Must NOT auto-send customer notification before admin approval'
      );
      console.log(`  ✅ Created live schedule (${liveScheduleId}): pending_customer_trigger='dispatch_confirmed', 0 auto-sent.`);

      // 3-B. Send HQ unacknowledged reminder
      const remindRes = await api('/api/schedules/remind', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: liveScheduleId,
          remindedBy: '본사 관제 테스트',
          note: '픽업 임박 확인 요망',
        }),
      });
      assert.strictEqual(remindRes.status, 200, `Remind API failed: ${JSON.stringify(remindRes.data)}`);
      assert.strictEqual(remindRes.data.reminderCount, 1);
      assert.strictEqual(remindRes.data.schedule.reminder_count, 1);
      console.log('  ✅ POST /api/schedules/remind incremented reminder_count=1 in Supabase.');

      // 3-C. Driver acknowledges schedule
      const ackRes = await api('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: liveScheduleId,
          version: 1,
          driverName: '김민수',
        }),
      }, DRIVER_KIM_TOKEN);
      assert.strictEqual(ackRes.status, 200, `Ack API failed: ${JSON.stringify(ackRes.data)}`);
      assert.strictEqual(ackRes.data.schedule.isAcknowledged, true);
      assert.strictEqual(ackRes.data.schedule.reminder_count, 0, 'Active reminder_count must reset to 0 on driver ack');

      // Calling remind after driver already acknowledged must return 409
      const remindAfterAck = await api('/api/schedules/remind', {
        method: 'POST',
        body: JSON.stringify({ scheduleId: liveScheduleId }),
      });
      assert.strictEqual(remindAfterAck.status, 409, 'Remind after ack must return 409 Conflict');
      console.log('  ✅ Driver acknowledgment cleared active reminder & blocked redundant reminders (409).');

      // 3-D. Reassign driver & vehicle -> must bump to v2, capture previous driver/plate, and set trigger='driver_changed'
      const reassignRes = await api('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: liveScheduleId,
          customerName: '[TEST] Phase3 VIP Auto-Track',
          passengerName: '테스트 임원',
          passengerPhone: '010-9999-0001',
          date: testDate,
          pickupTime: '15:00',
          origin: '인천국제공항 제1터미널',
          destination: '서울 신라호텔',
          driverName: '윤태준',
          driverPhone: '010-6348-8726',
          vehiclePlate: '116허 1514',
          vehicleModel: '현대 스타리아 리무진',
          dispatchStatus: 'published',
          allowUnverified: true,
          allowConflictOverride: true,
        }),
      });
      assert.strictEqual(reassignRes.status, 200);
      assert.strictEqual(reassignRes.data.schedule.version, 2);
      assert.strictEqual(reassignRes.data.schedule.previous_driver_name, '김민수');
      assert.strictEqual(reassignRes.data.schedule.previous_vehicle_plate, '01호 3343');
      assert.strictEqual(reassignRes.data.schedule.pending_customer_trigger, 'driver_changed');
      console.log('  ✅ Driver reassignment bumped to v2, captured previous driver/plate, and prepared driver_changed message.');

      // 3-E. Re-acknowledge v2 as 윤태준 and switch operation status to 'arrived_pickup'
      const reAckRes = await api('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: liveScheduleId,
          version: 2,
          driverName: '윤태준',
        }),
      }, DRIVER_YOON_TOKEN);
      assert.strictEqual(reAckRes.status, 200);

      const arriveRes = await api('/api/schedules/operation-status', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: liveScheduleId,
          status: 'arrived_pickup',
          changedBy: '윤태준',
        }),
      }, DRIVER_YOON_TOKEN);
      assert.strictEqual(arriveRes.status, 200, `Operation status failed: ${JSON.stringify(arriveRes.data)}`);

      // Verify in Supabase that pendingCustomerTrigger became 'arrived_pickup'
      const dbCheckRows = await executeSupabaseSql(`
        SELECT schedule_meta FROM cockpit.schedules WHERE id = '${liveScheduleId}';
      `);
      assert.strictEqual(
        dbCheckRows[0]?.schedule_meta?.pendingCustomerTrigger,
        'arrived_pickup',
        'Switching operation status to arrived_pickup must prepare arrived_pickup customer notification'
      );
      console.log('  ✅ Driver arrived_pickup status automatically prepared arrived_pickup customer notification.');

      // 3-F. Admin reviews and records customer SMS send -> clears pendingCustomerTrigger & saves history
      const notifyRes = await api('/api/schedules/customer-notify', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: liveScheduleId,
          action: 'record_sent',
          trigger: 'arrived_pickup',
          channel: 'sms',
          language: 'ko',
          recipient: '010-9999-0001',
          body: '[VIP 리무진] 윤태준 기사가 인천국제공항 제1터미널 픽업지에 도착했습니다.',
          deliveryMethod: 'manual_copy',
          sentBy: '사모님(테스트)',
        }),
      });
      assert.strictEqual(notifyRes.status, 200, `Customer notify failed: ${JSON.stringify(notifyRes.data)}`);
      assert.strictEqual(notifyRes.data.schedule.pending_customer_trigger, null);
      assert.strictEqual(notifyRes.data.schedule.customer_notifications.length, 1);
      assert.strictEqual(notifyRes.data.schedule.customer_notifications[0].trigger, 'arrived_pickup');
      console.log('  ✅ Admin confirmation recorded in Supabase and cleared pendingCustomerTrigger.');
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Hi-Pass CSV/TSV Parsing, Matching & Live Supabase Toll Sync
    // ------------------------------------------------------------------------
    console.log('\n[Scenario 4] Hi-Pass Toll CSV/TSV Reconciliation & Live Supabase Sync');
    {
      const sampleCsv = [
        '순번,거래일시,차량번호,카드번호,입구영업소,출구영업소,통행금액,승인번호',
        `1,${testDate} 15:25,116허 1514,9410-****-1514,인천공항영업소,북로JCT,"6,600",HP-TEST-901`,
        `2,${testDate} 15:25,116허 1514,9410-****-1514,인천공항영업소,북로JCT,"6,600",HP-TEST-901`, // intra-batch duplicate
        `합계,,,,,,,"13,200",`, // summary row to skip
      ].join('\n');

      const parsed = parseHipassText(sampleCsv);
      assert.strictEqual(parsed.rows.length, 2, 'Summary row must be skipped, leaving 2 transaction rows');

      const hqListRes = await api(`/api/schedules?role=hq&date=${testDate}`);
      assert.strictEqual(hqListRes.status, 200);
      const liveSchedule = (hqListRes.data.schedules || []).find((s: any) => s.id === liveScheduleId);
      assert.ok(liveSchedule, 'Must find live schedule for Hi-Pass matching');

      const bookingForMatch: HqBooking = {
        id: liveSchedule.id,
        scheduleId: liveSchedule.id,
        bookingNo: liveSchedule.booking_no || '#TEST-HP',
        no: 1,
        customerName: liveSchedule.customer_name || '[TEST] Phase3 VIP Auto-Track',
        pickupDate: testDate,
        pickupTime: '15:00',
        pickupLocation: liveSchedule.origin_name,
        destination: liveSchedule.destination_name,
        driverName: liveSchedule.driver_name,
        vehicleModel: liveSchedule.vehicle_model,
        vehiclePlate: liveSchedule.vehicle_plate,
        dispatchStatus: '배차 완료',
        driverAck: '확인완료',
        customerBrochure: '미발송',
      };

      const reconciled = matchHipassTransactions({
        rows: parsed.rows,
        bookings: [bookingForMatch],
        drivingLogs: [],
        existingExpenses: [],
      });

      assert.strictEqual(reconciled[0].matchStatus, 'matched');
      assert.strictEqual(reconciled[0].matchedScheduleId, liveScheduleId);
      assert.strictEqual(reconciled[0].isDuplicate, false);
      assert.strictEqual(reconciled[1].isDuplicate, true, 'Second identical row in batch must be flagged duplicate');

      // Sync non-duplicate toll to live Supabase `cockpit.schedules.driving_log`
      const syncRes1 = await api('/api/expenses/hipass-sync', {
        method: 'POST',
        body: JSON.stringify({
          items: [reconciled[0]],
          syncedBy: '정산 자동테스트',
        }),
      });
      assert.strictEqual(syncRes1.status, 200, `Hi-Pass sync failed: ${JSON.stringify(syncRes1.data)}`);
      assert.strictEqual(syncRes1.data.addedToSchedulesCount, 1);
      assert.strictEqual(syncRes1.data.totalSyncedTollAmount, 6600);

      // Re-posting the exact same toll must be idempotent (0 added, 1 skipped)
      const syncRes2 = await api('/api/expenses/hipass-sync', {
        method: 'POST',
        body: JSON.stringify({
          items: [reconciled[0]],
          syncedBy: '정산 자동테스트',
        }),
      });
      assert.strictEqual(syncRes2.status, 200);
      assert.strictEqual(syncRes2.data.addedToSchedulesCount, 0);
      assert.strictEqual(syncRes2.data.skippedScheduleDuplicates, 1);

      // Verify GET /api/expenses/hipass-sync returns the persisted toll
      const getSyncRes = await api('/api/expenses/hipass-sync');
      assert.strictEqual(getSyncRes.status, 200);
      const foundSynced = (getSyncRes.data.tolls || []).find(
        (t: any) => t.scheduleId === liveScheduleId && t.amount === 6600
      );
      assert.ok(foundSynced, 'GET /api/expenses/hipass-sync must return the toll saved in cockpit.schedules.driving_log');
      console.log('  ✅ Hi-Pass CSV parsing, schedule auto-matching, Supabase driving_log persistence & duplicate guard verified.');
    }

    console.log('\n🎉 ALL PHASE 3 AUTOMATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    if (scheduleIdsToClean.length > 0) {
      const idList = scheduleIdsToClean.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
      await executeSupabaseSql(`DELETE FROM cockpit.schedules WHERE id IN (${idList});`);
      console.log(`\n🧹 Cleaned up ${scheduleIdsToClean.length} test schedule(s) from cockpit.schedules.`);
    }
  }
}

runPhase3Tests().catch((err) => {
  console.error('\n❌ Phase 3 Test Suite Failed:', err);
  process.exit(1);
});
