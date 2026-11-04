import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatPhoneNumber, sanitizePlaceName, formatCapacity } from './formatters';

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

describe('formatCapacity', () => {
  it('standardizes various capacity inputs into [number]인 format', () => {
    assert.strictEqual(formatCapacity('최대 3인'), '3인');
    assert.strictEqual(formatCapacity('최대 4인'), '4인');
    assert.strictEqual(formatCapacity('최대 4~7인'), '4~7인');
    assert.strictEqual(formatCapacity('7~9인'), '7~9인');
    assert.strictEqual(formatCapacity('6인승'), '6인');
    assert.strictEqual(formatCapacity('15~16인'), '15~16인');
    assert.strictEqual(formatCapacity('최대 16인'), '16인');
    assert.strictEqual(formatCapacity('45인승'), '45인');
    assert.strictEqual(formatCapacity('28인승'), '28인');
    assert.strictEqual(formatCapacity('22인승'), '22인');
  });

  it('formats numeric and raw range values correctly', () => {
    assert.strictEqual(formatCapacity(4), '4인');
    assert.strictEqual(formatCapacity('4'), '4인');
    assert.strictEqual(formatCapacity('4~7'), '4~7인');
    assert.strictEqual(formatCapacity('최대 3인승'), '3인');
  });

  it('handles null, undefined, empty, and dash placeholders', () => {
    assert.strictEqual(formatCapacity(''), '-');
    assert.strictEqual(formatCapacity(null), '-');
    assert.strictEqual(formatCapacity(undefined), '-');
    assert.strictEqual(formatCapacity('-'), '-');
  });
});

