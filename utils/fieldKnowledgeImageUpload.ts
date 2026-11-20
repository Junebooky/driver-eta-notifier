export type UploadedKnowledgeImage={url:string;path:string};
const TYPES=new Set(['image/png','image/jpeg','image/webp']);
export function validateKnowledgePhoto(file:Pick<File,'type'|'size'>):string|null{
  if(!TYPES.has(file.type))return 'PNG·JPG·WebP 이미지만 등록할 수 있어요.';
  if(file.size<1||file.size>8*1024*1024)return '사진은 각각 최대 8MB까지 등록할 수 있어요.';
  return null;
}
export async function uploadKnowledgePhoto(knowledgeId:string,file:File):Promise<UploadedKnowledgeImage>{
  const issue=validateKnowledgePhoto(file);
  if(issue)throw new Error(issue);
  const form=new FormData();
  form.set('knowledgeId',knowledgeId);
  form.set('file',file);
  const result=await fetch('/api/field-knowledge/image',{method:'POST',body:form});
  const json=await result.json().catch(()=>({}));
  if(!result.ok||!json.ok||typeof json.path!=='string'||typeof json.url!=='string')
    throw new Error(json.error||'현장 이미지를 업로드하지 못했습니다.');
  return {url:json.url,path:json.path};
}
/** Cleanup only files uploaded in this editor's uncommitted save attempt. */
export async function cleanupUncommittedKnowledgePhotos(files:UploadedKnowledgeImage[]):Promise<void>{
  await Promise.all(files.map(file=>fetch('/api/field-knowledge/image',{
    method:'DELETE',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({path:file.path}),
  }).catch(()=>null)));
}
