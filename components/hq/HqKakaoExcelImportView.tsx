'use client';

import { HqDriverReportInbox } from '@/components/hq/HqDriverReportInbox';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardPaste, Download, FileSpreadsheet,
  FolderOpen, Info, Save, ShieldCheck,
} from 'lucide-react';
import {
  EXCEL_COLUMN_LABELS, excelVehicleModel, parseKakaoExcelReport,
  validateKakaoExcelDraft, type KakaoExcelDraft,
} from '@/utils/kakaoExcelImport';

type LocalFileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{write: (data: Blob) => Promise<void>; close: () => Promise<void>}>;
};
type PickerWindow = Window & {showOpenFilePicker?: (options?: unknown) => Promise<LocalFileHandle[]>};
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const fields: Array<{key:keyof KakaoExcelDraft; label:string; type?:string; full?:boolean}> = [
  {key:'date',label:'A · 날짜',type:'date'},
  {key:'plate',label:'B · 차량번호 (전체 번호로 확인)'},
  {key:'model',label:'C · 차종'},
  {key:'customer',label:'D · 거래처'},
  {key:'driver',label:'E · 운전자'},
  {key:'time',label:'F · 타임'},
  {key:'route',label:'G · 센딩,픽업',full:true},
  {key:'serviceType',label:'H · 셀프/의전'},
];
const optionalFields: Array<{key:keyof KakaoExcelDraft;label:string}> = [
  {key:'overtime',label:'I · OT Hours'},
  {key:'amount',label:'J · 합계'},
  {key:'payment',label:'K · 결제방법'},
  {key:'totalWithVat',label:'L · 합계(부포함)'},
];

export function HqKakaoExcelImportView() {
  const [raw, setRaw] = useState('');
  const [assumedYear, setAssumedYear] = useState(String(new Date().getFullYear()));
  const [reviewed, setReviewed] = useState(false);
  const sourceBytes = useRef<Uint8Array | null>(null);
  const operation = useRef(false);
  const [draft, setDraft] = useState<KakaoExcelDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [workbookBytes, setWorkbookBytes] = useState<Uint8Array | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [handle, setHandle] = useState<LocalFileHandle | null>(null);
  const [updatedRows, setUpdatedRows] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const requiredErrors = useMemo(() => draft ? validateKakaoExcelDraft(draft) : [], [draft]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (hasChanges) {event.preventDefault(); event.returnValue = '';}};
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  });

  function extract() {
    const result = parseKakaoExcelReport(raw, Number(assumedYear));
    setReviewed(false);
    setDraft(result.draft);
    setWarnings(result.warnings);
    setMessage(result.missing.length
      ? '확인 후 입력할 항목: ' + result.missing.join(', ')
      : '추출했습니다. Excel에 추가하기 전에 내용을 검토해 주세요.');
  }

  async function loadFile(file: File, chosenHandle: LocalFileHandle | null) {
    if (operation.current) return;
    if (!/\.xlsx$/i.test(file.name)) throw new Error('.xlsx 형식만 지원합니다.');
    if (hasChanges && !window.confirm('아직 저장하지 않은 Excel 변경 사항이 있습니다. 다른 파일을 열면 사라집니다. 계속할까요?')) return;
    operation.current = true;
    setBusy(true);
    try {
    const data = new Uint8Array(await file.arrayBuffer());
    const {workbookFromFile} = await import('@/utils/kakaoExcelWorkbook');
    workbookFromFile(data);
    sourceBytes.current = data;
    setWorkbookBytes(data);
    setSourceName(file.name);
    setHandle(chosenHandle);
    setUpdatedRows([]);
    setHasChanges(false);
    setMessage(file.name + ' 파일을 불러왔습니다. 원본 파일은 아직 변경되지 않았습니다.');
    } finally { operation.current = false; setBusy(false); }
  }

  async function selectPcFile() {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) {fileInput.current?.click(); return;}
    try {
      const [selected] = await picker({
        multiple:false, excludeAcceptAllOption:true,
        types:[{description:'Microsoft Excel',accept:{[XLSX_TYPE]:['.xlsx']}}],
      });
      if (selected) await loadFile(await selected.getFile(), selected);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setMessage((err as Error)?.message || '파일을 열지 못했습니다.');
    }
  }

  async function appendRow() {
    if (!draft || !workbookBytes || requiredErrors.length || busy || !reviewed || operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const {appendKakaoExcelReport} = await import('@/utils/kakaoExcelWorkbook');
      const result = appendKakaoExcelReport(workbookBytes, draft);
      setWorkbookBytes(result.bytes);
      setUpdatedRows(prev => [...prev, result.sheetName + ' · ' + result.rowNumber + '행']);
      setHasChanges(true);
      setMessage(result.sheetName + ' ' + result.rowNumber + '행에 반영했습니다. 아래 저장 버튼으로 파일을 저장해야 완료됩니다.');
      setRaw('');
      setDraft(null);
      setWarnings([]);
    } catch (err) {
      setMessage((err as Error)?.message || 'Excel 파일에 추가하지 못했습니다.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function downloadFile() {
    if (!workbookBytes || !hasChanges) return;
    const blob = new Blob([Uint8Array.from(workbookBytes)],{type:XLSX_TYPE});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stem = sourceName.replace(/\.xlsx$/i, '');
    a.download = stem + '_업데이트.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMessage('업데이트된 Excel 사본을 다운로드했습니다. 원본 파일은 변경되지 않았습니다. 다운로드한 파일을 기존 장부와 교체하기 전에 내용을 확인해 주세요.');
  }

  async function saveToPcFile() {
    if (!handle || !workbookBytes || !hasChanges || busy || operation.current) return;
    if (!window.confirm('선택한 원본 Excel 파일을 직접 갱신합니다. 먼저 별도 백업을 보관했는지 확인해 주세요. 계속할까요?')) return;
    operation.current = true;
    setBusy(true);
    try {
      const disk = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (!sourceBytes.current || disk.length !== sourceBytes.current.length || disk.some((v,i) => v !== sourceBytes.current![i])) throw new Error('원본 파일이 다른 곳에서 변경되었습니다. 변경본을 다운로드하고 최신 원본을 다시 열어 주세요.');
      const writer = await handle.createWritable();
      await writer.write(new Blob([Uint8Array.from(workbookBytes)],{type:XLSX_TYPE}));
      await writer.close();
      const reopened = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (reopened.length !== workbookBytes.length || reopened.some((v,i) => v !== workbookBytes[i])) throw new Error('저장 후 재열기 검증에 실패했습니다. 백업 사본을 확인해 주세요.');
      sourceBytes.current = reopened;
      setHasChanges(false);
      setMessage('선택한 PC Excel 파일에 저장했습니다. 해당 파일이 OneDrive 동기화 폴더에 있다면 동기화는 OneDrive 클라이언트가 처리합니다.');
    } catch (err) {
      setMessage('저장에 실패했습니다. 파일이 열려 있거나 쓰기 권한이 없을 수 있습니다: ' + ((err as Error)?.message || '알 수 없는 오류'));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const applyField = (key: keyof KakaoExcelDraft, value: string) => { setReviewed(false); setDraft(prev => {
    if (!prev) return prev;
    if (key === 'plate') return {...prev, plate:value, model:excelVehicleModel(value)};
    return {...prev,[key]:value};
  }); };

  return <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5">
    <HqDriverReportInbox />
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-[#1E60F3]"><FileSpreadsheet size={23}/></div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-800">카카오톡 보고 → Excel 자동입력</h2>
          <p className="mt-1 text-sm text-slate-500">기존 회사 Excel의 A~L 열만 사용합니다. 경비·운행일지 상세를 별도 열로 추가하지 않습니다.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void selectPcFile()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <FolderOpen size={17}/> Excel 파일 열기
        </button>
        <input ref={fileInput} type="file" accept=".xlsx" className="hidden" onChange={e => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file,null).catch(err => setMessage(err.message));
          e.target.value = '';
        }}/>
        <span className="text-sm text-slate-500">{sourceName ? '선택 파일: ' + sourceName : 'Excel 파일을 먼저 열어 주세요.'}</span>
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        <Info size={14} className="mr-1 inline text-slate-500"/>
        현재는 PC 파일을 불러와 갱신하는 방식입니다. OneDrive 개인용 계정에 자동으로 직접 쓰는 Microsoft Graph Excel API는 지원되지 않습니다. 동기화 폴더의 파일은 지원 브라우저에서 직접 저장하거나, 갱신본을 내려받아 OneDrive에 넣을 수 있습니다.
      </div>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><ClipboardPaste size={17}/> 카카오톡 운행보고 붙여넣기</h3>
        <label className="flex items-center gap-2 text-xs text-slate-600">연도
          <input type="number" min="2020" max="2100" value={assumedYear} onChange={e=>{setAssumedYear(e.target.value); setDraft(null); setReviewed(false);}} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"/>
        </label>
      </div>
      <textarea value={raw} onChange={e => {setRaw(e.target.value); setDraft(null); setReviewed(false);}} aria-label="카카오톡 운행보고 원문" rows={8} placeholder={'10월 24일(토)\n수행담당 : 윤태준\n차량번호 : 700호 1458\n고객명 : 샤넬\n시작 시간 : 09:15\n종료 시간 : 17:20\n출발지 : 안다즈 호텔\n최종도착지 : 차고지'} className="w-full resize-y text-slate-700 rounded-xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-[#1E60F3]"/>
      <button type="button" disabled={!raw.trim() || busy} onClick={extract} className="rounded-xl bg-[#1E60F3] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">항목 추출 및 검토</button>
    </div>

    {draft && <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-slate-800">Excel 입력값 확인</h3>
        <span className="text-xs text-slate-500">운행경로는 기존 G열의 요약만 입력합니다.</span>
      </div>
      {(warnings.length > 0 || requiredErrors.length > 0) && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
        <AlertTriangle size={16} className="mr-2 inline"/>
        {[...warnings, ...requiredErrors].map((warning,i) => <p key={i} className="mt-1">{warning}</p>)}
      </div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map(({key,label,type,full}) => <label key={key} className={'space-y-1.5 text-xs font-semibold text-slate-600 ' + (full ? 'sm:col-span-2':'')}>
          <span>{label}</span>
          {key==='serviceType'
            ? <select value={draft[key]} onChange={e => applyField(key,e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-800">
                <option value="">분류 선택 (미확정)</option><option value="의전">의전</option><option value="셀프">셀프</option><option value="인천픽업">인천픽업</option><option value="인천센딩">인천센딩</option><option value="김포픽업">김포픽업</option><option value="김포센딩">김포센딩</option><option value="차량관리">차량관리</option>
              </select>
            : <input type={type||'text'} value={draft[key]} onChange={e => applyField(key,e.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal text-slate-800 outline-none focus:border-[#1E60F3]"/>}
        </label>)}
      </div>
      <details className="rounded-xl bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-700">나머지 기존 열 I~L 직접 입력 (선택)</summary>
        <p className="mt-2 text-xs text-slate-500">OT·요금·결제방법은 카카오톡의 운행총시간·경비 합계에서 추정하지 않습니다.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {optionalFields.map(({key,label}) => <label key={key} className="space-y-1.5 text-xs font-semibold text-slate-600">
            <span>{label}</span><input value={draft[key]} onChange={e=>applyField(key,e.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-800"/>
          </label>)}
        </div>
      </details>
      <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1 accent-[#1E60F3]"/>날짜·차량·익일 시각과 모든 안내를 확인했습니다. 불명확한 값은 직접 확인해 수정했습니다.</label>
      <button type="button" onClick={() => void appendRow()} disabled={!workbookBytes || busy || !reviewed || requiredErrors.length > 0} className="rounded-xl bg-[#1E60F3] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? '처리 중…' : '확인하고 Excel에 행 추가'}
      </button>
    </div>}

    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><ShieldCheck size={18} className="text-[#1E60F3]"/> 저장 및 중복 검사</div>
      {updatedRows.length>0 && <p className="text-sm text-slate-600">추가한 위치: {updatedRows.join(' · ')}</p>}
      {message && <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!hasChanges || busy} onClick={downloadFile} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40"><Download size={17}/> 갱신된 Excel 다운로드</button>
        {handle && <button type="button" disabled={!hasChanges || busy} onClick={() => void saveToPcFile()} className="inline-flex items-center gap-2 rounded-xl bg-[#1E60F3] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Save size={17}/> 선택한 PC 파일에 저장</button>}
      </div>
      <p className="text-xs text-slate-500"><CheckCircle2 size={13} className="mr-1 inline"/> 같은 날짜·차량·거래처·기사·시간의 중복 행을 검사하고, 월별 시트가 없으면 회사가 승인한 템플릿을 Excel에서 먼저 복제해 주세요.</p>
      <p className="text-xs text-slate-500">출력 전 원본 파일을 별도로 백업해 두세요. 기존 기록·수식·서식은 유지하고 사용 범위 뒤에 A~L 행만 추가합니다. 회사 실제 장부 사본 검증 후 사용하세요.</p>
      <span className="sr-only">{EXCEL_COLUMN_LABELS.join(', ')}</span>
    </div>
  </div>;
}