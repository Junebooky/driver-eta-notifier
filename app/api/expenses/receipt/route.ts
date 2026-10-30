import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];
const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * GET: Securely serve receipt image only to authorized drivers and HQ admins.
 * Requires expenseId to verify ownership against cockpit.expenses.
 * Rejects unauthenticated, unauthorized, or cross-tenant access.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const expenseId = searchParams.get('expenseId');

    // Strict validation: Path-only access is strictly forbidden to prevent IDOR / cross-driver leaks
    if (!expenseId) {
      return NextResponse.json(
        { ok: false, error: '영수증 조회를 위해 expenseId 파라미터가 반드시 필요합니다. (path 파라미터 단독 조회 불가)' },
        { status: 400 }
      );
    }

    // Verify ownership via cockpit.expenses
    const { data: expenseRow, error: expErr } = await supabaseAdmin
      .from('expenses')
      .select('id, driver_id, organization_id, receipt_storage_path')
      .eq('id', expenseId)
      .maybeSingle();

    if (expErr) {
      return NextResponse.json(
        { ok: false, error: `경비 정보 조회 실패: ${expErr.message}` },
        { status: 500 }
      );
    }

    if (!expenseRow) {
      return NextResponse.json(
        { ok: false, error: '해당 경비 레코드를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 1. Organization boundary
    if (expenseRow.organization_id !== auth.session.org) {
      return NextResponse.json(
        { ok: false, error: '다른 조직의 영수증에 접근할 수 없습니다. (403 Forbidden)' },
        { status: 403 }
      );
    }

    // 2. Driver boundary (Driver can only access receipts of their own expenses)
    const effectiveDriverId = auth.session.driverId || auth.session.userId;
    if (auth.session.role === 'driver') {
      if (expenseRow.driver_id !== effectiveDriverId) {
        return NextResponse.json(
          { ok: false, error: '해당 영수증에 대한 접근 권한이 없습니다. (403 Forbidden)' },
          { status: 403 }
        );
      }
    }

    const storagePath = expenseRow.receipt_storage_path;

    if (!storagePath) {
      return NextResponse.json(
        { ok: false, error: '등록된 영수증 파일 경로가 없습니다.' },
        { status: 404 }
      );
    }

    // Path traversal and prefix validation
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
      return NextResponse.json(
        { ok: false, error: '유효하지 않은 영수증 파일 경로입니다.' },
        { status: 400 }
      );
    }

    if (!storagePath.startsWith(`${auth.session.org}/`)) {
      return NextResponse.json(
        { ok: false, error: '소속 조직 경로가 아닌 영수증 파일입니다. (403 Forbidden)' },
        { status: 403 }
      );
    }

    // Same-org cross-driver defense-in-depth: if requester is driver, storagePath must include their driverId
    if (auth.session.role === 'driver') {
      const allowedDriverPrefix = `${auth.session.org}/expenses/receipts/${effectiveDriverId}/`;
      const legacyDriverPrefix = `${auth.session.org}/${effectiveDriverId}/`;
      if (!storagePath.startsWith(allowedDriverPrefix) && !storagePath.startsWith(legacyDriverPrefix)) {
        return NextResponse.json(
          { ok: false, error: '다른 기사의 스토리지 경로에 접근할 수 없습니다. (403 Forbidden)' },
          { status: 403 }
        );
      }
    }

    // Download from Supabase private storage bucket 'cockpit-assets'
    const { data, error } = await supabaseAdmin.storage
      .from('cockpit-assets')
      .download(storagePath);

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: '영수증 파일을 스토리지에서 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const arrayBuffer = await data.arrayBuffer();
    const contentType = data.type || 'image/jpeg';

    return new NextResponse(Buffer.from(arrayBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('[Receipt GET] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '영수증 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * POST: Securely upload receipt image to private Supabase Storage bucket.
 * Enforces strict MIME type, file size limit (10MB), and organization path.
 * Zero simulated mock responses on real storage errors.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { ok: false, error: 'FormData 형식이 필요합니다.' },
        { status: 400 }
      );
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { ok: false, error: '업로드할 파일(file)이 누락되었습니다.' },
        { status: 400 }
      );
    }

    // MIME type validation
    const mimeType = file.type || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { ok: false, error: `지원하지 않는 파일 형식입니다 (${mimeType}). JPEG, PNG, WEBP, HEIC, PDF만 지원합니다.` },
        { status: 400 }
      );
    }

    // File size validation (10MB)
    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, error: '영수증 파일 크기는 10MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    const effectiveDriverId = auth.session.driverId || auth.session.userId;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const ext = file.name.split('.').pop() || 'jpg';
    const uniqueId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${auth.session.org}/expenses/receipts/${effectiveDriverId}/${year}/${month}/${uniqueId}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from('cockpit-assets')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    // Zero simulated fallback on error: Strictly report actual failure
    if (uploadError) {
      console.error('[Receipt Upload] Storage Error:', uploadError.message);
      return NextResponse.json(
        { ok: false, error: `영수증 스토리지 저장 실패: ${uploadError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      storagePath,
      message: '영수증이 안전하게 보관되었습니다.',
    });
  } catch (err: any) {
    console.error('[Receipt POST] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '영수증 업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
