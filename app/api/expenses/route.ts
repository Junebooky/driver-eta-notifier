import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';
import { normalizeDateToIso,normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { HqExpenseRecord, HqExpenseStatus } from '@/types/expenseHq';
import { ExpenseCategoryKey, PaymentMethod, EXPENSE_CATEGORIES } from '@/utils/expense';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUuid(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

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
    memo: row.memo || undefined,
    status: (row.status as HqExpenseStatus) || '검수 대기',
    hasReceiptImage: Boolean(row.has_receipt_image || row.receipt_storage_path),
    receiptStoragePath: row.receipt_storage_path || undefined,
    receiptUrl: row.receipt_storage_path ? `/api/expenses/receipt?expenseId=${encodeURIComponent(row.id)}` : undefined,
    ocrExtracted: Boolean(row.ocr_extracted),
    ocrSummary: row.ocr_summary || undefined,
    ocrDetails: row.ocr_details || undefined,
    hipassTxKey: row.hipass_tx_key || undefined,
    hipassEntrance: row.hipass_entrance || undefined,
    hipassExit: row.hipass_exit || undefined,
    hipassCardNo: row.hipass_card_no || undefined,
    billableToCustomer: Boolean(row.billable_to_customer ?? true),
    auditHistory: Array.isArray(row.audit_history) ? row.audit_history : [],
    reviewNotes:row.review_notes || undefined,
    reviewedAt:row.reviewed_at || undefined,
    reviewedBy:row.reviewed_by || undefined,
    bookingId: row.booking_id || undefined,
    drivingLogId:row.driving_log_id || undefined,
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
    const requestedDriverId = searchParams.get('driverId');
    const date = searchParams.get('date');
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    // Organization-level isolation: Always filter by session organization
    let query = supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('organization_id', auth.session.org);

    // Multi-tenant & Driver Isolation: Drivers only see their own expenses
    if (auth.session.role === 'driver') {
      const myDriverId = auth.session.driverId || auth.session.userId;
      if (requestedDriverId && requestedDriverId !== myDriverId) {
        return NextResponse.json(
          { ok: false, error: '다른 기사의 경비 목록을 조회할 권한이 없습니다. (403 Forbidden)' },
          { status: 403 }
        );
      }
      query = query.eq('driver_id', myDriverId);
    } else {
      if (requestedDriverId) {
        query = query.eq('driver_id', requestedDriverId);
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
      console.error('[Expenses GET] DB Query error:', error.message);
      return NextResponse.json(
        { ok: false, error: `경비 목록 조회 실패: ${error.message}` },
        { status: 500 }
      );
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
 * Validates mandatory fields and strictly verifies driver identity, organization, and schedule assignment.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const rawItems: any[] = Array.isArray(body.items) ? body.items : [body];

    if (rawItems.length === 0 || rawItems.length > 50) {
      return NextResponse.json(
        { ok: false, error: '한 번에 1~50건까지 제출할 수 있습니다.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const rowsToInsert: Record<string, any>[] = [];

    for (const item of rawItems) {
      const effectiveDriverId=auth.session.role==='driver'?auth.session.driverId || auth.session.userId:item.driverId;
      if(!isValidUuid(effectiveDriverId))return NextResponse.json({ok:false,error:'실제 기사 UUID가 필요합니다.'},{status:400});
      if(!normalizeDateToIso(item.date || item.expenseDate) || !normalizeTimeHHmm(item.time || item.expenseTime))return NextResponse.json({ok:false,error:'경비 날짜·시간을 확인해 주세요.'},{status:400});
      if(!isValidUuid(item.id))return NextResponse.json({ok:false,error:'같은 경비를 다시 저장할 수 있도록 UUID 식별자가 필요합니다.'},{status:400});
      const amount = Number(item.amount);
      if(!Number.isSafeInteger(amount))return NextResponse.json({ok:false,error:'금액은 원 단위 정수로 입력해 주세요.'},{status:400});
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

      // Role & Identity Enforcement
      if (auth.session.role === 'driver') {
        if (item.driverId && item.driverId !== effectiveDriverId) {
          return NextResponse.json(
            { ok: false, error: '다른 기사의 식별자로 경비를 대리 제출할 수 없습니다. (403 Forbidden)' },
            { status: 403 }
          );
        }
        if (item.status && item.status !== 'draft' && item.status !== '검수 대기' && item.status !== 'submitted') {
          return NextResponse.json(
            { ok: false, error: '기사는 승인 완료 상태를 직접 지정할 수 없습니다. (403 Forbidden)' },
            { status: 403 }
          );
        }
      }

      // Ownership verification when updating an existing expense
      if (item.id && isValidUuid(item.id)) {
        const { data: existingExp, error: existErr } = await supabaseAdmin
          .from('expenses')
          .select('id, driver_id, organization_id, status')
          .eq('id', item.id)
          .maybeSingle();

        if (existErr) {
          return NextResponse.json(
            { ok: false, error: `기존 경비 검증 실패: ${existErr.message}` },
            { status: 500 }
          );
        }

        if (existingExp) {
          if (existingExp.organization_id !== auth.session.org) {
            return NextResponse.json(
              { ok: false, error: '다른 조직의 경비 레코드를 수정할 수 없습니다. (403 Forbidden)' },
              { status: 403 }
            );
          }
          if (auth.session.role === 'driver') {
            if (existingExp.driver_id !== effectiveDriverId) {
              return NextResponse.json(
                { ok: false, error: '다른 기사의 경비 레코드를 수정할 권한이 없습니다. (403 Forbidden)' },
                { status: 403 }
              );
            }
            if (existingExp.status === '승인 완료' || existingExp.status === '검토 중') {
              return NextResponse.json(
                { ok: false, error: '이미 승인되었거나 검토 중인 경비는 수정할 수 없습니다. (403 Forbidden)' },
                { status: 403 }
              );
            }
          }
        }
      }

      // Priority linking to bookingId with assignment verification
      let validatedBookingId: string | null = null;
      if (item.bookingId) {
        const { data: scheduleRow, error: schedErr } = await supabaseAdmin
          .from('schedules')
          .select('*')
          .eq('id', item.bookingId)
          .maybeSingle();

        if (schedErr) {
          return NextResponse.json(
            { ok: false, error: `예약 정보 DB 조회 실패: ${schedErr.message}` },
            { status: 500 }
          );
        }

        if (!scheduleRow) {
          return NextResponse.json(
            { ok: false, error: `연결 대상 예약(bookingId: ${item.bookingId})을 찾을 수 없습니다.` },
            { status: 400 }
          );
        }

        if (auth.session.role === 'driver') {
          const schedMetaDriverId = scheduleRow.driver_id || scheduleRow.schedule_meta?.driverId || scheduleRow.schedule_meta?.driver_id;
          if (!schedMetaDriverId || schedMetaDriverId !== effectiveDriverId) {
            return NextResponse.json(
              { ok: false, error: '본인에게 배정되지 않았거나 기사 식별자(UUID)가 확정되지 않은 예약입니다. (403 Forbidden)' },
              { status: 403 }
            );
          }
        }

        if(scheduleRow.schedule_meta?.serviceMode==='vehicle_only' || ['draft','unassigned','cancelled'].includes(scheduleRow.dispatch_status))return NextResponse.json({ok:false,error:'현재 기사 운행으로 배정된 예약만 연결할 수 있습니다.'},{status:403});
        validatedBookingId = scheduleRow.id;
        item.vehicleId=scheduleRow.vehicle_id || item.vehicleId;
        item.vehiclePlate=scheduleRow.vehicle_plate || scheduleRow.schedule_meta?.vehiclePlate || item.vehiclePlate;
        item.vehicleModel=scheduleRow.schedule_meta?.vehicleModel || item.vehicleModel;
        item.customerId = scheduleRow.customer_id || scheduleRow.schedule_meta?.customerId;
        item.customerName = scheduleRow.customer_name || scheduleRow.schedule_meta?.customerName;
      }

      if(item.receiptStoragePath){
        const prefix=`${auth.session.org}/expenses/receipts/${effectiveDriverId}/`;
        if(typeof item.receiptStoragePath!=='string' || item.receiptStoragePath.includes('..') || !item.receiptStoragePath.startsWith(prefix))return NextResponse.json({ok:false,error:'본인의 영수증 파일만 연결할 수 있습니다.'},{status:403});
        const file=await supabaseAdmin.storage.from('cockpit-assets').download(item.receiptStoragePath);
        if(file.error || !file.data)return NextResponse.json({ok:false,error:'영수증 원본이 서버에 저장되지 않았습니다.'},{status:400});
      }else if(item.receiptUrl || item.hasReceiptImage){
        return NextResponse.json({ok:false,error:'영수증 원본 업로드를 먼저 완료해 주세요.'},{status:400});
      }
      if(item.drivingLogId){
        const linked=await supabaseAdmin.from('driving_logs').select('id,organization_id,driver_id,booking_id,driving_date').eq('id',item.drivingLogId).maybeSingle();
        if(linked.error)return NextResponse.json({ok:false,error:'운행일지 연결을 확인하지 못했습니다.'},{status:503});
        if(!linked.data || linked.data.organization_id!==auth.session.org || linked.data.driver_id!==effectiveDriverId || (linked.data.booking_id || null)!==validatedBookingId || linked.data.driving_date!==(item.date || item.expenseDate))return NextResponse.json({ok:false,error:'같은 기사·예약·날짜의 운행일지만 연결할 수 있습니다.'},{status:403});
      }

      const category = item.category || 'other';
      const categoryLabel = item.categoryLabel || getCategoryLabel(category);
      const paymentMethod = item.paymentMethod || 'company_card';
      const paymentMethodLabel = item.paymentMethodLabel || getPaymentMethodLabel(paymentMethod);

      const record: Record<string, any> = {
        id: item.id && isValidUuid(item.id) ? item.id : crypto.randomUUID(),
        organization_id: auth.session.org,
        booking_id: validatedBookingId,
        driving_log_id: item.drivingLogId || null,
        driver_id: effectiveDriverId,
        driver_name: auth.session.driverName || item.driverName || '담당 기사',
        vehicle_id: item.vehicleId || auth.session.vehicleNo || null,
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
        status: item.status==='submitted' ? '검수 대기' : item.status || '검수 대기',
        submitted_at: nowIso,
        submitted_by: auth.session.displayName || auth.session.driverName || '기사',
        updated_at: nowIso,
      };

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
 * PUT: HQ Admin Expense Review & Status Mutation
 * Requires HQ Admin authentication.
 * Verifies organization ownership and records audit history.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const { id, status, reviewNotes, billableToCustomer } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: '수정할 경비 ID(id)가 필요합니다.' },
        { status: 400 }
      );
    }

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
        { ok: false, error: `해당 경비 레코드(${id})를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    // Verify organization ownership
    if (existing.organization_id !== auth.session.org) {
      return NextResponse.json(
        { ok: false, error: '해당 조직의 경비 레코드를 수정할 권한이 없습니다. (403 Forbidden)' },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const actor = auth.session.displayName || auth.session.driverName || '본사 관리자';
    const prevHistory = Array.isArray(existing.audit_history) ? existing.audit_history : [];

    let actionType: 'approved' | 'revision_requested' | 'rejected' | 'update' = 'approved';
    let auditMessage = `관리자(${actor})가 ${status || '정보 수정'} 처리했습니다.`;

    if (status === '보완 필요') {
      actionType = 'revision_requested';
      auditMessage = reviewNotes ? `보완 요청: ${reviewNotes}` : '추가 증빙 확인이 필요합니다.';
    } else if (status === '반려') {
      actionType = 'rejected';
      auditMessage = reviewNotes ? `반려 사유: ${reviewNotes}` : '관리자에 의해 반려되었습니다.';
    } else if (status === '승인 완료') {
      actionType = 'approved';
      auditMessage = reviewNotes ? `승인 완료: ${reviewNotes}` : '검토 후 승인 완료되었습니다.';
    } else {
      actionType = 'update';
    }

    const newAuditEntry = {
      id: `audit-${Date.now()}`,
      time: new Date().toLocaleString('ko-KR'),
      message: auditMessage,
      actor,
      actionType,
    };

    const updatePayload: Record<string, any> = {
      audit_history: [newAuditEntry, ...prevHistory],
      updated_at: nowIso,
    };

    if (status) {
      updatePayload.status = status;
      updatePayload.reviewed_at = nowIso;
      updatePayload.reviewed_by = actor;
      if (reviewNotes !== undefined) updatePayload.review_notes = reviewNotes;
    }

    if (typeof billableToCustomer === 'boolean') {
      updatePayload.billable_to_customer = billableToCustomer;
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
