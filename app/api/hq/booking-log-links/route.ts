import {NextRequest, NextResponse} from 'next/server';
import {requireHqAdmin} from '@/lib/auth/serverAuth';
import {supabaseAdmin} from '@/lib/supabase/server';
import {SETTLEMENT_ORG, validScheduleId} from '@/lib/settlement/serverLedger';

export const dynamic = 'force-dynamic';
const HEADERS = {'Cache-Control': 'private, no-store'};
const fail = (message: string, status: number) =>
  NextResponse.json({ok:false,error:message},{status,headers:HEADERS});

/**
 * Only an authenticated HQ administrator can see or link these records.
 * Candidate schedules are never treated as a match until explicitly selected.
 */
export async function GET(request: NextRequest) {
  const auth = await requireHqAdmin(request);
  if(!auth.ok || !auth.session) return fail(auth.error || '관리자 인증이 필요합니다.', auth.statusCode);
  const [logs, schedules, linked, expenses, settlements] = await Promise.all([
    supabaseAdmin.from('driving_logs')
      .select('id,booking_id,driving_date,driver_id,driver_name,vehicle_plate,customer_name,status,updated_at')
      .eq('organization_id',SETTLEMENT_ORG).is('booking_id',null)
      .order('driving_date',{ascending:false}).limit(150),
    supabaseAdmin.from('schedules')
      .select('id,date,end_date,driver_id,driver_name,vehicle_plate,customer_name,event_name,dispatch_status,org_id')
      .or('org_id.eq.'+SETTLEMENT_ORG+',org_id.is.null')
      .order('date',{ascending:false}).limit(150),
    supabaseAdmin.from('driving_logs')
      .select('booking_id').eq('organization_id',SETTLEMENT_ORG).not('booking_id','is',null).limit(500),
    supabaseAdmin.from('expenses')
      .select('driving_log_id,booking_id').eq('organization_id',SETTLEMENT_ORG)
      .not('driving_log_id','is',null).limit(500),
    supabaseAdmin.from('settlement_documents')
      .select('schedule_id,status').eq('organization_id',SETTLEMENT_ORG)
      .in('status',['approved','issued']).limit(500),
  ]);
  if([logs,schedules,linked,expenses,settlements].some(result=>result.error))
    return fail('예약과 운행일지의 연결 정보를 읽지 못했습니다.',503);
  const alreadyLinked = new Set((linked.data || []).map(row=>row.booking_id));
  const locked = new Set((settlements.data || []).map(row=>row.schedule_id));
  const candidateSchedules = (schedules.data || [])
    .filter(row=>!alreadyLinked.has(row.id) && !locked.has(row.id));
  const expenseCounts:Record<string,number> = {};
  for(const entry of expenses.data || []) {
    if(entry.driving_log_id) expenseCounts[entry.driving_log_id] =
      (expenseCounts[entry.driving_log_id] || 0)+1;
  }
  return NextResponse.json({ok:true,logs:logs.data || [],schedules:candidateSchedules,expenseCounts},
    {headers:HEADERS});
}

export async function POST(request: NextRequest) {
  const auth = await requireHqAdmin(request);
  if(!auth.ok || !auth.session) return fail(auth.error || '관리자 인증이 필요합니다.',auth.statusCode);
  let body:Record<string,unknown>;
  try{body=await request.json();}catch{return fail('요청 형식이 올바르지 않습니다.',400);}
  if(!validScheduleId(body.logId) || !validScheduleId(body.scheduleId) || body.confirmed!==true)
    return fail('예약·운행일지 선택과 관리자 확인이 필요합니다.',400);
  const result = await supabaseAdmin.rpc('link_driving_log_to_booking',{
    p_org:SETTLEMENT_ORG,
    p_log:body.logId,
    p_booking:body.scheduleId,
    p_actor:auth.session.userId,
  });
  if(result.error){
    const code=result.error.message || '';
    if(/DATE_MISMATCH|DRIVER_MISMATCH|VEHICLE_MISMATCH/.test(code))
      return fail('예약 날짜·기사·차량이 운행일지와 일치하지 않습니다. 원본을 대조해 주세요.',409);
    if(/LINK_CONFLICT|ALREADY_LINKED|BOOKING_HAS_LOG|SETTLEMENT_LOCKED|EXPENSE_BOOKING_CONFLICT/.test(code))
      return fail('이미 연결되었거나 승인된 정산·경비와 충돌합니다. 새로고침 후 확인해 주세요.',409);
    if(/_NOT_FOUND/.test(code)) return fail('선택한 예약 또는 운행일지가 존재하지 않습니다.',404);
    return fail('연결 기능을 저장할 수 없습니다. 서버 마이그레이션을 확인해 주세요.',503);
  }
  return NextResponse.json({ok:true,result:result.data},{headers:HEADERS});
}
