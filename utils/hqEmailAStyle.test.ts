import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const inbox=r('components/hq/email/HqEmailInboxView.tsx');
const step=r('components/hq/email/HqStep1ExtractView.tsx');
const compose=r('components/hq/email/HqComposeEmailModal.tsx');
const batch=r('components/hq/email/HqEmailBatchRevisionPanel.tsx');
const detail=r('components/hq/email/HqStep2BookingDetailView.tsx');
const step5=r('components/hq/email/HqStep5AssignmentPanel.tsx');
const flightSection=r('components/hq/email/HqFlightAssignmentSection.tsx');
const revPanel=r('components/hq/email/HqEmailRevisionMatchPanel.tsx');
const placeSearch=r('components/hq/HqPlaceSearchInput.tsx');
const css=r('app/globals.css');

test('inbox A-plan keeps live IMAP, manual AI and safe dispatch controls',()=>{
  assert.match(inbox,/hq-email-a space-y-5/);
  assert.match(inbox,/fetchLiveInbox\(true\)/);
  assert.match(inbox,/handleSelectEmail\(item\.id\)/);
  assert.match(inbox,/setStatusFilter\(tab\.id\)/);
  assert.match(inbox,/dispatchMutation\.retry\(\)/);
  assert.match(inbox,/HqEmailWorkflowStepper/);
  assert.doesNotMatch(inbox,/bg-blue-50\/90 border-l-4/);
});

test('AI source viewer keeps the actual attachment count, every candidate and AI command',()=>{
  assert.match(step,/attachmentFiles\.map\(\(file, index\)/);
  assert.match(step,/emailDetail\?\.hasAttachments/);
  assert.match(step,/encodeURIComponent\(file\.filename\)/);
  assert.match(step,/onExtractWithAi/);
  assert.match(step,/extractedDraft/);
  assert.match(step,/shadow-\[0_6px_20px/);
  assert.match(step,/<HqSegmentedTabs/);
  assert.match(step,/<HqCard/);
  assert.match(step,/<HqBadge/);
  assert.match(step,/<HqButton/);
  assert.match(step,/displayedWaypoints\.length > 2 \|\| hasMultipleDates/);
  assert.match(step,/parseExcelWaypointNotes\(wp\.notes\)/);
  assert.match(step,/원본 \{excelSource\.cell\}/);
  assert.match(step,/mt-1 pl-14 flex flex-wrap items-center gap-1\.5/);
  assert.doesNotMatch(step,/TMAP 위치 미확정 · 눌러서 검색 결과 선택/);
  assert.doesNotMatch(step,/\{wp\.notes\}/);
  assert.match(step,/batchReviewCandidates\.length > 0/);
  assert.match(step,/<HqSearchSelect/);
  assert.doesNotMatch(step,/<select\b/);
});

test('compose email preserves explicit real-send safety and To/Cc recipient flow',()=>{
  assert.match(compose,/hq-email-compose-a/);
  assert.match(compose,/onSubmit=\{handleSendEmail\}/);
  assert.match(compose,/isConfirmedRealSend/);
  assert.match(compose,/setToEmails/);
  assert.match(compose,/setCcEmails/);
  assert.match(compose,/EMAIL_TEMPLATES\.map/);
  assert.doesNotMatch(compose,/bg-gradient-to-r from-\[#0B1E48\]/);
  assert.match(css,/A02 batch-approval internals are not restyled/);
});

test('A02 multi-day/vehicle atomic approval panel remains available',()=>{
  assert.match(batch,/emailBatchRows/);
  assert.match(batch,/onApprove/);
  assert.match(batch,/onAssignment/);
  assert.match(batch,/onCancelReason/);
});

test('Step 5 removes redundant verification cards, groups routes by date in 2 columns without end-time inputs, allows unconfirmed TMAP dispatch, places 추가 정보 right after assignment, and fixes mobile placeholder sizing',()=>{
  assert.doesNotMatch(inbox,/기존 예약 후보를 선택하거나 신규 예약으로 처리할지 먼저 확인해 주세요/);
  assert.doesNotMatch(revPanel,/기존 예약과 관계없는 신규 예약으로 처리/);

  assert.doesNotMatch(step5,/HqRoutePlaceVerification/);
  assert.doesNotMatch(step5,/allPlacesConfirmed\s*&&/);
  assert.match(step5,/<HqButton[\s\S]*variant="primary"/);
  assert.match(step5,/배차 확정 및 알림 전송/);
  assert.match(step5,/<HqSegmentedTabs/);

  assert.match(flightSection,/grid-cols-1 md:grid-cols-2/);
  assert.match(flightSection,/flex flex-col justify-between/);
  assert.match(detail,/grid-cols-\[64px_1fr\]/);

  assert.doesNotMatch(detail,/날짜별 장소·종료시간 확인/);
  assert.doesNotMatch(detail,/실제 종료 시간/);
  assert.match(detail,/grid-cols-1 md:grid-cols-2/);
  assert.match(detail,/emailDispatchDays\(/);
  assert.match(detail,/id="email-route-place-verification"/);
  assert.match(detail,/<HqPlaceSearchInput/);
  assert.match(detail,/confirmEmailRouteStop/);
  assert.match(detail,/<HqFlightInfoHint/);
  assert.match(detail,/<HqCard/);
  assert.match(detail,/<HqBadge/);
  assert.match(detail,/<HqButton/);
  assert.match(detail,/<HqSegmentedTabs/);
  const panelPos=detail.indexOf('<HqStep5AssignmentPanel');
  const addInfoPos=detail.indexOf('추가 정보</h3>');
  const basicInfoPos=detail.indexOf('예약 기본 정보 · 운행 일정</h3>');
  assert.ok(panelPos > 0 && addInfoPos > panelPos && basicInfoPos > addInfoPos, '추가 정보 card must appear directly below assignment panel and before 기본 정보');

  assert.match(placeSearch,/hq-place-search-input/);
  assert.match(placeSearch,/placeholder:text-\[11px\]/);
  assert.match(css,/input\.hq-place-search-input.*placeholder|input\.hq-place-search-input:not\(:focus\):placeholder-shown/);

  const flightHint=r('components/hq/email/HqFlightInfoHint.tsx');
  assert.match(flightHint,/const hasDirection = Boolean\(direction\);/);
  assert.match(flightHint,/\[normalizedCode, queryType, date, role, hasDirection\]/);
  assert.doesNotMatch(flightHint,/\[normalizedCode, queryType, date, role, direction\]/);
});
