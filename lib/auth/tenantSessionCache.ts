import {coordinateTenantRefresh,type TenantAuthLock,type TenantRead} from './tenantAuthCoordinator';
import {createTenantResponseCache,tenantCacheScope,type CacheIdentity,type CacheLease} from '../taas/tenantResponseCache';

export type TenantSessionView=CacheIdentity & {expiresAt:number;home:'/'|'/hq?tab=dashboard'};
export type TenantSessionState={kind:'ready';session:TenantSessionView;cache:CacheLease}|{kind:'blocked'|'signed-out'|'unavailable'|'superseded'};
type Options={hostname:string;orgId:string;lock:TenantAuthLock|null;now:()=>number;read:()=>Promise<TenantRead<unknown>>;refresh:()=>Promise<TenantRead<unknown>>};

/** Only copy the explicit public session projection, never credentials or extra fields. */
export function parseTenantSessionView(raw:unknown,host:string,org:string,now:number):TenantSessionView|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Number.isSafeInteger(now))return null;
 const r=raw as Record<string,unknown>;
 if(typeof r.orgId!=='string'||r.orgId!==org||typeof r.hostname!=='string'||r.hostname!==host||typeof r.userId!=='string'||typeof r.sessionId!=='string'||
  (r.role!=='company_owner'&&r.role!=='company_admin'&&r.role!=='driver')||!(r.driverId===null||typeof r.driverId==='string')||
  typeof r.expiresAt!=='number'||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=now||r.home!==(r.role==='driver'?'/':'/hq?tab=dashboard'))return null;
 const s:TenantSessionView={orgId:r.orgId,hostname:r.hostname,userId:r.userId,sessionId:r.sessionId,role:r.role,driverId:r.driverId,expiresAt:r.expiresAt,home:r.role==='driver'?'/':'/hq?tab=dashboard'};
 return tenantCacheScope(s)?s:null;
}

/** Candidate only. The UI must discard rendered records on invalidate(), and
 * reconcile on mount/focus/account change before displaying tenant data.
 * Does not read legacy storage or authorize any business operation. */
export function createTenantSessionCache(options:Options){
 const cache=createTenantResponseCache();
 let generation=0;
 let state:TenantSessionState={kind:'blocked'};
 function invalidate(){generation++;cache.clear();state={kind:'blocked'};}
 function current():TenantSessionState{
  const now=options.now();
  if(state.kind==='ready'&&(!Number.isSafeInteger(now)||state.session.expiresAt<=now))invalidate();
  return state;
 }
 async function reconcile():Promise<TenantSessionState>{
  invalidate();const g=generation;
  const stale=():TenantRead<unknown>=>({kind:'unavailable'});
  const result=await coordinateTenantRefresh(options.lock,async()=>g===generation?options.read():stale(),async()=>g===generation?options.refresh():stale());
  if(g!==generation)return {kind:'superseded'};
  if(result.kind!=='authenticated')return state={kind:result.kind==='signed-out'?'signed-out':'unavailable'};
  const session=parseTenantSessionView(result.session,options.hostname,options.orgId,options.now());
  if(!session)return state={kind:'unavailable'};
  const lease=cache.activate(session);if(!lease)return state={kind:'unavailable'};
  // Even an already-issued lease becomes unusable after expiry or invalidation.
  const valid=()=>g===generation&&current().kind==='ready';
  const guarded:CacheLease={get:<T>(key:string)=>valid()?lease.get<T>(key):undefined,set:<T>(key:string,value:T)=>valid()&&lease.set(key,value),remove:(key:string)=>valid()&&lease.remove(key)};
  return state={kind:'ready',session:Object.freeze(session),cache:guarded};
 }
 return {invalidate,current,reconcile};
}
