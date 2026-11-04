import {NextRequest} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {check,drainReports,processReport} from '@/lib/driverReports/service';
import {parseDriverReport} from '@/utils/driverReportChat';
import {boundedBody,UUID,privateJson,failure,sameOrigin} from '@/lib/driverReports/http';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
 const auth=await requireHqAdmin(req);if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 권한이 필요합니다.'},auth.statusCode||403);
 const org=auth.session.org,driver=req.nextUrl.searchParams.get('driverId');
 if(driver&&!UUID.test(driver))return privateJson({ok:false,error:'기사를 확인해 주세요.'},400);
 try{
  let q=db.from('report_submissions').select('*').eq('org_id',org).order('submitted_at',{ascending:false}).limit(100);
  if(driver)q=q.eq('driver_id',driver);
  const result=await q;check(result.error);
  const ids=req.nextUrl.searchParams.get('submissionId');
  if(ids&&!UUID.test(ids))throw new Error('보고 번호를 확인해 주세요.');
  let messages:unknown[]=[];let audit:unknown[]=[];
  if(ids){
   const m=await db.from('report_messages').select('*').eq('org_id',org).eq('linked_submission_id',ids).order('seq').limit(100);check(m.error);messages=m.data||[];
   const a=await db.from('report_audit').select('*').eq('org_id',org).eq('submission_id',ids).order('created_at',{ascending:false}).limit(50);check(a.error);audit=a.data||[];
  }
  return privateJson({ok:true,submissions:result.data,messages,audit});
 }catch(error){return failure(error);}
}
export async function POST(req:NextRequest) {
 const auth=await requireHqAdmin(req);if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 권한이 필요합니다.'},auth.statusCode||403);
 if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
 try{
  const b=JSON.parse(new TextDecoder().decode(await boundedBody(req,90000))),s=auth.session;
  if(b.action==='drain')return privateJson({ok:true,processed:await drainReports(s)});
  if(!UUID.test(b.id||''))throw new Error('보고 번호를 확인해 주세요.');
  if(b.action==='review'){
   if(typeof b.correctedMessage!=='string'||!b.correctedMessage.trim()||b.correctedMessage.length>20000||!Number.isInteger(b.revision))throw new Error('확인할 내용을 입력해 주세요.');
   const parsed=parseDriverReport(b.correctedMessage);
   if(parsed.reviewReasons.length)throw new Error(parsed.reviewReasons.join(' '));
   const r=await db.rpc('review_report',{p_org:s.org,p_actor:s.userId,p_id:b.id,p_revision:b.revision,p_parsed:parsed,p_note:String(b.note||'확인 후 재처리합니다.').slice(0,500)});check(r.error);
   if(!r.data)return privateJson({ok:false,error:'다른 담당자가 변경했습니다. 새로고침해 주세요.'},409);
  }else if(b.action!=='retry')throw new Error('지원하지 않는 요청입니다.');
  await processReport(s.org,b.id,s.userId);
  return privateJson({ok:true});
 }catch(error){return failure(error);}
}
