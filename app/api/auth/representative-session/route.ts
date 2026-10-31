import { NextRequest } from 'next/server';
import { GET as readSession } from '../session/route';
import { redirectSessionResponse } from '@/lib/auth/sessionRedirect';

/** Server page guards cannot rotate cookies themselves; reuse the existing refresh handler. */
export async function GET(req: NextRequest) {
  return redirectSessionResponse(await readSession(req), true);
}
