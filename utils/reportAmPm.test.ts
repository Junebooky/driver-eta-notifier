import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEtaWithAmPm } from './reportGenerator';
import { generateVipReportText } from './kakao';
import { generateEnglishReportText } from './locationTranslation';

test('Korean clock uses true 12-hour AM/PM including noon and midnight', () => {
  assert.equal(formatEtaWithAmPm('13:25'), '1:25 PM');
  assert.equal(formatEtaWithAmPm('09:05'), '9:05 AM');
  assert.equal(formatEtaWithAmPm('00:15'), '12:15 AM');
  assert.equal(formatEtaWithAmPm('12:00'), '12:00 PM');
  assert.equal(formatEtaWithAmPm('23:59'), '11:59 PM');
  assert.equal(formatEtaWithAmPm('01:25 PM'), '1:25 PM');
  assert.equal(formatEtaWithAmPm('도착 미정'), '도착 미정');
});

test('Korean departure report preserves customer-specified locations and formats both clocks', () => {
  const text = generateVipReportText({
    carNumber: '193호5336', driverName: '기사', originName: '조선팰리스',
    destinationName: '코엑스', etaFormatted: '13:25', mode: 'DEPARTURE',
    departureTimeText: '13:00',
  });
  assert.match(text, /조선팰리스/);
  assert.match(text, /코엑스/);
  assert.match(text, /1:00 PM/);
  assert.match(text, /1:25 PM/);
  assert.doesNotMatch(text, /현 위치/);
  assert.doesNotMatch(text, /13:25 PM/);
});

test('English report keeps designated origin, destination and 12-hour ETA', () => {
  const text = generateEnglishReportText({
    vehicleNo: '193호5336', originEn: 'Josun Palace',
    destinationEn: 'COEX', etaFormatted: '13:25', mode: 'DEPARTURE',
  });
  assert.match(text, /Vehicle No\.: 193호5336/);
  assert.match(text, /Route: Josun Palace → COEX/);
  assert.match(text, /ETA: 1:25 PM/);
});
