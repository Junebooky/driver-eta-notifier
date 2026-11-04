import {NextRequest,NextResponse} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {check,currentWorkbook,registerWorkbook,drainReports,bytesFromDb} from '@/lib/driverReports/service';
import {boundedBody,UUID,privateJson,failure,sameOrigin} from '@/lib/driverReports/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(req:NextRequest) {
 const auth=await requireHqAdmin(req);if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 권한이 필요합니다.'},auth.statusCode||403);
 try {
  const org=auth.session.org,version=req.nextUrl.searchParams.get('version');
  if(version&&version!=='original'&&!UUID.test(version))throw new Error('버전을 확인해 주세요.');
  if(req.nextUrl.searchParams.get('download')==='1'){
   const current=await currentWorkbook(org);if(!current)throw new Error('등록된 Excel이 없습니다.');
   let bytes=current.bytes;
   if(version){let q=db.from('report_workbook_versions').select('bytes').eq('org_id',org);q=version==='original'?q.eq('kind','original'):q.eq('id',version);const v=await q.single();check(v.error);bytes=bytesFromDb(v.data!.bytes);}
   return new NextResponse(Uint8Array.from(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(current.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  const registry=await db.from('report_workbooks').select('active_version,filename').eq('org_id',org).maybeSingle();check(registry.error);
  const versions=await db.from('report_workbook_versions').select('id,generation,kind,created_at').eq('org_id',org).order('generation',{ascending:false}).limit(50);check(versions.error);
  return privateJson({ok:true,workbook:registry.data,versions:versions.data});
 }catch(error){return failure(error);}
}
export async function POST(req:NextRequest) {
 const auth=await requireHqAdmin(req);if(!auth.ok||!auth.session)return privateJson({ok:false,error:'HQ 권한이 필요합니다.'},auth.statusCode||403);
 if(!sameOrigin(req))return privateJson({ok:false,error:'허용되지 않은 요청입니다.'},403);
 try{
  const s=auth.session;
  if(req.headers.get('content-type')?.startsWith('application/json')){
   const b=JSON.parse(new TextDecoder().decode(await boundedBody(req,2048)));
   if(b.action!=='restore'||!UUID.test(b.version||'')||!UUID.test(b.expected||''))throw new Error('복구할 버전을 확인해 주세요.');
   const r=await db.rpc('restore_report_workbook',{p_org:s.org,p_actor:s.userId,p_target:b.version,p_expected:b.expected});check(r.error);
   if(!r.data)return privateJson({ok:false,error:'작업본이 변경되었습니다. 새로고침해 주세요.'},409);
  }else{
   const filename=decodeURIComponent(req.headers.get('x-workbook-name')||'');
   if(!/\.xlsx$/i.test(filename)||filename.length>200||/[\r\n/\\]/.test(filename))throw new Error('Excel 파일 이름을 확인해 주세요.');
   await registerWorkbook(s,await boundedBody(req,12*1024*1024),filename);
  }
  // Partial queue failure does not undo a committed original/restore.
  try{await drainReports(s);}catch {/* durable queue is retriable from HQ */}
  return privateJson({ok:true});
 }catch(error){return failure(error);}
}
