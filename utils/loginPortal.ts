export type LoginPortal = 'driver' | 'hq' | 'representative';
export interface PortalIdentity { role?: string; isRepresentative?: boolean }

export function canAccessPortal(session: PortalIdentity, portal: LoginPortal) {
  if (portal === 'representative') return session.role === 'hq_admin' && session.isRepresentative === true;
  return portal === 'hq' ? session.role === 'hq_admin' : session.role === 'driver';
}

export function loginDestination(session: PortalIdentity, next?: string | null) {
  const fallback = canAccessPortal(session, 'representative') ? '/representative' : session.role === 'hq_admin' ? '/hq?tab=dashboard' : '/';
  if (!next || !/^\/(?!\/)/.test(next) || next.includes('\\')) return fallback;
  const path = new URL(next, 'https://cockpit.invalid').pathname;
  if (path === '/login' || path.endsWith('/login')) return fallback;
  if ((path === '/representative' || path.startsWith('/representative/')) && !canAccessPortal(session, 'representative')) return fallback;
  if ((path === '/hq' || path.startsWith('/hq/')) && !canAccessPortal(session, 'hq')) return fallback;
  return next;
}
