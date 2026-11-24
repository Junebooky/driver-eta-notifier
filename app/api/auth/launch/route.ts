import { NextRequest } from 'next/server';
import { GET as readSession } from '../session/route';
import { redirectSessionResponse } from '@/lib/auth/sessionRedirect';

export async function GET(req: NextRequest) {
  return redirectSessionResponse(await readSession(req));
}
