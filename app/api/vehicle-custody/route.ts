import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { dispatchRequestContext } from '@/lib/dispatch/requestContext';
import { CustodyError, custodyFailure, normalizeCustodyWrite, readCustodyState, storeCustodyPhoto } from '@/lib/fleet/custodyStore';
import { isReportingUuid } from '@/utils/receiptSubmission';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const failure = (error: unknown) => json({ ok: false, error: error instanceof CustodyError ? error.message : '인수·반납 요청을 처리하지 못했습니다.' }, error instanceof CustodyError ? error.status : 503);
export async function GET(req: NextRequest) {
  const auth = await verifyServerAuth(req);
  if (!auth.ok || !auth.session) return json({ ok: false, error: auth.error }, auth.statusCode);
  try { return json({ ok: true, ...await readCustodyState(auth.session) }); } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const auth = await verifyServerAuth(req, 'driver');
  if (!auth.ok || !auth.session) return json({ ok: false, error: auth.error }, auth.statusCode);
  const session = auth.session;
  if (!isReportingUuid(session.driverId)) return json({ ok: false, error: '확인된 기사 UUID가 필요합니다.' }, 403);
  try {
    const body = await req.json();
    const data = normalizeCustodyWrite(body);
    const context = dispatchRequestContext(req, session, body);
    if (!context) throw new CustodyError('저장 요청 식별자가 필요합니다. 같은 요청으로 다시 확인해 주세요.');
    const previous = await supabaseAdmin.from('vehicle_custody_requests').select('actor_id,driver_id,request_payload,result')
      .eq('request_id', context.requestId).eq('organization_id', session.org).maybeSingle();
    if (previous.error) throw custodyFailure(previous.error);
    if (previous.data) {
      if (previous.data.actor_id !== session.userId || previous.data.driver_id !== session.driverId || previous.data.request_payload.requestFingerprint !== context.fingerprint)
        throw new CustodyError('같은 저장 식별자에 다른 내용을 사용할 수 없습니다.', 409);
      return json(previous.data.result);
    }
    // Authorize any photo upload before using private Storage; the transaction rechecks the binding.
    if (data.action === 'pickup') {
      const found = await supabaseAdmin.from('schedules').select('driver_id,org_id').eq('id', data.bookingId!).maybeSingle();
      if (found.error) throw custodyFailure(found.error);
      if (!found.data || found.data.driver_id !== session.driverId || (found.data.org_id && found.data.org_id !== session.org)) throw new CustodyError('본인에게 배정된 일정만 인수할 수 있습니다.', 403);
    } else {
      const found = await supabaseAdmin.from('vehicle_custodies').select('driver_id,organization_id').eq('id', data.custodyId!).maybeSingle();
      if (found.error) throw custodyFailure(found.error);
      if (!found.data || found.data.driver_id !== session.driverId || found.data.organization_id !== session.org) throw new CustodyError('본인이 인수한 차량만 반납할 수 있습니다.', 403);
    }
    if (body.photo) data.inspection.photoPath = await storeCustodyPhoto(body.photo, session);
    const { data: result, error } = await supabaseAdmin.rpc('commit_vehicle_custody', {
      p_org: session.org, p_driver_id: session.driverId, p_actor_id: session.userId,
      p_request_id: context.requestId, p_data: { ...data, requestFingerprint: context.fingerprint },
    });
    if (error) throw custodyFailure(error);
    if (result?.ok !== true || !['picked_up', 'returned', 'mismatch'].includes(result.outcome)) throw new CustodyError('저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.', 503);
    return json(result);
  } catch (error) { return failure(error); }
}
export async function PATCH(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok || !auth.session) return json({ ok: false, error: auth.error }, auth.statusCode);
  try {
    const body = await req.json();
    if (typeof body.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(body.requestId) || typeof body.note !== 'string' || !body.note.trim() || body.note.length > 1000)
      throw new CustodyError('확인 요청과 관리자 조치 내용을 입력해 주세요.');
    const { data, error } = await supabaseAdmin.from('vehicle_custody_requests').update({
      resolved_at: new Date().toISOString(), resolved_by: auth.session.userId, resolution_note: body.note.trim(),
    }).eq('organization_id', auth.session.org).eq('request_id', body.requestId).eq('result->>outcome', 'mismatch').is('resolved_at', null).select('request_id').maybeSingle();
    if (error) throw custodyFailure(error);
    if (!data) throw new CustodyError('이미 처리되었거나 확인할 수 없는 요청입니다. 최신 내역을 확인해 주세요.', 409);
    return json({ ok: true, message: '관리자 확인 내용을 기록했습니다. 배차 변경과 차량 인수는 별도로 확인해야 합니다.' });
  } catch (error) { return failure(error); }
}
