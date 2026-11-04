import { NextRequest, NextResponse } from 'next/server';
import { extractBookingFromEmail } from '@/services/emailBookingGeminiService';
import { fetchNaverEmailDetail } from '@/services/naverImapService';
import { requireHqAdmin, isDevAuthAllowed } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // P0 Compliance: Require HQ Admin authentication before invoking AI extraction
    const auth = await requireHqAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await request.json().catch(() => ({}));
    const emailId = String(body.emailId || '');
    let subject = body.subject || body.emailSubject || '';
    let sender = body.sender || body.emailFrom || '';
    let senderName = body.senderName || '';
    const replyTo = body.replyTo || '';
    let bodyText = body.bodyText || body.emailText || '';

    if (!emailId) {
      return NextResponse.json({ ok: false, error: 'emailId는 필수 항목입니다.' }, { status: 400 });
    }

    // Server-side authoritative verification:
    // If bodyText is missing or empty, fetch directly from IMAP server for naver-* UIDs
    if (!bodyText.trim() && emailId.startsWith('naver-')) {
      const uidStr = emailId.replace(/^naver-/, '');
      const uid = parseInt(uidStr, 10);
      if (!isNaN(uid)) {
        const detail = await fetchNaverEmailDetail(uid);
        if (detail) {
          subject = detail.subject || subject;
          sender = detail.from?.address || sender;
          senderName = detail.from?.name || senderName;
          bodyText = detail.bodyText || '';
        }
      }
    } else if (!bodyText.trim() && emailId.startsWith('em-ref-') && isDevAuthAllowed()) {
      const { REFERENCE_EMAILS } = await import('@/components/hq/email/emailReferenceData');
      const refItem = REFERENCE_EMAILS.find((r) => r.summary.id === emailId);
      if (refItem) {
        subject = refItem.detail.subject;
        sender = refItem.detail.from.address;
        senderName = refItem.detail.from.name;
        bodyText = refItem.detail.bodyText;
      }
    }

    if (!bodyText.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: '이메일 본문 내용이 비어 있거나 로드되지 않았습니다. 본문 확인 후 다시 시도해 주세요.',
        },
        { status: 400 }
      );
    }

    const result = await extractBookingFromEmail({
      emailId,
      subject,
      sender: sender || '',
      senderName,
      replyTo,
      bodyText,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/extract-booking:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
