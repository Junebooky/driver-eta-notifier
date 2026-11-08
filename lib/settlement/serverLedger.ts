import { supabaseAdmin } from '@/lib/supabase/server';

export const SETTLEMENT_ORG = 'vip_limousine_korea';
export const SETTLEMENT_APPROVED = new Set(['승인 완료', 'approved']);
export const SETTLEMENT_REJECTED = new Set(['반려', 'rejected']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LedgerStage = 'draft' | 'reviewing' | 'approved' | 'issued';
export type LedgerAction = 'prepare' | 'price' | 'approve' | 'issue';
export interface SettlementContract {
  reference: string;
  laborReference: string;
  baseRate: number;
  overtimeHourlyRate: number;
  driverLaborCost: number;
  baseHours: number;
  roundingMinutes: 1 | 10 | 30 | 60;
  vatMode: 'included' | 'excluded';
}
export interface SettlementSource {
  scheduleId: string;
  serviceDate: string;
  customerName: string;
  eventName: string;
  vehicleModel: string;
  vehiclePlate: string;
  driverName: string;
  startTime: string | null;
  endTime: string | null;
  serviceMinutes: number | null;
  serviceVerified: boolean;
  approvedLogCount: number;
  pendingExpenseCount: number;
  billableExpenses: Array<{ id: string; date: string; category: string; amount: number; merchant: string }>;
  approvedExpenseTotal: number;
}
export interface SettlementTotals {
  baseFare: number;
  overtimeMinutes: number;
  overtimeFare: number;
  billableExpenses: number;
  approvedDirectExpenses: number;
  driverLaborCost: number;
  supplyAmount: number;
  vatAmount: number;
  grandTotal: number;
  provisionalDirectProfit: number;
}
export interface LedgerDocument {
  id: string;
  organization_id: string;
  schedule_id: string;
  version: number;
  status: LedgerStage;
  source_hash: string;
  source_snapshot: SettlementSource;
  contract_snapshot: SettlementContract | Record<string, never>;
  totals_snapshot: SettlementTotals | Record<string, never>;
  approved_by: string | null;
  approved_at: string | null;
  issued_by: string | null;
  issued_at: string | null;
  updated_at: string;
}
export function validScheduleId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function minuteOfDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
export function calculateServiceMinutes(start: unknown, end: unknown): number | null {
  const a = minuteOfDay(start);
  const b = minuteOfDay(end);
  if (a === null || b === null) return null;
  const duration = b >= a ? b - a : b + 1440 - a;
  return duration > 0 && duration <= 1440 ? duration : null;
}
export function validateSettlementContract(input: unknown): SettlementContract {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('계약 요율과 증빙 입력이 필요합니다.');
  const x = input as Record<string, unknown>;
  const reference = typeof x.reference === 'string' ? x.reference.trim() : '';
  const laborReference = typeof x.laborReference === 'string' ? x.laborReference.trim() : '';
  if (!reference || reference.length < 6 || reference.length > 120 || !laborReference ||
      laborReference.length < 6 || laborReference.length > 120 ||
      /^(\[?DEMO|TEST|SAMPLE)/i.test(reference) || /^(\[?DEMO|TEST|SAMPLE)/i.test(laborReference)) {
    throw new Error('확인 가능한 계약 요율 증빙번호와 기사 인건비 증빙번호를 각각 입력해 주세요.');
  }
  const amount = (key: string, max = 100_000_000): number => {
    const value = x[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
      throw new Error(key + ' 금액이 올바르지 않습니다.');
    return value;
  };
  const baseRate = amount('baseRate');
  const overtimeHourlyRate = amount('overtimeHourlyRate', 5_000_000);
  const driverLaborCost = amount('driverLaborCost');
  if (baseRate <= 0) throw new Error('계약 기본요금이 확인되지 않았습니다.');
  const baseHours = x.baseHours;
  const roundingMinutes = x.roundingMinutes;
  const vatMode = x.vatMode;
  if (!Number.isSafeInteger(baseHours) || Number(baseHours) < 1 || Number(baseHours) > 24 ||
      ![1, 10, 30, 60].includes(Number(roundingMinutes)) ||
      !['included', 'excluded'].includes(String(vatMode))) {
    throw new Error('계약 시간·초과시간 반올림·부가세 포함 여부를 확인해 주세요.');
  }
  return {
    reference, laborReference, baseRate, overtimeHourlyRate, driverLaborCost,
    baseHours: Number(baseHours),
    roundingMinutes: Number(roundingMinutes) as 1 | 10 | 30 | 60,
    vatMode: vatMode as 'included' | 'excluded',
  };
}
export function calculateSettlement(source: SettlementSource, contract: SettlementContract): SettlementTotals {
  if (!source.serviceVerified || source.serviceMinutes === null ||
      source.approvedLogCount !== 1 || source.pendingExpenseCount > 0) {
    throw new Error('운행시간·운행일지 승인 및 모든 경비 검수를 먼저 완료해 주세요.');
  }
  const overtimeMinutes = Math.max(0, source.serviceMinutes - contract.baseHours * 60);
  if (overtimeMinutes > 0 && contract.overtimeHourlyRate === 0)
    throw new Error('초과 운행이 있어 확정된 시간당 초과요율이 필요합니다.');
  const billed = Math.ceil(overtimeMinutes / contract.roundingMinutes) * contract.roundingMinutes;
  const overtimeFare = Math.round(billed * contract.overtimeHourlyRate / 60);
  const billableExpenses = source.billableExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const supplyAmount = contract.baseRate + overtimeFare + billableExpenses;
  const vatAmount = contract.vatMode === 'excluded' ? Math.round(supplyAmount / 10) : 0;
  const grandTotal = supplyAmount + vatAmount;
  const provisionalDirectProfit = supplyAmount - source.approvedExpenseTotal - contract.driverLaborCost;
  const totals = {
    baseFare: contract.baseRate,
    overtimeMinutes,
    overtimeFare,
    billableExpenses,
    approvedDirectExpenses: source.approvedExpenseTotal,
    driverLaborCost: contract.driverLaborCost,
    supplyAmount,
    vatAmount,
    grandTotal,
    provisionalDirectProfit,
  };
  if (Object.values(totals).some(n => !Number.isSafeInteger(n) || Math.abs(n) > 1_000_000_000))
    throw new Error('정산금액이 허용 범위를 벗어났습니다.');
  return totals;
}
export async function loadSettlementSource(scheduleId: string): Promise<{ source: SettlementSource; hash: string }> {
  if (!validScheduleId(scheduleId)) throw new Error('실제 예약 UUID가 필요합니다.');
  const readHash = async () => {
    const { data, error } = await supabaseAdmin.rpc('settlement_live_source_hash', {
      p_schedule: scheduleId, p_org: SETTLEMENT_ORG,
    });
    if (error || typeof data !== 'string' || data.length !== 32)
      throw new Error('서버 정산 원장이 아직 준비되지 않았거나 예약이 존재하지 않습니다.');
    return data;
  };
  const before = await readHash();
  const [s, l, e] = await Promise.all([
    supabaseAdmin.from('schedules')
      .select('id,org_id,date,customer_name,event_name,vehicle_model,vehicle_plate,driver_name,driver_id')
      .eq('id', scheduleId).maybeSingle(),
    supabaseAdmin.from('driving_logs')
      .select('id,booking_id,driver_id,status,customer_service_start,customer_service_end')
      .eq('organization_id', SETTLEMENT_ORG).eq('booking_id',scheduleId).order('id'),
    supabaseAdmin.from('expenses')
      .select('id,booking_id,expense_date,category,amount,merchant,billable_to_customer,status')
      .eq('organization_id', SETTLEMENT_ORG).eq('booking_id',scheduleId).order('id'),
  ]);
  if (s.error || !s.data || (s.data.org_id && s.data.org_id !== SETTLEMENT_ORG) || l.error || e.error)
    throw new Error('예약·운행일지·경비 원본을 조회하지 못했습니다.');
  const logs = l.data || [], expenses = e.data || [];
  const log = logs.length === 1 ? logs[0] : null;
  const start = log?.customer_service_start || null;
  const end = log?.customer_service_end || null;
  const serviceMinutes = calculateServiceMinutes(start,end);
  const serviceVerified = Boolean(log && SETTLEMENT_APPROVED.has(log.status) &&
    serviceMinutes !== null && (!s.data.driver_id || !log.driver_id || s.data.driver_id === log.driver_id));
  const approved = expenses.filter(x => SETTLEMENT_APPROVED.has(x.status));
  const source: SettlementSource = {
    scheduleId, serviceDate: s.data.date || '', customerName: s.data.customer_name || '미등록 고객사',
    eventName: s.data.event_name || '', vehicleModel: s.data.vehicle_model || '',
    vehiclePlate: s.data.vehicle_plate || '', driverName: s.data.driver_name || '',
    startTime: start, endTime: end, serviceMinutes, serviceVerified,
    approvedLogCount: logs.filter(x => SETTLEMENT_APPROVED.has(x.status)).length,
    pendingExpenseCount: expenses.filter(x => !SETTLEMENT_APPROVED.has(x.status) && !SETTLEMENT_REJECTED.has(x.status)).length,
    billableExpenses: approved.filter(x => x.billable_to_customer !== false).map(x => ({
      id:x.id, date:x.expense_date, category:x.category, amount:x.amount, merchant:x.merchant,
    })),
    approvedExpenseTotal: approved.reduce((sum,x)=> sum+x.amount,0),
  };
  const after = await readHash();
  if (before !== after) throw new Error('운행·경비 원본이 조회 중 변경되었습니다. 다시 시도해 주세요.');
  return { source, hash: after };
}
export function exportIssuedClientCsv(document: LedgerDocument): string {
  if (document.status !== 'issued' || !document.issued_at || !document.approved_at)
    throw new Error('서버에서 승인·발행된 정산서만 내려받을 수 있습니다.');
  const s=document.source_snapshot, t=document.totals_snapshot as SettlementTotals;
  const c=document.contract_snapshot as SettlementContract;
  const safe = (value: unknown): string => {
    let str=String(value ?? '').replace(/\r?\n/g,' ');
    if (/^[\s]*[=+\-@]/.test(str)) str="'"+str;
    return '"'+str.replace(/"/g,'""')+'"';
  };
  const items: Array<[string,unknown]> = [
    ['문서 ID',document.id], ['서버 승인 일시',document.approved_at], ['발행 일시',document.issued_at],
    ['고객사',s.customerName], ['행사명',s.eventName], ['수행일',s.serviceDate],
    ['차량',s.vehicleModel], ['차량번호',s.vehiclePlate], ['기사',s.driverName],
    ['서비스 시작',s.startTime], ['서비스 종료',s.endTime], ['서비스 시간(분)',s.serviceMinutes],
    ['요율 증빙번호',c.reference], ['기본요금',t.baseFare], ['초과요금',t.overtimeFare],
    ['승인 고객청구 실비',t.billableExpenses], ['공급가액',t.supplyAmount],
    ['부가세',t.vatAmount], ['최종 청구액',t.grandTotal],
  ];
  return '\uFEFF'+items.map(([key,value])=>safe(key)+','+safe(value)).join('\r\n');
}