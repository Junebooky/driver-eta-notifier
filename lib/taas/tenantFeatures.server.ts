import {supabaseAdmin as db} from '../supabase/server';
import {verifyTenantAuthCandidate} from '../auth/tenantAuthCandidate.server';
import type {TenantIdentity} from '../auth/tenantIdentity';
import {parseTenantFeaturePolicy,type TenantFeaturePolicy} from './tenantFeatures';
type Dependencies={verify:(host:string,token:string)=>Promise<TenantIdentity|null>;load:(i:TenantIdentity)=>Promise<unknown>};
export async function loadTenantFeaturePolicy(host:string,token:string,deps:Dependencies):Promise<TenantFeaturePolicy|null>{
 try{
  const i=await deps.verify(host,token);if(!i)return null;
  const policy=parseTenantFeaturePolicy(i,await deps.load(i));if(!policy)return null;
  const fresh=await deps.verify(host,token);
  if(!fresh||fresh.orgId!==i.orgId||fresh.userId!==i.userId||fresh.sessionId!==i.sessionId||fresh.role!==i.role||fresh.driverId!==i.driverId||fresh.hostname!==i.hostname)return null;
  return policy;
 }catch{return null;}
}
export const tenantFeatureCandidate=(host:string,token:string)=>loadTenantFeaturePolicy(host,token,{
 verify:verifyTenantAuthCandidate,
 async load(i){const r=await db.rpc('tenant_feature_policy_v1',{p_org:i.orgId,p_user:i.userId,p_session:i.sessionId});return r.error?null:r.data;},
});
