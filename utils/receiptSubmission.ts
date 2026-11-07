import type { ExpenseItem } from './expense';

export const isReportingUuid=(value:unknown):value is string=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Upload the original before marking an expense as submitted. Never persist a device-only URL as proof. */
export async function prepareExpenseReceipt(item:ExpenseItem,request:typeof fetch=fetch):Promise<ExpenseItem>{
  if(item.receiptStoragePath)return item;
  if(!item.receiptUrl)return item;
  const match=item.receiptUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if(!match)throw new Error('영수증 원본 사진을 다시 첨부해 주세요. 샘플·기기 전용 주소는 본사에 제출할 수 없습니다.');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  if(!bytes.length || bytes.length>10*1024*1024)throw new Error('영수증은 10MB 이하 사진으로 첨부해 주세요.');
  const form=new FormData();form.set('file',new Blob([bytes],{type:match[1]}),`receipt.${match[1].split('/')[1]}`);
  form.set('expenseId',item.id);
  const response=await request('/api/expenses/receipt',{method:'POST',body:form,credentials:'include'});
  const result=await response.json();
  if(!response.ok || !result.ok || typeof result.storagePath!=='string')throw new Error(result.error || '영수증 원본을 서버에 보관하지 못했습니다.');
  return {...item,receiptStoragePath:result.storagePath};
}
