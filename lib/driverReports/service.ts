import {reportWorkbookYear} from '@/utils/reportWorkbookYear';
import {createHash} from 'node:crypto';
import {supabaseAdmin as db} from '@/lib/supabase/server';
import {appendKakaoExcelReport,workbookFromFile} from '@/utils/kakaoExcelWorkbook';
import {parseDriverReport,reportReply} from '@/utils/driverReportChat';
import type {CockpitAuthSession} from '@/lib/auth/serverAuth';
import type {DriverReportSubmission} from '@/types/driverReportChat';

export function nightEndHour(){const raw=process.env.REPORT_NIGHT_END_HOUR??'6';if(!/^(?:[0-9]|1[0-9]|2[01])$/.test(raw))throw new Error('심야 종료 설정을 확인해 주세요.');return Number(raw);}
function check(error:{message:string}|null) {if(error)throw new Error('보고 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
const bytesFromDb=(value:string)=>new Uint8Array(Buffer.from(value.replace(/^\\x/,''),'hex'));
const hex=(bytes:Uint8Array)=>'\\x'+Buffer.from(bytes).toString('hex');
export async function currentWorkbook(org:string) {
  const {data,error}=await db.from('report_workbooks').select('active_version,filename').eq('org_id',org).maybeSingle();check(error);
  if(!data)return null;
  const version=await db.from('report_workbook_versions').select('id,bytes,generation').eq('org_id',org).eq('id',data.active_version).single();check(version.error);
  return {...data,id:version.data!.id,bytes:bytesFromDb(version.data!.bytes),generation:version.data!.generation,year:reportWorkbookYear(bytesFromDb(version.data!.bytes),data.filename)};
}
export async function processReport(org:string,id:string,actor:string) {
  for(let attempt=0;attempt<12;attempt++) {
    const read=await db.from('report_submissions').select('*').eq('org_id',org).eq('id',id).single();check(read.error);
    const s=read.data as DriverReportSubmission;
    if(!['pending','error'].includes(s.excel_status))return;
    try {
      const workbook=await currentWorkbook(org);
      if(!workbook)throw new Error('HQ에서 회사 Excel 원본을 먼저 등록해 주세요.');
      if(workbook.year===null||Number(s.parsed.draft.date.slice(0,4))!==workbook.year)throw new Error('활성 장부 연도와 보고 연도를 확인해 주세요.');
      const result=appendKakaoExcelReport(workbook.bytes,s.parsed.draft);
      const commit=await db.rpc('commit_report_workbook',{p_org:org,p_actor:actor,p_expected:workbook.id,p_bytes:hex(result.bytes),p_filename:workbook.filename,p_submission:id,p_revision:s.revision,p_sheet:result.sheetName,p_row:result.rowNumber});check(commit.error);
      if(commit.data===true)return;
      // Another request committed first; read its bytes and append again, never overwrite.
    } catch(error) {
      const reason=error instanceof Error?error.message:'Excel 반영 오류';
      const failed=await db.rpc('fail_report',{p_org:org,p_id:id,p_revision:s.revision,p_reason:reason});check(failed.error);return;
    }
  }
  // Leave durable pending state for the HQ retry queue rather than losing the submission.
}
export async function submitReport(session:CockpitAuthSession,raw:string,requestKey:string) {
  if(session.role!=='driver'||!session.driverId)throw new Error('기사 계정이 필요합니다.');
  let year:number|null=null;try{year=(await currentWorkbook(session.org))?.year??null;}catch{/* Persist submission even if workbook lookup fails. */}
  const parsed=parseDriverReport(raw,session.driverName,new Date(),{workbookYear:year,nightEndHour:nightEndHour()});
  const fingerprint=createHash('sha256').update(raw.trim().replace(/\r/g,'')).digest('hex');
  const saved=await db.rpc('submit_report',{p_org:session.org,p_driver:session.driverId,p_request:requestKey,p_fingerprint:fingerprint,p_raw:raw,p_parsed:parsed,p_reply:reportReply(parsed)});
  if(saved.error?.code==='40001')throw new Error('같은 전송 번호로 내용이 변경되었습니다. 새 메시지로 보내 주세요.');
  check(saved.error);const result=saved.data as {id:string;duplicate:boolean};
  // Submission/messages are already committed; Excel failure must never report submission failure.
  try {await processReport(session.org,result.id,session.userId);}catch {/* HQ queue retains the pending submission. */}
  return result;
}
export async function registerWorkbook(session:CockpitAuthSession,bytes:Uint8Array,filename:string) {
  workbookFromFile(bytes);
  if(reportWorkbookYear(bytes,filename)===null)throw new Error('장부 연도를 확인할 수 없습니다. 파일명에 2026처럼 연도를 명시해 주세요.');
  const saved=await db.rpc('commit_report_workbook',{p_org:session.org,p_actor:session.userId,p_expected:null,p_bytes:hex(bytes),p_filename:filename});check(saved.error);
  if(!saved.data)throw new Error('Excel 원본이 이미 등록되어 있습니다.');
}
export async function drainReports(session:CockpitAuthSession) {
  const {data,error}=await db.from('report_submissions').select('id').eq('org_id',session.org).in('excel_status',['pending','error']).order('submitted_at').limit(20);check(error);
  for(const row of data||[])await processReport(session.org,row.id,session.userId);
  return data?.length||0;
}
export {check,bytesFromDb};
