import { NextRequest } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin as db } from '@/lib/supabase/server';
import { check, currentWorkbook } from '@/lib/driverReports/service';
import { privateJson, failure, UUID } from '@/lib/driverReports/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Read-only original submission for one linked Excel row.
 * The server resolves the active workbook manifest: clients cannot choose
 * arbitrary submission IDs or read a report from another year or workbook.
 */
export async function GET(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok || !auth.session) {
    return privateJson({ ok: false, error: 'HQ 관리자 권한이 필요합니다.' }, auth.statusCode);
  }
  const params = req.nextUrl.searchParams;
  const year = Number(params.get('year'));
  const month = params.get('month') || '';
  const row = Number(params.get('row'));
  const version = params.get('version') || '';
  if (!Number.isInteger(year) || year < 2000 || year > 2099 ||
      !/^(?:[1-9]|1[0-2])월$/.test(month) ||
      !Number.isInteger(row) || row < 2 || row > 25000 ||
      !UUID.test(version)) {
    return privateJson({ ok: false, error: '원문 조회 위치를 확인해 주세요.' }, 400);
  }
  try {
    const w = await currentWorkbook(auth.session.org, year);
    if (!w || w.year !== year) {
      return privateJson({ ok: false, error: '해당 연도 Excel 장부가 없습니다.' }, 404);
    }
    if (w.id !== version) {
      return privateJson({ ok: false, error: 'Excel이 갱신됐습니다. 시트를 다시 불러와 주세요.' }, 409);
    }
    const matches = Object.entries(w.manifest || {})
      .filter(([, where]) => where.sheet === month && where.row === row);
    if (matches.length !== 1 || !UUID.test(matches[0][0])) {
      return privateJson({ ok: false, error: '이 행에는 연결된 기사 원문이 없습니다.' }, 404);
    }
    const submissionId = matches[0][0];
    const lookup = await db.from('report_submissions')
      .select('id,raw_message,parsed,submitted_at,excel_status,ledger_year,excel_sheet_name,excel_row_number')
      .eq('org_id', auth.session.org)
      .eq('id', submissionId)
      .maybeSingle();
    check(lookup.error);
    const report = lookup.data;
    if (!report || report.excel_status !== 'applied' ||
        Number(report.ledger_year) !== year ||
        report.excel_sheet_name !== month ||
        Number(report.excel_row_number) !== row) {
      return privateJson({
        ok: false,
        error: '행과 원문 연결 정보가 변경됐습니다. 새로고침 후 다시 확인해 주세요.',
      }, 409);
    }
    return privateJson({
      ok: true, year, month, row, submittedAt: report.submitted_at,
      driver: report.parsed?.draft?.driver || '',
      customer: report.parsed?.draft?.customer || '',
      plate: report.parsed?.draft?.plate || '',
      rawMessage: report.raw_message,
    });
  } catch (error) {
    return failure(error);
  }
}
