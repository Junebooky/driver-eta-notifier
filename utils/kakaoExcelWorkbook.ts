import * as XLSX from 'xlsx';
import {
  EXCEL_COLUMN_LABELS, normalizedPlate, validateKakaoExcelDraft,
  type KakaoExcelDraft,
} from '@/utils/kakaoExcelImport';

const MAX_BYTES = 12 * 1024 * 1024;
const MONTH_PATTERN = /^(\d{4})-(\d{2})-\d{2}$/;

export interface KakaoWorkbookResult {
  bytes: Uint8Array;
  sheetName: string;
  rowNumber: number;
  createdMonth: boolean;
}
function excelDateSerial(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function cleaned(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
}
function safeText(value: string): string {
  // Protect against Excel formula injection when names/notes come from messages.
  const trimmed = value.trim();
  return /^[=+\-@\t\r]/.test(trimmed) ? "'" + trimmed : trimmed;
}
function numberOrText(raw: string): number | string | null {
  if (!raw.trim()) return null;
  const digits = raw.replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(digits) ? Number(digits) : safeText(raw);
}
function shortPlate(plate: string): number | string {
  // Existing user's book stores most car numbers as four trailing digits.
  // Exact full plate must have been validated in the UI before this conversion.
  const full = plate.replace(/\s+/g, '');
  const match = full.match(/^\d{1,3}[가-힣]{1,2}(\d{4})$/);
  return match ? Number(match[1]) : safeText(plate);
}
export function workbookFromFile(bytes: Uint8Array): XLSX.WorkBook {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Excel 파일은 12MB 이하의 .xlsx 파일만 지원합니다.');
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true, cellDates: false });
  if (!workbook.SheetNames.length) throw new Error('Excel 시트가 없는 파일입니다.');
  return workbook;
}
function rowValues(sheet: XLSX.WorkSheet, row: number): unknown[] {
  return Array.from({length: 12}, (_, i) => {
    const cell = sheet[XLSX.utils.encode_cell({r: row - 1, c: i})] as XLSX.CellObject | undefined;
    return cell?.v ?? null;
  });
}
function isSamePlate(book: unknown, plate: string): boolean {
  const normalized = normalizedPlate(String(book ?? ''));
  if (normalized === normalizedPlate(plate)) return true;
  const full = plate.replace(/\s/g, '');
  const last4 = full.match(/(\d{4})$/)?.[1];
  // Only a complete 4-digit book value may be compared to the plate suffix.
  return !!last4 && /^\d{4}$/.test(normalized) && normalized === last4;
}
export function appendKakaoExcelReport(bytes: Uint8Array, draft: KakaoExcelDraft): KakaoWorkbookResult {
  const errors = validateKakaoExcelDraft(draft);
  if (errors.length) throw new Error(errors.join(' '));
  const dateMatch = draft.date.match(MONTH_PATTERN);
  if (!dateMatch) throw new Error('날짜 형식이 올바르지 않습니다.');
  const monthName = Number(dateMatch[2]) + '월';
  const wb = workbookFromFile(bytes);
  const existing = wb.Sheets[monthName];
  let target: XLSX.WorkSheet;
  const createdMonth = !existing;
  if (existing) {
    target = existing;
  } else {
    // A/B headers in the uploaded 4월 reference are old numeric values.
    // Make the two labels explicit for a NEW month without changing existing tabs.
    target = XLSX.utils.aoa_to_sheet([EXCEL_COLUMN_LABELS.slice()]);
    const base = wb.Sheets[wb.SheetNames.find(n => /^\d{1,2}월$/.test(n)) || wb.SheetNames[0]];
    target['!cols'] = base?.['!cols']?.map(col => ({...col})) || [
      {wch:12}, {wch:17}, {wch:18}, {wch:20}, {wch:16},
      {wch:24}, {wch:52}, {wch:15}, {wch:14}, {wch:15}, {wch:16}, {wch:18},
    ];
    XLSX.utils.book_append_sheet(wb, target, monthName);
  }
  const used = XLSX.utils.decode_range(target['!ref'] || 'A1:L1');
  const maxRow = Math.min(Math.max(used.e.r + 1, 1), 25000);
  const serial = excelDateSerial(draft.date);
  let lastDataRow = 1;
  for (let row = 2; row <= maxRow; row++) {
    const v = rowValues(target, row);
    const populated = v.slice(0, 8).filter(x => x !== null && String(x).trim() !== '').length;
    if (populated < 3) continue; // ignore stray footer cells, formulas, template notes
    lastDataRow = row;
    if (Number(v[0]) === serial &&
        isSamePlate(v[1], draft.plate) &&
        cleaned(v[3]) === cleaned(draft.customer) &&
        cleaned(v[4]) === cleaned(draft.driver) &&
        cleaned(v[5]) === cleaned(draft.time)) {
      throw new Error('이미 같은 날짜·차량·거래처·운전자·시간의 기록이 존재합니다. 중복 등록을 차단했습니다.');
    }
  }
  let insertRow = lastDataRow + 1;
  while (rowValues(target, insertRow).some(x => x !== null && String(x).trim() !== '')) insertRow++;
  const newRow: (string | number | null)[] = [
    serial, shortPlate(draft.plate), safeText(draft.model), safeText(draft.customer),
    safeText(draft.driver), safeText(draft.time), draft.route.trim() ? safeText(draft.route) : null,
    draft.serviceType.trim() ? safeText(draft.serviceType) : null, numberOrText(draft.overtime),
    numberOrText(draft.amount), draft.payment.trim() ? safeText(draft.payment) : null, numberOrText(draft.totalWithVat),
  ];
  XLSX.utils.sheet_add_aoa(target, [newRow], {origin: 'A' + insertRow});
  const dateCell = target['A' + insertRow] as XLSX.CellObject | undefined;
  if (dateCell) { dateCell.t = 'n'; dateCell.z = 'm/d/yyyy'; }
  const result = XLSX.write(wb, {bookType:'xlsx', type:'array', compression:true, cellStyles:true}) as ArrayBuffer;
  return {bytes:new Uint8Array(result), sheetName:monthName, rowNumber:insertRow, createdMonth};
}