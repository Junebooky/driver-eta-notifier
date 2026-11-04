import {NextRequest} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {newDeviceSecret,tokenHash} from '@/lib/driverDevices/tokens';
import {sealSharedReportToken,openSharedReportToken,extractSharedReportToken} from '@/lib/driverReports/sharedLinkSealing';
import {boundedBody,privateJson,sameOrigin} from '@/lib/driverReports/http';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const unavailable='공용 링크 보관 기능을 사용할 수 없습니다. 관리자에게 확인해 주세요.';

export async function GET(req:NextRequest){
 const auth=await requireHqAdmin(req);
 if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 관리자 로그인이 필요합니다.'},auth.statusCode);
 const r=await db.from('report_shared_links').select('issued_at,expires_at,revoked_at,sealed_token,token_hash').eq('org_id',auth.session.org).maybeSingle();
 if(r.error)return privateJson({ok:false,error:unavailable},503);
 const item=r.data;
 const active=Boolean(item&&!item.revoked_at&&Date.parse(item.expires_at)>Date.now());
 const token=active&&item?.sealed_token?openSharedReportToken(item.sealed_token,item.token_hash):null;
 return privateJson({
  ok:true,issuedAt:item?.issued_at||null,expiresAt:item?.expires_at||null,active,
  path:token?'/report#key='+token:null,
  needsRecovery:active&&!token
 });
}
export async function POST(req:NextRequest){
 const auth=await requireHqAdmin(req);
 if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 관리자 로그인이 필요합니다.'},auth.statusCode);
 if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
 try{
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(req,3000)));
  if(!['issue','revoke','remember'].includes(body.action))return privateJson({ok:false,error:'지원하지 않는 요청입니다.'},400);
  const token=body.action==='issue'?newDeviceSecret():body.action==='remember'?extractSharedReportToken(body.link||''):null;
  if(body.action==='remember'&&!token)return privateJson({ok:false,error:'기존 링크 주소를 확인해 주세요.'},400);
  const expiresAt=body.action==='issue'?new Date(Date.now()+180*86400000).toISOString():null;
  const result=await db.rpc('manage_report_shared_link_secure',{
   p_org:auth.session.org,p_actor:auth.session.userId,p_action:body.action,
   p_hash:token?tokenHash(token):null,p_expires:expiresAt,
   p_sealed:token?sealSharedReportToken(token):null
  });
  if(result.error){
   if(body.action==='remember')return privateJson({ok:false,error:'현재 사용 중인 링크와 일치하지 않습니다. 기존 발급 주소를 확인해 주세요.'},400);
   return privateJson({ok:false,error:unavailable},503);
  }
  return privateJson({ok:true,path:token?'/report#key='+token:null,expiresAt});
 }catch{return privateJson({ok:false,error:'링크 요청을 확인해 주세요.'},400);}
}
