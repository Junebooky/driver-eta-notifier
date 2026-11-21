import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin, verifyServerAuth } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { FIELD_KNOWLEDGE_ORG } from '@/utils/sharedFieldKnowledge';

export const dynamic='force-dynamic';
const BUCKET='cockpit-assets';
const MAX_SIZE=8*1024*1024;
const allowed:Record<string,{ext:string;signature:(bytes:Uint8Array)=>boolean}>={
  'image/jpeg':{ext:'jpg',signature:b=>b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff},
  'image/png':{ext:'png',signature:b=>b.length>8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)},
  'image/webp':{ext:'webp',signature:b=>b.length>12&&
    String.fromCharCode(...b.subarray(0,4))==='RIFF'&&
    String.fromCharCode(...b.subarray(8,12))==='WEBP'},
};
const isPath=(value:string)=>/^vip_limousine_korea\/field-knowledge\/[A-Za-z0-9._:-]{1,100}\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(value);
const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'no-store'}});

/** Authenticated HQ upload. Both the cover and gallery reuse this one API. */
export async function POST(req:NextRequest){
  const auth=await requireHqAdmin(req);
  if(!auth.ok||!auth.session)return fail(auth.error||'관리자 권한이 필요합니다.',auth.statusCode);
  if(auth.session.org&&auth.session.org!==FIELD_KNOWLEDGE_ORG)return fail('조직 접근 권한이 없습니다.',403);
  try{
    const form=await req.formData();
    const file=form.get('file');
    const itemId=form.get('knowledgeId');
    if(typeof itemId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(itemId))
      return fail('유효한 현장 지식 ID가 필요합니다.',400);
    if(!(file instanceof File))return fail('업로드할 이미지가 없습니다.',400);
    if(file.size<1||file.size>MAX_SIZE)return fail('이미지 크기는 최대 8MB입니다.',413);
    const kind=allowed[file.type];
    if(!kind)return fail('PNG·JPG·WebP 이미지만 업로드할 수 있습니다.',400);
    const data=new Uint8Array(await file.arrayBuffer());
    if(!kind.signature(data))return fail('이미지 파일 형식이 올바르지 않습니다.',400);
    const path=FIELD_KNOWLEDGE_ORG+'/field-knowledge/'+itemId+'/'+crypto.randomUUID()+'.'+kind.ext;
    const {error}=await supabaseAdmin.storage.from(BUCKET).upload(path,data,{
      contentType:file.type,upsert:false,cacheControl:'3600',
    });
    if(error)return fail('스토리지 업로드 실패: '+error.message,503);
    return NextResponse.json({
      ok:true,path,url:'/api/field-knowledge/image?path='+encodeURIComponent(path),
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){return fail(e instanceof Error?e.message:'이미지를 업로드하지 못했습니다.',503);}
}

/** Drivers + HQ can read the same durable private image URL after login. */
export async function GET(req:NextRequest){
  const auth=await verifyServerAuth(req);
  if(!auth.ok||!auth.session)return fail(auth.error||'로그인이 필요합니다.',auth.statusCode);
  if(auth.session.org&&auth.session.org!==FIELD_KNOWLEDGE_ORG)return fail('조직 접근 권한이 없습니다.',403);
  const path=req.nextUrl.searchParams.get('path')||'';
  if(!isPath(path))return fail('유효하지 않은 현장 이미지 경로입니다.',400);
  try{
    const {data,error}=await supabaseAdmin.storage.from(BUCKET).download(path);
    if(error||!data)return fail('이미지를 불러오지 못했습니다.',404);
    const ext=path.split('.').at(-1);
    const mime=ext==='jpg'?'image/jpeg':ext==='png'?'image/png':'image/webp';
    return new NextResponse(await data.arrayBuffer(),{
      headers:{'Content-Type':mime,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff',
        'Cache-Control':'private, max-age=60'},
    });
  }catch{return fail('이미지를 불러오지 못했습니다.',503);}
}

/** Only cleanup temporary uploads. Caller must be an HQ administrator. */
export async function DELETE(req:NextRequest){
  const auth=await requireHqAdmin(req);
  if(!auth.ok||!auth.session)return fail(auth.error||'관리자 권한이 필요합니다.',auth.statusCode);
  if(auth.session.org&&auth.session.org!==FIELD_KNOWLEDGE_ORG)return fail('조직 접근 권한이 없습니다.',403);
  const payload=await req.json().catch(()=>({}));
  const path=typeof payload.path==='string'?payload.path:'';
  if(!isPath(path))return fail('파일 경로가 올바르지 않습니다.',400);
  try{
    // Do not delete any file already referenced by published knowledge.
    const {data:rows,error:queryError}=await supabaseAdmin.from('field_knowledge')
      .select('content').eq('organization_id',FIELD_KNOWLEDGE_ORG).eq('archived',false).limit(500);
    if(queryError)return fail('이미지 사용 여부를 확인하지 못했습니다.',503);
    const url='/api/field-knowledge/image?path='+encodeURIComponent(path);
    if((rows||[]).some(row=>{
      const content=row.content as {imageUrl?:string;photos?:string[]}|null;
      return content?.imageUrl===url||content?.photos?.includes(url);
    }))return fail('현재 현장 지식에서 사용 중인 이미지는 삭제할 수 없습니다.',409);
    const {error}=await supabaseAdmin.storage.from(BUCKET).remove([path]);
    if(error)return fail('파일 정리 실패: '+error.message,503);
    return NextResponse.json({ok:true});
  }catch{return fail('파일을 정리하지 못했습니다.',503);}
}
