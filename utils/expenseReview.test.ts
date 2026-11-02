import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExpenseCorrections, expenseCorrectionFields, approvalProblem, nextPendingReceiptId, receiptApprovalShortcut } from './expenseReview';
import { fetchHqExpensesFromDb, getHqExpenses, saveHqExpenses, updateHqExpenseReviewDb } from './expenseHqStorage';
import type { HqExpenseRecord } from '../types/expenseHq';

const row: HqExpenseRecord = {
  id:'a0000000-0000-4000-8000-000000000001',no:1,submittedAt:'',submittedDate:'',rawDate:'2026-11-02',time:'09:00',
  driverName:'기사',vehicleModel:'차량',vehiclePlate:'123가4567',category:'parking',categoryLabel:'주차비',merchant:'주차장',
  amount:8000,paymentMethod:'company_card',paymentMethodLabel:'회사 카드',status:'검수 대기',hasReceiptImage:true,
  receiptStoragePath:'private/proof.png',updatedAt:'2026-11-02T00:00:00Z',
};

test('corrections accept only editable fields and real dates, times, KRW integers and known enums',()=>{
  const valid=expenseCorrectionFields(row);
  assert.deepEqual(normalizeExpenseCorrections({...valid,merchant:' 주차장 '}),valid);
  for(const patch of [{rawDate:'2026-02-29'},{time:'24:00'},{amount:1.5},{amount:-1},{amount:2147483648},{amount:'1000'},{category:'invented'},{paymentMethod:'invented'},{merchant:''},{bookingId:'not-a-uuid'},{receiptStoragePath:'replacement'},{ocrDetails:{total:1}},{driverId:'other'}]) {
    assert.throws(()=>normalizeExpenseCorrections({...valid,...patch}));
  }
  assert.equal(normalizeExpenseCorrections({...valid,rawDate:'2028-02-29'}).rawDate,'2028-02-29');
  assert.equal(approvalProblem(row),null);
  for(const patch of [{amount:0},{category:'unclassified' as const},{paymentMethod:'unspecified' as const},{receiptStoragePath:undefined}]) assert.ok(approvalProblem({...row,...patch}));
  assert.equal(approvalProblem({...row,receiptStoragePath:undefined,category:'toll',hipassTxKey:'ledger-1'}),null);
});

test('approval queue retains filtered order, skips removed/approved/rejected rows and never returns itself',()=>{
  const rows=[row,{...row,id:'two',status:'승인 완료' as const},{...row,id:'three'},{...row,id:'four',status:'반려' as const}];
  assert.equal(nextPendingReceiptId([row.id,'two','deleted','three','four'],row.id,rows),'three');
  assert.equal(nextPendingReceiptId([row.id,'two','deleted'],row.id,rows),null);
  assert.equal(nextPendingReceiptId(['three',row.id],row.id,rows),'three');
});

test('approval shortcut ignores plain Enter, IME and any editable target',()=>{
  const event={key:'Enter',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,isComposing:false,target:null};
  assert.equal(receiptApprovalShortcut(event),true);
  for(const patch of [{ctrlKey:false},{isComposing:true},{shiftKey:true},{altKey:true},{target:{closest:()=>({})} as unknown as EventTarget},{target:{isContentEditable:true} as unknown as EventTarget}]) assert.equal(receiptApprovalShortcut({...event,...patch}),false);
});

test('a correction is confirmed only when every requested saved field matches; stale polls cannot undo confirmed edits',async()=>{
  const previous=globalThis.fetch;
  saveHqExpenses([row]);
  try {
    const corrections={...expenseCorrectionFields(row),amount:9000};
    globalThis.fetch=(async()=>Response.json({ok:true,expense:{...row,updatedAt:'2026-11-02T00:01:00Z'}})) as typeof fetch;
    assert.equal((await updateHqExpenseReviewDb(row.id,{corrections},row.updatedAt)).ok,false);
    assert.equal(getHqExpenses()[0].amount,8000);
    const confirmed={...row,amount:9000,updatedAt:'2026-11-02T00:02:00Z'};
    globalThis.fetch=(async()=>Response.json({ok:true,expense:confirmed})) as typeof fetch;
    assert.equal((await updateHqExpenseReviewDb(row.id,{corrections},row.updatedAt)).ok,true);
    globalThis.fetch=(async()=>Response.json({ok:true,expenses:[row]})) as typeof fetch;
    assert.equal((await fetchHqExpensesFromDb()).expenses[0].amount,9000);
    globalThis.fetch=(async()=>Response.json({ok:true,expenses:[]})) as typeof fetch;
    assert.equal((await fetchHqExpensesFromDb()).expenses.length,0,'true removal must still clear stale rows');
  } finally { globalThis.fetch=previous;saveHqExpenses([]); }
});
