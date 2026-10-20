'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Building2, Calculator, CarFront, Check, ClipboardCheck,
  ClipboardList, Clock3, Copy, Eye, Fuel, MapPinPlus, Plane, Plus,
  Receipt, ShieldAlert, Trash2,
} from 'lucide-react';

type Stop = { id: string; time: string; place: string };
type Expense = { id: string; category: string; amount: string; note: string };
type Section = 'log' | 'expenses';
type View = 'driver' | 'admin';

const CATEGORIES = ['통행료', '세차비', '주차비', '주유비', '교통비', '숙박비', '식비', '기타'];
const money = (value: number) => value.toLocaleString('ko-KR') + '원';
const number = (value: number) => value.toLocaleString('ko-KR');
const createId = () => crypto.randomUUID();

function minutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  return hours < 24 && mins < 60 ? hours * 60 + mins : null;
}

function elapsedTime(start: string, end: string): number | null {
  const first = minutes(start);
  const last = minutes(end);
  if (first === null || last === null) return null;
  // A smaller end time is treated as the following calendar day.
  return (last - first + 1440) % 1440;
}

const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98]';
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5"><span className="text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
function SectionCard({ children }: { children: ReactNode }) {
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">{children}</section>;
}

export default function VipReportDemo() {
  const [view, setView] = useState<View>('driver');
  const [section, setSection] = useState<Section>('log');
  const [date, setDate] = useState('2026-10-19');
  const [driverName, setDriverName] = useState('샘플 기사');
  const [vehicle, setVehicle] = useState('샘플 차량');
  const [client, setClient] = useState('VIP 고객사 예시');
  const [passengers, setPassengers] = useState('9');
  const [clockIn, setClockIn] = useState('06:40');
  const [clockOut, setClockOut] = useState('22:30');
  const [odoStart, setOdoStart] = useState('154725');
  const [odoEnd, setOdoEnd] = useState('154861');
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [stops, setStops] = useState<Stop[]>([
    { id: 's1', time: '07:00', place: '차고지' },
    { id: 's2', time: '08:50', place: '호텔' },
    { id: 's3', time: '22:15', place: '차고지' },
  ]);
  const [expenses, setExpenses] = useState<Expense[]>([
    { id: 'e1', category: '통행료', amount: '1000', note: '' },
    { id: 'e2', category: '통행료', amount: '1000', note: '' },
    { id: 'e3', category: '주차비', amount: '18800', note: '' },
    { id: 'e4', category: '식비', amount: '9500', note: '점심' },
    { id: 'e5', category: '식비', amount: '10000', note: '저녁' },
  ]);

  const duration = useMemo(() => elapsedTime(clockIn, clockOut), [clockIn, clockOut]);
  const durationLabel = duration === null ? '확인 필요' : Math.floor(duration / 60) + '시간 ' + duration % 60 + '분';
  const validOdometer = odoStart.trim() !== '' && odoEnd.trim() !== '' &&
    Number.isFinite(Number(odoStart)) && Number.isFinite(Number(odoEnd)) &&
    Number(odoStart) >= 0 && Number(odoEnd) >= Number(odoStart);
  const distance = validOdometer ? Number(odoEnd) - Number(odoStart) : null;
  const expenseTotal = expenses.reduce((sum, expense) => {
    const value = Number(expense.amount);
    return sum + (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  }, 0);

  const groupedExpenses = CATEGORIES.map(category => ({
    category,
    amount: expenses.filter(item => item.category === category)
      .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0),
  }));

  const routeText = stops.map(stop => stop.time + ' ' + (stop.place.trim() || '(장소 미입력)')).join(' → ');
  const reportText = [
    date, '수행담당 : ' + driverName, '차량번호 : ' + vehicle,
    '고객명 : ' + client, '탑승인원 : ' + passengers + '명',
    '출근시간 : ' + clockIn, '퇴근시간 : ' + clockOut,
    '총 근무시간 : ' + durationLabel,
    '시작km : ' + (odoStart || '-') + ' km',
    '종료km : ' + (odoEnd || '-') + ' km',
    '일일운행합 : ' + (distance === null ? '확인 필요' : number(distance) + ' km'),
    '', '운행일지', routeText, '', '경비지출',
    ...groupedExpenses.map(item => item.category + ' : ' + money(item.amount)),
    '합계 : ' + money(expenseTotal),
    '', '특이사항', notes || '(없음)',
  ].join('\n');

  const editStop = (id: string, patch: Partial<Stop>) =>
    setStops(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const editExpense = (id: string, patch: Partial<Expense>) =>
    setExpenses(current => current.map(item => item.id === id ? { ...item, ...patch } : item));

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] pb-16 text-slate-900">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-5 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <a href="/" className={buttonClass + ' border border-slate-200 bg-white text-slate-700'}><ArrowLeft className="h-4 w-4" /> Cockpit</a>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">DESIGN DEMO · NOT SAVED</span>
        </header>

        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-[#1E60F3]"><Building2 className="h-4 w-4" /> VIP LIMOUSINE KOREA</div>
            <h1 className="text-2xl font-bold tracking-tight">운행보고 · 경비관리</h1>
            <p className="max-w-lg text-sm leading-relaxed text-slate-500">출근시간과 퇴근시간만 입력합니다. 운행거리, 총 근무시간, 경비 합계는 자동으로 계산됩니다.</p>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
            <button type="button" onClick={() => setView('driver')} className={buttonClass + (view === 'driver' ? ' bg-white text-[#1E60F3] shadow-sm' : ' text-slate-600')}>기사 화면</button>
            <button type="button" onClick={() => setView('admin')} className={buttonClass + (view === 'admin' ? ' bg-white text-[#1E60F3] shadow-sm' : ' text-slate-600')}>관리자 시트 예시</button>
          </div>
        </div>

        {view === 'driver' ? (
          <div className="mx-auto max-w-xl space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSection('log')} className={buttonClass + ' min-h-20 flex-col ' + (section === 'log' ? 'bg-[#1E60F3] text-white' : 'bg-slate-50 text-slate-700')}>
                  <ClipboardList className="h-6 w-6" /> 운행일지
                </button>
                <button type="button" onClick={() => setSection('expenses')} className={buttonClass + ' min-h-20 flex-col ' + (section === 'expenses' ? 'bg-[#1E60F3] text-white' : 'bg-slate-50 text-slate-700')}>
                  <Receipt className="h-6 w-6" /> 경비지출
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { icon: ClipboardCheck, label: '차량체크' },
                  { icon: MapPinPlus, label: '즐겨찾기' },
                  { icon: Fuel, label: '주유' },
                  { icon: Plane, label: '항공편' },
                  { icon: Eye, label: '로드뷰' },
                ].map(item => (
                  <div key={item.label} className="flex flex-col items-center gap-1.5 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 text-slate-600"><item.icon className="h-5 w-5" /></div>
                    <span className="text-[10px] font-medium text-slate-600">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-400">기존 5개 바로가기는 실제 Cockpit에서 그대로 유지됩니다.</p>
            </div>

            <SectionCard>
              <h2 className="text-base font-bold">기본 정보</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="날짜"><input aria-label="날짜" type="date" className={inputClass} value={date} onChange={e => setDate(e.target.value)} /></Field>
                <Field label="탑승인원"><input type="number" min="0" className={inputClass} value={passengers} onChange={e => setPassengers(e.target.value)} /></Field>
                <Field label="수행담당"><input className={inputClass} value={driverName} onChange={e => setDriverName(e.target.value)} /></Field>
                <Field label="차량번호"><input className={inputClass} value={vehicle} onChange={e => setVehicle(e.target.value)} /></Field>
                <div className="col-span-2"><Field label="고객명"><input className={inputClass} value={client} onChange={e => setClient(e.target.value)} /></Field></div>
              </div>
              <p className="text-xs text-slate-400">운영 버전에서는 기사, 차량, 고객 정보를 검증된 배차정보에서 불러옵니다.</p>
            </SectionCard>

            {section === 'log' ? (
              <>
                <SectionCard>
                  <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#1E60F3]" /><h2 className="font-bold">근무 시간</h2></div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="출근시간"><input type="time" className={inputClass} value={clockIn} onChange={e => setClockIn(e.target.value)} /></Field>
                    <Field label="퇴근시간"><input type="time" className={inputClass} value={clockOut} onChange={e => setClockOut(e.target.value)} /></Field>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-4 py-3"><p className="text-xs font-semibold text-slate-600">총 근무시간 · 경과 시간</p><p className="mt-1 text-xl font-bold text-[#1E60F3]">{durationLabel}</p></div>
                  <p className="text-xs leading-relaxed text-slate-500">퇴근시간이 출근시간보다 빠르면 다음 날 퇴근한 것으로 계산합니다. 휴게시간은 아직 차감하지 않습니다.</p>
                </SectionCard>

                <SectionCard>
                  <div className="flex items-center gap-2"><CarFront className="h-5 w-5 text-[#1E60F3]" /><h2 className="font-bold">주행거리</h2></div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="시작 km"><input type="number" min="0" className={inputClass} value={odoStart} onChange={e => setOdoStart(e.target.value)} /></Field>
                    <Field label="종료 km"><input type="number" min="0" className={inputClass} value={odoEnd} onChange={e => setOdoEnd(e.target.value)} /></Field>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-xs font-semibold text-slate-600">일일운행합</p><p className="mt-1 text-xl font-bold">{distance === null ? '입력값 확인 필요' : number(distance) + ' km'}</p></div>
                </SectionCard>

                <SectionCard>
                  <div className="flex items-center justify-between gap-3"><h2 className="font-bold">운행일지 · 이동 경로</h2><span className="text-xs text-slate-500">{stops.length}개 지점</span></div>
                  <div className="space-y-2">
                    {stops.map((stop, index) => (
                      <div key={stop.id} className="flex items-end gap-2">
                        <span className="mb-3 w-4 shrink-0 text-xs font-bold text-slate-400">{index + 1}</span>
                        <div className="w-28 shrink-0"><Field label="시간"><input aria-label={'경유지 ' + (index + 1) + ' 시간'} type="time" className={inputClass} value={stop.time} onChange={e => editStop(stop.id, { time: e.target.value })} /></Field></div>
                        <div className="min-w-0 flex-1"><Field label="장소"><input aria-label={'경유지 ' + (index + 1) + ' 장소'} className={inputClass} value={stop.place} onChange={e => editStop(stop.id, { place: e.target.value })} /></Field></div>
                        <button aria-label={'경유지 ' + (index + 1) + ' 삭제'} type="button" onClick={() => setStops(current => current.filter(item => item.id !== stop.id))} className="mb-0.5 rounded-xl p-3 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setStops(current => [...current, { id: createId(), time: '12:00', place: '' }])} className={buttonClass + ' w-full border border-dashed border-[#1E60F3] text-[#1E60F3]'}><Plus className="h-4 w-4" /> 경유지 추가</button>
                  <Field label="특이사항"><textarea rows={3} className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} placeholder="전달할 사항을 적어주세요." /></Field>
                </SectionCard>
              </>
            ) : (
              <SectionCard>
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Receipt className="h-5 w-5 text-[#1E60F3]" /><h2 className="font-bold">경비지출</h2></div><span className="text-xs text-slate-500">{expenses.length}개 항목</span></div>
                <div className="space-y-3">
                  {expenses.map((item, index) => (
                    <div key={item.id} className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                        <Field label="종류"><select className={inputClass} value={item.category} onChange={e => editExpense(item.id, { category: e.target.value })}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></Field>
                        <Field label="금액 (원)"><input type="number" min="0" className={inputClass} value={item.amount} onChange={e => editExpense(item.id, { amount: e.target.value })} /></Field>
                        <button aria-label={'경비 ' + (index + 1) + ' 삭제'} type="button" onClick={() => setExpenses(current => current.filter(expense => expense.id !== item.id))} className="rounded-xl p-3 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <Field label="메모 (선택)"><input className={inputClass} value={item.note} onChange={e => editExpense(item.id, { note: e.target.value })} placeholder="예: 점심, 영수증 번호" /></Field>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setExpenses(current => [...current, { id: createId(), category: '기타', amount: '0', note: '' }])} className={buttonClass + ' w-full border border-dashed border-[#1E60F3] text-[#1E60F3]'}><Plus className="h-4 w-4" /> 경비 항목 추가</button>
                <div className="rounded-xl bg-blue-50 px-4 py-3"><p className="text-xs font-semibold text-slate-600">경비 합계</p><p className="mt-1 text-2xl font-bold text-[#1E60F3]">{money(expenseTotal)}</p></div>
                <p className="text-xs text-slate-500">영수증 사진 첨부와 AI 읽기는 후속 개발 단계에서 연결합니다.</p>
              </SectionCard>
            )}

            <SectionCard>
              <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-[#1E60F3]" /><h2 className="font-bold">자동 계산 요약</h2></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">근무시간</p><p className="mt-1 text-sm font-bold">{durationLabel}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">주행거리</p><p className="mt-1 text-sm font-bold">{distance === null ? '확인 필요' : number(distance) + 'km'}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">경비합계</p><p className="mt-1 text-sm font-bold">{money(expenseTotal)}</p></div>
              </div>
              <button type="button" onClick={copyReport} className={buttonClass + ' w-full bg-[#1E60F3] text-white'}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? '복사 완료' : '작성 내용 복사'}</button>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><ShieldAlert className="mr-1 inline h-4 w-4" /> 이 화면은 디자인 검토용입니다. 실제 관리자 시트 전송·저장은 아직 연결되지 않았습니다.</div>
            </SectionCard>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="text-lg font-bold">관리자 운행 시트 · 실시간 미리보기</h2>
              <p className="mt-1 text-sm text-slate-500">기사 입력값이 어떻게 표시될지 확인하는 예시입니다. 현재는 실제 저장·전송되지 않습니다.</p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[940px] w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600"><tr>
                    {['날짜', '고객명', '수행담당', '차량번호', '출근시간', '퇴근시간', '총 근무시간', '주행거리', '경비합계', '상태'].map(name => <th key={name} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold">{name}</th>)}
                  </tr></thead>
                  <tbody><tr className="text-slate-800">
                    {[date, client, driverName, vehicle, clockIn, clockOut, durationLabel, distance === null ? '확인 필요' : number(distance) + ' km', money(expenseTotal), '미제출 (데모)'].map((value, index) => <td key={index} className="whitespace-nowrap px-3 py-4">{value}</td>)}
                  </tr></tbody>
                </table>
              </div>
            </section>
            <div className="grid gap-4 md:grid-cols-2">
              <SectionCard><h3 className="font-bold">운행 경로</h3><ol className="space-y-2">{stops.map((stop, index) => <li key={stop.id} className="flex gap-3 text-sm"><span className="w-6 shrink-0 text-slate-400">{index + 1}.</span><span className="font-semibold">{stop.time}</span><span className="text-slate-600">{stop.place || '(미입력)'}</span></li>)}</ol></SectionCard>
              <SectionCard><h3 className="font-bold">경비 내역</h3><div className="space-y-2">{groupedExpenses.map(item => <div key={item.category} className="flex justify-between text-sm"><span className="text-slate-600">{item.category}</span><span className="font-medium">{money(item.amount)}</span></div>)}</div><div className="flex justify-between border-t border-slate-200 pt-3 font-bold"><span>합계</span><span className="text-[#1E60F3]">{money(expenseTotal)}</span></div></SectionCard>
            </div>
            <button type="button" onClick={() => setView('driver')} className={buttonClass + ' border border-slate-200 bg-white text-slate-700'}><ArrowLeft className="h-4 w-4" /> 기사 화면으로 돌아가기</button>
          </div>
        )}
      </div>
    </main>
  );
}
