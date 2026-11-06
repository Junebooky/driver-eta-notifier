import test from 'node:test';
import assert from 'node:assert/strict';
import type { HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import { extractFlightEvidence, extractCustomerAddressEvidence, addressHintToTmapQuery, enrichBookingDraftWithEmailEvidence, canonicalKoreanPlaceName } from './emailBookingEvidence';
import { selectUserEmailAttachments } from '@/services/naverImapService';

// Anonymized regression fixture: no real passenger names, emails or internal customer IDs.
const email = [
  'Please arrange the same driver for Nov 18-20.',
  'Nov 18 – Staria',
  '22:25pm – Pick up Group at Gimpo Int Airport T1 -> Conrad Seoul',
  'KE2104 HND-GMP 1950/2225 (Guest A, Guest B)',
  'NH867 HND-GMP 2000/2230 (Guest C)',
  'Meet & Greet',
  'Nov 19 – Staria',
  '9:50am – Pick up from Conrad Seoul -> Samsung Fire',
  '10:30am – Samsung Fire, 14 Seocho-daero 74-gil, Seocho-gu, Seoul',
  '12pm – Conrad Seoul (Standby at 13:15pm)',
  '13:30pm – KB Ins, 41, Three IFC 10, Gukjegeumyung-ro, Yeongdeungpo-gu, Seoul, 07326',
  '15:00pm – NH Securities, 108 Yeoui-daero, Yeongdeungpo-gu, Seoul, 07335',
  '16:30pm – Hanwha Life, 63 Hanwha Life Building, Yeouido-dong, Yeongdeungpo-gu, Seoul',
  '17:30pm – Head back to Conrad Seoul',
  'Nov 20 – Staria',
  '10:30am – Pick up from Conrad Seoul -> NPS Lunch',
  '11:45am – NPS Lunch TBA',
  '13:15pm – Head to POBA',
  '14:00pm – POBA, 140 Hangang-daeroYongsan-Gu, Seoul, 04382',
  '15:30pm – Hyundai Insurance, 163 Sejong-daero, Jongno-gu, Seoul, 03183',
  '16:30pm – Head to Incheon Int Airport T1',
  'AS120 ICN-SEA 2000/1255 | AS34 SEA-JFK 1440/2255 (Guest A, Guest B)',
  'CX419 ICN-HKG 1935/2240 (Guest C)',
].join('\n');
const points: RouteWaypointItem[] = [
  ['2026-11-18', '22:25', 'Gimpo Int Airport T1'], ['2026-11-18', '', 'Conrad Seoul'],
  ['2026-11-19', '09:50', 'Conrad Seoul'], ['2026-11-19', '10:30', 'Samsung Fire'],
  ['2026-11-19', '12:00', 'Conrad Seoul'], ['2026-11-19', '13:30', 'KB Ins'],
  ['2026-11-19', '15:00', 'NH Securities'], ['2026-11-19', '16:30', 'Hanwha Life'],
  ['2026-11-19', '17:30', 'Conrad Seoul'], ['2026-11-20', '10:30', 'Conrad Seoul'],
  ['2026-11-20', '11:45', 'NPS Lunch TBA'], ['2026-11-20', '14:00', 'POBA'],
  ['2026-11-20', '15:30', 'Hyundai Insurance'], ['2026-11-20', '16:30', 'Incheon Int Airport T1'],
].map(([date, time, location], i) => ({ id: 'p' + i, date, time, location, order: i + 1 }));

function draft(): HqEmailExtractedDraft {
  return {
    id: 'anon', emailId: 'test', passengerName: 'Guest A, Guest B, Guest C',
    passengerPhone: '', passengerCount: 3, pickupDate: '2026-11-18', pickupTime: '22:25',
    pickupLocation: 'Gimpo Int Airport T1', dropoffLocation: 'Incheon Int Airport T1',
    flightNumber: 'KE2104', requestedVehicleClass: '스타리아 1대', specialRequests: '동일 기사 3일',
    tripType: 'single', confidence: 0.8, warnings: [], waypoints: points,
    assignedDriver: null, assignedVehicle: null, assignedVehiclePlate: null,
    status: 'draft', updatedAt: '2026-11-07T00:00:00Z',
  };
}

test('both arrival flights, both departure flights and the connecting leg survive', () => {
  const flights = extractFlightEvidence(email, '2026-11-18');
  assert.deepEqual(flights.map(f=>f.flightNumber), ['KE2104','NH867','AS120','AS34','CX419']);
  assert.deepEqual(flights.map(f=>f.role), ['arrival','arrival','departure','connection','departure']);
  assert.deepEqual(flights.map(f=>f.date), ['2026-11-18','2026-11-18','2026-11-20','2026-11-20','2026-11-20']);
  assert.equal(flights[0].scheduledArrival, '22:25');
  assert.equal(flights[1].scheduledArrival, '22:30');
  assert.deepEqual(flights[1].passengers, ['Guest C']);
});

test('all six client addresses are retained and road numbers drive TMAP search', () => {
  const hints = extractCustomerAddressEvidence(email, '2026-11-18');
  assert.equal(hints.length, 6);
  assert.equal(hints[0].address, '14 Seocho-daero 74-gil, Seocho-gu, Seoul');
  assert.equal(addressHintToTmapQuery(hints[0].address), '서울 서초구 서초대로74길 14');
  assert.equal(addressHintToTmapQuery(hints[1].address), '서울 영등포구 국제금융로 10');
  assert.equal(addressHintToTmapQuery(hints[2].address), '서울 영등포구 여의대로 108');
  assert.match(hints[3].address, /63 Hanwha Life Building/);
  assert.equal(addressHintToTmapQuery(hints[4].address), '서울 용산구 한강대로 140');
  assert.equal(addressHintToTmapQuery(hints[5].address), '서울 종로구 세종대로 163');
});

test('fixes missing flight and movement info without falsely confirming any TMAP POI', () => {
  const result = enrichBookingDraftWithEmailEvidence(draft(), email);
  assert.equal(result.flights?.length, 5);
  assert.ok(result.warnings.some(w=>w.includes('NH867') && w.includes('픽업')));
  assert.equal(result.waypoints?.length, 14);
  const fire = result.waypoints?.find(p => p.date==='2026-11-19' && p.time==='10:30');
  assert.equal(fire?.location, '삼성화재');
  assert.equal(fire?.clientAddress, '14 Seocho-daero 74-gil, Seocho-gu, Seoul');
  assert.equal(fire?.address, undefined);
  assert.equal(fire?.isPoiConfirmed, undefined);
  assert.match(result.waypoints?.find(p=>p.date==='2026-11-19' && p.time==='12:00')?.notes || '', /13:15 대기/);
  assert.match(result.waypoints?.find(p=>p.date==='2026-11-20' && p.time==='11:45')?.notes || '', /13:15 .*이동 시작/);
  assert.match(result.waypoints?.find(p=>p.date==='2026-11-19' && p.time==='16:30')?.notes || '', /17:30 .*이동 시작/);
  assert.ok(result.waypoints?.some(p=>p.date==='2026-11-19' && p.location==='콘래드 서울' && p.time===''));
  assert.equal(result.waypoints?.find(p=>p.date==='2026-11-20' && p.location==='인천국제공항 제1여객터미널')?.time, '');
  assert.equal(result.waypoints?.some(p=>p.isPoiConfirmed), false);
});

test('explicit road-address appointment missing from AI is restored with review warning', () => {
  const withoutFire = draft();
  withoutFire.waypoints = withoutFire.waypoints?.filter(p=>p.location!=='Samsung Fire');
  const result = enrichBookingDraftWithEmailEvidence(withoutFire, email);
  assert.equal(result.waypoints?.length, 14);
  assert.ok(result.warnings.some(w=>w.includes('고객 원문에서 복원한 경유지')));
});

test('canonical venue translation never guesses an unknown venue', () => {
  assert.equal(canonicalKoreanPlaceName('Conrad Seoul'), '콘래드 서울');
  assert.equal(canonicalKoreanPlaceName('Unlisted Private Office'), 'Unlisted Private Office');
});

test('one real file plus inline signature image produces one attachment icon', () => {
  const files = [
    {filename:'schedule.xlsx',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentDisposition:'attachment',size:800},
    {filename:'logo.png',contentType:'image/png',contentDisposition:'inline',contentId:'<logo>',size:20},
    {filename:'schedule.xlsx',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentDisposition:'attachment',size:800},
  ];
  assert.deepEqual(selectUserEmailAttachments(files).map(f=>f.filename), ['schedule.xlsx']);
});
