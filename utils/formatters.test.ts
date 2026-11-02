import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatPhoneNumber, sanitizePlaceName } from './formatters';

describe('formatPhoneNumber', () => {
  it('formats standard 11-digit mobile numbers with hyphens', () => {
    assert.strictEqual(formatPhoneNumber('01063488726'), '010-6348-8726');
    assert.strictEqual(formatPhoneNumber('01012345678'), '010-1234-5678');
    assert.strictEqual(formatPhoneNumber('01099998888'), '010-9999-8888');
  });

  it('keeps existing hyphens cleanly without duplicate hyphens', () => {
    assert.strictEqual(formatPhoneNumber('010-6348-8726'), '010-6348-8726');
    assert.strictEqual(formatPhoneNumber('010-1234-5678'), '010-1234-5678');
  });

  it('supports progressive typing', () => {
    assert.strictEqual(formatPhoneNumber('010'), '010');
    assert.strictEqual(formatPhoneNumber('0106'), '010-6');
    assert.strictEqual(formatPhoneNumber('01063'), '010-63');
    assert.strictEqual(formatPhoneNumber('010634'), '010-634');
    assert.strictEqual(formatPhoneNumber('0106348'), '010-6348');
    assert.strictEqual(formatPhoneNumber('01063488'), '010-6348-8');
    assert.strictEqual(formatPhoneNumber('010634887'), '010-6348-87');
    assert.strictEqual(formatPhoneNumber('0106348872'), '010-6348-872');
    assert.strictEqual(formatPhoneNumber('01063488726'), '010-6348-8726');
  });

  it('formats Seoul landline (02) correctly', () => {
    assert.strictEqual(formatPhoneNumber('021234567'), '02-123-4567');
    assert.strictEqual(formatPhoneNumber('0212345678'), '02-1234-5678');
    assert.strictEqual(formatPhoneNumber('02'), '02');
    assert.strictEqual(formatPhoneNumber('021'), '02-1');
  });

  it('formats regional 10-digit numbers correctly', () => {
    assert.strictEqual(formatPhoneNumber('0312345678'), '031-234-5678');
    assert.strictEqual(formatPhoneNumber('0511234567'), '051-123-4567');
  });

  it('formats representative toll-free numbers (15xx, 16xx)', () => {
    assert.strictEqual(formatPhoneNumber('15881234'), '1588-1234');
    assert.strictEqual(formatPhoneNumber('16001234'), '1600-1234');
  });

  it('preserves international numbers starting with +', () => {
    assert.strictEqual(formatPhoneNumber('+82 10-6348-8726'), '+82 10-6348-8726');
    assert.strictEqual(formatPhoneNumber('+33 6 12 34 56 78'), '+33 6 12 34 56 78');
  });

  it('returns empty string for nullish or empty input', () => {
    assert.strictEqual(formatPhoneNumber(''), '');
    assert.strictEqual(formatPhoneNumber(null as unknown as string), '');
    assert.strictEqual(formatPhoneNumber(undefined as unknown as string), '');
  });

  it('strips invalid non-numeric characters', () => {
    assert.strictEqual(formatPhoneNumber('010abc6348def8726'), '010-6348-8726');
  });
});
