/**
 * Pure Client-Side Vehicle Inspection & KakaoTalk Report Generator
 * Zero Database / Pure LocalStorage Architecture
 */

export const STORAGE_KEY_INITIAL_INSPECTION = 'cockpit_initial_inspection';

export interface InitialInspectionData {
  initialTotalKm: number;
  initialDte: number;
  inspectionDate: string;
  vehicleHocha?: string;
  carNumber?: string;
  outerDamage?: string;
  savedAt: string;
}

export interface ReceiptReportParams {
  date?: Date;
  vehicleHocha?: string;
  carNumber?: string;
  totalKm: number | string;
  dte: number | string;
  outerDamage?: string;
}

export interface ReturnReportParams {
  date?: Date;
  vehicleHocha?: string;
  carNumber?: string;
  returnTotalKm: number | string;
  returnDte: number | string;
  outerDamage?: string;
  parkingLocation?: string;
  keyLocation?: string;
  initialData?: InitialInspectionData | null;
}

/**
 * Format date strictly as: YYYY년 M월 D일 (요일) without hour/minute
 * e.g., '2026년 9월 23일 (수)'
 */
export function formatInspectionDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = days[d.getDay()];
  return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
}

/**
 * Parse numeric value from string or number safely
 */
export function parseKmNumber(val: number | string | undefined | null): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract clean hocha string (e.g. '4호차') if present
 */
export function extractHocha(vehicleNo?: string): string | null {
  if (!vehicleNo) return null;
  const match = vehicleNo.match(/(\d+호차)/);
  if (match) return match[1];
  const trimmed = vehicleNo.trim();
  if (trimmed.endsWith('호차')) return trimmed;
  return null;
}

/**
 * Generate standard vehicle receipt report text
 */
export function generateReceiptReport(params: ReceiptReportParams): string {
  const dateStr = formatInspectionDate(params.date || new Date());
  const hocha = extractHocha(params.vehicleHocha) || params.vehicleHocha?.trim();
  const carNo = params.carNumber?.trim();
  const totalKmNum = parseKmNumber(params.totalKm);
  const dteNum = parseKmNumber(params.dte);
  const hasTotalKm = params.totalKm !== '' && params.totalKm !== undefined && params.totalKm !== null;
  const hasDte = params.dte !== '' && params.dte !== undefined && params.dte !== null;
  const damage = params.outerDamage?.trim() || '무';

  const lines: string[] = ['[차량 수령]', ''];
  lines.push(`• 수령일자 : ${dateStr}`);
  
  if (hocha) {
    lines.push(`• 차량호차 : ${hocha}`);
  }
  
  if (carNo) {
    lines.push(`• 차량번호 : ${carNo}`);
  }

  lines.push('• 계기판 현황 :');
  lines.push(`  - 총 주행거리 : ${hasTotalKm ? `${totalKmNum.toLocaleString()} km` : ''}`);
  lines.push(`  - 주행가능거리 : ${hasDte ? `${dteNum.toLocaleString()} km` : ''}`);
  lines.push(`• 외관 데미지 : ${damage}`);

  return lines.join('\n');
}

/**
 * Generate standard vehicle return report text with mathematical comparison
 */
export function generateReturnReport(params: ReturnReportParams): string {
  const dateStr = formatInspectionDate(params.date || new Date());
  const hocha = extractHocha(params.vehicleHocha) || params.vehicleHocha?.trim();
  const carNo = params.carNumber?.trim();
  const returnTotalKmNum = parseKmNumber(params.returnTotalKm);
  const returnDteNum = parseKmNumber(params.returnDte);
  const hasReturnTotalKm = params.returnTotalKm !== '' && params.returnTotalKm !== undefined && params.returnTotalKm !== null;
  const hasReturnDte = params.returnDte !== '' && params.returnDte !== undefined && params.returnDte !== null;
  const damage = params.outerDamage?.trim() || '무';

  const lines: string[] = ['[차량 반납]', ''];
  lines.push(`• 반납일자 : ${dateStr}`);

  if (hocha) {
    lines.push(`• 차량호차 : ${hocha}`);
  }

  if (carNo) {
    lines.push(`• 차량번호 : ${carNo}`);
  }

  lines.push('• 계기판 현황 :');

  if (params.initialData && params.initialData.initialTotalKm > 0 && hasReturnTotalKm) {
    const initialKm = params.initialData.initialTotalKm;
    const initialDte = params.initialData.initialDte;
    const totalDriven = returnTotalKmNum - initialKm;
    const diffDte = returnDteNum - initialDte;
    const diffDteSign = diffDte > 0 ? '+' : '';
    const diffDteFormatted = `${diffDteSign}${diffDte.toLocaleString()} km`;

    lines.push(
      `  - 총 주행거리 : ${returnTotalKmNum.toLocaleString()} km (최초: ${initialKm.toLocaleString()} km / 총 운행: ${totalDriven.toLocaleString()} km)`
    );
    lines.push(
      `  - 주행가능거리 : ${hasReturnDte ? `${returnDteNum.toLocaleString()} km (최초: ${initialDte.toLocaleString()} km / 차이: ${diffDteFormatted})` : ''}`
    );
  } else {
    lines.push(`  - 총 주행거리 : ${hasReturnTotalKm ? `${returnTotalKmNum.toLocaleString()} km` : ''}`);
    lines.push(`  - 주행가능거리 : ${hasReturnDte ? `${returnDteNum.toLocaleString()} km` : ''}`);
  }

  lines.push(`• 외관 데미지 : ${damage}`);

  const parking = params.parkingLocation?.trim();
  const key = params.keyLocation?.trim();

  if (parking || key) {
    lines.push('• 보관 위치 :');
    if (parking) {
      lines.push(`  - 주차위치 : ${parking}`);
    }
    if (key) {
      lines.push(`  - 차키위치 : ${key}`);
    }
  }

  return lines.join('\n');
}

/**
 * Save initial inspection data to localStorage
 */
export function saveInitialInspection(data: Omit<InitialInspectionData, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: InitialInspectionData = {
      ...data,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_INITIAL_INSPECTION, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save initial vehicle inspection to localStorage:', err);
  }
}

/**
 * Retrieve initial inspection data from localStorage
 */
export function getInitialInspection(): InitialInspectionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INITIAL_INSPECTION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.initialTotalKm === 'number') {
      return parsed as InitialInspectionData;
    }
  } catch (err) {
    console.warn('Failed to parse initial vehicle inspection from localStorage:', err);
  }
  return null;
}

/**
 * Clear initial inspection data from localStorage
 */
export function clearInitialInspection(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_INITIAL_INSPECTION);
  } catch (err) {
    console.warn('Failed to clear initial vehicle inspection from localStorage:', err);
  }
}
