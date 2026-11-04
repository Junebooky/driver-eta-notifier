/**
 * Parses the existing driver KakaoTalk report into ONLY the 12 columns used by
 * the customer's 2026 vehicle-use workbook. No new log/expense columns.
 */
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';

export interface KakaoExcelDraft {
  date: string; // yyyy-mm-dd
  plate: string; // complete license plate, never just last four for matching
  model: string; // workbook column C
  customer: string;
  driver: string;
  time: string; // workbook column F, e.g. 09:15~17:20
  route: string; // workbook column G, confirmed summary only
  serviceType: string; // workbook column H; do not infer
  overtime: string; // workbook column I; blank unless explicitly reviewed
  amount: string; // workbook column J; never derive from expenses
  payment: string; // workbook column K
  totalWithVat: string; // workbook column L
}

export interface KakaoExcelParseResult {
  draft: KakaoExcelDraft;
  warnings: string[];
  missing: string[];
}

export const currentReportYear = () => Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date()));

export const EXCEL_COLUMN_LABELS = [
  '날짜', '차량번호', '차종', '거래처', '운전자', '타임',
  '센딩,픽업', '셀프/의전', 'OT Hours', '합계', '결제방법', '합계(부포함)',
] as const;

export const blankKakaoExcelDraft = (): KakaoExcelDraft => ({
  date: '', plate: '', model: '', customer: '', driver: '',
  time: '', route: '', serviceType: '', overtime: '',
  amount: '', payment: '', totalWithVat: '',
});

export const normalizedPlate = (plate: string): string =>
  plate.replace(/\s+/g, '').toLowerCase();

export function findExactFleetVehicle(plate: string) {
  const exact = normalizedPlate(plate);
  return exact ? VIP_REAL_VEHICLES.find(v => normalizedPlate(v.plate) === exact) : undefined;
}

export function excelVehicleModel(plate: string): string {
  const vehicle = findExactFleetVehicle(plate);
  if (!vehicle) return '';
  const model = vehicle.model.toLowerCase();
  if (model.includes('스프린터')) return '스프린터';
  if (model.includes('스타리아')) return '스타리아';
  if (model.includes('카니발')) return '카니발';
  if (model.includes('gv80')) return 'GV80';
  if (model.includes('g90l') || model.includes('리무진') && model.includes('g90')) return '롱휠';
  if (model.includes('g90')) return 'G90';
  if (model.includes('s560')) return 'S560';
  return vehicle.model;
}

function getLine(src: string, label: string): string {
  const pattern = new RegExp('^[\\t ]*' + label + '[\\t ]*[:：][\\t ]*(.*?)[\\t ]*$', 'gim');
  const values = [...src.matchAll(pattern)].map(m => m[1].trim());
  return values.length === 1 ? values[0] : '';
}

export function checkedTime(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hour = Number(m[1]), minute = Number(m[2]);
  return hour < 48 && minute < 60 ? String(hour).padStart(2, '0') + ':' + m[2] : '';
}

function dateString(src: string, year: number): string {
  // Only accept the year attached to the report date, not unrelated years in notes.
  const m = src.match(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return '';
  const y = m[1] ? Number(m[1]) : year;
  const month = Number(m[2]), day = Number(m[3]);
  const date = new Date(Date.UTC(y, month - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return [y, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

export function parseKakaoExcelReport(raw: string, assumedYear = currentReportYear()): KakaoExcelParseResult {
  const src = raw.replace(/\u00a0/g, ' ').replace(/\r/g, '');
  const warnings: string[] = [];
  const ambiguousDate = /\d{1,2}\s*월\s*\d{1,2}\s*일?\s*[~～–—]/.test(src) || /\d\s*(?:일)?\s*[~～–—]\s*(?:\d{1,2}\s*월\s*)?\d/.test(src.split('\n')[0]) || [...src.matchAll(/\d{1,2}\s*월\s*\d{1,2}\s*일/g)].length > 1;
  const dateHeader = src.match(/(?:(20\d{2})\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/);
  const conflictingYear = Boolean(dateHeader?.[1] && Number(dateHeader[1]) !== assumedYear);
  const date = ambiguousDate || conflictingYear ? '' : dateString(src, assumedYear);
  if (ambiguousDate) warnings.push('기간 운행 또는 여러 날짜입니다. 임의로 첫날을 선택하지 않았습니다. 확정한 단일 운행 날짜별로 검토해 주세요.');
  if (conflictingYear) warnings.push('보고서에 적힌 연도가 ' + assumedYear + '년 기록부와 다릅니다. 원문 날짜를 확인해 주세요.');
  // When year is omitted, the selected company workbook year is authoritative.
  // Do not show a redundant "assumed year" warning for every daily report.

  const plates = [...src.matchAll(/^[\t ]*차량[\t ]*번호[\t ]*[:：][\t ]*(.*?)[\t ]*$/gm)].map(m => m[1]);
  const plate = plates.length === 1 && !/[\/,+·]|및|대체/.test(plates[0]) ? plates[0] : '';
  if (plates.length && !plate) warnings.push('복수 차량번호입니다. 실제 운행 차량을 확인한 후 한 대씩 입력해 주세요.');
  const vehicle = findExactFleetVehicle(plate);
  if (plate && !vehicle) warnings.push('전체 차량번호와 등록 차량이 정확히 일치하지 않습니다. 차종을 직접 확인해 주세요.');

  const start = checkedTime(getLine(src, '시작\\s*시간'));
  const end = checkedTime(getLine(src, '종료\\s*시간'));
  const dutyStart = checkedTime(getLine(src, '출\\s*근'));
  const from = getLine(src, '출발지');
  const to = getLine(src, '최종\\s*도착지');
  if ((!start || !end) && dutyStart) warnings.push('고객 서비스 시작·종료시간이 불완전하여 출근시간으로 대체하지 않았습니다.');
  const overnightUnclear = start && end && end <= start;
  const time = start && end && !overnightUnclear ? start + '~' + end : '';
  if (overnightUnclear) warnings.push('종료 시각이 시작 이전입니다. 익일 여부 확인 후 24:20처럼 명시해 주세요.');
  const expected = src.match(/운행총시간\s*[:：]\s*(\d+)\s*시간\s*(\d+)\s*분/);
  if (start && end && expected) {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const actual = (toMin(end) - toMin(start) + 1440) % 1440;
    const declared = Number(expected[1]) * 60 + Number(expected[2]);
    if (actual !== declared) warnings.push('보고된 운행총시간과 시작·종료시간 계산이 일치하지 않습니다.');
  }
  // Route locations are independent of timestamps. Preserve the exact written
  // stop order even when timeline times contradict one another.
  const timeline = src.match(/(?:^|\n)[ \t]*운행일지[ \t]*\n([\s\S]*?)(?=\n[ \t]*(?:경비\s*지출|특이\s*사항)(?:[ \t]*[:：]?[ \t]*(?:\n|$))|$)/i)?.[1] || '';
  const stops = timeline.split(/\s*(?:→|➡|➔|⇒|->)\s*/)
    .map(part => part.replace(/^\s*\d{1,2}:\d{2}\s*/, '')
      .replace(/\s*\/\s*(?:업무\s*종료|운행\s*종료|종료)\s*$/, '').trim())
    .filter(part => part && /[가-힣a-z]/i.test(part) && !/^(?:업무\s*종료|운행\s*종료|종료)$/.test(part));
  const route = stops.length >= 2 ? stops.join(' → ') : (from && to ? from + ' → ' + to : from || to || '');
  const times = [...timeline.matchAll(/(?:^|[^\d])(\d{1,2}):(\d{2})(?=[^\d]|$)/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
  if (times.some((v, i) => i > 0 && v < times[i - 1])) {
    warnings.push('경유시간의 앞뒤 순서가 맞지 않습니다. 경유지는 원문 순서대로 모두 추출했으며, 경유시간은 Excel 경로에 반영하지 않았습니다.');
  }
  if (!getLine(src, '고객명')) warnings.push('거래처가 없으며, 임의로 고객사를 생성하지 않습니다.');
  const draft: KakaoExcelDraft = {
    date, plate, model: excelVehicleModel(plate),
    customer: getLine(src, '고객명'),
    driver: getLine(src, '수행\\s*담당'),
    time, route, serviceType: '', overtime: '', amount: '', payment: '', totalWithVat: '',
  };
  const missing = [
    ['날짜', draft.date], ['차량번호', draft.plate], ['차종', draft.model],
    ['거래처', draft.customer], ['운전자', draft.driver], ['타임', draft.time],
  ].filter(([, value]) => !value).map(([name]) => name);
  return { draft, warnings, missing };
}

export function validateKakaoExcelDraft(draft: KakaoExcelDraft, workbookYear?:number): string[] {
  const errors: string[] = [];
  if(workbookYear!==undefined&&!draft.date.startsWith(workbookYear+'-'))errors.push(workbookYear+'년 장부와 날짜가 다릅니다.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || dateString(draft.date.replace(/(\d{4})-(\d\d)-(\d\d)/, '$1년 $2월 $3일'), Number(draft.date.slice(0,4))) !== draft.date) errors.push('운행 날짜를 올바르게 입력해 주세요.');
  if (!draft.plate.trim() || !draft.model.trim() || !draft.customer.trim() || !draft.driver.trim()) errors.push('차량번호, 차종, 거래처, 운전자는 필수입니다.');
  const timeParts = draft.time.match(/^(?:\d+(?:\.\d+)?\()?([0-4]?\d:[0-5]\d)~([0-4]?\d:[0-5]\d)\)?$/);
  if (!timeParts || !checkedTime(timeParts[1]) || !checkedTime(timeParts[2]) || checkedTime(timeParts[2]) <= checkedTime(timeParts[1]) || draft.time.includes('(') !== draft.time.endsWith(')')) errors.push('타임은 09:15~17:20 또는 11(13:20~24:20) 형식으로 입력하고 익일은 24시 이상으로 확인해 주세요.');
  if (!/^\d{1,3}[가-힣]{1,2}\d{4}$/.test(normalizedPlate(draft.plate))) errors.push('차량번호는 한 대의 전체 번호판을 확인해 주세요.');
  for (const key of ['amount', 'totalWithVat'] as const) {
    if (draft[key].trim() && !/^\d[\d,]*$/.test(draft[key].trim())) errors.push('금액은 숫자만 입력해 주세요.');
  }
  return errors;
}