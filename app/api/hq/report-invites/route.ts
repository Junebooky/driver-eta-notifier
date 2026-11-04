import {NextRequest} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {boundedBody,sameOrigin,UUID,privateJson,failure} from '@/lib/driverReports/http';
import {newDeviceSecret,tokenHash} from '@/lib/driverDevices/tokens';
export async function GET(req:NextRequest){
 const auth=await requireHqAdmin(req);if(!auth.ok||!auth.session)return privateJson({ok:false},auth.statusCode);
 try{
  const id=req.nextUrl.searchParams.get('driverId');if(!id||!UUID.test(id))throw new Error('기사 UUID를 확인해 주세요.');
  const scope=await db.rpc('report_driver_scope',{p_org:auth.session.org,p_driver:id});if(scope.error)return privateJson({ok:false,error:['42P01','PGRST202','PGRST205'].includes(scope.error.code)?'운행보고 데이터베이스가 준비되지 않았습니다. 별도 테스트 DB 마이그레이션을 확인해 주세요.':'기사 연결 상태를 조회하지 못했습니다.'},503);
  if(scope.data!==true)return privateJson({ok:false,error:'현재 조직에 등록된 기사 UUID를 확인해 주세요.'},404);
  const active=await db.rpc('report_driver_active',{p_org:auth.session.org,p_driver:id});
  const d=await db.from('report_driver_devices').select('id,label,created_at,last_seen_at,expires_at,absolute_expires_at,revoked_at').eq('org_id',auth.session.org).eq('driver_id',id).order('created_at',{ascending:false}).limit(50);
  const i=await db.from('report_driver_invites').select('id,created_at,expires_at,used_at,revoked_at').eq('org_id',auth.session.org).eq('driver_id',id).order('created_at',{ascending:false}).limit(10);
  if(d.error||i.error||active.error)throw new Error('초대 상태를 조회하지 못했습니다.');
  const links=await db.rpc('report_auth_link_state',{p_driver:id});
  return privateJson({ok:true,authLinks:links.data?.count??null,eligible:active.data===true,devices:d.data,invites:i.data});
 }catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 const auth=await requireHqAdmin(req);if(!auth.ok||!auth.session)return privateJson({ok:false},auth.statusCode);
 if(!sameOrigin(req))return privateJson({ok:false},403);
 try{
  const b=JSON.parse(new TextDecoder().decode(await boundedBody(req,2048))),s=auth.session;if(!UUID.test(b.driverId||''))throw new Error('실제 기사 UUID를 선택해 주세요.');
  const scope=await db.rpc('report_driver_scope',{p_org:s.org,p_driver:b.driverId});if(scope.error)return privateJson({ok:false,error:['42P01','PGRST202','PGRST205'].includes(scope.error.code)?'운행보고 데이터베이스가 준비되지 않았습니다. 별도 테스트 DB 마이그레이션을 확인해 주세요.':'기사 연결 상태를 조회하지 못했습니다.'},503);
  if(scope.data!==true)return privateJson({ok:false,error:'현재 조직에 등록된 기사 UUID를 확인해 주세요.'},404);
  if(b.action==='revoke'){
   if(b.deviceId&&!UUID.test(b.deviceId))throw new Error('기기를 확인해 주세요.');
   const r=await db.rpc('revoke_report_devices',{p_org:s.org,p_driver:b.driverId,p_actor:s.userId,p_device:b.deviceId||null});if(r.error)throw new Error('철회하지 못했습니다.');return privateJson({ok:true});
  }
  if(b.action!=='issue')throw new Error('요청을 확인해 주세요.');
  const secret=newDeviceSecret();const r=await db.rpc('issue_report_invite',{p_org:s.org,p_driver:b.driverId,p_actor:s.userId,p_hash:tokenHash(secret)});
  if(r.error)throw new Error('비활성·미연결 기사이거나 발급 권한이 없습니다.');
  // Fragment never reaches HTTP access logs or Referer. Value is returned only once to HQ.
  return privateJson({ok:true,path:'/driver/connect#invite='+secret,expiresIn:900});
 }catch(e){return failure(e);}
}
