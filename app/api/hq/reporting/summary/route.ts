import { NextRequest,NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  const auth=await requireHqAdmin(req);
  if(!auth.ok || !auth.session)return NextResponse.json({ok:false,error:auth.error},{status:auth.statusCode});
  try{
    const {data,error}=await supabaseAdmin.rpc('reporting_summary',{p_org:auth.session.org});
    if(error || !data)return NextResponse.json({ok:false,error:'운행일지·경비 집계 기능을 사용할 수 없습니다. 저장 DB 설정을 확인해 주세요.'},{status:503});
    return NextResponse.json({ok:true,summary:data},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({ok:false,error:'운행·경비 집계 서버에 연결하지 못했습니다.'},{status:503});}
}
