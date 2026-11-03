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
  const pattern = new RegExp('^\\s*' + label + '\\s*[:：]\\s*(.*?)\\s*$', 'im');
  return src.match(pattern)?.[1]?.trim() || '';
}

function checkedTime(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hour = Number(m[1]), minute = Number(m[2]);
  return hour < 24 && minute < 60 ? String(hour).padStart(2, '0') + ':' + m[2] : '';
}

function dateString(src: string, year: number): string {
  const explicit = src.match(/(20\d{2})\s*년/);
  const m = src.match(/(?:20\d{2}\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return '';
  const y = explicit ? Number(explicit[1]) : year;
  const month = Number(m[1]), day = Number(m[2]);
  const date = new Date(Date.UTC(y, month - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return [y, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

export function parseKakaoExcelReport(raw: string, assumedYear = 2026): KakaoExcelParseResult {
  const src = raw.replace(/\u00a0/g, ' ').replace(/\r/g, '');
  const warnings: string[] = [];
  const date = dateString(src, assumedYear);
  if (date && !/20\d{2}\s*년/.test(src)) warnings.push('보고서에 연도가 없어 ' + assumedYear + '년으로 해석했습니다. 확인해 주세요.');

  const plate = getLine(src, '차량\\s*번호');
  const vehicle = findExactFleetVehicle(plate);
  if (plate && !vehicle) warnings.push('전체 차량번호와 등록 차량이 정확히 일치하지 않습니다. 차종을 직접 확인해 주세요.');

  const start = checkedTime(getLine(src, '시작\\s*시간'));
  const end = checkedTime(getLine(src, '종료\\s*시간'));
  const dutyStart = checkedTime(getLine(src, '출\\s*근'));
  const from = getLine(src, '출발지');
  const to = getLine(src, '최종\\s*도착지');
  if ((!start || !end) && dutyStart) warnings.push('고객 서비스 시작·종료시간이 불완전하여 출근시간으로 대체하지 않았습니다.');
  const time = start && end ? start + '~' + end : '';
  const expected = src.match(/운행총시간\s*[:：]\s*(\d+)\s*시간\s*(\d+)\s*분/);
  if (start && end && expected) {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const actual = (toMin(end) - toMin(start) + 1440) % 1440;
    const declared = Number(expected[1]) * 60 + Number(expected[2]);
    if (actual !== declared) warnings.push('보고된 운행총시간과 시작·종료시간 계산이 일치하지 않습니다.');
  }
  // The original Excel G column stores a short route description, not the full
  // KakaoTalk operational diary. Never guess stop order from inconsistent timestamps.
  const route = from && to ? from + ' - ' + to : from || to || '';
  const timeline = src.match(/운행일지\s*\n([\s\S]*?)(?=\n\s*경비지출|$)/i)?.[1] || '';
  const times = [...timeline.matchAll(/(?:^|[^\d])(\d{1,2}):(\d{2})(?=[^\d]|$)/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
  if (times.some((v, i) => i > 0 && v < times[i - 1])) {
    warnings.push('운행일지의 경유시간 순서가 맞지 않아 Excel 경로에는 출발지·최종도착지만 넣었습니다.');
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

export function validateKakaoExcelDraft(draft: KakaoExcelDraft): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || dateString(draft.date.replace(/(\d{4})-(\d\d)-(\d\d)/, '$1년 $2월 $3일'), 2026) !== draft.date) errors.push('운행 날짜를 올바르게 입력해 주세요.');
  if (!draft.plate.trim() || !draft.model.trim() || !draft.customer.trim() || !draft.driver.trim()) errors.push('차량번호, 차종, 거래처, 운전자는 필수입니다.');
  if (!/^\d{2}:\d{2}~\d{2}:\d{2}$/.test(draft.time)) errors.push('타임은 09:15~17:20 형식으로 입력해 주세요.');
  for (const key of ['amount', 'totalWithVat'] as const) {
    if (draft[key].trim() && !/^\d[\d,]*$/.test(draft[key].trim())) errors.push('금액은 숫자만 입력해 주세요.');
  }
  return errors;
}