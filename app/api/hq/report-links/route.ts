import {NextRequest} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {newDeviceSecret,tokenHash} from '@/lib/driverDevices/tokens';
import {boundedBody,privateJson,sameOrigin} from '@/lib/driverReports/http';

export const dynamic='force-dynamic';
const unavailable='공유 보고 링크용 DB가 준비되지 않았습니다. 격리 테스트 DB의 신규 마이그레이션을 확인해 주세요.';

export async function GET(req:NextRequest){
 const auth=await requireHqAdmin(req);
 if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 관리자 로그인이 필요합니다.'},auth.statusCode);
 const r=await db.from('report_shared_links').select('issued_at,expires_at,revoked_at').eq('org_id',auth.session.org).maybeSingle();
 if(r.error)return privateJson({ok:false,error:unavailable},503);
 const item=r.data;
 return privateJson({
  ok:true,issuedAt:item?.issued_at||null,expiresAt:item?.expires_at||null,
  active:Boolean(item&&!item.revoked_at&&Date.parse(item.expires_at)>Date.now())
 });
}

export async function POST(req:NextRequest){
 const auth=await requireHqAdmin(req);
 if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 관리자 로그인이 필요합니다.'},auth.statusCode);
 if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
 try{
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(req,2048)));
  if(body.action!=='issue'&&body.action!=='revoke')return privateJson({ok:false,error:'지원하지 않는 요청입니다.'},400);
  const token=body.action==='issue'?newDeviceSecret():null;
  const expiresAt=token?new Date(Date.now()+180*86400000).toISOString():null;
  const result=await db.rpc('manage_report_shared_link',{
   p_org:auth.session.org,p_actor:auth.session.userId,p_action:body.action,
   p_hash:token?tokenHash(token):null,p_expires:expiresAt
  });
  if(result.error)return privateJson({ok:false,error:unavailable},503);
  // The secret is returned to HQ only at issuance; it is never stored in plaintext.
  return privateJson({ok:true,path:token?'/report#key='+token:null,expiresAt});
 }catch{return privateJson({ok:false,error:'링크 발급 요청을 확인해 주세요.'},400);}
}
