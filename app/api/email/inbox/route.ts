import { NextRequest, NextResponse } from 'next/server';
import {
  fetchNaverInboxSummaries,
  checkNaverImapStatus,
  isNaverImapConfigured,
} from '@/services/naverImapService';
import { getInboxCandidateEmails } from '@/services/emailIntakeService';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

interface ServerInboxCache {
  data: any;
  cachedAt: number;
}

let serverInboxCache: ServerInboxCache | null = null;
const CACHE_TTL_MS = 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    // P0 Compliance: Require HQ Admin authentication before accessing company inbox
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const isConfigured = isNaverImapConfigured();
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const mode = url.searchParams.get('mode');

    // If explicit synthetic mode or not configured with real credentials, return safe synthetic candidate emails
    if (mode === 'synthetic' || !isConfigured) {
      const candidateEmails = await getInboxCandidateEmails();
      return NextResponse.json({
        ok: true,
        isConfigured: false,
        isSynthetic: true,
        emails: candidateEmails,
        totalCount: candidateEmails.length,
        notice: 'HQ 이메일 인박스는 현재 승인된 테스트 모드로 동작 중입니다 (실제 편지함 접근 차단).',
      });
    }

    const now = Date.now();
    if (!forceRefresh && serverInboxCache && now - serverInboxCache.cachedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        ...serverInboxCache.data,
        fromServerCache: true,
      });
    }

    const status = await checkNaverImapStatus();
    const inbox = await fetchNaverInboxSummaries(30);

    const responseData = {
      ok: true,
      isConfigured,
      status,
      emails: inbox.emails,
      totalCount: inbox.totalExists,
      lastSync: inbox.lastSync,
      error: inbox.error,
      fromServerCache: false,
    };

    serverInboxCache = {
      data: responseData,
      cachedAt: now,
    };

    return NextResponse.json(responseData);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/inbox:', errorMsg);

    if (serverInboxCache) {
      return NextResponse.json({
        ...serverInboxCache.data,
        stale: true,
        error: `실시간 동기화 지연: ${errorMsg}`,
      });
    }

    // Fallback to synthetic candidate emails on error
    const candidateEmails = await getInboxCandidateEmails();
    return NextResponse.json({
      ok: true,
      isConfigured: false,
      isSynthetic: true,
      emails: candidateEmails,
      totalCount: candidateEmails.length,
      warning: errorMsg,
    });
  }
}
