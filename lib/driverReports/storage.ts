import {createHash,randomUUID} from 'node:crypto';
import {supabaseAdmin as db} from '@/lib/supabase/server';
export type WorkbookStorage={hex?:string;path?:string;sha256:string;size:number};
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export async function storeWorkbook(org:string,bytes:Uint8Array):Promise<WorkbookStorage>{
 const info={sha256:sha(bytes),size:bytes.length};
 if(process.env.REPORT_STORAGE_MODE!=='object')return {...info,hex:Buffer.from(bytes).toString('hex')};
 const bucket=process.env.REPORT_STORAGE_BUCKET||'report-workbooks';
 const config=await db.storage.getBucket(bucket);if(config.error||config.data.public)throw new Error('비공개 장부 저장소 설정을 확인해 주세요.');
 const path=createHash('sha256').update(org).digest('hex')+'/'+randomUUID()+'.xlsx';
 const staged=await db.from('report_object_uploads').insert({org_id:org,path,sha256:info.sha256,byte_size:info.size});if(staged.error)throw new Error('파일 준비 정보를 저장하지 못했습니다.');
 const uploaded=await db.storage.from(bucket).upload(path,bytes,{upsert:false,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 if(uploaded.error)throw new Error('Excel 저장소 연결을 다시 시도합니다.');
 const read=await db.storage.from(bucket).download(path);if(read.error||sha(new Uint8Array(await read.data.arrayBuffer()))!==info.sha256)throw new Error('Excel 저장 무결성 검증 실패');
 return {...info,path};
}
export async function readWorkbook(version:{bytes:string|null;object_path?:string|null;sha256?:string|null;byte_size?:number|null}){
 let bytes:Uint8Array;
 if(version.bytes)bytes=new Uint8Array(Buffer.from(version.bytes.replace(/^\\x/,''),'hex'));
 else{
  if(!version.object_path)throw new Error('파일 위치가 없습니다.');
  const r=await db.storage.from(process.env.REPORT_STORAGE_BUCKET||'report-workbooks').download(version.object_path);
  if(r.error)throw new Error('Excel 저장소 연결을 다시 시도합니다.');bytes=new Uint8Array(await r.data.arrayBuffer());
 }
 if(version.sha256&&sha(bytes)!==version.sha256||version.byte_size&&bytes.length!==Number(version.byte_size))throw new Error('파일 무결성 검증 실패');
 return bytes;
}
