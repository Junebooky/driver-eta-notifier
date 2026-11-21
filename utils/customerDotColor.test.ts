import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_DOT_COLORS, getCustomerDotColor } from './customerDotColor';

test('customer dots stay stable when a registered customer changes their name', () => {
  const initial = getCustomerDotColor('client-01', 'A Korea');
  assert.equal(initial, getCustomerDotColor('client-01', 'A Korea Ltd.'));
  assert.ok(CUSTOMER_DOT_COLORS.includes(initial as typeof CUSTOMER_DOT_COLORS[number]));
});

test('customers without IDs use normalized names and never require a database color', () => {
  assert.equal(getCustomerDotColor(undefined, '  ABC Korea  '), getCustomerDotColor(null, 'abc korea'));
  assert.ok(CUSTOMER_DOT_COLORS.includes(getCustomerDotColor() as typeof CUSTOMER_DOT_COLORS[number]));
});
