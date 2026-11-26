import {browserTenantAuthLock,coordinateTenantAuthMutation,type TenantAuthLock,type TenantRead} from './tenantAuthCoordinator';
import {createTenantSessionCache,parseTenantSessionView,type TenantSessionState} from './tenantSessionCache';
import {tenantCacheScope} from '../taas/tenantResponseCache';

const PATH='/api/tenant/auth/session';
const INVALIDATE='invalidate-v1';
export type TenantCredentials={email:string;password:string;code?:string};
export type AuthMutation={kind:'complete'|'stale'|'unavailable'|'mfa-required'|'rate-limited'|'invalid'};
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Signal={publish:()=>void;subscribe:(listener:()=>void)=>()=>void;close:()=>void};
type Reply={status:number;body:Record<string,unknown>};
const unavailable=():AuthMutation=>({kind:'unavailable'});

/** Fixed same-origin URL; no token access, redirects, persistent storage, or retries. */
export function createTenantSessionTransport(fetcher:Fetcher){
 async function request(body?:object):Promise<Reply|null>{
  try{
   const r=await fetcher(PATH,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:body?{'Accept':'application/json','Content-Type':'application/json'}:{Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   if(r.redirected||!r.headers.get('content-type')?.toLowerCase().includes('application/json'))return null;
   const value:unknown=await r.json();
   return value&&typeof value==='object'&&!Array.isArray(value)?{status:r.status,body:value as Record<string,unknown>}:null;
  }catch{return null;}
 }
 function session(r:Reply|null,read:boolean):TenantRead<unknown>{
  if(r?.status===200&&r.body.ok===true&&r.body.authenticated===true)return {kind:'authenticated',session:r.body.session};
  if(read&&r?.status===401&&r.body.ok===false&&r.body.authenticated===false){
   if(r.body.code==='REFRESH_REQUIRED')return {kind:'refresh-required'};
   if(r.body.code==='SESSION_UNAVAILABLE')return {kind:'signed-out'};
  }
  return {kind:'unavailable'};
 }
 return {
  read:async()=>session(await request(),true),
  refresh:async()=>session(await request({action:'refresh'}),false),
  login:async(input:TenantCredentials)=>{
   const r=await request({email:input.email,password:input.password,...(input.code!==undefined?{code:input.code}:{})});
   return {reply:r,session:session(r,false)};
  },
  logout:async()=>{const r=await request({action:'logout'});return r?.status===200&&r.body.ok===true&&r.body.authenticated===false;},
 };
}

/** A same-origin message can only invalidate, never authenticate a tab.
 * No identities, credentials or data are sent. Unsupported browsers remain locked. */
export function browserTenantInvalidationSignal():Signal|null{
 if(typeof window==='undefined'||!window.isSecureContext||typeof BroadcastChannel==='undefined')return null;
 try{
  const c=new BroadcastChannel('cockpit:tenant-auth-invalidation:v1');
  return {publish:()=>c.postMessage(INVALIDATE),subscribe(listener){
   const handle=(e:MessageEvent)=>{if(e.data===INVALIDATE)listener();};
   c.addEventListener('message',handle);return ()=>c.removeEventListener('message',handle);
  },close:()=>c.close()};
 }catch{return null;}
}
type Options={hostname:string;orgId:string;now:()=>number;lock:TenantAuthLock|null;signal:Signal|null;fetcher:Fetcher;onInvalidate:()=>void};
/** Not mounted. The future UI must discard all rendered records in onInvalidate,
 * reconcile on mount/focus, and explicitly reconcile after successful mutations.
 * Server authorization remains mandatory. */
export function createTenantBrowserAuth(o:Options){
 const transport=createTenantSessionTransport(o.fetcher);
 const cache=createTenantSessionCache({...o,read:transport.read,refresh:transport.refresh});
 let epoch=0,disposed=false,mutating=false;
 function invalidate(){epoch++;cache.invalidate();o.onInvalidate();}
 const unsubscribe=o.signal?.subscribe(()=>{if(!disposed)invalidate();});
 async function mutate(work:(g:number)=>Promise<AuthMutation>):Promise<AuthMutation>{
  if(disposed||mutating||!o.signal||!o.lock)return unavailable();
  mutating=true;
  try{
   invalidate();const g=epoch;
   const result=await coordinateTenantAuthMutation(o.lock,async()=>{
    if(disposed||g!==epoch)return {kind:'stale'} as AuthMutation;
    return work(g);
   });
   return result.kind==='complete'?result.value:unavailable();
  }catch{return unavailable();}
  finally{mutating=false;}
 }
 async function send(g:number,work:()=>Promise<AuthMutation>):Promise<AuthMutation>{
  if(disposed||g!==epoch||!o.signal)return {kind:'stale'};
  // Invalidate other tabs before and after the complete cookie-mutating request.
  o.signal.publish();
  try{const result=await work();return disposed||g!==epoch?{kind:'stale'}:result;}
  finally{if(!disposed)o.signal.publish();}
 }
 return {
  current:()=>cache.current(),
  invalidate,
  async reconcile():Promise<TenantSessionState>{
   if(disposed||mutating||!o.signal||!o.lock)return {kind:'blocked'};
   invalidate();return cache.reconcile();
  },
  login(input:TenantCredentials):Promise<AuthMutation>{
   return mutate(async g=>{
    const current=await transport.read();
    // Do not silently overwrite a session from another tab, even if it needs refresh.
    if(current.kind!=='signed-out')return {kind:current.kind==='unavailable'?'unavailable':'stale'};
    return send(g,async()=>{
     const {reply,session}=await transport.login(input);
     if(session.kind==='authenticated')return {kind:parseTenantSessionView(session.session,o.hostname,o.orgId,o.now())?'complete':'unavailable'};
     if(reply?.status===403&&reply.body.code==='MFA_REQUIRED')return {kind:'mfa-required'};
     if(reply?.status===429&&reply.body.code==='RATE_LIMITED')return {kind:'rate-limited'};
     if(reply?.status===401&&reply.body.code==='AUTH_FAILED')return {kind:'invalid'};
     return unavailable();
    });
   });
  },
  logout():Promise<AuthMutation>{
   const before=cache.current();
   if(before.kind!=='ready')return Promise.resolve({kind:'stale'});
   const expected=tenantCacheScope(before.session);
   return mutate(async g=>{
    const fresh=await transport.read();
    if(fresh.kind==='signed-out')return {kind:'complete'};
    if(fresh.kind!=='authenticated')return {kind:'stale'};
    const actual=parseTenantSessionView(fresh.session,o.hostname,o.orgId,o.now());
    if(!actual||tenantCacheScope(actual)!==expected)return {kind:'stale'};
    return send(g,async()=>({kind:await transport.logout()?'complete':'unavailable'}));
   });
  },
  dispose(){if(disposed)return;disposed=true;cache.invalidate();epoch++;unsubscribe?.();o.signal?.close();},
 };
}
export function browserTenantAuth(hostname:string,orgId:string,onInvalidate:()=>void){
 if(typeof window==='undefined'||window.location.protocol!=='https:'||window.location.hostname!==hostname||window.location.port)return null;
 const lock=browserTenantAuthLock();if(!lock)return null;
 const signal=browserTenantInvalidationSignal();if(!signal)return null;
 return createTenantBrowserAuth({hostname,orgId,onInvalidate,lock,signal,now:()=>Math.floor(Date.now()/1000),fetcher:(url,init)=>window.fetch(url,init)});
}
