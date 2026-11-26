import {createHmac} from 'node:crypto';
import {supabaseAdmin as db} from '../supabase/server';
import {createUserAuthClient} from './userAuthClient';
import {getAuthSecret} from './serverAuth';
import {verifyTenantAuthCandidate} from './tenantAuthCandidate.server';
import {tenantBrandCandidate} from '../taas/tenantBranding.server';
import {loginTenantSession,readTenantSession,logoutTenantSession,type TenantSessionDependencies} from './tenantSession';
const secret=()=>getAuthSecret()||process.env.SUPABASE_SERVICE_ROLE_KEY||null;
const deps:TenantSessionDependencies={
 secret,now:()=>Math.floor(Date.now()/1000),
 async brandOrg(host){return (await tenantBrandCandidate(host))?.orgId??null;},
 verify:verifyTenantAuthCandidate,
 async consume(email,ip){
  const key=secret();if(!key)return 'unavailable';
  // Same global email/IP throttle as the legacy login (not reset per tenant).
  const digest=(s:string)=>createHmac('sha256',key).update(s).digest('hex');
  const r=await db.rpc('consume_auth_login_attempt',{p_keys:['email:'+digest(email),'ip:'+digest(ip)]});
  return r.error?'unavailable':r.data===true?'allow':'limit';
 },
 async signIn(input){
  const client=createUserAuthClient();
  const result=await client.auth.signInWithPassword({email:input.email,password:input.password});
  if(result.error||!result.data.session)return {kind:'invalid'};
  let provider=result.data.session;
  const factor=result.data.user?.factors?.find(f=>f.status==='verified'&&f.factor_type==='totp');
  if(factor){
   if(!input.code){await client.auth.signOut({scope:'local'});return {kind:'mfa'};}
   const r=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:input.code});
   if(r.error||!r.data){await client.auth.signOut({scope:'local'});return {kind:'mfa'};}
   provider=r.data;
  }
  return {kind:'ok',token:provider.access_token};
 },
 async discard(token){await db.auth.admin.signOut(token,'local');},
 async revoke(i,token){
  // Existing immediate revocation table and current-provider-session signout.
  const r=await db.from('revoked_auth_sessions').upsert({session_id:i.sessionId,user_id:i.userId},{onConflict:'session_id'});
  if(r.error)return false;
  // Once app revocation committed, the existing active-session check denies
  // copied JWTs. Local signout also revokes provider refresh credentials.
  try{await db.auth.admin.signOut(token,'local');}catch{/* app revocation is already effective */}
  return true;
 },
};
// Not a public route. Brand and identity dependencies both remain hard-disabled.
export const loginTenantSessionCandidate=(host:string,ip:string,origin:unknown,raw:unknown)=>loginTenantSession(host,ip,origin,raw,deps);
export const readTenantSessionCandidate=(host:string,cookies:{access?:string;binding?:string})=>readTenantSession(host,cookies,deps);
export const logoutTenantSessionCandidate=(host:string,origin:unknown,cookies:{access?:string;binding?:string})=>logoutTenantSession(host,origin,cookies,deps);
