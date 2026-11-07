import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPortal, loginDestination } from './loginPortal';

test('unified HQ authority allows access for both HQ admin and representative marker', () => {
  assert.equal(canAccessPortal({ role: 'hq_admin', isRepresentative: true }, 'representative'), true);
  assert.equal(canAccessPortal({ role: 'hq_admin' }, 'representative'), true);
  assert.equal(canAccessPortal({ role: 'hq_admin' }, 'hq'), true);
  assert.equal(canAccessPortal({ role: 'driver', isRepresentative: true }, 'representative'), false);
  assert.equal(canAccessPortal({ role: 'hq_admin' }, 'driver'), false);
  assert.equal(canAccessPortal({ role: 'driver' }, 'hq'), false);
});

test('login returns to an authorized local destination and blocks cross-portal/open redirect loops', () => {
  const rep = { role: 'hq_admin', isRepresentative: true },
    admin = { role: 'hq_admin' },
    driver = { role: 'driver' };
  assert.equal(loginDestination(rep), '/hq?tab=dashboard');
  assert.equal(loginDestination(admin), '/hq?tab=dashboard');
  assert.equal(loginDestination(driver), '/');
  assert.equal(loginDestination(rep, '/hq?tab=dispatch&view=action'), '/hq?tab=dispatch&view=action');
  assert.equal(loginDestination(rep, '/representative'), '/hq?tab=dashboard');
  assert.equal(loginDestination(admin, '/representative'), '/hq?tab=dashboard');
  assert.equal(loginDestination(driver, '/hq?tab=dispatch'), '/');
  for (const path of [
    'https://evil.invalid',
    '//evil.invalid',
    '/\\evil.invalid',
    '/login',
    '/representative/login',
  ])
    assert.equal(loginDestination(rep, path), '/hq?tab=dashboard');
});

test('representative session continuation routes only authenticated HQ identities to the shared dashboard', async () => {
  const { NextResponse } = await import('next/server');
  const { redirectSessionResponse } = await import('../lib/auth/sessionRedirect');
  for (const [session, authenticated, status, expected] of [
    [{ role: 'hq_admin', isRepresentative: true }, true, 200, '/hq?tab=dashboard'],
    [{ role: 'hq_admin' }, true, 200, '/hq?tab=dashboard'],
    [{ role: 'driver', isRepresentative: true }, true, 200, '/hq/login'],
    [{}, true, 200, '/hq/login'],
    [{ role: 'hq_admin' }, false, 200, '/hq/login'],
    [{ role: 'hq_admin', isRepresentative: true }, true, 401, '/hq/login'],
  ] as const) {
    const source = NextResponse.json({ authenticated, session }, { status });
    source.cookies.set('cockpit_refresh', status === 401 ? '' : 'rotated-test-refresh', {
      httpOnly: true, secure: true, path: '/', maxAge: status === 401 ? 0 : 3600,
    });
    const response = await redirectSessionResponse(source, true);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), expected);
    assert.equal(response.cookies.get('cockpit_refresh')?.value, status === 401 ? '' : 'rotated-test-refresh');
    assert.equal(response.cookies.get('cockpit_refresh')?.httpOnly, true);
    assert.equal(response.cookies.get('cockpit_refresh')?.secure, true);
    if (status === 401) assert.equal(response.cookies.get('cockpit_refresh')?.maxAge, 0);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Cookie');
  }
});
