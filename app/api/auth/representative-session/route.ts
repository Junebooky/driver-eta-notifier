import { NextRequest, NextResponse } from 'next/server';
import { GET as readSession } from '../session/route';
import { canAccessPortal } from '@/utils/loginPortal';

/** Server page guards cannot rotate cookies themselves; reuse the existing refresh handler. */
export async function GET(req: NextRequest) {
  const sessionResponse = await readSession(req);
  const data = await sessionResponse.json();
  const destination = data.authenticated && canAccessPortal(data.session || {}, 'representative')
    ? '/representative' : '/representative/login';
  const response = NextResponse.redirect(new URL(destination, req.url));
  for (const cookie of sessionResponse.cookies.getAll()) response.cookies.set(cookie);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
