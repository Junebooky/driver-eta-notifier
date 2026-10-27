import { NextResponse } from 'next/server';
import {
  fetchNaverInboxSummaries,
  checkNaverImapStatus,
  isNaverImapConfigured,
} from '@/services/naverImapService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isConfigured = isNaverImapConfigured();
    const status = await checkNaverImapStatus();
    const inbox = await fetchNaverInboxSummaries(30);

    return NextResponse.json({
      ok: true,
      isConfigured,
      status,
      emails: inbox.emails,
      totalCount: inbox.totalExists,
      lastSync: inbox.lastSync,
      error: inbox.error,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/inbox:', errorMsg);
    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
