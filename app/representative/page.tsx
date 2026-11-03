import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseAndVerifyToken } from '@/lib/auth/serverAuth';
import { canAccessPortal } from '@/utils/loginPortal';

export const dynamic = 'force-dynamic';

export default async function RepresentativePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('cockpit_session')?.value;
  const session = token ? await parseAndVerifyToken(token) : null;
  if (!session && cookieStore.get('cockpit_refresh')?.value) redirect('/api/auth/representative-session');
  if (!session || !canAccessPortal(session, 'hq')) redirect('/hq/login');
  redirect('/hq?tab=dispatch');
}
