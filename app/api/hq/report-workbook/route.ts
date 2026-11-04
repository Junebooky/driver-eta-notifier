import {NextRequest,NextResponse} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {check,currentWorkbook,registerWorkbook,drainReports,approveMonth} from '@/lib/driverReports/service';
import {workbookFromFile} from '@/utils/kakaoExcelWorkbook';
import {readWorkbook} from '@/lib/driverReports/storage';
import {boundedBody,UUID,privateJson,failure,sameOrigin} from '@/lib/driverReports/http';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=await requireHqAdmin(req);if(!a.ok||!a.session)return privateJson({ok:false},a.statusCode);
 try{
  const org=a.session.org,y=req.nextUrl.searchParams.get('year'),year=y?Number(y):undefined;
  if(year&&(!Number.isInteger(year)||year<2000||year>2099))throw new Error('연도를 확인해 주세요.');
  const w=await currentWorkbook(org,year),version=req.nextUrl.searchParams.get('version');
  if(version&&version!=='original'&&!UUID.test(version))throw new Error('버전을 확인해 주세요.');
  if(req.nextUrl.searchParams.get('download')==='1'){
   if(!w)throw new Error('장부가 없습니다.');let bytes=w.bytes;
   if(version){let q=db.from('report_workbook_versions').select('*').eq('org_id',org).eq('ledger_year',w.year!);q=version==='original'?q.eq('kind','original'):q.eq('id',version);const r=await q.single();check(r.error);bytes=await readWorkbook(r.data!);}
   return new NextResponse(Uint8Array.from(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(w.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  let q=db.from('report_workbook_versions').select('id,generation,kind,created_at,byte_size,object_path,ledger_year').eq('org_id',org).order('generation',{ascending:false}).limit(50);if(w?.year)q=q.eq('ledger_year',w.year);
  const versions=await q;check(versions.error);
  const years=await db.from('report_ledgers').select('year,filename,active_version').eq('org_id',org).order('year',{ascending:false});check(years.error);
  const jobs=await db.from('report_jobs').select('submission_id,attempts,next_attempt_at,lease_until,last_error,last_success_at,finished_at').eq('org_id',org).order('next_attempt_at',{ascending:false}).limit(200);check(jobs.error);
  const usage=await db.rpc('report_storage_usage',{p_org:org});check(usage.error);
  return privateJson({ok:true,workbook:w?{active_version:w.id,filename:w.filename,year:w.year}:null,versions:versions.data,ledgers:years.data,jobs:jobs.data,usage:usage.data,months:w?workbookFromFile(w.bytes).SheetNames.filter(n=>/^\d{1,2}월$/.test(n)):[]});
 }catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 const a=await requireHqAdmin(req);if(!a.ok||!a.session)return privateJson({ok:false},a.statusCode);if(!sameOrigin(req))return privateJson({ok:false},403);
 try{
  const s=a.session;
  if(req.headers.get('content-type')?.startsWith('application/json')){
   const b=JSON.parse(new TextDecoder().decode(await boundedBody(req,4096)));
   if(b.action==='activate'){
    if(!Number.isInteger(b.year)||b.year<2000||b.year>2099)throw new Error('연도를 확인해 주세요.');const r=await db.rpc('activate_report_ledger',{p_org:s.org,p_year:b.year,p_actor:s.userId});check(r.error);if(!r.data)throw new Error('장부가 없습니다.');
   }else if(b.action==='template'){
    if(!Number.isInteger(b.year)||!Number.isInteger(b.month)||typeof b.source!=='string'||!/^\d{1,2}월$/.test(b.source))throw new Error('승인할 양식을 확인해 주세요.');await approveMonth(s,b.year,b.month,b.source);
   }else if(b.action==='restore'&&UUID.test(b.version||'')&&UUID.test(b.expected||'')){
    const r=await db.rpc('restore_report_workbook',{p_org:s.org,p_actor:s.userId,p_target:b.version,p_expected:b.expected});check(r.error);if(!r.data)return privateJson({ok:false,error:'장부가 변경되었습니다.'},409);
   }else throw new Error('요청을 확인해 주세요.');
  }else{
   const name=decodeURIComponent(req.headers.get('x-workbook-name')||'');if(!/\.xlsx$/i.test(name)||name.length>200||/[\r\n/\\]/.test(name))throw new Error('Excel 파일 이름을 확인해 주세요.');await registerWorkbook(s,await boundedBody(req,12*1024*1024),name);
  }
  try{await drainReports(s);}catch{/* durable queue */}return privateJson({ok:true});
 }catch(e){return failure(e);}
}
