import { NextResponse } from 'next/server';
import { accountHome, canAccessPortal } from '@/utils/loginPortal';

/** Preserve rotated/cleared HttpOnly cookies when a launch resumes an existing session. */
export async function redirectSessionResponse(sessionResponse: NextResponse, representativeOnly = false) {
  const data = await sessionResponse.json();
  const authenticated = sessionResponse.ok && data.authenticated === true;
  const destination = representativeOnly
    ? authenticated && canAccessPortal(data.session || {}, 'hq') ? '/hq?tab=dashboard' : '/hq/login'
    : authenticated ? accountHome(data.session || {}) : '/login';
  const response = new NextResponse(null, { status: 307, headers: { Location: destination } });
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
}
