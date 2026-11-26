import type { TenantIdentity } from '../auth/tenantIdentity';

export type ResourceKind = 'driver' | 'vehicle' | 'customer' | 'schedule';
export type ResourceRow = Record<string, unknown>;
export type ScopedResourceReader = (kind: ResourceKind, orgId: string, id: string) => Promise<ResourceRow | null>;
export const scopeColumn = (kind: ResourceKind) => kind === 'vehicle' ? 'organization_id' : 'org_id';
const uuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const validOrg = (org: unknown): org is string => typeof org === 'string' && /^[a-z][a-z0-9_]{2,62}$/.test(org);
const validId = (kind: ResourceKind, id: unknown): id is string =>
  kind === 'customer' ? typeof id === 'string' && id.length > 0 && id.length <= 256 && id.trim() === id && !/[\u0000-\u001f\u007f]/.test(id) : uuid(id);

export async function readOwnedResource(read: ScopedResourceReader, kind: ResourceKind, orgId: string, id: string): Promise<ResourceRow | null> {
  if (!validOrg(orgId) || !validId(kind,id)) return null;
  try {
    const row = await read(kind,orgId,id);
    return row && row.id === id && row[scopeColumn(kind)] === orgId ? row : null;
  } catch { return null; }
}
export async function ownsActiveDriver(read: ScopedResourceReader, orgId: string, id: string): Promise<boolean> {
  const row = await readOwnedResource(read,'driver',orgId,id);
  const meta = row?.driver_meta;
  // Unverified status is not enough for a new tenant membership.
  return !!meta && typeof meta === 'object' && !Array.isArray(meta) &&
    (meta as Record<string,unknown>).status === 'active';
}

export interface DispatchReferences {
  scheduleId?: string;
  driverId?: string;
  vehicleId?: string;
  customerId?: string;
}

/** Ownership precheck only; NOT an atomic write authorization or availability check.
 * Caller must obtain identity from the server-auth engine, never the request body.
 * All writes will need transactional scope checks before runtime is unlocked.
 */
export async function checkTenantDispatchReferences(identity: TenantIdentity, refs: DispatchReferences, read: ScopedResourceReader): Promise<boolean> {
  if (!validOrg(identity.orgId) || !['company_owner','company_admin'].includes(identity.role)) return false;
  const org = identity.orgId;
  const entries: [ResourceKind,string|undefined][] = [['schedule',refs.scheduleId],['driver',refs.driverId],['vehicle',refs.vehicleId],['customer',refs.customerId]];
  for (const [kind,id] of entries) {
    if (id === undefined) continue;
    if (kind === 'driver') {
      if (!await ownsActiveDriver(read,org,id)) return false;
    } else {
      const row = await readOwnedResource(read,kind,org,id);
      if (!row || (kind === 'vehicle' && (row.archived !== false || row.status === 'maintenance'))) return false;
    }
  }
  return true;
}

/** No VIP stock, cross-tenant correction or resurrection of archived records. */
export function validateScopedFleetRows(orgId: string, rows: unknown): ResourceRow[] {
  if (!validOrg(orgId) || !Array.isArray(rows)) throw new Error('Invalid fleet scope');
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || row.organization_id !== orgId || !uuid(row.id) ||
        row.archived !== false || typeof row.plate !== 'string' || !row.plate.trim() ||
        typeof row.model !== 'string' || !row.model.trim() || ids.has(row.id)) {
      throw new Error('Fleet ownership or identity mismatch');
    }
    ids.add(row.id);
  }
  return rows;
}
