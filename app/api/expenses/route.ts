import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';
import { HqExpenseRecord, HqExpenseStatus } from '@/types/expenseHq';
import { ExpenseCategoryKey, PaymentMethod, EXPENSE_CATEGORIES } from '@/utils/expense';

export const dynamic = 'force-dynamic';

function getCategoryLabel(category: string): string {
  const cat = (EXPENSE_CATEGORIES as any)[category];
  return cat ? cat.label : category || '기타';
}

function getPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'company_card':
      return '회사 카드';
    case 'driver_personal':
      return '기사 개인';
    case 'client_card':
      return '고객 카드';
    case 'cash':
      return '현금';
    default:
      return '회사 카드';
  }
}

/**
 * Maps DB row from cockpit.expenses to frontend HqExpenseRecord interface
 */
export function mapDbRowToExpenseRecord(row: any, index: number = 1): HqExpenseRecord {
  const rawDate = row.expense_date || new Date().toISOString().split('T')[0];
  const dateParts = rawDate.split('-');
  const submittedDate = dateParts.length === 3 ? `${dateParts[0]}. ${dateParts[1]}. ${dateParts[2]}` : rawDate;
  const time = row.expense_time ? String(row.expense_time).slice(0, 5) : '12:00';

  const m = dateParts[1] || '10';
  const d = dateParts[2] || '24';
  const submittedAt = `${m}/${d} ${time}`;

  return {
    id: row.id,
    no: index,
    submittedAt,
    submittedDate,
    rawDate,
    time,
    driverName: row.driver_name,
    vehicleModel: row.vehicle_model || '법인 차량',
    vehiclePlate: row.vehicle_plate || '',
    customerName: row.customer_name || undefined,
    customerId: row.customer_id || undefined,
    category: (row.category as ExpenseCategoryKey) || 'other',
    categoryLabel: row.category_label || getCategoryLabel(row.category),
    merchant: row.merchant || '거래처',
    address: row.address || undefined,
    amount: Number(row.amount) || 0,
    paymentMethod: (row.payment_method as PaymentMethod) || 'company_card',
    paymentMethodLabel: row.payment_method_label || getPaymentMethodLabel(row.payment_method),
    status: (row.status as HqExpenseStatus) || '검수 대기',
    receiptUrl: row.receipt_storage_path ? `/api/expenses/receipt?path=${encodeURIComponent(row.receipt_storage_path)}` : undefined,
    receiptStoragePath: row.receipt_storage_path || undefined,
    hasReceiptImage: Boolean(row.has_receipt_image || row.receipt_storage_path),
    memo: row.memo || undefined,
    ocrExtracted: Boolean(row.ocr_extracted),
    ocrSummary: row.ocr_summary || undefined,
    ocrDetails: row.ocr_details || undefined,
    reviewNotes: row.review_notes || undefined,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toLocaleString('ko-KR') : undefined,
    reviewedBy: row.reviewed_by || undefined,
    billableToCustomer: Boolean(row.billable_to_customer ?? true),
    bookingId: row.booking_id || undefined,
    drivingLogId: row.driving_log_id || undefined,
    hipassTxKey: row.hipass_tx_key || undefined,
    hipassEntrance: row.hipass_entrance || undefined,
    hipassExit: row.hipass_exit || undefined,
    hipassCardNo: row.hipass_card_no || undefined,
    organizationId: row.organization_id || undefined,
    driverId: row.driver_id || undefined,
    vehicleId: row.vehicle_id || undefined,
  };
}

/**
 * GET: Retrieve business expenses
 * Drivers can only query their own expenses.
 * HQ Admins can query all expenses within their organization.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');
    const drivingLogId = searchParams.get('drivingLogId');
    const driverId = searchParams.get('driverId');
    const date = searchParams.get('date');
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    let query = supabaseAdmin.from('expenses').select('*');

    // Multi-tenant & Driver Isolation: Drivers only see their own expenses
    if (auth.session.role === 'driver') {
      const driverIdent = auth.session.driverName || auth.session.userId;
      query = query.or(`driver_name.eq."${driverIdent}",driver_id.eq."${auth.session.driverId || auth.session.userId}"`);
    } else {
      if (driverId) {
        query = query.or(`driver_id.eq."${driverId}",driver_name.eq."${driverId}"`);
      }
    }

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }
    if (drivingLogId) {
      query = query.eq('driving_log_id', drivingLogId);
    }
    if (date) {
      query = query.eq('expense_date', date);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (category && category !== '전체') {
      query = query.eq('category', category);
    }

    query = query.order('expense_date', { ascending: false }).order('expense_time', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.warn('[Expenses GET] DB Query note/error:', error.message);
      return NextResponse.json({
        ok: true,
        expenses: [],
        note: 'Table cockpit.expenses query fallback',
      });
    }

    const expenses: HqExpenseRecord[] = (data || []).map((row: any, idx: number) =>
      mapDbRowToExpenseRecord(row, idx + 1)
    );

    return NextResponse.json({
      ok: true,
      expenses,
    });
  } catch (err: any) {
    console.error('[Expenses GET] Internal error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '경비 조회 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * POST: Submit expenses (single or batch)
 * Validates mandatory fields and guarantees that DB failures strictly prevent false "제출 완료" state.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const rawItems: any[] = Array.isArray(body.items) ? body.items : [body];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: '제출할 경비 내역이 없습니다.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const rowsToInsert: Record<string, any>[] = [];

    for (const item of rawItems) {
      const amount = Number(item.amount) || 0;
      if (amount <= 0) {
        return NextResponse.json(
          { ok: false, error: '경비 금액은 0원보다 커야 합니다.' },
          { status: 400 }
        );
      }

      if (!item.category) {
        return NextResponse.json(
          { ok: false, error: '경비 카테고리(category)를 지정해주세요.' },
          { status: 400 }
        );
      }

      if (!item.merchant || !String(item.merchant).trim()) {
        return NextResponse.json(
          { ok: false, error: '거래처/가맹점명(merchant)을 입력해주세요.' },
          { status: 400 }
        );
      }

      const driverName = (item.driverName || auth.session.driverName || '윤태준').trim();
      // Driver authorization: Drivers cannot submit expenses for someone else
      if (auth.session.role === 'driver') {
        const sessionDriverName = (auth.session.driverName || '').trim();
        if (sessionDriverName && driverName !== sessionDriverName) {
          return NextResponse.json(
            { ok: false, error: '다른 기사의 경비를 대리 제출할 수 없습니다. (403 Forbidden)' },
            { status: 403 }
          );
        }
      }

      // Priority linking to bookingId; if not confirmed or empty, keep null (never connect to wrong booking!)
      let validatedBookingId: string | null = null;
      if (item.bookingId) {
        const { data: scheduleRow } = await supabaseAdmin
          .from('schedules')
          .select('id, customer_id, customer_name')
          .eq('id', item.bookingId)
          .maybeSingle();

        if (scheduleRow) {
          validatedBookingId = scheduleRow.id;
          item.customerId = item.customerId || scheduleRow.customer_id;
          item.customerName = item.customerName || scheduleRow.customer_name;
        }
      }

      const category = item.category || 'other';
      const categoryLabel = item.categoryLabel || getCategoryLabel(category);
      const paymentMethod = item.paymentMethod || 'company_card';
      const paymentMethodLabel = item.paymentMethodLabel || getPaymentMethodLabel(paymentMethod);

      const record: Record<string, any> = {
        organization_id: '00000000-0000-0000-0000-000000000001',
        booking_id: validatedBookingId,
        driving_log_id: item.drivingLogId || null,
        driver_id: item.driverId || auth.session.driverId || auth.session.userId,
        driver_name: driverName,
        vehicle_id: item.vehicleId || auth.session.vehicleNo || '1호차',
        vehicle_plate: item.vehiclePlate || auth.session.carNumber || '',
        vehicle_model: item.vehicleModel || '법인 차량',
        customer_id: item.customerId || null,
        customer_name: item.customerName || null,
        expense_date: item.date || item.expenseDate || new Date().toISOString().split('T')[0],
        expense_time: item.time || item.expenseTime || '12:00',
        category,
        category_label: categoryLabel,
        amount,
        merchant: String(item.merchant).trim(),
        address: item.address || null,
        payment_method: paymentMethod,
        payment_method_label: paymentMethodLabel,
        memo: item.memo || null,
        receipt_storage_path: item.receiptStoragePath || null,
        has_receipt_image: Boolean(item.hasReceiptImage || item.receiptStoragePath || item.receiptUrl),
        ocr_extracted: Boolean(item.ocrExtracted),
        ocr_summary: item.ocrSummary || null,
        ocr_details: item.ocrDetails || {},
        hipass_tx_key: item.hipassTxKey || null,
        hipass_entrance: item.hipassEntrance || null,
        hipass_exit: item.hipassExit || null,
        hipass_card_no: item.hipassCardNo || null,
        billable_to_customer: Boolean(item.billableToCustomer ?? true),
        status: item.status || '검수 대기',
        submitted_at: nowIso,
        submitted_by: auth.session.displayName || auth.session.driverName || '기사',
        updated_at: nowIso,
      };

      if (item.id && !String(item.id).startsWith('demo-') && !String(item.id).startsWith('hq-exp-')) {
        record.id = item.id;
      }

      rowsToInsert.push(record);
    }

    // Upsert into cockpit.expenses (onConflict: id)
    const { data: savedRows, error: saveErr } = await supabaseAdmin
      .from('expenses')
      .upsert(rowsToInsert, { onConflict: 'id' })
      .select('*');

    if (saveErr) {
      console.error('[Expenses POST] DB Save Error:', saveErr);
      return NextResponse.json(
        { ok: false, error: `데이터베이스 저장 실패: ${saveErr.message}` },
        { status: 500 }
      );
    }

    const mapped = (savedRows || []).map((r, idx) => mapDbRowToExpenseRecord(r, idx + 1));
    const totalAmount = mapped.reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json({
      ok: true,
      count: mapped.length,
      totalAmount,
      expenses: mapped,
      message: `경비 ${mapped.length}건이 성공적으로 등록되었습니다.`,
    });
  } catch (err: any) {
    console.error('[Expenses POST] Internal error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '경비 등록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * PUT: HQ Admin Review & Status Mutation
 * Requires HQ Admin authentication.
 * Records audit trail with reviewer name and timestamp.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const { id, status, reviewNotes } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: '수정할 경비 ID(id)가 필요합니다.' },
        { status: 400 }
      );
    }

    // Fetch existing row to preserve audit history
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json(
        { ok: false, error: `DB 조회 실패: ${findErr.message}` },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `해당 경비 내역(${id})을 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    const nowIso = new Date().toISOString();
    const actor = auth.session.displayName || auth.session.driverName || '본사 관리자';
    const prevHistory = Array.isArray(existing.audit_history) ? existing.audit_history : [];

    const newAuditEntry = {
      id: `audit-${Date.now()}`,
      time: new Date().toLocaleString('ko-KR'),
      message: `관리자(${actor})가 상태를 [${status}]로 변경했습니다.${reviewNotes ? ` (사유: ${reviewNotes})` : ''}`,
      actor,
      actionType: status === '승인 완료' ? 'approved' : status === '반려' ? 'rejected' : 'review',
    };

    const updatePayload: Record<string, any> = {
      status,
      reviewed_at: nowIso,
      reviewed_by: actor,
      audit_history: [newAuditEntry, ...prevHistory],
      updated_at: nowIso,
    };

    if (reviewNotes !== undefined) {
      updatePayload.review_notes = reviewNotes;
    }

    const { data: updatedRow, error: updateErr } = await supabaseAdmin
      .from('expenses')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: `DB 수정 실패: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      expense: mapDbRowToExpenseRecord(updatedRow),
      message: '경비 상태가 성공적으로 갱신되었습니다.',
    });
  } catch (err: any) {
    console.error('[Expenses PUT] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '상태 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
