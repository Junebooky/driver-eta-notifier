import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDriverFlightEntries } from './driverFlightNumbers';

test('multiple assigned flights remain separate lookup targets for one driver', () => {
  assert.deepEqual(parseDriverFlightEntries('KE2104, NH867'), [
    { label: 'KE2104', code: 'KE2104' },
    { label: 'NH867', code: 'NH867' },
  ]);
});

test('flight whitespace, annotations, and duplicate codes are handled without losing displayed details', () => {
  assert.deepEqual(parseDriverFlightEntries('SQ 612 (09:50 입국); SQ612; 7C 101 / OZ113'), [
    { label: 'SQ 612 (09:50 입국)', code: 'SQ612' },
    { label: '7C 101', code: '7C101' },
    { label: 'OZ113', code: 'OZ113' },
  ]);
});

test('unknown flight text is preserved for driver review but never used as a live lookup code', () => {
  assert.deepEqual(parseDriverFlightEntries('항공편 미정, KE2104'), [
    { label: '항공편 미정', code: null }, { label: 'KE2104', code: 'KE2104' },
  ]);
  assert.deepEqual(parseDriverFlightEntries(''), []);
});
