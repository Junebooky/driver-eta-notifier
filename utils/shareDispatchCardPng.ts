import {zipSync} from 'fflate';

// The share-sheet copy is customer-facing; filenames stay vehicle/driver-specific.
export const DISPATCH_CARD_PAIR_SHARE_TEXT =
  '안녕하세요 VIP리무진코리아입니다. 기사 인포카드 전달드립니다. 보기 편하시도록 PC용과 모바일용 함께 보내드려요.';
export const DISPATCH_CARD_SINGLE_SHARE_TEXT =
  '안녕하세요 VIP리무진코리아입니다. 기사 인포카드 전달드립니다.';

/**
 * Convert a saved, server-authenticated card to an actual PNG attachment.
 * Never share expiring signed URLs: the recipient receives image bytes.
 */
export async function prepareSavedDispatchCardPng(path:string,fileName:string):Promise<File>{
  if(!path.startsWith('vip_limousine_korea/drivers/info/')||
    path.includes('..'))throw new Error('배차카드 파일 경로가 올바르지 않습니다.');
  const response=await fetch(
    '/api/hq/drivers/assets/preview?path='+encodeURIComponent(path),
    {cache:'no-store',credentials:'same-origin'},
  );
  if(!response.ok)throw new Error('배차카드 이미지를 불러오지 못했습니다.');
  const source=await response.blob();
  if(!source.type.startsWith('image/'))throw new Error('배차카드 이미지 형식이 올바르지 않습니다.');
  const url=URL.createObjectURL(source);
  try{
    const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('이미지를 열 수 없습니다.'));
      image.src=url;
    });
    if(!img.naturalWidth||!img.naturalHeight)throw new Error('이미지 크기를 확인하지 못했습니다.');
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalWidth;
    canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('이미지를 변환할 수 없습니다.');
    ctx.drawImage(img,0,0);
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
      result=>result?resolve(result):reject(new Error('PNG 변환에 실패했습니다.')),'image/png',
    ));
    return new File([png],fileName.replace(/[^a-zA-Z0-9가-힣_().-]/g,'_')+'.png',{type:'image/png'});
  }finally{URL.revokeObjectURL(url);}
}

export function supportsDispatchCardNativeShare(file:File):boolean{
  return typeof navigator!=='undefined'&&typeof navigator.share==='function'&&
    typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});
}

export function downloadDispatchCardPng(file:File):void{
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');
  a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}

/** Invoke synchronously from the user's click handler (gesture-safe). */
export async function shareDispatchCardPng(file:File):Promise<'shared'|'downloaded'|'cancelled'>{
  if(!supportsDispatchCardNativeShare(file)){
    downloadDispatchCardPng(file);
    return 'downloaded';
  }
  try{
    await navigator.share({files:[file],text:DISPATCH_CARD_SINGLE_SHARE_TEXT});
    return 'shared';
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')return 'cancelled';
    throw error;
  }
}


/**
 * Native share sends BOTH image files as independent attachments in one share
 * sheet. The fallback produces one ZIP containing both exact PNG bytes.
 */
export function supportsDispatchCardPairShare(files:readonly [File,File]):boolean{
  return typeof navigator!=='undefined'&&typeof navigator.share==='function'&&
    typeof navigator.canShare==='function'&&navigator.canShare({files:[...files]});
}

function validateDispatchCardPair(files:readonly [File,File]):void{
  if(files.length!==2||files.some(f=>!(f instanceof File)||f.type!=='image/png'||f.size<1)||
     files[0].name===files[1].name){
    throw new Error('PC·모바일 PNG 두 장이 모두 준비되어야 공유할 수 있습니다.');
  }
}

/** Stored ZIP uses level 0: PNGs are already compressed. */
export async function createDispatchCardPairZip(files:readonly [File,File]):Promise<Blob>{
  validateDispatchCardPair(files);
  const [pc,mobile]=await Promise.all(files.map(async file=>new Uint8Array(await file.arrayBuffer())));
  const zip=zipSync({[files[0].name]:pc,[files[1].name]:mobile},{level:0});
  // Explicit ArrayBuffer copy is compatible with strict DOM BlobPart typing.
  const binary=new Uint8Array(zip.byteLength);
  binary.set(zip);
  return new Blob([binary.buffer as ArrayBuffer],{type:'application/zip'});
}

export function downloadDispatchCardPairZip(blob:Blob,filename:string):void{
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=filename.replace(/[^a-zA-Z0-9가-힣_().-]/g,'_')+'.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}

/**
 * Must be invoked directly by a user click with prebuilt PNG File objects,
 * without awaiting anything before navigator.share() on the native path.
 */
export async function shareDispatchCardPngPair(
  files:readonly [File,File],
  zipName:string,
):Promise<'shared'|'downloaded'|'cancelled'>{
  validateDispatchCardPair(files);
  if(supportsDispatchCardPairShare(files)){
    try{
      await navigator.share({
        files:[...files],
        text:DISPATCH_CARD_PAIR_SHARE_TEXT,
      });
      return 'shared';
    }catch(error){
      if(error instanceof Error&&error.name==='AbortError')return 'cancelled';
      throw error;
    }
  }
  const zip=await createDispatchCardPairZip(files);
  downloadDispatchCardPairZip(zip,zipName);
  return 'downloaded';
}
