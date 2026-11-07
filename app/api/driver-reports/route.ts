import {tokenHash} from '@/lib/driverDevices/tokens';
import {NextRequest} from 'next/server';
import {verifyServerAuth} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {check,submitReport} from '@/lib/driverReports/service';
import {isReportServiceType} from '@/utils/reportServiceTypes';
import {boundedBody,UUID,privateJson,failure,sameOrigin} from '@/lib/driverReports/http';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  const auth=await verifyServerAuth(req,'driver');
  if(!auth.ok||!auth.session?.driverId)return privateJson({ok:false,error:'기사 로그인이 필요합니다.'},auth.ok?403:auth.statusCode);
  const s=auth.session,driver=req.nextUrl.searchParams.get('driverId'),before=req.nextUrl.searchParams.get('before');
  if(driver&&driver!==s.driverId)return privateJson({ok:false,error:'본인 대화만 볼 수 있습니다.'},403);
  if(before&&!/^\d{1,15}$/.test(before))return privateJson({ok:false,error:'대화 위치가 올바르지 않습니다.'},400);
  try {
    let q=db.from('report_messages').select('*').eq('org_id',s.org).eq('driver_id',s.driverId!).order('seq',{ascending:false}).limit(50);
    if(before)q=q.lt('seq',Number(before));
    const {data,error}=await q;check(error);
    return privateJson({ok:true,messages:(data||[]).reverse(),hasMore:data?.length===50});
  }catch(error){return failure(error);}
}
export async function POST(req:NextRequest) {
  const auth=await verifyServerAuth(req,'driver');
  if(!auth.ok||!auth.session?.driverId)return privateJson({ok:false,error:'기사 로그인이 필요합니다.'},auth.ok?403:auth.statusCode);
  if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
  try {
    const rate=await db.rpc('allow_report_link_attempt',{p_bucket:tokenHash('report-submit:'+auth.session.org+':'+auth.session.driverId)});
    if(rate.error)return privateJson({ok:false,error:'요청 보호 상태를 확인하지 못했습니다.'},503);
    if(rate.data!==true)return privateJson({ok:false,error:'요청이 많습니다. 잠시 후 다시 보내 주세요.'},429);
    const body=JSON.parse(new TextDecoder().decode(await boundedBody(req,90000)));
    if(body.driverId&&body.driverId!==auth.session.driverId)return privateJson({ok:false,error:'기사 계정이 변경되었습니다. 대화방을 다시 열어 주세요.'},403);
    if(typeof body.message!=='string'||!body.message.trim()||body.message.length>20000||!UUID.test(body.requestKey||''))throw new Error('운행보고와 전송 번호를 확인해 주세요.');
    const result=await submitReport(auth.session,body.message.trim(),body.requestKey,isReportServiceType(body.serviceType)?body.serviceType:undefined);
    return privateJson({ok:true,...result},result.accepted?201:200);
  }catch(error){return failure(error);}
}
