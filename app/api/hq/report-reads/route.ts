import {NextRequest} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {boundedBody,privateJson,sameOrigin,UUID} from '@/lib/driverReports/http';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const auth=await requireHqAdmin(req);
 if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 권한이 필요합니다.'},auth.statusCode);
 const r=await db.rpc('unread_applied_reports',{p_org:auth.session.org,p_actor:auth.session.userId});
 if(r.error)return privateJson({ok:false,error:'새 보고 알림을 확인하지 못했습니다.'},503);
 return privateJson({ok:true,unreadIds:(r.data||[]).map((v:{submission_id:string})=>v.submission_id)});
}
export async function POST(req:NextRequest){
 const auth=await requireHqAdmin(req);
 if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 권한이 필요합니다.'},auth.statusCode);
 if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
 try{
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(req,800)));
  if(!UUID.test(body.submissionId||''))return privateJson({ok:false,error:'보고 번호를 확인해 주세요.'},400);
  const r=await db.rpc('mark_report_hq_seen',{
   p_org:auth.session.org,p_actor:auth.session.userId,p_id:body.submissionId
  });
  if(r.error)return privateJson({ok:false,error:'열람 상태를 저장하지 못했습니다.'},503);
  if(!r.data)return privateJson({ok:false,error:'보고를 찾지 못했습니다.'},404);
  return privateJson({ok:true});
 }catch{return privateJson({ok:false,error:'요청을 확인해 주세요.'},400);}
}
