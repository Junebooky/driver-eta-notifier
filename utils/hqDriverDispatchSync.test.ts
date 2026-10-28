import assert from 'node:assert/strict';
import {
  detectDispatchConflicts,
  mapScheduleItemToHqBooking,
} from './dispatchConflictDetector';
import { ScheduleItem } from '../data/ferrariSchedules';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TEST_DATE_PRIMARY = '2027-05-18';
const TEST_DATE_GROUP = '2027-05-19';

async function apiJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('=== A02 HQ ↔ Driver Cockpit Real-Time Dispatch Sync E2E Verification ===\n');

  const createdIds = new Set<string>();

  // Pre-clean any residual rows on dedicated test dates (2027-05-18 / 2027-05-19)
  for (const dt of [TEST_DATE_PRIMARY, TEST_DATE_GROUP]) {
    const existingRes = await apiJson(`/api/schedules?role=hq&date=${dt}`);
    for (const s of (existingRes.data.schedules || []) as ScheduleItem[]) {
      await fetch(`${BASE_URL}/api/schedules?id=${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }

  try {
    // 0. Pure Unit Check: Conflict Detector
    {
      const existing = [
        mapScheduleItemToHqBooking(
          {
            id: 'unit-1',
            vehicle_no: '116허 1514',
            vehicle_plate: '116허 1514',
            driver_name: '윤태준',
            date: TEST_DATE_PRIMARY,
            dateLabel: '5월 18일 (화)',
            pickup_time: '10:00',
            dropoff_time: null,
            time_display: '10:00 픽업',
            flightType: 'arrival',
            origin_name: '인천국제공항 제2여객터미널',
            origin_address: '',
            origin_lat: 37.4685,
            origin_lng: 126.4337,
            origin_preset_id: 'icn-t2',
            destination_name: '서울신라호텔',
            destination_address: '',
            destination_lat: 37.5559,
            destination_lng: 127.0052,
            destination_preset_id: 'shilla',
            status: 'confirmed',
            dispatch_status: 'published',
            passenger: 'VIP Guest',
          },
          0
        ),
      ];

      const conflicts = detectDispatchConflicts(
        {
          pickupDate: TEST_DATE_PRIMARY,
          pickupTime: '11:30',
          driverName: '윤태준',
          vehiclePlate: '703서 2658',
        },
        existing
      );
      assert.equal(conflicts.length, 1, 'Expected driver overlap conflict within 180-min window');
      assert.equal(conflicts[0].type, 'driver');
      console.log('✓ [0] Unit conflict detector accurately flags overlapping driver/vehicle schedules');
    }

    // 1. 사모님 PC 전화 예약 접수 & 이메일 예약 접수 -> 배차 대기함 등록 (미배정) + 기사 화면 미노출 검증
    let phoneScheduleId = '';
    let emailScheduleId = '';
    {
      const phoneRes = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          bookingNo: 'VIP-E2E-PHONE-01',
          customerName: 'LVMH 코리아',
          eventName: 'LVMH 회장단 방한 의전',
          intakeSource: 'phone',
          dispatchStatus: 'unassigned',
          vehicleNo: '미배정',
          date: TEST_DATE_PRIMARY,
          pickupTime: '10:00',
          origin: '인천국제공항 제2여객터미널',
          destination: '서울신라호텔',
          passengerName: 'Bernard Arnault 외 2명',
          passengerPhone: '010-9100-1111',
          flightNumber: 'AF264',
          notes: '사모님 PC 전화 접수 테스트',
        }),
      });
      assert.equal(phoneRes.status, 200, `Phone intake failed: ${JSON.stringify(phoneRes.data)}`);
      assert.equal(phoneRes.data.ok, true);
      phoneScheduleId = phoneRes.data.schedule.id;
      createdIds.add(phoneScheduleId);

      const emailRes = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          bookingNo: 'VIP-E2E-EMAIL-01',
          customerName: '샤넬 코리아',
          eventName: '샤넬 글로벌 디렉터 의전',
          intakeSource: 'email',
          dispatchStatus: 'unassigned',
          vehicleNo: '미배정',
          date: TEST_DATE_PRIMARY,
          pickupTime: '14:00',
          origin: '김포국제공항 비즈니스항공센터(SGBAC)',
          destination: '포시즌스 호텔 서울',
          passengerName: 'Virginie Viard VIP',
          passengerPhone: '010-9200-2222',
          flightNumber: 'PRIVATE-01',
          notes: '사모님 이메일 접수 대기함 테스트',
        }),
      });
      assert.equal(emailRes.status, 200, `Email intake failed: ${JSON.stringify(emailRes.data)}`);
      emailScheduleId = emailRes.data.schedule.id;
      createdIds.add(emailScheduleId);

      // HQ sees both unassigned reservations
      const hqRes = await apiJson(`/api/schedules?role=hq&date=${TEST_DATE_PRIMARY}`);
      assert.equal(hqRes.status, 200);
      const hqIds = (hqRes.data.schedules as ScheduleItem[]).map((s) => s.id);
      assert.ok(hqIds.includes(phoneScheduleId), 'HQ must see unassigned phone booking');
      assert.ok(hqIds.includes(emailScheduleId), 'HQ must see unassigned email booking');

      const phoneBookingView = mapScheduleItemToHqBooking(
        (hqRes.data.schedules as ScheduleItem[]).find((s) => s.id === phoneScheduleId)!,
        0
      );
      assert.equal(phoneBookingView.dispatchStatus, '미배정');
      assert.equal(phoneBookingView.intakeSource, 'phone');

      // Driver Cockpit strictly NEVER sees unassigned bookings
      const driverAllRes = await apiJson(`/api/schedules?vehicle_no=all&date=${TEST_DATE_PRIMARY}`);
      const driverIds = (driverAllRes.data.schedules as ScheduleItem[]).map((s) => s.id);
      assert.ok(!driverIds.includes(phoneScheduleId), 'Driver Cockpit must NEVER see unassigned phone booking');
      assert.ok(!driverIds.includes(emailScheduleId), 'Driver Cockpit must NEVER see unassigned email booking');

      console.log('✓ [1] 사모님 전화·이메일 예약 접수 → 본사 배차 대기함(미배정) 저장 및 기사 화면 유출 차단 검증 완료');
    }

    // 2. 대표님 스마트폰 배차 확정 -> 기사 스마트폰 스케줄 자동 반영 -> 기사 [배차 확인] -> 본사 확인완료 동기화
    {
      const publishRes = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: phoneScheduleId,
          bookingNo: 'VIP-E2E-PHONE-01',
          customerName: 'LVMH 코리아',
          eventName: 'LVMH 회장단 방한 의전',
          intakeSource: 'phone',
          dispatchStatus: 'published',
          driverId: '윤태준',
          driverName: '윤태준',
          driverPhone: '010-6348-8726',
          vehicleNo: '116허 1514',
          vehiclePlate: '116허 1514',
          vehicleModel: '벤츠 스프린터',
          date: TEST_DATE_PRIMARY,
          pickupTime: '10:00',
          origin: '인천국제공항 제2여객터미널',
          destination: '서울신라호텔',
          passengerName: 'Bernard Arnault 외 2명',
          passengerPhone: '010-9100-1111',
          flightNumber: 'AF264',
          notes: '대표님 스마트폰 배차 확정',
          publishedBy: '대표님 (모바일)',
        }),
      });
      assert.equal(publishRes.status, 200, `Publish failed: ${JSON.stringify(publishRes.data)}`);
      assert.equal(publishRes.data.schedule.dispatch_status, 'published');
      assert.equal(publishRes.data.schedule.isAcknowledged, false);

      // Driver '윤태준' sees it via both '4호차' (dedicated hocha) and '116허 1514' (dispatched plate)
      const drvHochaRes = await apiJson(`/api/schedules?vehicle_no=${encodeURIComponent('4호차')}&date=${TEST_DATE_PRIMARY}`);
      const drvPlateRes = await apiJson(`/api/schedules?vehicle_no=${encodeURIComponent('116허 1514')}&date=${TEST_DATE_PRIMARY}`);
      assert.ok(
        (drvHochaRes.data.schedules as ScheduleItem[]).some((s) => s.id === phoneScheduleId),
        '4호차(윤태준) Cockpit must receive published dispatch'
      );
      assert.ok(
        (drvPlateRes.data.schedules as ScheduleItem[]).some((s) => s.id === phoneScheduleId),
        '116허 1514 Cockpit query must receive published dispatch'
      );

      // Other driver ('1호차' 배선만) must NOT see 윤태준's dispatch
      const otherDrvRes = await apiJson(`/api/schedules?vehicle_no=${encodeURIComponent('1호차')}&date=${TEST_DATE_PRIMARY}`);
      assert.ok(
        !(otherDrvRes.data.schedules as ScheduleItem[]).some((s) => s.id === phoneScheduleId),
        '1호차(배선만) must NOT see 윤태준 schedule'
      );

      // HQ initially shows '미확인'
      const hqBeforeAck = await apiJson(`/api/schedules?role=hq&date=${TEST_DATE_PRIMARY}`);
      const bookingBeforeAck = mapScheduleItemToHqBooking(
        (hqBeforeAck.data.schedules as ScheduleItem[]).find((s) => s.id === phoneScheduleId)!,
        0
      );
      assert.equal(bookingBeforeAck.dispatchStatus, '배차 완료');
      assert.equal(bookingBeforeAck.driverAck, '미확인');

      // Driver taps [배차 확인]
      const ackRes = await apiJson('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: phoneScheduleId,
          version: 1,
          driverId: '윤태준',
          driverName: '윤태준',
        }),
      });
      assert.equal(ackRes.status, 200);
      assert.equal(ackRes.data.ok, true);

      // HQ immediately reflects '확인완료' + timestamp
      const hqAfterAck = await apiJson(`/api/schedules?role=hq&date=${TEST_DATE_PRIMARY}`);
      const bookingAfterAck = mapScheduleItemToHqBooking(
        (hqAfterAck.data.schedules as ScheduleItem[]).find((s) => s.id === phoneScheduleId)!,
        0
      );
      assert.equal(bookingAfterAck.driverAck, '확인완료');
      assert.ok(Boolean(bookingAfterAck.lastAckAt), 'lastAckAt timestamp must be recorded');

      console.log('✓ [2] 대표님 모바일 배차 확정 → 기사 Cockpit 즉시 노출 → 기사 [배차 확인] → 본사 확인완료 실시간 갱신 검증 완료');
    }

    // 3. 반대 기기 조합 (모바일 전화 예약 접수 -> PC 배차 확정)
    let reverseDeviceId = '';
    {
      const mobileIntake = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          bookingNo: 'VIP-E2E-REV-01',
          customerName: '구찌 코리아',
          intakeSource: 'phone',
          dispatchStatus: 'unassigned',
          vehicleNo: '미배정',
          date: TEST_DATE_PRIMARY,
          pickupTime: '18:00',
          origin: '그랜드 하얏트 서울',
          destination: '인천국제공항 제1여객터미널',
          passengerName: 'Sabato De Sarno',
          notes: '모바일 접수 -> PC 배차 확정 검증',
        }),
      });
      assert.equal(mobileIntake.status, 200);
      reverseDeviceId = mobileIntake.data.schedule.id;
      createdIds.add(reverseDeviceId);

      const pcPublish = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: reverseDeviceId,
          bookingNo: 'VIP-E2E-REV-01',
          customerName: '구찌 코리아',
          intakeSource: 'phone',
          dispatchStatus: 'published',
          driverName: '민성호',
          vehicleNo: '8호차',
          vehiclePlate: '142호 7815',
          vehicleModel: '벤츠 V클래스',
          date: TEST_DATE_PRIMARY,
          pickupTime: '18:00',
          origin: '그랜드 하얏트 서울',
          destination: '인천국제공항 제1여객터미널',
          passengerName: 'Sabato De Sarno',
          publishedBy: '본사 PC 관리자',
        }),
      });
      assert.equal(pcPublish.status, 200);

      const drv8Res = await apiJson(`/api/schedules?vehicle_no=${encodeURIComponent('8호차')}&date=${TEST_DATE_PRIMARY}`);
      assert.ok((drv8Res.data.schedules as ScheduleItem[]).some((s) => s.id === reverseDeviceId));

      console.log('✓ [3] 반대 기기 조합 (모바일 예약 접수 → PC 배차 확정 → 8호차 기사 수신) 검증 완료');
    }

    // 4. 복수 차량 행사 (2대 그룹 배차 · 기사별 독립 스케줄 격리 검증)
    {
      const groupId = 'GRP-E2E-MULTI-01';
      const batchRes = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              bookingNo: 'VIP-E2E-GRP-1',
              customerName: '페라리 코리아',
              eventName: '페라리 갈라 디너 VIP 의전',
              groupId,
              groupName: '페라리 갈라 디너 2대 그룹',
              groupTotalVehicles: 2,
              groupVehicleIndex: 1,
              intakeSource: 'quick_dispatch',
              dispatchStatus: 'published',
              driverName: '배선만',
              vehicleNo: '142호 7814',
              vehiclePlate: '142호 7814',
              vehicleModel: '벤츠 스프린터',
              date: TEST_DATE_GROUP,
              pickupTime: '09:00',
              origin: '인천국제공항 제2여객터미널',
              destination: '서울신라호텔',
              passengerName: '회장님 부부 (2명)',
              passengerPhone: '010-7777-0001',
              flightNumber: 'KE902',
              notes: '1호차 VIP 본진 영접',
            },
            {
              bookingNo: 'VIP-E2E-GRP-2',
              customerName: '페라리 코리아',
              eventName: '페라리 갈라 디너 VIP 의전',
              groupId,
              groupName: '페라리 갈라 디너 2대 그룹',
              groupTotalVehicles: 2,
              groupVehicleIndex: 2,
              intakeSource: 'quick_dispatch',
              dispatchStatus: 'published',
              driverName: '정태훈',
              vehicleNo: '703서 2658',
              vehiclePlate: '703서 2658',
              vehicleModel: '벤츠 스프린터',
              date: TEST_DATE_GROUP,
              pickupTime: '09:20',
              origin: '인천국제공항 제2여객터미널',
              destination: '코엑스 인터컨티넨탈',
              passengerName: '수행단 스태프 (6명)',
              passengerPhone: '010-7777-0002',
              flightNumber: 'KE902',
              notes: '2호차 수행단 및 수하물 전담',
            },
          ],
        }),
      });
      assert.equal(batchRes.status, 200, `Group dispatch failed: ${JSON.stringify(batchRes.data)}`);
      assert.equal(batchRes.data.count, 2);
      for (const s of batchRes.data.schedules as ScheduleItem[]) {
        createdIds.add(s.id);
      }

      // 1호차 driver ('배선만') sees ONLY Car 1
      const car1DriverView = await apiJson(`/api/schedules?vehicle_no=${encodeURIComponent('1호차')}&date=${TEST_DATE_GROUP}`);
      const car1List = car1DriverView.data.schedules as ScheduleItem[];
      assert.equal(car1List.length, 1);
      assert.equal(car1List[0].passenger, '회장님 부부 (2명)');
      assert.equal(car1List[0].destination_name, '서울신라호텔');
      assert.equal(car1List[0].group_vehicle_index, 1);
      assert.equal(car1List[0].group_total_vehicles, 2);

      // 2호차 driver ('정태훈' / '703서 2658') sees ONLY Car 2
      const car2DriverView = await apiJson(`/api/schedules?vehicle_no=${encodeURIComponent('703서 2658')}&date=${TEST_DATE_GROUP}`);
      const car2List = car2DriverView.data.schedules as ScheduleItem[];
      assert.equal(car2List.length, 1);
      assert.equal(car2List[0].passenger, '수행단 스태프 (6명)');
      assert.equal(car2List[0].destination_name, '코엑스 인터컨티넨탈');
      assert.equal(car2List[0].group_vehicle_index, 2);

      console.log('✓ [4] 복수 차량 행사(2대 그룹 배차) → 본사 행사 묶음 유지 + 기사별 차량·승객·목적지 완벽 분리 검증 완료');
    }

    // 5. 배차 변경(시간·목적지 수정) -> version v1 -> v2 증가 -> 재확인 필요 전환 -> 기사 재확인 완료
    {
      const modifyRes = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: phoneScheduleId,
          bookingNo: 'VIP-E2E-PHONE-01',
          customerName: 'LVMH 코리아',
          eventName: 'LVMH 회장단 방한 의전',
          intakeSource: 'phone',
          dispatchStatus: 'published',
          driverId: '윤태준',
          driverName: '윤태준',
          driverPhone: '010-6348-8726',
          vehicleNo: '116허 1514',
          vehiclePlate: '116허 1514',
          vehicleModel: '벤츠 스프린터',
          date: TEST_DATE_PRIMARY,
          pickupTime: '11:30', // 10:00 -> 11:30 변경
          origin: '인천국제공항 제2여객터미널',
          destination: '그랜드 하얏트 서울', // 신라호텔 -> 하얏트 변경
          passengerName: 'Bernard Arnault 외 2명',
          passengerPhone: '010-9100-1111',
          flightNumber: 'AF264',
          notes: '항공편 지연으로 픽업 시간 및 호텔 변경',
        }),
      });
      assert.equal(modifyRes.status, 200);
      assert.equal(modifyRes.data.schedule.version, 2, 'Version must increment to 2 upon itinerary change');
      assert.equal(modifyRes.data.schedule.isAcknowledged, false, 'isAcknowledged must reset on v2 bump');

      // HQ shows '재확인 필요'
      const hqReackCheck = await apiJson(`/api/schedules?role=hq&date=${TEST_DATE_PRIMARY}`);
      const hqUpdatedBooking = mapScheduleItemToHqBooking(
        (hqReackCheck.data.schedules as ScheduleItem[]).find((s) => s.id === phoneScheduleId)!,
        0
      );
      assert.equal(hqUpdatedBooking.dispatchStatus, '재확인 필요');
      assert.equal(hqUpdatedBooking.driverAck, '재확인 필요');

      // Driver re-acknowledges v2
      const reAckRes = await apiJson('/api/schedules/ack', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: phoneScheduleId,
          version: 2,
          driverId: '윤태준',
          driverName: '윤태준',
        }),
      });
      assert.equal(reAckRes.status, 200);

      const hqAfterReAck = await apiJson(`/api/schedules?role=hq&date=${TEST_DATE_PRIMARY}`);
      const hqFinalBooking = mapScheduleItemToHqBooking(
        (hqAfterReAck.data.schedules as ScheduleItem[]).find((s) => s.id === phoneScheduleId)!,
        0
      );
      assert.equal(hqFinalBooking.dispatchStatus, '배차 완료');
      assert.equal(hqFinalBooking.driverAck, '확인완료');
      assert.equal(hqFinalBooking.lastAckVersion, 2);

      console.log('✓ [5] 배차 시간·목적지 변경(v1 → v2) → 기사 [배차 변경됨 · 재확인] 전환 및 재확인 완료 동기화 검증 완료');
    }

    // 6. 동일 시간대 기사·차량 중복 배차 충돌 차단 (409 SCHEDULE_CONFLICT)
    {
      // 윤태준 & 116허 1514 has published trip at 11:30 on TEST_DATE_PRIMARY
      const driverConflictRes = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          customerName: '충돌 테스트 고객사 A',
          dispatchStatus: 'published',
          driverName: '윤태준', // 동일 기사!
          vehicleNo: '702서 2657',
          vehiclePlate: '702서 2657',
          date: TEST_DATE_PRIMARY,
          pickupTime: '12:15', // 45분 차이 -> 충돌!
          origin: '서울신라호텔',
          destination: '코엑스',
          passengerName: 'Conflict Guest 1',
        }),
      });
      assert.equal(driverConflictRes.status, 409, 'Overlapping driver schedule must return HTTP 409');
      assert.equal(driverConflictRes.data.code, 'SCHEDULE_CONFLICT');

      const vehicleConflictRes = await apiJson('/api/schedules/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          customerName: '충돌 테스트 고객사 B',
          dispatchStatus: 'published',
          driverName: '조기현',
          vehicleNo: '116허 1514', // 동일 차량!
          vehiclePlate: '116허 1514',
          date: TEST_DATE_PRIMARY,
          pickupTime: '12:30', // 60분 차이 -> 충돌!
          origin: '서울신라호텔',
          destination: '인천국제공항 제2여객터미널',
          passengerName: 'Conflict Guest 2',
        }),
      });
      assert.equal(vehicleConflictRes.status, 409, 'Overlapping vehicle schedule must return HTTP 409');
      assert.equal(vehicleConflictRes.data.code, 'SCHEDULE_CONFLICT');

      console.log('✓ [6] 동일 시간대 기사 중복 및 차량 중복 배차 차단 (HTTP 409 SCHEDULE_CONFLICT) 검증 완료');
    }

    // 7. 배차 취소 (/api/schedules/cancel) -> 본사 '취소' + 기사 Cockpit 취소 알림 노출 검증
    {
      const cancelRes = await apiJson('/api/schedules/cancel', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: reverseDeviceId,
          reason: '고객사 항공편 결항으로 인한 취소',
        }),
      });
      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.data.ok, true);

      // HQ sees dispatchStatus === '취소'
      const hqCancelCheck = await apiJson(`/api/schedules?role=hq&date=${TEST_DATE_PRIMARY}`);
      const cancelledHq = mapScheduleItemToHqBooking(
        (hqCancelCheck.data.schedules as ScheduleItem[]).find((s) => s.id === reverseDeviceId)!,
        0
      );
      assert.equal(cancelledHq.dispatchStatus, '취소');
      assert.equal(cancelledHq.cancelReason, '고객사 항공편 결항으로 인한 취소');

      // Driver Cockpit with include_cancelled=1 receives cancellation notice
      const drvWithCancelled = await apiJson(
        `/api/schedules?vehicle_no=${encodeURIComponent('8호차')}&date=${TEST_DATE_PRIMARY}&include_cancelled=1`
      );
      const cancelledCard = (drvWithCancelled.data.schedules as ScheduleItem[]).find(
        (s) => s.id === reverseDeviceId
      );
      assert.ok(cancelledCard, 'Driver Cockpit with include_cancelled=1 must receive cancelled notice card');
      assert.equal(cancelledCard.dispatch_status, 'cancelled');
      assert.equal(cancelledCard.cancel_reason, '고객사 항공편 결항으로 인한 취소');

      // Active-only feed excludes cancelled schedule
      const drvActiveOnly = await apiJson(
        `/api/schedules?vehicle_no=${encodeURIComponent('8호차')}&date=${TEST_DATE_PRIMARY}`
      );
      assert.ok(
        !(drvActiveOnly.data.schedules as ScheduleItem[]).some((s) => s.id === reverseDeviceId),
        'Active-only driver schedule feed must exclude cancelled trip'
      );

      console.log('✓ [7] 배차 취소 시 본사 상태 전환 및 기사 Cockpit [배차 취소됨] 안내 동기화 검증 완료');
    }

    console.log('\n🎉 ALL 8 HQ ↔ DRIVER DISPATCH SYNC E2E SCENARIOS PASSED SUCCESSFULLY!');
  } finally {
    // Clean up temporary test rows so production/demo DB remains clean
    for (const id of createdIds) {
      await fetch(`${BASE_URL}/api/schedules?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }
}

runTests().catch((err) => {
  console.error('❌ E2E Dispatch Sync Test Failed:', err);
  process.exit(1);
});
