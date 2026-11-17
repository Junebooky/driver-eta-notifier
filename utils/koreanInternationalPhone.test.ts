import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KOREA_MOBILE_PREFIX,
  formatKoreanMobileInternationalInput,
  formatKoreanMobileForDisplay,
  normalizeKoreanMobileNumber,
  getDialablePhoneHref,
} from './koreanInternationalPhone';

test('Korean mobile entry automatically converts 010 to the +82 international format', () => {
  for (const input of [
    '01063488726',
    '010-6348-8726',
    '+82-10-6348-8726',
    '+82 10 6348 8726',
    '+821063488726',
    '+82-01063488726',
    '821063488726',
    '10-6348-8726',
  ]) {
    assert.equal(formatKoreanMobileInternationalInput(input), '+82-10-6348-8726', input);
    assert.equal(normalizeKoreanMobileNumber(input), '+82-10-6348-8726', input);
  }
});

test('international mobile input works as a person types after the +82- prefix', () => {
  const samples = [
    ['+82-', '+82-'],
    ['+82-0', '+82-0'],
    ['+82-01', '+82-01'],
    ['+82-010', '+82-10'],
    ['+82-106', '+82-10-6'],
    ['+82-106348', '+82-10-6348'],
    ['+82-1063488726', '+82-10-6348-8726'],
  ];
  assert.equal(KOREA_MOBILE_PREFIX, '+82-');
  for (const [input, expected] of samples) {
    assert.equal(formatKoreanMobileInternationalInput(input), expected);
  }
  assert.equal(normalizeKoreanMobileNumber('+82-'), null);
  assert.equal(normalizeKoreanMobileNumber('+82-10-6348'), null);
});

test('existing stored domestic numbers display internationally and dial as +8210', () => {
  assert.equal(formatKoreanMobileForDisplay('010-6348-8726'), '+82-10-6348-8726');
  assert.equal(getDialablePhoneHref('01063488726'), 'tel:+821063488726');
  assert.equal(getDialablePhoneHref('+82-10-6348-8726'), 'tel:+821063488726');
  assert.equal(getDialablePhoneHref('연락처 미등록'), '');
  assert.equal(formatKoreanMobileForDisplay('연락처 미등록'), '연락처 미등록');
  assert.equal(formatKoreanMobileInternationalInput('+1 415 555 1234'), '+1 415 555 1234');
});
