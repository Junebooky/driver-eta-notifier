import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const auth = await verifyServerAuth(req);
  if (!auth.ok || !auth.session) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
  const requestId = req.nextUrl.searchParams.get('requestId');
  if (!requestId || !/^[a-f0-9]{64}$/.test(requestId)) return NextResponse.json({ ok: false, error: '점검 기록 식별자가 필요합니다.' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('vehicle_custody_requests').select('driver_id,organization_id,request_payload').eq('request_id', requestId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: '점검 기록을 조회하지 못했습니다.' }, { status: 503 });
  if (!data || data.organization_id !== auth.session.org || (auth.session.role === 'driver' && data.driver_id !== auth.session.driverId))
    return NextResponse.json({ ok: false, error: '사진을 조회할 권한이 없습니다.' }, { status: 403 });
  const path = data.request_payload?.inspection?.photoPath;
  if (typeof path !== 'string' || !path.startsWith(`${auth.session.org}/custody/${data.driver_id}/`) || path.includes('..'))
    return NextResponse.json({ ok: false, error: '보관된 계기판 사진이 없습니다.' }, { status: 404 });
  try {
    const file = await supabaseAdmin.storage.from('cockpit-assets').download(path);
    if (file.error || !file.data) return NextResponse.json({ ok: false, error: '계기판 사진을 불러오지 못했습니다.' }, { status: 503 });
    return new NextResponse(await file.data.arrayBuffer(), { headers: { 'Content-Type': file.data.type || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return NextResponse.json({ ok: false, error: '계기판 사진을 불러오지 못했습니다.' }, { status: 503 }); }
}
