import {reportWorkbookYear} from '@/utils/reportWorkbookYear';
import {createHash} from 'node:crypto';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {appendKakaoExcelReport,workbookFromFile} from '@/utils/kakaoExcelWorkbook';
import {amendReportRow,removeReportRow,addApprovedMonth,ensureReportMonth} from '@/utils/reportWorkbookOperations';
import {organizeManagedMonth} from '@/utils/reportWorkbookRowOrder';
import {parseDriverReport,reportReply} from '@/utils/driverReportChat';
import {validateReportInput} from '@/utils/reportSubmissionValidation';
import {isReportServiceType,type ReportServiceType} from '@/utils/reportServiceTypes';
import {readWorkbook,storeWorkbook} from './storage';
import type {CockpitAuthSession} from '@/lib/auth/serverAuth';
import type {DriverReportSubmission} from '@/types/driverReportChat';
export function nightEndHour(){const raw=process.env.REPORT_NIGHT_END_HOUR??'6';if(!/^(?:[0-9]|1[0-9]|2[01])$/.test(raw))throw new Error('심야 종료 설정을 확인해 주세요.');return Number(raw);}
function check(error:{message:string;code?:string}|null){
 if(!error)return;
 if(['42P01','PGRST202','PGRST205'].includes(error.code||''))throw new Error('운행보고 데이터베이스가 준비되지 않았습니다. cockpit 스키마의 보고서 마이그레이션 적용 상태를 확인해 주세요.');
 throw new Error('보고 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}
const bytesFromDb=(value:string)=>new Uint8Array(Buffer.from(value.replace(/^\\x/,''),'hex'));
export async function currentWorkbook(org:string,year?:number){
 const registry=year?await db.from('report_ledgers').select('active_version,filename').eq('org_id',org).eq('year',year).maybeSingle():await db.from('report_workbooks').select('active_version,filename').eq('org_id',org).maybeSingle();check(registry.error);
 if(!registry.data)return null;
 const version=await db.from('report_workbook_versions').select('*').eq('org_id',org).eq('id',registry.data.active_version).single();check(version.error);
 const bytes=await readWorkbook(version.data),resolvedYear=version.data.ledger_year??reportWorkbookYear(bytes,registry.data.filename);
 if(resolvedYear&&!version.data.ledger_year){const b=await db.rpc('bind_legacy_report_ledger',{p_org:org,p_year:resolvedYear,p_expected:version.data.id});check(b.error);}
 return {...registry.data,id:version.data.id,bytes,generation:version.data.generation,year:resolvedYear as number|null,manifest:version.data.manifest as Record<string,{sheet:string;row:number}>};
}
export async function processReport(org:string,id:string,actor:string,lease?:string){
 if(!lease){await runReportWorker(org,1,id);return;}
 try{
  for(let attempt=0;attempt<12;attempt++){
   const ownership=await db.from('report_jobs').select('lease_token,lease_until').eq('org_id',org).eq('submission_id',id).single();check(ownership.error);
   if(ownership.data?.lease_token!==lease||Date.parse(ownership.data.lease_until)<=Date.now())return;
   const r=await db.from('report_submissions').select('*').eq('org_id',org).eq('id',id).single();check(r.error);const s=r.data as DriverReportSubmission & {ledger_year:number|null};
   if(!['pending','error'].includes(s.excel_status))return;
   const targetYear=Number(s.parsed.draft.date.slice(0,4));let target=await currentWorkbook(org,targetYear);
   if(!target){await currentWorkbook(org);target=await currentWorkbook(org,targetYear);} // Bind a verified legacy annual ledger once.
   if(!target||target.year!==targetYear)throw new Error('해당 연도 장부를 HQ에서 등록해 주세요.');
   let bytes=target.bytes;
   const month=Number(s.parsed.draft.date.slice(5,7));
   if(!workbookFromFile(bytes).Sheets[month+'월']){
    // Use an HQ-approved source when it exists; otherwise clone the most recent
    // earlier monthly sheet as an EMPTY template (e.g. 10월 -> 11월).
    // The cloned month and the new record commit atomically with the CAS version.
    const t=await db.from('report_month_templates').select('source_month').eq('org_id',org).eq('year',targetYear).eq('month',month).maybeSingle();check(t.error);
    bytes=ensureReportMonth(bytes,month,t.data?.source_month??undefined).bytes;
   }
   const plans:{year:number;expected:string;storage:Awaited<ReturnType<typeof storeWorkbook>>}[]=[];
   let result;
   if(s.applied_version&&s.ledger_year){
    const source=s.ledger_year===targetYear?target:await currentWorkbook(org,s.ledger_year);
    const location=source?.manifest[id];if(!source||!location)throw new Error('이전 반영 위치를 확인해 주세요.');
    if(source.year===targetYear)result=amendReportRow(bytes,location.sheet,location.row,s.parsed.draft);
    else{plans.push({year:s.ledger_year,expected:source.id,storage:await storeWorkbook(org,removeReportRow(source.bytes,location.sheet,location.row))});result=appendKakaoExcelReport(bytes,s.parsed.draft);}
   }else result=appendKakaoExcelReport(bytes,s.parsed.draft);
   // Only auto-appended submissions are re-ordered. Existing historic workbook
   // rows, formulas and unrelated tabs are never moved.
   const normalized=!s.applied_version?organizeManagedMonth(result.bytes,result.sheetName,targetYear,target.manifest||{},
    {row:result.rowNumber,date:s.parsed.draft.date}):null;
   const moved=normalized?.changed?normalized.moves:{};
   if(normalized?.changed)result={...result,bytes:normalized.bytes,rowNumber:normalized.rowNumber};
   plans.push({year:targetYear,expected:target.id,storage:await storeWorkbook(org,result.bytes),
    ...(Object.keys(moved).length?{moves:moved}:{})});
   const commit=await db.rpc('commit_report_plan',{p_org:org,p_id:id,p_revision:s.revision,p_lease:lease,p_actor:actor,p_plans:plans,p_sheet:result.sheetName,p_row:result.rowNumber});check(commit.error);if(commit.data===true)return;
  }
  throw new Error('동시 변경이 많아 다시 시도합니다.');
 }catch(error){const f=await db.rpc('finish_report_failure',{p_org:org,p_id:id,p_lease:lease,p_reason:error instanceof Error?error.message:'Excel 반영 오류'});check(f.error);}
}
export async function runReportWorker(org?:string,limit=15,id?:string){
 const claim=await db.rpc('claim_report_jobs',{p_limit:limit,p_org:org||null,p_id:id||null});check(claim.error);
 for(const job of claim.data||[])await processReport(job.org_id,job.submission_id,'00000000-0000-4000-8000-000000000001',job.lease_token);
 return claim.data?.length||0;
}
export async function activeLedgerYear(org:string){
 const registry=await db.from('report_workbooks').select('active_version').eq('org_id',org).maybeSingle();check(registry.error);if(!registry.data)return null;
 const version=await db.from('report_workbook_versions').select('ledger_year').eq('org_id',org).eq('id',registry.data.active_version).single();check(version.error);
 return version.data?.ledger_year??(await currentWorkbook(org))?.year??null;
}
export async function submitReport(session:CockpitAuthSession,raw:string,requestKey:string,serviceType?:ReportServiceType){
 if(session.role!=='driver'||!session.driverId)throw new Error('기사 계정이 필요합니다.');
 const gate=validateReportInput(raw);
 if(!gate.accepted)return {accepted:false as const,needsTemplate:true as const,reply:gate.reply,missing:gate.missing,duplicate:false};
 if(!isReportServiceType(serviceType))return {accepted:false as const,needsServiceType:true as const,reply:'운행 유형을 먼저 선택해 주세요.\n김포공항 샌딩 · 인천공항 샌딩 · 의전 중 하나를 눌러주세요.',duplicate:false};
 let year:number|null=null;try{year=await activeLedgerYear(session.org);}catch{/* Submission remains durable. */}
 const parsed=parseDriverReport(raw,session.driverName,new Date(),{workbookYear:year,nightEndHour:nightEndHour()});
 parsed.draft.serviceType=serviceType;
 // Shared public intake deduplicates by requestKey, not by report body: two people may submit identical reports.
 const fingerprint=createHash('sha256').update(session.userId==='a18a0000-0000-4000-8000-000000000001' ? 'shared|'+requestKey : (parsed.draft.date||'')+'|'+serviceType+'|'+raw.trim().replace(/\r/g,'')).digest('hex');
 const saved=await db.rpc('submit_report',{p_org:session.org,p_driver:session.driverId,p_request:requestKey,p_fingerprint:fingerprint,p_raw:raw,p_parsed:parsed,p_reply:reportReply(parsed)});
 if(saved.error?.code==='40001')throw new Error('같은 전송 번호로 내용이 변경되었습니다. 새 메시지로 보내 주세요.');check(saved.error);
 const result=saved.data as {id:string;duplicate:boolean};
 try{await runReportWorker(session.org,1,result.id);}catch{/* Cron resumes the durable queue. */}
 return {...result,accepted:true as const,needsTemplate:false as const,reply:result.duplicate?'이미 접수된 운행보고입니다. 감사합니다.':reportReply(parsed)};

}
export async function registerWorkbook(session:CockpitAuthSession,bytes:Uint8Array,filename:string){
 workbookFromFile(bytes);const year=reportWorkbookYear(bytes,filename);if(year===null)throw new Error('파일명과 날짜의 연도가 다르거나 혼합되어 있습니다. 장부를 확인해 주세요.');
 const saved=await db.rpc('register_report_ledger',{p_org:session.org,p_year:year,p_actor:session.userId,p_filename:filename,p_storage:await storeWorkbook(session.org,bytes)});check(saved.error);
}
export async function approveMonth(session:CockpitAuthSession,year:number,month:number,source:string){
 const w=await currentWorkbook(session.org,year);if(!w)throw new Error('해당 장부가 없습니다.');
 const bytes=addApprovedMonth(w.bytes,source,month);const r=await db.rpc('commit_report_template',{p_org:session.org,p_year:year,p_month:month,p_source:source,p_actor:session.userId,p_expected:w.id,p_storage:await storeWorkbook(session.org,bytes)});check(r.error);if(!r.data)throw new Error('장부가 변경되었습니다. 새로고침해 주세요.');
 await runReportWorker(session.org);
}
export async function drainReports(session:CockpitAuthSession){return runReportWorker(session.org,20);}
export {check,bytesFromDb};
