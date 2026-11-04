import {NextRequest} from 'next/server';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {boundedBody,sameOrigin,privateJson} from '@/lib/driverReports/http';
import {devicePrefix,newDeviceSecret,tokenHash,validSecret} from '@/lib/driverDevices/tokens';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
 try{
  const b=JSON.parse(new TextDecoder().decode(await boundedBody(req,2048)));if(!validSecret(b.token))return privateJson({ok:false,error:'링크를 확인해 주세요.'},400);
  const rate=await db.rpc('allow_report_link_attempt',{p_bucket:tokenHash('report-invite:'+String(req.headers.get('x-forwarded-for')||'unknown'))});
  if(rate.error||rate.data!==true)return privateJson({ok:false,error:'잠시 후 다시 시도해 주세요.'},429);
  const previous=req.cookies.get('cockpit_session')?.value;
  const old=previous?.startsWith(devicePrefix)?previous.slice(devicePrefix.length):null;
  const secret=newDeviceSecret();const {data,error}=await db.rpc('replace_report_device',{p_hash:tokenHash(b.token),p_device_hash:tokenHash(secret),p_label:typeof b.label==='string'?b.label.slice(0,80):'기사 휴대전화',p_old_hash:old&&validSecret(old)?tokenHash(old):null});
  if(error||!data)return privateJson({ok:false,error:'사용됐거나 만료된 링크입니다. 회사에 새 링크를 요청해 주세요.'},403);
  const response=privateJson({ok:true});
  response.cookies.set('cockpit_session',devicePrefix+secret,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:30*86400});
  response.cookies.set('cockpit_refresh','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
  return response;
 }catch{return privateJson({ok:false,error:'연결하지 못했습니다. 다시 시도해 주세요.'},503);}
}
