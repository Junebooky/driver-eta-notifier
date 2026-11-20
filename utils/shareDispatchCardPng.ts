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
    await navigator.share({files:[file],title:'VIP LIMOUSINE KOREA 배차카드'});
    return 'shared';
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')return 'cancelled';
    throw error;
  }
}
