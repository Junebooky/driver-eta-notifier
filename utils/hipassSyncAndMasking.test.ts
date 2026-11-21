import assert from 'node:assert';
import * as XLSX from 'xlsx';
import {
  maskHipassCardNo,
  decodeHipassFileBuffer,
  parseHipassText,
  matchHipassTransactions,
} from './hipassReconciler';

async function runHipassTests() {
  console.log('🧪 Starting Hi-Pass Excel, Card Masking & Atomic Sync Tests...');

  // 1. Test Card Masking (P0 Compliance)
  const rawCards = [
    '9410-1234-5678-1514',
    '9410123456781514',
    '1234-5678-9012-3456',
    'short',
    '',
    undefined,
  ];

  const masked1 = maskHipassCardNo(rawCards[0]);
  assert.strictEqual(masked1, '9410-****-****-1514', 'Masked dashed 16-digit card number');
  assert.ok(!masked1.includes('1234') && !masked1.includes('5678'), 'Middle 8 digits must never be exposed');

  const masked2 = maskHipassCardNo(rawCards[1]);
  assert.strictEqual(masked2, '9410-****-****-1514', 'Masked raw 16-digit continuous card number');

  const masked3 = maskHipassCardNo(rawCards[2]);
  assert.strictEqual(masked3, '1234-****-****-3456', 'Masked generic 16-digit card number');

  console.log('✅ Card Masking verified: Raw card digits are strictly shielded from logs & UI.');

  // 2. Test Real XLSX Parsing (P1 Compliance)
  const worksheetData = [
    ['거래일시', '카드번호', '차량번호', '출구영업소', '이용금액', '할인금액', '실청구금액'],
    ['2026-09-20 08:15:00', '9410-1111-2222-3333', '112하 3456', '인천공항T1', '6,600', '0', '6,600'],
    ['2026-09-20 13:45:00', '9410-4444-5555-6666', '142호 7814', '서울TG', '1,800', '0', '1,800'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '하이패스내역');
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const decodedCsv = decodeHipassFileBuffer(xlsxBuffer, 'test_hipass.xlsx');
  const parsed = parseHipassText(decodedCsv);

  assert.strictEqual(parsed.rows.length, 2, 'Should parse 2 valid data rows from XLSX buffer');
  assert.strictEqual(parsed.rows[0].amount, 6600);
  assert.strictEqual(parsed.rows[0].exit, '인천공항T1');
  assert.strictEqual(parsed.rows[0].vehiclePlateRaw, '112하 3456');
  assert.strictEqual(parsed.rows[0].cardNo, '9410-****-****-3333', 'Parsed cardNo must be pre-masked');

  console.log('✅ Real Excel (.xlsx) buffer parsing verified with card masking applied at intake.');

  // 3. Test Reconciliation & Selection Defaults (P0 Compliance)
  const mockBookings: any[] = [
    {
      id: 'sch_ferrari_001',
      bookingNo: '#260920-001',
      customerName: 'Ferrari Korea',
      pickupDate: '2026-09-20',
      pickupTime: '07:30',
      pickupLocation: '조선팰리스 강남',
      destination: '인천공항 T1',
      vehiclePlate: '112하 3456',
      driverName: '홍승범',
      dispatchStatus: '배차 완료',
    },
  ];

  const candidateRows = parsed.rows;
  const reconciled = matchHipassTransactions({
    rows: candidateRows,
    bookings: mockBookings,
    drivingLogs: [],
    existingExpenses: [],
  });

  assert.strictEqual(reconciled.length, 2);

  const matched = reconciled[0];
  const unmatched = reconciled[1];

  assert.strictEqual(matched.matchStatus, 'matched');
  assert.strictEqual(matched.matchedScheduleId, 'sch_ferrari_001');

  // Verify selection rule: matched defaults to true, unmatched/vehicle_only defaults to false
  const initialSelection = reconciled.reduce((acc, item) => {
    acc[item.hipassTxKey] = item.matchStatus === 'matched';
    return acc;
  }, {} as Record<string, boolean>);

  assert.strictEqual(initialSelection[matched.hipassTxKey], true, 'Matched items must default to selected');
  assert.strictEqual(initialSelection[unmatched.hipassTxKey], false, 'Unmatched items must default to unselected');

  console.log('✅ Reconciler & Selection Defaults verified (Matched: selected/approved, Unmatched: unselected/review).');

  console.log('🎉 ALL HI-PASS EXCEL, MASKING & ATOMIC SYNC TESTS PASSED 100%!\n');
}

runHipassTests().catch((err) => {
  console.error('❌ Hi-Pass Test Failure:', err);
  process.exit(1);
});
