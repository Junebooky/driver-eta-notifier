import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { accountHome, loginDestination } from './loginPortal';
import { redirectSessionResponse } from '../lib/auth/sessionRedirect';

test('the same installed PWA start URL resolves only from the authenticated role', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(accountHome({ role: 'hq_admin', isRepresentative: true }), '/hq?tab=dashboard');
  assert.equal(accountHome({ role: 'hq_admin' }), '/hq?tab=dashboard');
  assert.equal(accountHome({ role: 'driver', isRepresentative: true }), '/');
  assert.equal(accountHome({}), '/login');
  assert.equal(loginDestination({ role: 'hq_admin', isRepresentative: true }, '/'), '/hq?tab=dashboard');
  assert.equal(loginDestination({ role: 'hq_admin' }, '/'), '/hq?tab=dashboard');
});

test('launch preserves refreshed private cookies and never accepts an arbitrary destination', async () => {
  for (const [session, destination] of [
    [{ role: 'hq_admin', isRepresentative: true }, '/hq?tab=dashboard'],
    [{ role: 'hq_admin' }, '/hq?tab=dashboard'],
    [{ role: 'driver' }, '/'],
  ] as const) {
    const source = NextResponse.json({ authenticated: true, session });
    source.cookies.set('cockpit_session', 'rotated-access', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
    source.cookies.set('cockpit_refresh', 'rotated-refresh', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 604800,
    });
    const response = await redirectSessionResponse(source);
    assert.equal(response.headers.get('location'), destination);
    assert.equal(response.cookies.get('cockpit_refresh')?.value, 'rotated-refresh');
    assert.equal(response.cookies.get('cockpit_session')?.httpOnly, true);
    assert.equal(response.cookies.get('cockpit_session')?.secure, true);
    assert.match(response.headers.get('cache-control') || '', /private.*no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
  }
});

test('expired/revoked or unsuccessful authentication clears cookies and returns to login', async () => {
  const source = NextResponse.json(
    { authenticated: true, session: { role: 'hq_admin', isRepresentative: true } },
    { status: 401 }
  );
  source.cookies.set('cockpit_session', '', { path: '/', httpOnly: true, maxAge: 0 });
  const response = await redirectSessionResponse(source);
  assert.equal(response.headers.get('location'), '/login');
  assert.equal(response.cookies.get('cockpit_session')?.maxAge, 0);

  const unauthRep = NextResponse.json({ authenticated: false }, { status: 401 });
  assert.equal((await redirectSessionResponse(unauthRep, true)).headers.get('location'), '/hq/login');
  const hq = NextResponse.json({ authenticated: true, session: { role: 'hq_admin' } });
  assert.equal((await redirectSessionResponse(hq, true)).headers.get('location'), '/hq?tab=dashboard');
});
