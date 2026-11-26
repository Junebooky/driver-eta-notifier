/** Review-only browser coordinator. No UI, route, or legacy cache imports.
 * All future cookie-mutating tenant requests must share the same origin lock.
 * This is cooperative browser serialization, NOT a server security boundary.
 */
export const TENANT_AUTH_LOCK = 'cockpit:tenant-auth:v1';
export type TenantAuthLock = {
 request<T>(name:string,work:()=>Promise<T>):Promise<T>;
};
export type Coordinated<T> =
 | {kind:'complete';value:T}
 | {kind:'unavailable'};
export type TenantRead<T> =
 | {kind:'authenticated';session:T}
 | {kind:'refresh-required'}
 | {kind:'signed-out'}
 | {kind:'unavailable'};
export type TenantRefresh<T> = ( )=>Promise<TenantRead<T>>;

/** No localStorage, BroadcastChannel, token transfer or unsafe unlocked fallback.
 * Web Locks are origin-scoped; unsupported browsers must not rotate cookies.
 */
export function browserTenantAuthLock():TenantAuthLock|null{
 if(typeof window==='undefined'||!window.isSecureContext||typeof navigator==='undefined'||!navigator.locks)return null;
 return {request:<T>(name:string,work:()=>Promise<T>)=>navigator.locks.request(name,{mode:'exclusive'},()=>work())};
}

/** The callback must await the complete HTTP response, including cookie updates.
 * Never nest this operation or bypass it with an independent mutation.
 */
export async function coordinateTenantAuthMutation<T>(
 lock:TenantAuthLock|null,work:()=>Promise<T>,
):Promise<Coordinated<T>>{
 if(!lock)return {kind:'unavailable'};
 try{return {kind:'complete',value:await lock.request(TENANT_AUTH_LOCK,work)};}
 catch{return {kind:'unavailable'};}
}

/** Read again AFTER acquiring the lock: another tab may have already rotated
 * the cookie or signed out. Only the server's explicit refresh-required result
 * permits one refresh. No automatic retries after ambiguous network failures.
 * Returned identity is the current cookie session, not the caller's stale view.
 */
export async function coordinateTenantRefresh<T>(
 lock:TenantAuthLock|null,read:()=>Promise<TenantRead<T>>,refresh:TenantRefresh<T>,
):Promise<TenantRead<T>>{
 const result=await coordinateTenantAuthMutation(lock,async()=>{
  const current=await read();
  return current.kind==='refresh-required'?await refresh():current;
 });
 return result.kind==='complete'?result.value:{kind:'unavailable'};
}
