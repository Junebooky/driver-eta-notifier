import {NextRequest} from 'next/server';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {tokenHash,validSecret} from '@/lib/driverDevices/tokens';
import {submitReport} from '@/lib/driverReports/service';
import type {CockpitAuthSession} from '@/lib/auth/serverAuth';
import {boundedBody,privateJson,sameOrigin,UUID} from '@/lib/driverReports/http';

export const dynamic='force-dynamic';
// Technical intake identity only. Never create a driver account with this UUID.
// The actual performer, if supplied, is extracted from the report text.
const SHARED_INTAKE_ID='a18a0000-0000-4000-8000-000000000001';

export async function POST(req:NextRequest){
 if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
 try{
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(req,24000)));
  if(!validSecret(body.token)||typeof body.message!=='string'||!body.message.trim()||
     body.message.length>20000||!UUID.test(body.requestKey||'')){
   return privateJson({ok:false,error:'제출 링크와 운행보고 내용을 확인해 주세요.'},400);
  }
  const secretHash=tokenHash(body.token);
  // Fixed per-link and per-network budgets, even for an otherwise valid credential.
  const forwarded=req.headers.get('x-forwarded-for')||'unknown';
  const ip=forwarded.split(',')[0].trim().slice(0,120);
  const [linkRate,networkRate]=await Promise.all([
   db.rpc('allow_report_link_attempt',{p_bucket:tokenHash('shared-link:'+secretHash)}),
   db.rpc('allow_report_link_attempt',{p_bucket:tokenHash('shared-network:'+ip)})
  ]);
  if(linkRate.error||networkRate.error){
   return privateJson({ok:false,error:'보고서 저장소가 준비되지 않았습니다. 회사에 문의해 주세요.'},503);
  }
  if(linkRate.data!==true||networkRate.data!==true){
   return privateJson({ok:false,error:'전송 요청이 많습니다. 잠시 후 다시 보내 주세요.'},429);
  }
  const link=await db.from('report_shared_links').select('org_id,expires_at,revoked_at').eq('token_hash',secretHash).maybeSingle();
  if(link.error)return privateJson({ok:false,error:'보고서 저장소가 준비되지 않았습니다.'},503);
  if(!link.data||link.data.revoked_at||Date.parse(link.data.expires_at)<=Date.now()){
   return privateJson({ok:false,error:'링크가 만료되거나 폐기되었습니다. 회사에 새 링크를 요청해 주세요.'},403);
  }
  // A shared credential authorizes append-only reporting, never history reads or HQ access.
  // The existing ingest/Excel queue and parser remain the single processing pipeline.
  const session:CockpitAuthSession={
   userId:SHARED_INTAKE_ID,driverId:SHARED_INTAKE_ID,role:'driver',
   org:'vip_limousine_korea',issuedAt:0,expiresAt:0
  };
  if(link.data.org_id!==session.org)return privateJson({ok:false,error:'사용할 수 없는 링크입니다.'},403);
  const submitted=await submitReport(session,body.message.trim(),body.requestKey);
  return privateJson({ok:true,received:true,duplicate:submitted.duplicate},201);
 }catch(e){
  return privateJson({ok:false,error:e instanceof Error?e.message:'보고를 접수하지 못했습니다.'},400);
 }
}
