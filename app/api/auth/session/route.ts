import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Session } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/server';
import { createUserAuthClient } from '@/lib/auth/userAuthClient';
import { parseAndVerifyToken, signCockpitSession, extractAuthToken, isDevAuthAllowed, DEV_ACCOUNTS, type DevAccountKey, getAuthSecret } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', path:'/', sameSite:'lax' as const });
function clearCookies(response: NextResponse) {
  for (const name of ['cockpit_session','cockpit_refresh']) response.cookies.set(name,'',{...cookieOptions(),maxAge:0});
  response.headers.set('Cache-Control','no-store');
  return response;
}
async function sessionResponse(provider: Session) {
  const session = await parseAndVerifyToken(provider.access_token);
  if (!session) {
    await supabaseAdmin.auth.admin.signOut(provider.access_token,'local').catch(()=>{});
    return clearCookies(NextResponse.json({ok:false,error:'접근 권한 또는 기사 계정 연결을 확인해 주세요.'},{status:403}));
  }
  const response = NextResponse.json({ok:true,authenticated:true,session,isDevAllowed:false});
  const remaining = Math.max(1,session.expiresAt-Math.floor(Date.now()/1000));
  response.cookies.set('cockpit_session',provider.access_token,{...cookieOptions(),maxAge:remaining});
  response.cookies.set('cockpit_refresh',provider.refresh_token,{...cookieOptions(),maxAge:60*60*24*7});
  response.headers.set('Cache-Control','no-store');
  return response;
}
export async function GET(req: NextRequest) {
  try {
    const token = extractAuthToken(req);
    const session = token ? await parseAndVerifyToken(token) : null;
    if (session && session.expiresAt > Math.floor(Date.now()/1000)+300) return NextResponse.json({ok:true,authenticated:true,session,isDevAllowed:isDevAuthAllowed()},{headers:{'Cache-Control':'no-store'}});
    const refresh = req.cookies.get('cockpit_refresh')?.value;
    if (refresh && (!token || !token.startsWith('cockpit_s1.'))) {
      const {data,error}=await createUserAuthClient().auth.refreshSession({refresh_token:refresh});
      if (!error && data.session) return sessionResponse(data.session);
    }
    if (isDevAuthAllowed() && !token) {
      const response=NextResponse.json({ok:true,authenticated:true,session:DEV_ACCOUNTS.admin,isDevAllowed:true});
      response.cookies.set('cockpit_session',signCockpitSession(DEV_ACCOUNTS.admin),{...cookieOptions(),maxAge:86400});
      return response;
    }
    return clearCookies(NextResponse.json({ok:false,authenticated:false,isDevAllowed:false,error:'다시 로그인해 주세요.'},{status:401}));
  } catch { return clearCookies(NextResponse.json({ok:false,authenticated:false,error:'로그인 상태를 확인할 수 없습니다.'},{status:503})); }
}
export async function POST(req: NextRequest) {
  try {
    const body=await req.json();
    // Cookies cannot authorize cross-site credential changes, refreshes or logout.
    const origin=req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ok:false,error:'허용되지 않은 요청입니다.'},{status:403});
    if (body.action==='dev_switch' || body.accountKey) {
      if (!isDevAuthAllowed()) return NextResponse.json({ok:false,error:'개발 계정 전환은 로컬에서만 사용할 수 있습니다.'},{status:403});
      const key=(body.target||body.accountKey) as DevAccountKey;
      if (!Object.hasOwn(DEV_ACCOUNTS,key)) return NextResponse.json({ok:false,error:'계정을 확인해 주세요.'},{status:400});
      const response=NextResponse.json({ok:true,authenticated:true,session:DEV_ACCOUNTS[key],isDevAllowed:true});
      response.cookies.set('cockpit_session',signCockpitSession(DEV_ACCOUNTS[key]),{...cookieOptions(),maxAge:86400});
      return response;
    }
    if (body.action==='logout') {
      const token=extractAuthToken(req);
      const session=token ? await parseAndVerifyToken(token) : null;
      if (token && !session) return clearCookies(NextResponse.json({ok:false,error:'세션이 만료되었거나 서버 로그아웃을 확인하지 못했습니다. 다시 로그인해 주세요.'},{status:503}));
      if (session?.sessionId) {
        // Immediate local revocation also denies a copied access token before its natural expiry.
        const {error}=await supabaseAdmin.from('revoked_auth_sessions').upsert({session_id:session.sessionId,user_id:session.userId},{onConflict:'session_id'});
        if (error) return clearCookies(NextResponse.json({ok:false,error:'서버 로그아웃을 확인하지 못했습니다.'},{status:503}));
        await supabaseAdmin.auth.admin.signOut(token!,'local');
      }
      return clearCookies(NextResponse.json({ok:true,authenticated:false}));
    }
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email.includes('@') || body.email.length>254 || !body.password || body.password.length>1024) {
      return NextResponse.json({ok:false,code:'PERSONAL_AUTH_REQUIRED',error:'개인 계정 이메일과 비밀번호로 로그인해 주세요. 공용 PIN은 사용할 수 없습니다.'},{status:400});
    }
    const secret=getAuthSecret() || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return NextResponse.json({ok:false,error:'인증 서비스가 설정되지 않았습니다.'},{status:503});
    const digest=(s:string)=>createHmac('sha256',secret).update(s).digest('hex');
    const email=body.email.trim().toLowerCase();
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rate=await supabaseAdmin.rpc('consume_auth_login_attempt',{p_keys:[`email:${digest(email)}`,`ip:${digest(ip)}`]});
    if (rate.error) return NextResponse.json({ok:false,error:'인증 보호 기능을 사용할 수 없습니다.'},{status:503});
    if (rate.data!==true) return NextResponse.json({ok:false,error:'로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'},{status:429,headers:{'Retry-After':'900'}});
    const client=createUserAuthClient();
    const result=await client.auth.signInWithPassword({email,password:body.password});
    if (result.error || !result.data.session) return NextResponse.json({ok:false,error:'이메일과 비밀번호를 확인해 주세요.'},{status:401});
    let provider=result.data.session;
    const factor=result.data.user?.factors?.find(f=>f.status==='verified' && f.factor_type==='totp');
    if (factor) {
      if (typeof body.code!=='string' || !/^\d{6}$/.test(body.code)) {
        await client.auth.signOut({scope:'local'});
        return NextResponse.json({ok:false,code:'MFA_REQUIRED',error:'인증 앱의 6자리 번호를 입력해 주세요.'},{status:403});
      }
      const verified=await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:body.code});
      if (verified.error || !verified.data) {
        await client.auth.signOut({scope:'local'});
        return NextResponse.json({ok:false,error:'인증 번호를 확인해 주세요.'},{status:403});
      }
      provider=verified.data;
    }
    return sessionResponse(provider);
  } catch { return NextResponse.json({ok:false,error:'로그인 서비스에 연결하지 못했습니다.'},{status:503}); }
}
