import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DriverCockpit from '@/components/DriverCockpit';
import { isDevAuthAllowed, parseAndVerifyToken } from '@/lib/auth/serverAuth';
import { accountHome } from '@/utils/loginPortal';

export const dynamic = 'force-dynamic';

/** The shared PWA start URL also routes previously installed home-screen icons. */
export default async function AppEntryPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('cockpit_session')?.value;
  const session = token ? await parseAndVerifyToken(token) : null;
  if (!session) {
    if (cookieStore.get('cockpit_refresh')?.value || isDevAuthAllowed()) redirect('/api/auth/launch');
    redirect('/login');
  }
  const destination = accountHome(session);
  if (destination !== '/') redirect(destination);
  return <DriverCockpit />;
}
