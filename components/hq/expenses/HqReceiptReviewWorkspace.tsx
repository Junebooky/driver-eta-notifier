'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, RotateCw, X, ZoomIn, ZoomOut, Scan } from 'lucide-react';
import type { HqExpenseRecord } from '@/types/expenseHq';
import type { HqBooking } from '@/types/hq';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, formatKRW } from '@/utils/expense';
import { approvalProblem, expenseCorrectionFields, normalizeExpenseCorrections, pendingReceipt, receiptApprovalShortcut, type ExpenseReviewPatch } from '@/utils/expenseReview';
import { checkDuplicateReceipt } from '@/utils/settlementCalculator';
import { updateHqExpenseReviewDb } from '@/utils/expenseHqStorage';

interface Props {
  expense: HqExpenseRecord;
  expenses: HqExpenseRecord[];
  bookings: HqBooking[];
  onClose: () => void;
  onApproved: (expense: HqExpenseRecord) => Promise<void>;
  onRefresh: () => Promise<unknown>;
}

export default function HqReceiptReviewWorkspace({ expense, expenses, bookings, onClose, onApproved, onRefresh }: Props) {
  const [saved, setSaved] = useState(expense);
  const [fields, setFields] = useState(expenseCorrectionFields(expense));
  const [amount, setAmount] = useState(String(expense.amount));
  const [notes, setNotes] = useState(expense.reviewNotes || '');
  const [billable, setBillable] = useState(expense.billableToCustomer ?? true);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState({ width: 600, height: 900 });
  const [viewport, setViewport] = useState({ width: 600, height: 600 });
  const viewer = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const approveButton = useRef<HTMLButtonElement>(null);
  const draft = { ...fields, amount: /^\d+$/.test(amount) ? Number(amount) : NaN };
  const dirty = JSON.stringify(draft) !== JSON.stringify(expenseCorrectionFields(saved)) || notes !== (saved.reviewNotes || '') || billable !== (saved.billableToCustomer ?? true);
  const stale = expense.updatedAt !== saved.updatedAt;
  const problem = approvalProblem(saved);
  const duplicate = checkDuplicateReceipt(saved, expenses);
  const pdf = /\.pdf$/i.test(saved.receiptStoragePath || '');
  const proofReady = (Boolean(saved.receiptUrl) && loaded) || (saved.category === 'toll' && Boolean(saved.hipassTxKey));
  const canApprove = !busy && !dirty && !stale && checked && proofReady && !problem && pendingReceipt(saved);
  const eligibleBookings = bookings.filter(row => row.driverId === saved.driverId && saved.driverId &&
    (saved.vehicleId ? row.vehicleId === saved.vehicleId : row.vehiclePlate?.replace(/\s/g,'') === saved.vehiclePlate.replace(/\s/g,'')) &&
    row.serviceMode !== 'vehicle_only' && !['취소','작성 중','미배정'].includes(row.dispatchStatus));
  const quarterTurn = rotation % 180 !== 0;
  const rotated = { width: quarterTurn ? natural.height : natural.width, height: quarterTurn ? natural.width : natural.height };
  const scale = Math.min(Math.max(viewport.width - 24, 1) / rotated.width, Math.max(viewport.height - 24, 1) / rotated.height) * zoom;

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!viewer.current) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewer.current);
    return () => observer.disconnect();
  }, []);

  function close() {
    if (saving.current) return;
    if (dirty) setDiscard(true); else onClose();
  }
  async function persist(patch: ExpenseReviewPatch, advance = false) {
    if (saving.current || stale) return;
    saving.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await updateHqExpenseReviewDb(saved.id, patch, saved.updatedAt);
      if (!result.ok) {
        setError(result.error);
        if (result.conflict) await onRefresh();
        return;
      }
      setSaved(result.expense); setFields(expenseCorrectionFields(result.expense)); setAmount(String(result.expense.amount));
      setNotes(result.expense.reviewNotes || ''); setBillable(result.expense.billableToCustomer ?? true); setChecked(false);
      setNotice(patch.status ? '검수 상태가 저장되었습니다.' : '수정 내용이 저장되었습니다. 원본을 대조한 뒤 별도로 승인해 주세요.');
      if (advance) await onApproved(result.expense);
    } catch(error) { setError(error instanceof Error ? error.message : '다음 검수 목록을 불러오지 못했습니다.'); } finally { saving.current = false; setBusy(false); }
  }
  function save() {
    try { void persist({ corrections: normalizeExpenseCorrections(draft), reviewNotes: notes, billableToCustomer: billable }); }
    catch(error) { setError(error instanceof Error ? error.message : '입력 항목을 확인해 주세요.'); }
  }
  function reload() {
    setSaved(expense); setFields(expenseCorrectionFields(expense)); setAmount(String(expense.amount));
    setNotes(expense.reviewNotes || ''); setBillable(expense.billableToCustomer ?? true); setChecked(false); setError('');
  }
  const inputClass = 'mt-1 min-h-11 w-full rounded-[15px] border border-[#E1E7F0]/25 bg-white px-4 py-3 text-[14px] text-[#17233B] shadow-[0_4px_14px_rgba(35,49,78,0.045)] outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20 disabled:opacity-60';
  const buttonClass = 'min-h-11 cursor-pointer rounded-[14px] bg-white px-4 py-2 text-[13px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.045)] transition-colors hover:bg-[#F5F8FF] disabled:cursor-not-allowed disabled:opacity-40';

  return <dialog ref={dialog} aria-labelledby="receipt-review-title" aria-busy={busy}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (receiptApprovalShortcut(event.nativeEvent)) { event.preventDefault(); if (canApprove) approveButton.current?.click(); }
    }}
    className="fixed inset-0 m-auto h-[95dvh] max-h-[95dvh] w-[96vw] max-w-7xl overflow-hidden rounded-[26px] bg-[#FAFBFD] p-0 text-[#17233B] shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)] backdrop:bg-[#17233B]/30">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 bg-white p-5">
        <div><h2 id="receipt-review-title" className="text-[20px] font-bold tracking-[-0.03em] text-[#17233B]">영수증 검수 · {saved.merchant || '상호 확인 필요'}</h2>
          <p className="mt-1 text-xs text-slate-500">{saved.driverName} · {saved.vehiclePlate} · {saved.status} · {formatKRW(saved.amount)}</p></div>
        <button type="button" className={buttonClass} aria-label="검수 닫기" onClick={close} disabled={busy}><X size={20}/></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid lg:grid-cols-2 lg:overflow-hidden">
        <section aria-label="영수증 원본" className="flex flex-col bg-[#F7F9FC] lg:min-h-0">
          <div className="flex flex-wrap items-center gap-1 p-3">
            {!pdf && <><button className={buttonClass} aria-label="원본 축소" onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}><ZoomOut size={18}/></button>
              <span className="px-1 text-xs">{Math.round(zoom * 100)}%</span>
              <button className={buttonClass} aria-label="원본 확대" onClick={() => setZoom(value => Math.min(5, value + 0.25))}><ZoomIn size={18}/></button>
              <button className={buttonClass} aria-label="왼쪽으로 회전" onClick={() => setRotation(value => (value + 270) % 360)}><RotateCcw size={18}/></button>
              <button className={buttonClass} aria-label="오른쪽으로 회전" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw size={18}/></button>
              <button className={buttonClass} onClick={() => { setRotation(0); setZoom(1); }}><Scan size={18} className="inline mr-1"/>화면 맞춤</button></>}
            {saved.receiptUrl && <a className={`${buttonClass} inline-flex items-center`} href={saved.receiptUrl} target="_blank" rel="noopener noreferrer">원본 열기</a>}
          </div>
          <div ref={viewer} tabIndex={0} aria-label="원본 확대 영역 · 확대 후 스크롤로 이동" className="h-[48vh] min-h-72 overflow-auto overscroll-contain lg:h-auto lg:min-h-0 lg:flex-1">
            {saved.receiptUrl ? pdf ? <iframe title="영수증 PDF 원본" src={saved.receiptUrl} className="h-full min-h-72 w-full" onLoad={() => setLoaded(true)}/> :
              <div className="relative" style={{ width: Math.max(viewport.width, rotated.width * scale + 24), height: Math.max(viewport.height, rotated.height * scale + 24) }}>
                {/* Protected evidence uses its authenticated URL directly; transforms never rewrite the uploaded file. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={saved.receiptUrl} alt="검수할 영수증 원본" draggable={false}
                  onLoad={event => { setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setLoaded(true); }}
                  onError={() => { setLoaded(false); setError('원본을 불러오지 못했습니다. 원본 열기 또는 새로고침으로 확인해 주세요.'); }}
                  className="absolute max-w-none" style={{ width: natural.width * scale, height: natural.height * scale, left: '50%', top: '50%', transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}/>
              </div> : <div className="p-6 text-sm text-slate-600">{saved.hipassTxKey ? <>하이패스 거래 증빙<br/>{saved.hipassEntrance} → {saved.hipassExit}<br/>거래 식별자: {saved.hipassTxKey}</> : '서버에 저장된 영수증 원본이 없습니다. 기사에게 증빙을 요청해 주세요.'}</div>}
          </div>
          <p className="p-3 text-xs text-slate-500">회전·확대는 보기 설정입니다. 원본은 변경되지 않습니다. {pdf ? 'PDF의 페이지·확대는 뷰어 도구를 사용하세요.' : '확대 후 가로·세로 스크롤로 이동하세요.'}</p>
        </section>
        <section aria-label="영수증 항목 수정" className="space-y-5 bg-white p-5 lg:overflow-y-auto lg:overscroll-contain">
          {stale && <div role="alert" className="rounded-[15px] bg-[#FFF9F1] p-4 text-sm">다른 기기에서 변경된 내역입니다. 입력 내용은 유지됩니다.
            <button className={`${buttonClass} mt-2 block`} disabled={busy} onClick={reload}>입력을 버리고 최신 내역 사용</button></div>}
          {error && <div role="alert" className="rounded-[15px] bg-[#FFF4F2] p-4 text-[13px] text-[#A34E45]">{error}<button className="ml-2 underline" disabled={busy} onClick={() => void onRefresh()}>최신 내역 불러오기</button></div>}
          {notice && <p role="status" className="text-[13px] font-medium text-[#31598F]">{notice}</p>}
          {duplicate.isDuplicate && <p className="rounded-[15px] bg-[#FFF9F1] p-4 text-sm">중복 의심 영수증입니다. {duplicate.reason}</p>}
          <p className="text-xs text-slate-500">{saved.ocrExtracted ? 'OCR 추출 결과가 있습니다. 원본과 대조해 수정하세요.' : 'OCR 확인 정보가 없습니다. 원본을 직접 확인하세요.'} 수정 저장과 승인은 별개입니다.</p>
          <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">상호<input className={inputClass} value={fields.merchant} maxLength={200} onChange={event => setFields({ ...fields, merchant: event.target.value })}/></label>
            <label className="text-sm">지출 날짜<input type="date" className={inputClass} value={fields.rawDate} onChange={event => setFields({ ...fields, rawDate: event.target.value })}/></label>
            <label className="text-sm">지출 시간<input type="time" className={inputClass} value={fields.time} onChange={event => setFields({ ...fields, time: event.target.value })}/></label>
            <label className="text-sm">항목<select className={inputClass} value={fields.category} onChange={event => setFields({ ...fields, category: event.target.value as typeof fields.category })}>{Object.entries(EXPENSE_CATEGORIES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
            <label className="text-sm">금액 (원)<input inputMode="numeric" className={inputClass} value={amount} onChange={event => setAmount(event.target.value)}/></label>
            <label className="text-sm sm:col-span-2">결제자·결제수단<select className={inputClass} value={fields.paymentMethod} onChange={event => setFields({ ...fields, paymentMethod: event.target.value as typeof fields.paymentMethod })}><option value="unspecified">결제 미확인</option>{PAYMENT_METHODS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            <label className="text-sm sm:col-span-2">연결 예약<select className={inputClass} value={fields.bookingId || ''} onChange={event => setFields({ ...fields, bookingId: event.target.value || null })}><option value="">예약 연결 없음</option>
              {fields.bookingId && !eligibleBookings.some(row => (row.scheduleId || row.id) === fields.bookingId) && <option value={fields.bookingId}>현재 연결 예약 · {saved.customerName || fields.bookingId}</option>}
              {eligibleBookings.map(row => <option key={row.id} value={row.scheduleId || row.id}>{row.pickupDate} {row.pickupTime} · {row.customerName} · {row.pickupLocation}</option>)}</select></label>
            <label className="text-sm sm:col-span-2">주소<input className={inputClass} value={fields.address} maxLength={1000} onChange={event => setFields({ ...fields, address: event.target.value })}/></label>
            <label className="text-sm sm:col-span-2">메모<textarea className={inputClass} value={fields.memo} maxLength={5000} onChange={event => setFields({ ...fields, memo: event.target.value })}/></label>
            <label className="text-sm sm:col-span-2">검수 의견<textarea className={inputClass} value={notes} maxLength={5000} onChange={event => setNotes(event.target.value)}/></label>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={billable} onChange={event => setBillable(event.target.checked)}/>고객 정산에 반영</label>
          </fieldset>
          <button className={`${buttonClass} w-full bg-[#F7F9FC] text-[#17233B]`} disabled={busy || stale || !dirty} onClick={save}>수정 내용 저장</button>
          {problem && <p className="text-sm text-amber-800">{problem}</p>}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={busy || !proofReady || dirty || stale} onChange={event => setChecked(event.target.checked)}/>원본과 저장된 항목을 대조했습니다</label>
          <button ref={approveButton} className={`${buttonClass} flex w-full items-center justify-center gap-2 bg-[#1E60F3] text-white hover:bg-[#1757DC]`} disabled={!canApprove} onClick={() => void persist({ status: '승인 완료' }, true)}><Check size={18}/>승인 후 다음 영수증</button>
          <p className="text-xs text-slate-500">저장되지 않은 수정이 있으면 승인할 수 없습니다. 입력 칸 밖에서 Ctrl/Cmd+Enter로 승인할 수 있습니다.</p>
          <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy || dirty || stale} onClick={() => void persist({ status: '금액 확인' })}>보완 요청</button><button className={buttonClass} disabled={busy || dirty || stale} onClick={() => void persist({ status: '반려' })}>반려</button></div>
        </section>
      </div>
      {busy && <p role="status" className="border-t p-3 text-center text-sm">서버 저장 결과를 확인하고 있습니다.</p>}
      {discard && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-amber-50 p-3 text-sm"><span>저장하지 않은 입력을 버리고 닫으시겠습니까?</span><button className={buttonClass} onClick={() => setDiscard(false)}>계속 검수</button><button className={buttonClass} onClick={onClose}>입력 버리고 닫기</button></div>}
    </div>
  </dialog>;
}
