import { HqBooking } from '@/types/hq';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqExpenseRecord } from '@/types/expenseHq';
import { VIP_REAL_VEHICLES, stripManufacturerName } from '@/utils/vehicleData';
import * as XLSX from 'xlsx';
import {
  cleanDriverIdentity,
  cleanVehicleIdentity,
  normalizeDateToIso,
  normalizeTimeHHmm,
  timeHHmmToMinutes,
} from '@/utils/dispatchConflictDetector';

/**
 * Masks Hi-Pass card numbers to protect PII and prevent storing raw card numbers.
 * Example: 9410-1234-5678-1514 -> 9410-****-****-1514
 */
export function maskHipassCardNo(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const clean = raw.trim();
  if (!clean) return undefined;
  if (clean.includes('*')) return clean;

  const digits = clean.replace(/[^0-9]/g, '');
  if (digits.length >= 14) {
    const first4 = digits.slice(0, 4);
    const last4 = digits.slice(-4);
    return `${first4}-****-****-${last4}`;
  }
  if (digits.length >= 8) {
    const first4 = digits.slice(0, 4);
    const last4 = digits.slice(-4);
    return `${first4}-****-${last4}`;
  }
  return '****-****-****-' + (digits.length > 0 ? digits.slice(-4) : '****');
}

export interface ParsedHipassRow {
  rowIndex: number;
  hipassTxKey: string;
  rawDate: string; // 'YYYY-MM-DD'
  time: string; // 'HH:mm'
  vehiclePlateRaw: string;
  entrance: string;
  exit: string;
  amount: number;
  cardNo?: string;
  approvalNo?: string;
  roadType?: string;
  merchantLabel: string;
  paymentMethod?: 'company_card' | 'driver_personal';
  paymentMethodLabel?: string;
}

export type HipassMatchStatus = 'matched' | 'ambiguous' | 'vehicle_only' | 'unmatched';

export interface ReconciledHipassItem extends ParsedHipassRow {
  matchStatus: HipassMatchStatus;
  matchStatusLabel: string;
  resolvedPlate: string;
  resolvedModel: string;
  resolvedDriverName: string;
  matchedScheduleId?: string;
  matchedBookingNo?: string;
  matchedCustomerName?: string;
  matchedCustomerId?: string;
  matchedEventName?: string;
  matchedDrivingLogId?: string;
  candidateSchedules?: Array<{
    scheduleId: string;
    bookingNo: string;
    customerName: string;
    pickupTime: string;
    route: string;
    driverName: string;
  }>;
  isDuplicate: boolean;
  duplicateReason?: string;
  paymentMethod?: 'company_card' | 'driver_personal';
  paymentMethodLabel?: string;
}

/**
 * Splits a CSV or TSV line respecting double-quoted fields.
 */
function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseAmountKRW(raw?: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9-]/g, '');
  const val = parseInt(cleaned, 10);
  return Number.isNaN(val) || val < 0 ? 0 : val;
}

/**
 * Decodes ArrayBuffer from CSV, TSV or real Excel (.xlsx / .xls) upload.
 * Supports UTF-8, Korean EUC-KR/CP949, and binary Excel workbooks.
 */
export function decodeHipassFileBuffer(buffer: ArrayBuffer, fileName?: string): string {
  const bytes = new Uint8Array(buffer);

  // Check Excel binary signatures: PK (0x50, 0x4B) for xlsx, or 0xD0, 0xCF for legacy xls
  const isExcel =
    (fileName && (fileName.endsWith('.xlsx') || fileName.endsWith('.xls'))) ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b) ||
    (bytes[0] === 0xd0 && bytes[1] === 0xcf);

  if (isExcel) {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (sheetName && workbook.Sheets[sheetName]) {
        return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      }
    } catch (err) {
      console.warn('Failed to parse as Excel workbook, trying text decoders:', err);
    }
  }

  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return utf8.replace(/^\uFEFF/, '');
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

/**
 * Parses CSV or Excel copy-paste (TSV) text exported from hipass.co.kr or corporate Hi-Pass card statements.
 */
export function parseHipassText(rawText: string): {
  rows: ParsedHipassRow[];
  skippedCount: number;
  errors: string[];
} {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], skippedCount: 0, errors: ['입력된 하이패스 내역이 없습니다.'] };
  }

  // Detect delimiter (TSV from Excel paste vs CSV)
  const firstDataCandidate = lines.find((l) => l.includes('\t') || l.includes(',')) || lines[0];
  const delimiter: ',' | '\t' = firstDataCandidate.includes('\t') ? '\t' : ',';

  // Locate header row (hipass.co.kr exports sometimes include 1~3 title metadata rows above the header)
  let headerLineIdx = -1;
  let colMap: {
    datetime?: number;
    date?: number;
    time?: number;
    plate?: number;
    entrance?: number;
    exit?: number;
    merchant?: number;
    amount?: number;
    cardNo?: number;
    approvalNo?: number;
    roadType?: number;
    payer?: number;
  } = {};

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const cols = splitDelimitedLine(lines[i], delimiter).map((c) =>
      c.replace(/\s+/g, '').toLowerCase()
    );
    const hasDateCol = cols.some((c) =>
      /거래일|통행일|이용일|승인일|출구일|일시|날짜|date/.test(c)
    );
    const hasAmountCol = cols.some((c) =>
      /금액|요금|통행료|결제|수납|amount|fare/.test(c)
    );

    if (hasDateCol && hasAmountCol) {
      headerLineIdx = i;
      cols.forEach((col, idx) => {
        if (/거래일시|통행일시|이용일시|승인일시|출구일시|결제일시|datetime/.test(col)) {
          colMap.datetime = idx;
        } else if (colMap.date === undefined && /거래일자|통행일자|이용일자|승인일자|날짜|일자|date/.test(col)) {
          colMap.date = idx;
        } else if (colMap.time === undefined && /거래시각|통행시각|이용시각|시간|시각|time/.test(col)) {
          colMap.time = idx;
        } else if (/차량번호|차번|차량|plate|vehicle/.test(col)) {
          colMap.plate = idx;
        } else if (/입구영업소|입구ic|진입영업소|입구|출발영업소|entrance/.test(col)) {
          colMap.entrance = idx;
        } else if (/출구영업소|출구ic|진출영업소|출구|도착영업소|영업소명|exit/.test(col)) {
          colMap.exit = idx;
        } else if (/가맹점|상호|노선|merchant/.test(col)) {
          colMap.merchant = idx;
        } else if (
          colMap.amount === undefined &&
          (/통행금액|이용금액|결제금액|수납금액|승인금액|통행료|청구금액|거래금액|금액|amount/.test(col) &&
            !col.includes('할인') &&
            !col.includes('전금액'))
        ) {
          colMap.amount = idx;
        } else if (/카드번호|카드|card/.test(col)) {
          colMap.cardNo = idx;
        } else if (/승인번호|거래번호|일련번호|approval/.test(col)) {
          colMap.approvalNo = idx;
        } else if (/도로구분|기관|도로명/.test(col)) {
          colMap.roadType = idx;
        } else if (/카드구분|결제구분|결제주체|지불자|법인개인|구분|payer|cardtype/.test(col)) {
          colMap.payer = idx;
        }
      });
      break;
    }
  }

  if (headerLineIdx === -1) {
    return {
      rows: [],
      skippedCount: lines.length,
      errors: [
        '표준 컬럼 헤더(거래일시/통행일시, 차량번호, 입구영업소, 출구영업소, 통행금액 등)를 찾을 수 없습니다. 첫 줄에 헤더를 포함해 주세요.',
      ],
    };
  }

  const parsedRows: ParsedHipassRow[] = [];
  let skippedCount = 0;
  const errors: string[] = [];

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || /^[,;\t\s]+$/.test(rawLine)) continue;

    const cols = splitDelimitedLine(rawLine, delimiter);
    const joinedCheck = cols.join(' ');
    if (/^(합계|총계|소계|total)/i.test(joinedCheck.trim()) || cols[0]?.includes('합계')) {
      skippedCount++;
      continue;
    }

    const rawDtCombined =
      colMap.datetime !== undefined
        ? cols[colMap.datetime] || ''
        : `${colMap.date !== undefined ? cols[colMap.date] || '' : ''} ${
            colMap.time !== undefined ? cols[colMap.time] || '' : ''
          }`.trim();

    const rawDate = normalizeDateToIso(rawDtCombined);
    const time = normalizeTimeHHmm(rawDtCombined) || '00:00';
    const amount = colMap.amount !== undefined ? parseAmountKRW(cols[colMap.amount]) : 0;
    const vehiclePlateRaw = (colMap.plate !== undefined ? cols[colMap.plate] : '')?.trim() || '';
    const entrance = (colMap.entrance !== undefined ? cols[colMap.entrance] : '')?.trim() || '';
    const exit = (colMap.exit !== undefined ? cols[colMap.exit] : '')?.trim() || '';
    const merchantRaw = (colMap.merchant !== undefined ? cols[colMap.merchant] : '')?.trim() || '';
    const rawCardNo = (colMap.cardNo !== undefined ? cols[colMap.cardNo] : '')?.trim() || undefined;
    const cardNo = rawCardNo ? maskHipassCardNo(rawCardNo) : undefined;
    const approvalNo =
      (colMap.approvalNo !== undefined ? cols[colMap.approvalNo] : '')?.trim() || undefined;
    const roadType =
      (colMap.roadType !== undefined ? cols[colMap.roadType] : '')?.trim() || undefined;
    const payerRaw = (colMap.payer !== undefined ? cols[colMap.payer] : '')?.trim() || '';
    const isPersonal = /개인|기사|선납|personal|driver/i.test(payerRaw);
    const paymentMethod: 'company_card' | 'driver_personal' = isPersonal ? 'driver_personal' : 'company_card';
    const paymentMethodLabel = isPersonal ? '기사 개인 선납 (환급 대상)' : '법인 하이패스 카드';

    if (!rawDate || amount <= 0) {
      skippedCount++;
      continue;
    }

    const routeSegment =
      entrance && exit
        ? `${entrance} → ${exit}`
        : exit || entrance || merchantRaw || '고속도로 하이패스';

    const merchantLabel =
      entrance || exit
        ? `${roadType || '한국도로공사'} (${routeSegment})`
        : merchantRaw || '한국도로공사 하이패스';

    const cleanPlateForKey = cleanVehicleIdentity(vehiclePlateRaw) || cardNo || 'unknown';
    const hipassTxKey = approvalNo
      ? `hp:apv:${approvalNo}:${rawDate}:${amount}`
      : `hp:${rawDate}:${time}:${cleanPlateForKey}:${entrance}-${exit}:${amount}`;

    parsedRows.push({
      rowIndex: parsedRows.length + 1,
      hipassTxKey,
      rawDate,
      time,
      vehiclePlateRaw,
      entrance,
      exit,
      amount,
      cardNo,
      approvalNo,
      roadType,
      merchantLabel,
      paymentMethod,
      paymentMethodLabel,
    });
  }

  if (parsedRows.length === 0 && errors.length === 0) {
    errors.push('유효한 통행일자 및 통행금액(> 0원)이 포함된 행이 없습니다.');
  }

  return { rows: parsedRows, skippedCount, errors };
}

/**
 * Matches parsed Hi-Pass rows against:
 * 1) Active / completed HQ bookings (Supabase schedules) by vehicle plate + date (+ time window)
 * 2) Submitted HQ driving logs by vehicle plate + date
 * 3) VIP Fleet master (20 vehicles)
 * 4) Existing HQ expenses (for strict duplicate prevention)
 */
export function matchHipassTransactions(params: {
  rows: ParsedHipassRow[];
  bookings: HqBooking[];
  drivingLogs: HqDrivingLog[];
  existingExpenses: HqExpenseRecord[];
}): ReconciledHipassItem[] {
  const { rows, bookings, drivingLogs, existingExpenses } = params;

  const existingKeys = new Set<string>();
  existingExpenses.forEach((exp) => {
    if (exp.hipassTxKey) existingKeys.add(exp.hipassTxKey);
    if (exp.category === 'toll' || exp.categoryLabel === '통행료') {
      const pClean = cleanVehicleIdentity(exp.vehiclePlate);
      existingKeys.add(`legacy:${exp.rawDate}:${exp.time}:${pClean}:${exp.amount}`);
    }
  });

  const batchSeenKeys = new Set<string>();

  return rows.map((row) => {
    const cleanInputPlate = cleanVehicleIdentity(row.vehiclePlateRaw);
    const digitsMatch = cleanInputPlate.match(/(\d{4})$/);
    const last4 = digitsMatch ? digitsMatch[1] : '';

    // 1. Resolve vehicle against VIP_REAL_VEHICLES
    let fleetMatches = VIP_REAL_VEHICLES.filter(
      (v) => cleanInputPlate && cleanVehicleIdentity(v.plate) === cleanInputPlate
    );
    let isAmbiguousSuffix = false;
    if (fleetMatches.length === 0 && last4 && cleanInputPlate.length === 4) {
      // Only allow 4-digit shorthand if strictly unique in fleet
      const suffixMatches = VIP_REAL_VEHICLES.filter((v) => v.plate.endsWith(last4));
      if (suffixMatches.length === 1) {
        fleetMatches = suffixMatches;
      } else if (suffixMatches.length > 1) {
        isAmbiguousSuffix = true;
      }
    }

    const fleetVeh = fleetMatches[0] || null;
    const resolvedPlate = fleetVeh?.plate || row.vehiclePlateRaw || '차량번호 미기재';
    const normalizedResolvedPlate = cleanVehicleIdentity(resolvedPlate);

    // 2. Duplicate check (against existing expenses and within the same upload batch)
    const legacySig = `legacy:${row.rawDate}:${row.time}:${normalizedResolvedPlate}:${row.amount}`;
    let isDuplicate = false;
    let duplicateReason: string | undefined;

    if (existingKeys.has(row.hipassTxKey) || existingKeys.has(legacySig)) {
      isDuplicate = true;
      duplicateReason = '이미 경비지출에 등록된 동일 하이패스 내역';
    } else if (batchSeenKeys.has(row.hipassTxKey)) {
      isDuplicate = true;
      duplicateReason = '업로드 파일 내 중복 행';
    }
    batchSeenKeys.add(row.hipassTxKey);

    if (isAmbiguousSuffix) {
      return {
        ...row,
        matchStatus: 'ambiguous',
        matchStatusLabel: `차량 뒷번호(${last4}) 중복 · 확인 필요`,
        resolvedPlate,
        resolvedModel: '차량 확인 필요',
        resolvedDriverName: '확인 필요',
        isDuplicate,
        duplicateReason,
      };
    }

    // 3. Match active/completed schedules on row.rawDate for this vehicle
    const sameDateSchedules = bookings.filter((b) => {
      if (b.dispatchStatus === '취소' || b.dispatchStatus === '미배정') return false;
      const bDate = normalizeDateToIso(b.pickupDate);
      if (bDate !== row.rawDate) return false;
      const bPlate = cleanVehicleIdentity(b.vehiclePlate || b.vehicleNoKey);
      return Boolean(normalizedResolvedPlate && bPlate && bPlate === normalizedResolvedPlate);
    });

    // 4. Match driving log on row.rawDate for this vehicle
    const matchedLog = drivingLogs.find((log) => {
      const lDate = normalizeDateToIso(log.rawDate);
      const lPlate = cleanVehicleIdentity(log.vehiclePlate);
      return (
        lDate === row.rawDate &&
        Boolean(normalizedResolvedPlate && lPlate && lPlate === normalizedResolvedPlate)
      );
    });

    if (sameDateSchedules.length === 1) {
      const target = sameDateSchedules[0];
      const drv = cleanDriverIdentity(target.driverName) || fleetVeh?.defaultDriver || '담당 기사';
      const mdl =
        target.vehicleModel && target.vehicleModel !== '-'
          ? stripManufacturerName(target.vehicleModel)
          : fleetVeh
          ? stripManufacturerName(fleetVeh.model)
          : '의전 차량';

      return {
        ...row,
        matchStatus: 'matched',
        matchStatusLabel: matchedLog ? '배차 · 운행일지 자동 연결' : '배차 일정 자동 연결',
        resolvedPlate: target.vehiclePlate || resolvedPlate,
        resolvedModel: mdl,
        resolvedDriverName: drv,
        matchedScheduleId: target.scheduleId || target.id,
        matchedBookingNo: target.bookingNo,
        matchedCustomerName: target.customerName,
        matchedCustomerId: target.customerId,
        matchedEventName: target.eventName,
        matchedDrivingLogId: matchedLog?.id,
        isDuplicate,
        duplicateReason,
      };
    }

    if (sameDateSchedules.length > 1) {
      // Narrow down by transaction timestamp vs schedule pickup time window
      const txMin = timeHHmmToMinutes(row.time);
      const candidates = sameDateSchedules.map((s) => ({
        schedule: s,
        pickupMin: timeHHmmToMinutes(s.pickupTime),
      }));

      let windowMatches = candidates;
      if (txMin !== null && row.time !== '00:00') {
        windowMatches = candidates.filter(({ pickupMin }) => {
          if (pickupMin === null) return true;
          // Within [pickup - 90 mins, pickup + 10 hours]
          return txMin >= pickupMin - 90 && txMin <= pickupMin + 600;
        });
      }

      if (windowMatches.length === 1) {
        const target = windowMatches[0].schedule;
        const drv = cleanDriverIdentity(target.driverName) || fleetVeh?.defaultDriver || '담당 기사';
        return {
          ...row,
          matchStatus: 'matched',
          matchStatusLabel: '시간대 기준 배차 자동 연결',
          resolvedPlate: target.vehiclePlate || resolvedPlate,
          resolvedModel:
            target.vehicleModel && target.vehicleModel !== '-'
              ? stripManufacturerName(target.vehicleModel)
              : fleetVeh
              ? stripManufacturerName(fleetVeh.model)
              : '의전 차량',
          resolvedDriverName: drv,
          matchedScheduleId: target.scheduleId || target.id,
          matchedBookingNo: target.bookingNo,
          matchedCustomerName: target.customerName,
          matchedCustomerId: target.customerId,
          matchedEventName: target.eventName,
          matchedDrivingLogId: matchedLog?.id,
          isDuplicate,
          duplicateReason,
        };
      }

      return {
        ...row,
        matchStatus: 'ambiguous',
        matchStatusLabel: `당일 복수 배차(${sameDateSchedules.length}건) · 선택 필요`,
        resolvedPlate,
        resolvedModel: fleetVeh ? stripManufacturerName(fleetVeh.model) : '의전 차량',
        resolvedDriverName:
          cleanDriverIdentity(sameDateSchedules[0].driverName) ||
          fleetVeh?.defaultDriver ||
          '담당 기사',
        matchedDrivingLogId: matchedLog?.id,
        candidateSchedules: sameDateSchedules.map((s) => ({
          scheduleId: s.scheduleId || s.id,
          bookingNo: s.bookingNo,
          customerName: s.customerName,
          pickupTime: s.pickupTime,
          route: `${s.pickupLocation} → ${s.destination}`,
          driverName: s.driverName,
        })),
        isDuplicate,
        duplicateReason,
      };
    }

    // No schedule on that date, check if driving log exists on that date
    if (matchedLog) {
      return {
        ...row,
        matchStatus: 'matched',
        matchStatusLabel: '운행일지 기준 자동 연결',
        resolvedPlate: matchedLog.vehiclePlate || resolvedPlate,
        resolvedModel: matchedLog.vehicleModel || (fleetVeh ? stripManufacturerName(fleetVeh.model) : '의전 차량'),
        resolvedDriverName: matchedLog.driverName,
        matchedScheduleId: matchedLog.bookingId,
        matchedCustomerName: matchedLog.customerName,
        matchedCustomerId: matchedLog.customerId,
        matchedEventName: matchedLog.eventName,
        matchedDrivingLogId: matchedLog.id,
        isDuplicate,
        duplicateReason,
      };
    }

    // Vehicle exists in VIP fleet, but no schedule/log on that date
    if (fleetVeh) {
      return {
        ...row,
        matchStatus: 'vehicle_only',
        matchStatusLabel: '보유차량 식별 (당일 배차 미등록)',
        resolvedPlate: fleetVeh.plate,
        resolvedModel: stripManufacturerName(fleetVeh.model),
        resolvedDriverName: fleetVeh.defaultDriver || '미지정',
        isDuplicate,
        duplicateReason,
      };
    }

    return {
      ...row,
      matchStatus: 'unmatched',
      matchStatusLabel: '미등록 차량번호 (확인 필요)',
      resolvedPlate,
      resolvedModel: '미등록 차량',
      resolvedDriverName: '미확인',
      isDuplicate,
      duplicateReason,
    };
  });
}

