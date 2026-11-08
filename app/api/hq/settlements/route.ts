import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  SETTLEMENT_ORG, validScheduleId, loadSettlementSource, validateSettlementContract,
  calculateSettlement, exportIssuedClientCsv,
  type LedgerDocument, type LedgerAction, type SettlementTotals,
} from '@/lib/settlement/serverLedger';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'no-store, private' };
const fail = (message: string, status: number) =>
  NextResponse.json({ ok:false, error:message },{status,headers:HEADERS});

function dbError(error: unknown) {
  const msg = error && typeof error === 'object' && 'message' in error
    ? String((error as {message:unknown}).message) : '';
  if (/VERSION_CONFLICT|SOURCE_CHANGED|LOCKED|NOT_APPROVABLE|NOT_ISSUABLE|UNVERIFIED/i.test(msg))
    return fail('정산 근거 또는 상태가 변경되었습니다. 새로고침 후 다시 검토해 주세요.',409);
  if (/NOT_FOUND|NOT_PREPARED/i.test(msg)) return fail('정산 기록을 찾지 못했습니다.',404);
  return fail('정산 서버 저장에 실패했습니다. 운영 DB 마이그레이션 및 권한을 확인해 주세요.',503);
}

/**
 * Authenticated HQ-only endpoint. Never accept client-provided source snapshots,
 * approved expenses, totals or claimed approval identity.
 */
export async function GET(req: NextRequest) {
  const auth=await requireHqAdmin(req);
  if(!auth.ok || !auth.session) return fail(auth.error || '권한이 없습니다.',auth.statusCode);
  try{
    const downloadId=new URL(req.url).searchParams.get('download');
    if(downloadId){
      if(!validScheduleId(downloadId))return fail('정산 문서 ID가 올바르지 않습니다.',400);
      const {data,error}=await supabaseAdmin.from('settlement_documents').select('*')
        .eq('id',downloadId).eq('organization_id',SETTLEMENT_ORG).maybeSingle();
      if(error || !data)return fail('서버 정산서를 찾을 수 없습니다.',404);
      const doc=data as LedgerDocument;
      if(doc.status!=='issued')return fail('최종 발행 승인이 완료된 정산서만 출력할 수 있습니다.',403);
      const {hash}=await loadSettlementSource(doc.schedule_id);
      if(hash!==doc.source_hash)return fail('발행 후 운영 근거가 바뀌어 재검토가 필요합니다.',409);
      return new Response(exportIssuedClientCsv(doc),{
        headers:{...HEADERS,'Content-Type':'text/csv; charset=utf-8',
          'Content-Disposition':'attachment; filename="settlement-'+doc.id+'.csv"',
          'X-Content-Type-Options':'nosniff'},
      });
    }
    const [docs,schedules]=await Promise.all([
      supabaseAdmin.from('settlement_documents').select('*')
        .eq('organization_id',SETTLEMENT_ORG).order('updated_at',{ascending:false}).limit(150),
      supabaseAdmin.from('schedules').select('id,date,customer_name,event_name,vehicle_model,vehicle_plate,driver_name,org_id,schedule_meta')
        .or('org_id.eq.'+SETTLEMENT_ORG+',org_id.is.null')
        .order('date',{ascending:false}).limit(100),
    ]);
    if(docs.error || schedules.error) return fail('정산 DB 테이블을 조회할 수 없습니다.',503);
    return NextResponse.json({ok:true,documents:docs.data || [],
      schedules:(schedules.data || []).map(s=>{
        const meta=(s.schedule_meta && typeof s.schedule_meta==='object' && !Array.isArray(s.schedule_meta)
          ? s.schedule_meta:{}) as Record<string,unknown>;
        const field=(value:unknown,other:unknown)=>typeof value==='string'&&value.trim()?value.trim():
          typeof other==='string'&&other.trim()?other.trim():'';
        return {
          id:s.id,date:s.date,customerName:field(s.customer_name,meta.customerName)||'미등록 고객사',
          eventName:field(s.event_name,meta.eventName),vehicleModel:field(s.vehicle_model,meta.vehicleModel),
          vehiclePlate:field(s.vehicle_plate,meta.vehiclePlate),driverName:field(s.driver_name,meta.driverName),
        };
      })}, {headers:HEADERS});
  }catch{return fail('정산 서버에 연결하지 못했습니다.',503);}
}

export async function POST(req:NextRequest){
  const auth=await requireHqAdmin(req);
  if(!auth.ok || !auth.session) return fail(auth.error || '권한이 없습니다.',auth.statusCode);
  let body:Record<string,unknown>;
  try{body=await req.json();}catch{return fail('요청 형식이 올바르지 않습니다.',400);}
  const scheduleId=body?.scheduleId, action=body?.action, expectedVersion=body?.expectedVersion;
  if(!validScheduleId(scheduleId) || !['prepare','price','approve','issue'].includes(String(action)) ||
    !Number.isSafeInteger(expectedVersion) || Number(expectedVersion)<0)
    return fail('예약·정산 상태·버전 입력을 확인해 주세요.',400);
  try{
    const {source,hash}=await loadSettlementSource(scheduleId);
    const {data:existing,error:readError}=await supabaseAdmin.from('settlement_documents')
      .select('*').eq('organization_id',SETTLEMENT_ORG).eq('schedule_id',scheduleId).maybeSingle();
    if(readError)return dbError(readError);
    const current=existing as LedgerDocument|null;
    if(current && current.version!==Number(expectedVersion))return fail('다른 관리자가 먼저 정산을 수정했습니다. 새로고침해 주세요.',409);
    if(!current && (action!=='prepare' || expectedVersion!==0))return fail('먼저 정산 초안을 생성해 주세요.',409);
    if(current && current.source_hash!==hash && action!=='prepare')
      return fail('운행 또는 경비 원본이 바뀌었습니다. 새로 초안을 생성해 주세요.',409);
    if(action==='prepare' && current && (current.status==='approved'||current.status==='issued'))
      return fail('승인·발행된 정산은 변경할 수 없습니다.',409);

    let contract=null,totals:null|SettlementTotals=null;
    if(action==='price'){
      contract=validateSettlementContract(body.contract);
      if(source.customerName==='미등록 고객사' || !source.vehiclePlate)
        return fail('고객사명과 차량번호가 등록된 예약만 정산할 수 있습니다.',400);
      totals=calculateSettlement(source,contract);
      if(current?.status==='approved'||current?.status==='issued')
        return fail('승인·발행된 정산은 변경할 수 없습니다.',409);
    }
    if(action==='approve' || action==='issue'){
      if(!current)return fail('서버 정산 초안이 없습니다.',404);
      if(current.status!==(action==='approve'?'reviewing':'approved'))
        return fail('승인·발행 순서를 확인해 주세요.',409);
      const stored=validateSettlementContract(current.contract_snapshot);
      const fresh=calculateSettlement(source,stored);
      if(JSON.stringify(fresh)!==JSON.stringify(current.totals_snapshot) ||
        JSON.stringify(source)!==JSON.stringify(current.source_snapshot))
        return fail('운행·경비·요율 스냅샷이 변경되었습니다. 재검토가 필요합니다.',409);
    }
    const {data,error}=await supabaseAdmin.rpc('commit_settlement_document',{
      p_org:SETTLEMENT_ORG,p_schedule:scheduleId,p_actor:auth.session.userId,
      p_action:action as LedgerAction,p_expected_version:expectedVersion,
      p_source_hash:hash,p_source_snapshot:action==='prepare'?source:null,
      p_contract_snapshot:action==='price'?contract:null,
      p_totals_snapshot:action==='price'?totals:null,
    });
    if(error)return dbError(error);
    return NextResponse.json({ok:true,document:data}, {headers:HEADERS});
  }catch(error){
    if(error instanceof Error && /(입력|요율|계약|경비|운행|승인|증빙|금액|시간|기본|초과|원본|필요|확인)/.test(error.message))
      return fail(error.message,400);
    return fail('정산 원본 또는 데이터베이스를 확인할 수 없습니다.',503);
  }
}