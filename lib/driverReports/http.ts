import {NextResponse} from 'next/server';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function boundedBody(req:Request,max:number) {
  if(Number(req.headers.get('content-length'))>max)throw new Error('전송 내용이 너무 큽니다.');
  const reader=req.body?.getReader();if(!reader)return new Uint8Array();
  const parts:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('전송 내용이 너무 큽니다.');}parts.push(value);}
  const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}return all;
}
export function sameOrigin(req:Request) {
  const origin=req.headers.get('origin');if(!origin)return true;
  const url=new URL(req.url);
  // Next dev may normalize req.url to localhost although the browser uses 127.0.0.1.
  const host=req.headers.get('host');
  return origin===(host?url.protocol+'//'+host:url.origin);
}
export const privateJson=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
export const failure=(error:unknown)=>privateJson({ok:false,error:error instanceof Error?error.message:'처리하지 못했습니다. 다시 시도해 주세요.'},400);
