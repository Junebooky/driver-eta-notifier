import { Buffer } from 'node:buffer';

export type TenantRole = 'company_owner' | 'company_admin' | 'driver';
type Row = Record<string, unknown>;
export interface TenantIdentity {
  userId: string;
  orgId: string;
  hostname: string;
  role: TenantRole;
  driverId: string | null;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  home: '/' | '/hq?tab=dashboard';
}

/** Internal dependencies. All rows must be freshly read from server-managed sources.
 * No data from a client-provided organization, role, driver ID or JWT user_metadata.
 */
export interface TenantAuthDependencies {
  getUser(token: string): Promise<Row | null>;
  isSessionActive(userId: string, sessionId: string): Promise<boolean>;
  getDomain(hostname: string): Promise<Row | null>;
  getOrganization(orgId: string): Promise<Row | null>;
  getMembership(userId: string, orgId: string): Promise<Row | null>;
  ownsActiveDriver(orgId: string, driverId: string): Promise<boolean>;
}

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const orgIdValid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9_]{2,62}$/.test(value);
const tenantRole = (value: unknown): value is TenantRole =>
  value === 'company_owner' || value === 'company_admin' || value === 'driver';
const record = (value: unknown): Row | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const pastTimestamp = (value: unknown, now: number) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now * 1000;

/** Accept only a canonical hostname supplied by a trusted ingress adapter.
 * Never obtain this argument from arbitrary forwarded headers, query parameters
 * or request bodies. Domain ownership and ingress configuration are separate gates.
 */
export function canonicalTenantHostname(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 4 || value.length > 253) return null;
  const hostname = value.toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) return null;
  return hostname;
}

/** Candidate engine; NOT a replacement for legacy verifyServerAuth.
 * Only provider-verified access JWTs and active per-tenant memberships qualify.
 * Every call rechecks current records. Return null for all errors and mismatches.
 * No fallback to VIP, no cookie writes, no session refresh or auth mutations.
 */
export async function evaluateTenantIdentity(
  trustedHostname: string,
  token: string,
  dependencies: TenantAuthDependencies,
  now = Math.floor(Date.now() / 1000),
): Promise<TenantIdentity | null> {
  const hostname = canonicalTenantHostname(trustedHostname);
  if (!hostname || !Number.isSafeInteger(now) || typeof token !== 'string' ||
      token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
      token.startsWith('cockpit_s1.')) return null;

  try {
    const domain = await dependencies.getDomain(hostname);
    if (!domain || domain.hostname !== hostname || domain.status !== 'verified' ||
        !pastTimestamp(domain.verified_at, now) || !orgIdValid(domain.org_id)) return null;
    const orgId = domain.org_id;
    const organization = await dependencies.getOrganization(orgId);
    if (!organization || organization.id !== orgId || organization.status !== 'active' ||
        organization.runtime_enabled !== true) return null;

    // getUser validates the access token with the Auth provider before decoding claims.
    const user = await dependencies.getUser(token);
    if (!user || !uuid(user.id) || user.is_anonymous === true ||
        !pastTimestamp(user.email_confirmed_at, now)) return null;
    const claims = record(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')));
    if (!claims || claims.sub !== user.id || claims.role !== 'authenticated' ||
        claims.aud !== 'authenticated' || claims.is_anonymous === true ||
        !uuid(claims.session_id) || typeof claims.iat !== 'number' || typeof claims.exp !== 'number' ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
        claims.iat > now + 60 || claims.exp <= now || claims.exp <= claims.iat ||
        (claims.aal !== 'aal1' && claims.aal !== 'aal2')) return null;
    const appMetadata = record(user.app_metadata);
    if (appMetadata?.disabled === true) return null;
    const verifiedFactors = Array.isArray(user.factors) && user.factors.some(
      factor => record(factor)?.status === 'verified'
    );
    if ((appMetadata?.require_mfa === true || verifiedFactors) && claims.aal !== 'aal2') return null;
    if (!await dependencies.isSessionActive(user.id, claims.session_id)) return null;

    const membership = await dependencies.getMembership(user.id, orgId);
    if (!membership || membership.user_id !== user.id || membership.org_id !== orgId ||
        membership.status !== 'active' || !tenantRole(membership.role)) return null;
    const role = membership.role;
    let driverId: string | null = null;
    if (role === 'driver') {
      if (!uuid(membership.driver_id) || !await dependencies.ownsActiveDriver(orgId, membership.driver_id)) return null;
      driverId = membership.driver_id;
    } else if (membership.driver_id !== null) {
      // Ambiguous membership must be reconciled rather than elevated.
      return null;
    }
    return {
      userId: user.id, orgId, hostname, role, driverId, sessionId: claims.session_id,
      issuedAt: claims.iat, expiresAt: claims.exp,
      home: role === 'driver' ? '/' : '/hq?tab=dashboard',
    };
  } catch {
    return null;
  }
}
