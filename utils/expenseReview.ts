import type { HqExpenseRecord, HqExpenseStatus } from '@/types/expenseHq';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategoryKey, type PaymentMethod } from './expense';

export interface ExpenseCorrections {
  merchant: string; address: string; rawDate: string; time: string; category: ExpenseCategoryKey;
  amount: number; paymentMethod: PaymentMethod; memo: string; bookingId: string | null;
}
export interface ExpenseReviewPatch {
  status?: HqExpenseStatus; reviewNotes?: string; billableToCustomer?: boolean; corrections?: ExpenseCorrections;
}
const fields = ['merchant','address','rawDate','time','category','amount','paymentMethod','memo','bookingId'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validExpenseDate(value: unknown): value is string {
  if (typeof value !== 'string' || (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0,4)) === 0)) return false;
  const date = new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function normalizeExpenseCorrections(value: unknown): ExpenseCorrections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('수정할 영수증 항목을 확인해 주세요.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !fields.some(field => field === key))) throw new Error('기사·차량·원본·OCR 정보는 이 검수 화면에서 변경할 수 없습니다.');
  const text = (key: string, max: number) => {
    if (typeof input[key] !== 'string' || (input[key] as string).length > max) throw new Error('상호·주소·메모의 형식과 길이를 확인해 주세요.');
    return (input[key] as string).trim();
  };
  const merchant = text('merchant',200), address = text('address',1000), memo = text('memo',5000);
  if (!merchant) throw new Error('거래처 상호를 입력해 주세요.');
  if (!validExpenseDate(input.rawDate)) throw new Error('실제로 존재하는 지출 날짜를 입력해 주세요.');
  if (typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('지출 시간을 00:00~23:59 형식으로 입력해 주세요.');
  if (!Number.isSafeInteger(input.amount) || Number(input.amount) < 0 || Number(input.amount) > 2147483647) throw new Error('금액은 0~2,147,483,647원의 정수로 입력해 주세요.');
  if (typeof input.category !== 'string' || !Object.hasOwn(EXPENSE_CATEGORIES,input.category)) throw new Error('올바른 지출 항목을 선택해 주세요.');
  if (typeof input.paymentMethod !== 'string' || !['unspecified', ...PAYMENT_METHODS.map(method => method.key)].includes(input.paymentMethod)) throw new Error('결제자·결제수단을 확인해 주세요.');
  if (input.bookingId !== null && (typeof input.bookingId !== 'string' || !uuid.test(input.bookingId))) throw new Error('연결할 예약 식별자를 확인해 주세요.');
  return {merchant,address,memo,rawDate:input.rawDate,time:input.time,amount:Number(input.amount),category:input.category as ExpenseCategoryKey,paymentMethod:input.paymentMethod as PaymentMethod,bookingId:input.bookingId as string | null};
}
export function expenseCorrectionFields(expense: HqExpenseRecord): ExpenseCorrections {
  return {merchant:expense.merchant,address:expense.address || '',rawDate:expense.rawDate,time:expense.time,category:expense.category,amount:expense.amount,paymentMethod:expense.paymentMethod,memo:expense.memo || '',bookingId:expense.bookingId || null};
}
export function expenseFieldChanges(before: ExpenseCorrections, after: ExpenseCorrections) {
  return fields.filter(key=>before[key]!==after[key]).map(field=>({field,before:before[field],after:after[field]}));
}
export function pendingReceipt(expense: HqExpenseRecord) { return expense.status === '검수 대기' || expense.status === '금액 확인'; }
export function nextPendingReceiptId(ids: string[], current: string, records: HqExpenseRecord[]) {
  const at=ids.indexOf(current), ordered=[...ids.slice(at+1),...ids.slice(0,Math.max(at,0))];
  return ordered.find(id=>id!==current && records.some(row=>row.id===id && pendingReceipt(row))) || null;
}
export function approvalProblem(expense: HqExpenseRecord): string | null {
  try { normalizeExpenseCorrections(expenseCorrectionFields(expense)); } catch(error) { return error instanceof Error ? error.message : '영수증 항목을 확인해 주세요.'; }
  if (expense.amount<=0 || expense.category==='unclassified' || expense.paymentMethod==='unspecified') return '금액·미분류 항목·결제 미확인 정보를 수정하고 저장한 뒤 승인해 주세요.';
  if (!expense.receiptStoragePath && !(expense.category==='toll' && expense.hipassTxKey)) return '서버에 보관된 영수증 원본 또는 하이패스 거래 증빙을 먼저 확인해 주세요.';
  return null;
}
export function receiptApprovalShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing: boolean; target: EventTarget | null }) {
  if (event.key!=='Enter' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.isComposing) return false;
  const target=event.target as HTMLElement | null;
  return !target?.isContentEditable && !target?.closest?.('input,textarea,select,[contenteditable="true"]');
}
