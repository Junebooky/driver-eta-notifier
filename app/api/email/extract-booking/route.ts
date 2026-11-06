import { NextRequest, NextResponse } from 'next/server';
import { extractBookingFromEmail } from '@/services/emailBookingGeminiService';
import { fetchNaverEmailForAnalysis } from '@/services/naverImapService';
import { analyzeScheduleAttachments, type AnalyzedScheduleAttachment } from '@/services/emailAttachmentIntake';
import { findEmailBookingCandidates } from '@/services/emailBookingMatchService';
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
    let bodyText = typeof (body.bodyText || body.emailText) === 'string' ? (body.bodyText || body.emailText) : '';
    let attachments: AnalyzedScheduleAttachment[] = [];
    let sourceMessageId = '';
    let sourceInReplyTo = '';
    let sourceReferences: string[] = [];
    let ignoredAttachments: string[] = [];

    if (!emailId) {
      return NextResponse.json({ ok: false, error: 'emailId는 필수 항목입니다.' }, { status: 400 });
    }

    // Always use the authenticated source when analyzing a NAVER email.
    // Client-provided bodyText/From/Subject is display-only and cannot spoof
    // attachment bytes or a previously booked customer.
    if (emailId.startsWith('naver-')) {
      const uidMatch = /^naver-(\\d+)$/.exec(emailId);
      if (!uidMatch) return NextResponse.json({ ok: false, error: '메일 ID가 올바르지 않습니다.' }, { status: 400 });
      try {
        const source = await fetchNaverEmailForAnalysis(Number(uidMatch[1]));
        subject = source.subject;
        sender = source.sender;
        senderName = source.senderName;
        bodyText = source.bodyText;
        sourceMessageId = source.messageId;
        sourceInReplyTo = source.inReplyTo;
        sourceReferences = source.references;
        const analysis = analyzeScheduleAttachments(source.attachments);
        attachments = analysis.analyzed;
        ignoredAttachments = analysis.ignored;
      } catch (error) {
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : '메일 첨부파일을 불러오지 못했습니다.',
        }, { status: 422 });
      }
    } else if (emailId.startsWith('em-ref-') && isDevAuthAllowed() && !bodyText.trim()) {
      const { REFERENCE_EMAILS } = await import('@/components/hq/email/emailReferenceData');
      const refItem = REFERENCE_EMAILS.find((r) => r.summary.id === emailId);
      if (refItem) {
        subject = refItem.detail.subject;
        sender = refItem.detail.from.address;
        senderName = refItem.detail.from.name;
        bodyText = refItem.detail.bodyText;
      }
    } else if (!isDevAuthAllowed()) {
      return NextResponse.json({ ok: false, error: '지원하지 않는 이메일 원본입니다.' }, { status: 400 });
    }

    if (!bodyText.trim() && attachments.length === 0) {
      return NextResponse.json({
        ok: false,
        error: '메일 본문 또는 지원되는 Excel·PDF 일정표가 없습니다.',
      }, { status: 400 });
    }

    const result = await extractBookingFromEmail({
      emailId,
      subject,
      sender: sender || '',
      senderName,
      replyTo,
      bodyText,
      attachments,
      sourceMessageId,
      sourceInReplyTo,
      sourceReferences,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }

    const matches = await findEmailBookingCandidates({
      companyName: result.draft.companyName,
      clientId: result.draft.clientId,
      sender,
      subject,
      inReplyTo: sourceInReplyTo,
      references: sourceReferences,
      pickupDate: result.draft.pickupDate,
      passengerName: result.draft.passengerName,
    });
    return NextResponse.json({
      ...result,
      matches,
      attachmentFiles: attachments.map((item) => ({ filename: item.filename, kind: item.kind })),
      ignoredAttachments,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/extract-booking:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
