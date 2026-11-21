/**
 * Same profile asset endpoint as the dispatch-card builder.
 * Selecting a file is client-side only. The upload runs AFTER driver creation,
 * when the real cockpit.drivers UUID is available.
 */
const TYPES=new Set(['image/png','image/jpeg','image/webp']);
const MAX_BYTES=10*1024*1024;
export function validateNewDriverPhotoFile(file:Pick<File,'type'|'size'>):string|null{
  if(!TYPES.has(file.type))return 'PNG·JPG·WebP 이미지 파일만 사용할 수 있어요.';
  if(file.size<=0||file.size>MAX_BYTES)return '사진 크기는 10MB 이하여야 합니다.';
  return null;
}
export async function uploadNewDriverProfilePhoto(
  driver:{id:string;name:string},file:File,
):Promise<string>{
  const error=validateNewDriverPhotoFile(file);
  if(error)throw new Error(error);
  const blob=URL.createObjectURL(file);
  let dimensions:{width:number;height:number};
  try{
    dimensions=await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});
      img.onerror=()=>reject(new Error('이미지를 열 수 없습니다. 다른 사진을 선택해 주세요.'));
      img.src=blob;
    });
  }finally{
    URL.revokeObjectURL(blob);
  }
  if(dimensions.width<400||dimensions.height<400)
    throw new Error('배차카드 프로필은 가로·세로 각각 최소 400px 이상이어야 합니다.');
  const form=new FormData();
  form.set('assetType','profile');
  form.set('driverId',driver.id);
  form.set('driverName',driver.name);
  form.set('width',String(dimensions.width));
  form.set('height',String(dimensions.height));
  form.set('file',file);
  const response=await fetch('/api/hq/drivers/assets/upload',{method:'POST',body:form});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok!==true||!payload.storagePath)
    throw new Error(payload.error||'사진을 저장하지 못했습니다.');
  return payload.storagePath as string;
}
