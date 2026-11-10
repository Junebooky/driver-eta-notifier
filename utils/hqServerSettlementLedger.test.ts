import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  calculateServiceMinutes,validateSettlementContract,calculateSettlement,
  exportIssuedClientCsv,validScheduleId,
  type SettlementSource,type LedgerDocument,
} from '../lib/settlement/serverLedger';

const source: SettlementSource={
  scheduleId:'f5626e32-8e65-4fe0-9760-148e3c755d19',
  serviceDate:'2026-11-08',customerName:'Verified Customer',
  eventName:'VIP Transfer',vehicleModel:'Sprinter 519',
  vehiclePlate:'123호 4567',driverName:'Driver',
  startTime:'09:00',endTime:'21:50',serviceMinutes:770,
  serviceVerified:true,approvedLogCount:1,pendingExpenseCount:0,
  billableExpenses:[{id:'ex-1',date:'2026-11-08',category:'toll',merchant:'Toll',amount:18000}],
  approvedExpenseTotal:25000,
};
const contract=validateSettlementContract({
  reference:'CONTRACT-2026-001',laborReference:'LABOR-2026-001',
  baseRate:800000,overtimeHourlyRate:60000,driverLaborCost:150000,
  baseHours:10,roundingMinutes:30,vatMode:'excluded',
});
test('overnight service uses real verified start and end times',()=>{
  assert.equal(calculateServiceMinutes('23:00:00','01:10:00'),130);
  assert.equal(calculateServiceMinutes('10:00:00','10:00:00'),null);
  assert.equal(calculateServiceMinutes('anything','12:00'),null);
});
test('pricing uses explicitly confirmed overtime rounding, approved billable expenses and VAT',()=>{
  const t=calculateSettlement(source,contract);
  assert.deepEqual(t,{
    baseFare:800000,overtimeMinutes:170,overtimeFare:180000,
    billableExpenses:18000,approvedDirectExpenses:25000,driverLaborCost:150000,
    supplyAmount:998000,vatAmount:99800,grandTotal:1097800,
    provisionalDirectProfit:823000,
  });
});
test('no approved log, unreviewed expenses or unpriced overtime fail closed',()=>{
  assert.throws(()=>calculateSettlement({...source,serviceVerified:false},contract),/운행/);
  assert.throws(()=>calculateSettlement({...source,pendingExpenseCount:1},contract),/경비/);
  assert.throws(()=>calculateSettlement(source,{...contract,overtimeHourlyRate:0}),/초과/);
});
test('unverified rates and forged pricing fields are not accepted',()=>{
  assert.throws(()=>validateSettlementContract({...contract,reference:'DEMO-EXAMPLE'}),/증빙/);
  assert.throws(()=>validateSettlementContract({...contract,baseRate:-1}),/금액/);
  assert.throws(()=>validateSettlementContract({...contract,vatMode:'unset'}),/부가세/);
  assert.throws(()=>validateSettlementContract({...contract,roundingMinutes:999}),/반올림/);
  assert.ok(validScheduleId(source.scheduleId));
  assert.equal(validScheduleId('rep-chanel-cruise-2026'),false);
});
test('client CSV cannot export unissued document or leak labor/margin',()=>{
  const document={
    id:source.scheduleId,schedule_id:source.scheduleId,organization_id:'vip_limousine_korea',
    version:4,status:'issued',source_hash:'0123456789abcdef0123456789abcdef',
    source_snapshot:{...source,customerName:'=2+2'},contract_snapshot:contract,
    totals_snapshot:calculateSettlement(source,contract),approved_by:'admin',
    approved_at:'2026-11-08T09:00:00Z',issued_by:'admin',
    issued_at:'2026-11-08T10:00:00Z',updated_at:'2026-11-08T10:00:00Z',
  } as LedgerDocument;
  assert.throws(()=>exportIssuedClientCsv({...document,status:'approved'}),/발행/);
  const csv=exportIssuedClientCsv(document);
  assert.match(csv,/'=2\+2/);
  assert.ok(!csv.includes('driverLaborCost'));
  assert.ok(!csv.includes('provisionalDirectProfit'));
  assert.ok(!csv.includes('150000'));
});
test('SQL and API require atomic org-scoped approval and route never trusts client totals',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261108163000_server_settlement_ledger.sql',import.meta.url),'utf8');
  const api=readFileSync(new URL('../app/api/hq/settlements/route.ts',import.meta.url),'utf8');
  const panel=readFileSync(new URL('../components/hq/reports/HqServerSettlementPanel.tsx',import.meta.url),'utf8');
  assert.match(migration,/FOR UPDATE/);
  assert.match(migration,/SETTLEMENT_VERSION_CONFLICT/);
  assert.match(migration,/settlement_live_source_hash/);
  assert.match(migration,/REVOKE ALL ON cockpit\.settlement_documents, cockpit\.settlement_document_audit FROM PUBLIC, anon, authenticated/);
  assert.match(api,/requireHqAdmin\(req\)/);
  assert.match(api,/calculateSettlement\(source,stored\)/);
  assert.match(api,/action==='price'\?totals:null/);
  assert.match(panel,/고객사 정산서 발행 확정/);
});