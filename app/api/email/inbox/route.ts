import { NextRequest, NextResponse } from 'next/server';
import {
  fetchNaverInboxSummaries,
  checkNaverImapStatus,
  isNaverImapConfigured,
} from '@/services/naverImapService';

export const dynamic = 'force-dynamic';

// Server-side in-memory cache to prevent redundant IMAP connections and reduce latency
interface ServerInboxCache {
  data: any;
  cachedAt: number;
}

let serverInboxCache: ServerInboxCache | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache

export async function GET(req: NextRequest) {
  try {
    const isConfigured = isNaverImapConfigured();
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const now = Date.now();
    // Return cached inbox if fresh and not forced to refresh
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

    // Update server cache
    serverInboxCache = {
      data: responseData,
      cachedAt: now,
    };

    return NextResponse.json(responseData);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/inbox:', errorMsg);

    // If fetch failed but we have stale cache, return it with warning
    if (serverInboxCache) {
      return NextResponse.json({
        ...serverInboxCache.data,
        stale: true,
        error: `실시간 동기화 지연: ${errorMsg}`,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
