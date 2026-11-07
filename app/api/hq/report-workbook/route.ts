import {NextRequest,NextResponse} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {check,currentWorkbook,registerWorkbook,replaceWorkbook,drainReports,approveMonth,processReport,nightEndHour} from '@/lib/driverReports/service';
import {workbookFromFile} from '@/utils/kakaoExcelWorkbook';
import {parseDriverReport} from '@/utils/driverReportChat';
import {isReportServiceType} from '@/utils/reportServiceTypes';
import {readWorkbook,storeWorkbook} from '@/lib/driverReports/storage';
import {readWorkbookGrid,patchWorkbookCell} from '@/utils/reportWorkbookGrid';
import {organizeManagedMonth} from '@/utils/reportWorkbookRowOrder';
import {refitWorkbookRouteColumns} from '@/utils/reportWorkbookOperations';
import {boundedBody,UUID,privateJson,failure,sameOrigin} from '@/lib/driverReports/http';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=await requireHqAdmin(req);if(!a.ok||!a.session)return privateJson({ok:false},a.statusCode);
 try{
  const org=a.session.org,y=req.nextUrl.searchParams.get('year'),year=y?Number(y):undefined;
  if(year&&(!Number.isInteger(year)||year<2000||year>2099))throw new Error('연도를 확인해 주세요.');
  const w=await currentWorkbook(org,year),version=req.nextUrl.searchParams.get('version');
  if(req.nextUrl.searchParams.get('view')==='1'){
   if(!w||!w.year)throw new Error('등록된 Excel 장부가 없습니다.');
   const book=workbookFromFile(w.bytes);
   const requested=req.nextUrl.searchParams.get('month');
   const months=book.SheetNames.filter(n=>/^(?:[1-9]|1[0-2])월$/.test(n));
   const todayMonth=new Intl.DateTimeFormat('ko-KR',{month:'numeric',timeZone:'Asia/Seoul'}).format(new Date()).replace(/[^0-9]/g,'')+'월';
   const month=requested|| (months.includes(todayMonth)?todayMonth:months.at(-1));
   if(!month)throw new Error('월별 Excel 시트가 없습니다.');
   const offset=Number(req.nextUrl.searchParams.get('offset')||'0');if(!Number.isInteger(offset)||offset<0||offset>25000)throw new Error('조회 위치를 확인해 주세요.');
   const focusText=req.nextUrl.searchParams.get('focusRow');
   const focusRow=focusText===null?undefined:Number(focusText);
   if(focusRow!==undefined&&(!/^\d{1,5}$/.test(focusText!)||!Number.isInteger(focusRow)||focusRow<2||focusRow>25000))throw new Error('이동할 Excel 행을 확인해 주세요.');
   return privateJson({ok:true,version:w.id,year:w.year,filename:w.filename,...readWorkbookGrid(w.bytes,month,300,offset,focusRow)});
  }
  if(version&&version!=='original'&&!UUID.test(version))throw new Error('버전을 확인해 주세요.');
  if(req.nextUrl.searchParams.get('download')==='1'){
   if(!w)throw new Error('장부가 없습니다.');let bytes=w.bytes;
   if(version){let q=db.from('report_workbook_versions').select('*').eq('org_id',org).eq('ledger_year',w.year!);q=version==='original'?q.eq('kind','original').order('generation',{ascending:false}).limit(1):q.eq('id',version);const r=await q.single();check(r.error);bytes=await readWorkbook(r.data!);}
   if(!version)bytes=refitWorkbookRouteColumns(bytes); // Only the latest download gets presentation widths.
   const downloadName=version?`${w.year}-excel-backup-${version==='original'?'original':version.slice(0,8)}.xlsx`:w.filename;
   return new NextResponse(Uint8Array.from(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
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
  let replacement:null|Awaited<ReturnType<typeof replaceWorkbook>>=null;
  if(req.headers.get('content-type')?.startsWith('application/json')){
   const b=JSON.parse(new TextDecoder().decode(await boundedBody(req,4096)));
   if(b.action==='sort_month'){
    if(!Number.isInteger(b.year)||!UUID.test(b.expectedVersion||'')||typeof b.month!=='string')throw new Error('정렬할 Excel 시트를 확인해 주세요.');
    const w=await currentWorkbook(s.org,b.year);
    if(!w||w.id!==b.expectedVersion)return privateJson({ok:false,error:'Excel 버전이 변경됐습니다. 새로고침해 주세요.'},409);
    const arranged=organizeManagedMonth(w.bytes,b.month,b.year,w.manifest||{});
    if(!arranged.changed){
     if(arranged.reason!=='이미 날짜순으로 정리돼 있습니다.')return privateJson({ok:false,error:arranged.reason||'안전하게 정렬할 수 없습니다.'},422);
     return privateJson({ok:true,unchanged:true,message:arranged.reason});
    }
    const saved=await db.rpc('commit_report_hq_reorder',{
     p_org:s.org,p_actor:s.userId,p_year:b.year,p_expected:w.id,p_storage:await storeWorkbook(s.org,arranged.bytes),
     p_sheet:b.month,p_moves:arranged.moves
    });check(saved.error);
    if(!saved.data)return privateJson({ok:false,error:'다른 관리자가 Excel을 변경했습니다. 다시 불러와 주세요.'},409);
    return privateJson({ok:true,moved:Object.keys(arranged.moves).length});
   }
   if(b.action==='edit_cell'){
    if(!Number.isInteger(b.year)||b.year<2000||b.year>2099||!UUID.test(b.expectedVersion||''))throw new Error('Excel 버전을 확인해 주세요.');
    if(typeof b.month!=='string'||typeof b.column!=='string'||!Number.isInteger(b.row)||typeof b.value!=='string')throw new Error('편집할 셀을 확인해 주세요.');
    const w=await currentWorkbook(s.org,b.year);
    if(!w||w.id!==b.expectedVersion)return privateJson({ok:false,error:'Excel이 다른 관리자에 의해 변경되었습니다. 다시 불러와 주세요.'},409);
    if(b.column==='A'&&Number(b.value.slice(0,4))!==w.year)throw new Error('장부와 같은 연도의 날짜만 입력해 주세요.');
    const edit=patchWorkbookCell(w.bytes,b.month,b.row,b.column,b.value);
    if(!edit.changed)return privateJson({ok:true,unchanged:true,version:w.id});
    const linked=Object.entries(w.manifest||{}).find(([,p])=>p.sheet===b.month&&p.row===b.row)?.[0];
    if(linked&&b.column==='H'&&!isReportServiceType(b.value))throw new Error('김포공항 샌딩 · 인천공항 샌딩 · 의전 중 선택해 주세요.');
    if(linked&&['F','B'].includes(b.column)){
     const record=await db.from('report_submissions').select('*').eq('org_id',s.org).eq('id',linked).single();check(record.error);
     const d=record.data.parsed.draft,time=b.column==='F'?b.value:d.time,plate=b.column==='B'?b.value:d.plate;
     if(!/^\d{2}:\d{2}~\d{2}:\d{2}$/.test(time))throw new Error('시간은 10:00~23:00 형식으로 입력해 주세요.');
     const corrected=`${d.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$1년 $2월 $3일')}\n수행담당 : ${d.driver}\n차량번호 : ${plate}\n고객명 : ${d.customer}\n시작 시간 : ${time.split('~')[0]}\n종료 시간 : ${time.split('~')[1]}\n운행일지\n${d.route.split(' - ').join(' → ')}`;
     const parsed=parseDriverReport(corrected,undefined,new Date(),{workbookYear:w.year,nightEndHour:nightEndHour()});parsed.draft={...parsed.draft,serviceType:d.serviceType,amount:d.amount,payment:d.payment,totalWithVat:d.totalWithVat};
     if(parsed.reviewReasons.length)throw new Error(parsed.reviewReasons.join(' '));
     const reviewed=await db.rpc('review_report',{p_org:s.org,p_actor:s.userId,p_id:linked,p_revision:record.data.revision,p_parsed:parsed,p_note:'Excel 셀 편집 · 차량 매핑/OT·심야 재계산'});check(reviewed.error);if(!reviewed.data)return privateJson({ok:false,error:'보고가 변경됐습니다. 다시 불러와 주세요.'},409);
     await processReport(s.org,linked,s.userId);
     const status=await db.from('report_submissions').select('excel_status,last_error').eq('org_id',s.org).eq('id',linked).single();check(status.error);
     if(status.data?.excel_status!=='applied')return privateJson({ok:true,pending:true,message:'수정 내용을 보관했습니다. Excel 반영은 아직 완료되지 않았습니다. HQ에서 재처리 상태를 확인해 주세요.'});
     return privateJson({ok:true});
    }

    const saved=await db.rpc('commit_report_hq_cell_edit',{
     p_org:s.org,p_actor:s.userId,p_year:w.year,p_expected:w.id,
     p_storage:await storeWorkbook(s.org,edit.bytes),p_sheet:b.month,
     p_row:b.row,p_column:b.column,p_before:edit.oldValue,p_after:edit.value
    });
    check(saved.error);
    if(!saved.data)return privateJson({ok:false,error:'Excel 버전이 변경됐습니다. 다시 불러온 뒤 수정해 주세요.'},409);
    return privateJson({ok:true});
   }
   if(b.action==='activate'){
    if(!Number.isInteger(b.year)||b.year<2000||b.year>2099)throw new Error('연도를 확인해 주세요.');const r=await db.rpc('activate_report_ledger',{p_org:s.org,p_year:b.year,p_actor:s.userId});check(r.error);if(!r.data)throw new Error('장부가 없습니다.');
   }else if(b.action==='template'){
    if(!Number.isInteger(b.year)||!Number.isInteger(b.month)||typeof b.source!=='string'||!/^\d{1,2}월$/.test(b.source))throw new Error('승인할 양식을 확인해 주세요.');await approveMonth(s,b.year,b.month,b.source);
   }else if(b.action==='restore'&&UUID.test(b.version||'')&&UUID.test(b.expected||'')){
    const r=await db.rpc('restore_report_workbook',{p_org:s.org,p_actor:s.userId,p_target:b.version,p_expected:b.expected});check(r.error);if(!r.data)return privateJson({ok:false,error:'장부가 변경되었습니다.'},409);
   }else throw new Error('요청을 확인해 주세요.');
  }else{
   const name=decodeURIComponent(req.headers.get('x-workbook-name')||'');
   if(!/\.xlsx$/i.test(name)||name.length>200||/[\r\n/\\]/.test(name))throw new Error('Excel 파일 이름을 확인해 주세요.');
   const replaceVersion=req.headers.get('x-workbook-replace-version');
   if(replaceVersion!==null){
    const year=Number(req.headers.get('x-workbook-replace-year'));
    if(!UUID.test(replaceVersion)||!Number.isInteger(year)||year<2000||year>2099)
     throw new Error('교체할 Excel의 현재 버전과 연도를 확인해 주세요.');
    replacement=await replaceWorkbook(s,await boundedBody(req,12*1024*1024),name,year,replaceVersion);
   }else await registerWorkbook(s,await boundedBody(req,12*1024*1024),name);
  }
  try{await drainReports(s);}catch{/* durable queue */}
  return privateJson({ok:true,...(replacement?{replacement}:{})});
 }catch(e){return failure(e);}
}
