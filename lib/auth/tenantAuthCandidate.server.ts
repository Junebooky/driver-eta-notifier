import { supabaseAdmin } from '../supabase/server';
import { evaluateTenantIdentity, type TenantAuthDependencies, type TenantIdentity } from './tenantIdentity';
import { ownsActiveDriver } from '../taas/resourceOwnership';
import { readScopedResource } from '../taas/resourceStore.server';

/** P0-02 release interlock: no tenant candidate may grant live access.
 * Changing an env var, domain record or staged membership cannot lift it.
 * Do not remove until all API/RLS/storage/worker gates and verified ownership
 * are complete. No existing route imports this candidate.
 */
const TENANT_RUNTIME_RELEASED: boolean = false;

const dependencies: TenantAuthDependencies = {
  async getUser(token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    return error || !data.user ? null : { ...data.user };
  },
  async isSessionActive(userId, sessionId) {
    const { data, error } = await supabaseAdmin.rpc('is_active_auth_session', {
      p_session_id: sessionId, p_user_id: userId,
    });
    return !error && data === true;
  },
  async getDomain(hostname) {
    const { data, error } = await supabaseAdmin.from('organization_domains')
      .select('hostname,org_id,status,verified_at').eq('hostname', hostname).maybeSingle();
    return error ? null : data;
  },
  async getOrganization(orgId) {
    const { data, error } = await supabaseAdmin.from('organizations')
      .select('id,status,runtime_enabled').eq('id', orgId).maybeSingle();
    return error ? null : data;
  },
  async getMembership(userId, orgId) {
    const { data, error } = await supabaseAdmin.from('organization_members')
      .select('org_id,user_id,role,status,driver_id')
      .eq('org_id', orgId).eq('user_id', userId).maybeSingle();
    return error ? null : data;
  },
  async ownsActiveDriver(orgId, driverId) {
    return ownsActiveDriver(readScopedResource, orgId, driverId);
  },
};

export async function verifyTenantAuthCandidate(
  trustedHostname: string,
  accessToken: string,
): Promise<TenantIdentity | null> {
  if (!TENANT_RUNTIME_RELEASED) return null;
  return evaluateTenantIdentity(trustedHostname, accessToken, dependencies);
}
