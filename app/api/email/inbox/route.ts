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

    // P0 Compliance: If not configured, strictly return unconfigured/disconnected state with empty email list (Never mix synthetic emails)
    if (!isConfigured) {
      return NextResponse.json({
        ok: false,
        isConfigured: false,
        syncStatus: 'disconnected',
        status: {
          ok: false,
          totalMessages: 0,
          unreadCount: 0,
          accountEmail: '미연결',
          server: 'imap.naver.com',
          lastChecked: new Date().toISOString(),
          error: 'NAVER_USER 또는 NAVER_APP_PASSWORD 환경 변수가 서버에 설정되지 않았습니다.',
        },
        emails: [],
        totalCount: 0,
        lastSync: null,
        error: 'NAVER 이메일 계정이 연결되지 않았습니다. 관리자 환경변수 설정을 확인해 주세요.',
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

    // P0 Compliance: Do not disguise errors with synthetic sample emails
    return NextResponse.json(
      {
        ok: false,
        isConfigured: isNaverImapConfigured(),
        syncStatus: 'error',
        emails: [],
        totalCount: 0,
        error: `NAVER IMAP 동기화 오류: ${errorMsg}`,
      },
      { status: 502 }
    );
  }
}
