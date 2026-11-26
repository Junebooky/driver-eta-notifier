import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {canonicalTenantHostname,type TenantIdentity} from './tenantIdentity';
import {tenantCacheScope} from '../taas/tenantResponseCache';

export const TENANT_ACCESS_COOKIE='__Host-taas-access';
export const TENANT_BINDING_COOKIE='__Host-taas-binding';
const opts={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/'};
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Host'};
type Credentials={email:string;password:string;code?:string};
type ProviderResult={kind:'ok';token:string}|{kind:'invalid'|'mfa'|'unavailable'};
export type TenantSessionDependencies={
 brandOrg:(host:string)=>Promise<string|null>;
 verify:(host:string,token:string)=>Promise<TenantIdentity|null>;
 consume:(email:string,verifiedIp:string)=>Promise<'allow'|'limit'|'unavailable'>;
 signIn:(credentials:Credentials)=>Promise<ProviderResult>;
 discard:(token:string)=>Promise<void>;
 revoke:(identity:TenantIdentity,token:string)=>Promise<boolean>;
 secret:()=>string|null;
 now:()=>number;
};
type Cookies={access?:string;binding?:string};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
const fail=(status:number,code='SESSION_UNAVAILABLE')=>json({ok:false,authenticated:false,code,error:status===401?'이메일과 비밀번호 또는 로그인 상태를 확인해 주세요.':status===429?'로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.':'로그인 또는 업체 접근 권한을 확인해 주세요.'},status);
function clear(r:NextResponse){
 for(const name of [TENANT_ACCESS_COOKIE,TENANT_BINDING_COOKIE])r.cookies.set(name,'',{...opts,maxAge:0});
 return r;
}
function secretValid(s:string|null):s is string{return typeof s==='string'&&Buffer.byteLength(s)>=32;}
function tokenValid(s:unknown):s is string{return typeof s==='string'&&s.length<=3500&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)&&!s.startsWith('cockpit_s1.');}
function identityValid(i:TenantIdentity|null,host:string,org:string,now:number):i is TenantIdentity{
 return !!i&&i.hostname===host&&i.orgId===org&&!!tenantCacheScope(i)&&Number.isSafeInteger(i.expiresAt)&&i.expiresAt>now&&
 i.home===(i.role==='driver'?'/':'/hq?tab=dashboard');
}
function binding(secret:string,host:string,org:string,token:string){
 return createHmac('sha256',secret).update(JSON.stringify(['taas-session-v1',host,org,createHash('sha256').update(token).digest('hex')])).digest('hex');
}
function matches(a:unknown,b:string){
 return typeof a==='string'&&/^[0-9a-f]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function view(i:TenantIdentity){
 // No access/refresh token, provider metadata or credentials in JSON.
 return {orgId:i.orgId,hostname:i.hostname,userId:i.userId,sessionId:i.sessionId,role:i.role,driverId:i.driverId,expiresAt:i.expiresAt,home:i.home};
}
function credentials(raw:unknown):Credentials|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).some(k=>!['email','password','code'].includes(k))||typeof r.email!=='string'||typeof r.password!=='string'||!r.password||r.password.length>1024)return null;
 const email=r.email.trim().toLowerCase();
 if(email.length>254||!/^[^\s@]+@[^\s@]+$/.test(email)||(r.code!==undefined&&(typeof r.code!=='string'||!/^\d{6}$/.test(r.code))))return null;
 return {email,password:r.password,...(typeof r.code==='string'?{code:r.code}:{})};
}
const sameOrigin=(host:string,origin:unknown)=>origin==='https://'+host;
async function discard(token:string,deps:TenantSessionDependencies){try{await deps.discard(token);}catch{/* no cookie issued; provider session cleanup is best effort */}}
/** Trusted host and IP are supplied only by a verified ingress adapter, never
 * from request headers/body here. Brand preflight also enforces runtime hold. */
export async function loginTenantSession(trustedHost:string,verifiedIp:string,origin:unknown,raw:unknown,deps:TenantSessionDependencies):Promise<NextResponse>{
 let token:string|undefined;
 try{
  const host=canonicalTenantHostname(trustedHost),secret=deps.secret();
  if(!host||!sameOrigin(host,origin))return fail(403);
  if(!secretValid(secret)||typeof verifiedIp!=='string'||!verifiedIp||verifiedIp.length>64)return fail(503);
  const org=await deps.brandOrg(host);if(!org)return fail(403);
  const input=credentials(raw);if(!input)return fail(400,'INVALID_CREDENTIALS');
  const rate=await deps.consume(input.email,verifiedIp);
  if(rate==='limit'){const r=fail(429,'RATE_LIMITED');r.headers.set('Retry-After','900');return r;}
  if(rate!=='allow')return fail(503);
  const provider=await deps.signIn(input);
  if(provider.kind!=='ok')return fail(provider.kind==='invalid'?401:provider.kind==='mfa'?403:503,provider.kind==='mfa'?'MFA_REQUIRED':'AUTH_FAILED');
  token=provider.token;
  if(!tokenValid(token)){await discard(token,deps);return fail(503);}
  const i=await deps.verify(host,token);
  if(!identityValid(i,host,org,deps.now())||await deps.brandOrg(host)!==org){await discard(token,deps);return fail(403);}
  const remaining=i.expiresAt-deps.now();if(remaining<=0){await discard(token,deps);return fail(401);}
  const r=json({ok:true,authenticated:true,session:view(i)});
  r.cookies.set(TENANT_ACCESS_COOKIE,token,{...opts,maxAge:remaining});
  r.cookies.set(TENANT_BINDING_COOKIE,binding(secret,host,org,token),{...opts,maxAge:remaining});
  return r;
 }catch{if(token)await discard(token,deps);return fail(503);}
}
async function authenticate(host:string,cookies:Cookies,deps:TenantSessionDependencies):Promise<TenantIdentity|null>{
 const secret=deps.secret();
 if(!secretValid(secret)||!tokenValid(cookies.access)||!cookies.binding)return null;
 const org=await deps.brandOrg(host);if(!org||!matches(cookies.binding,binding(secret,host,org,cookies.access)))return null;
 const i=await deps.verify(host,cookies.access);
 return identityValid(i,host,org,deps.now())&&await deps.brandOrg(host)===org?i:null;
}
export async function readTenantSession(trustedHost:string,cookies:Cookies,deps:TenantSessionDependencies):Promise<NextResponse>{
 try{
  const host=canonicalTenantHostname(trustedHost);if(!host)return clear(fail(403));
  const i=await authenticate(host,cookies,deps);
  return i?json({ok:true,authenticated:true,session:view(i)}):clear(fail(401));
 }catch{return clear(fail(503));}
}
export async function logoutTenantSession(trustedHost:string,origin:unknown,cookies:Cookies,deps:TenantSessionDependencies):Promise<NextResponse>{
 const host=canonicalTenantHostname(trustedHost);
 if(!host||!sameOrigin(host,origin))return fail(403); // do not mutate cookies on CSRF
 try{
  if(!cookies.access&&!cookies.binding)return clear(json({ok:true,authenticated:false}));
  const i=await authenticate(host,cookies,deps);
  if(!i||!cookies.access||!await deps.revoke(i,cookies.access))return clear(fail(503,'REVOCATION_UNCONFIRMED'));
  return clear(json({ok:true,authenticated:false}));
 }catch{return clear(fail(503,'REVOCATION_UNCONFIRMED'));}
}
