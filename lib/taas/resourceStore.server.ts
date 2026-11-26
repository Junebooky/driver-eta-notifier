import { supabaseAdmin } from '../supabase/server';
import { scopeColumn, validateScopedFleetRows, type ScopedResourceReader, type ResourceKind } from './resourceOwnership';
const tables = { driver:'drivers',vehicle:'vehicles',customer:'customers',schedule:'schedules' } as const;
const columns: Record<ResourceKind,string> = {
  driver:'id,org_id,driver_meta',
  vehicle:'id,organization_id,archived,status',
  customer:'id,org_id',
  schedule:'id,org_id',
};

/** Internal candidate only. Service-role access MUST be scoped in the query.
 * Return only the minimal fields required for ownership checks. */
export const readScopedResource: ScopedResourceReader = async (kind,orgId,id) => {
  const {data,error} = await supabaseAdmin.from(tables[kind])
    .select(columns[kind]).eq(scopeColumn(kind),orgId).eq('id',id).maybeSingle();
  if (error) throw new Error('Scoped resource unavailable');
  return data as unknown as Record<string,unknown> | null;
};

/** Internal read-only candidate. No public route imports this.
 * Read DB fleet in stable pages without using the VIP static catalog. */
export async function readTenantFleetCandidate(orgId: string) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(orgId)) throw new Error('Invalid fleet scope');
  const all: Record<string,unknown>[]=[];
  const size=200;
  let lastId: string | undefined;
  for (;;) {
    let query=supabaseAdmin.from('vehicles')
      .select('id,organization_id,plate,model,model_short,brand,category,capacity,fuel_type,status,archived')
      .eq('organization_id',orgId).eq('archived',false).order('id',{ascending:true}).limit(size);
    if (lastId) query=query.gt('id',lastId);
    const {data,error}=await query;
    if (error) throw new Error('Scoped fleet unavailable');
    const page=validateScopedFleetRows(orgId,data);
    if (!page.length) break;
    const next=String(page[page.length-1].id);
    if (lastId && next<=lastId) throw new Error('Fleet pagination stalled');
    all.push(...page);
    lastId=next;
    // Continue until an empty page: a provider-side row limit may be smaller than size.
  }
  return validateScopedFleetRows(orgId,all);
}
