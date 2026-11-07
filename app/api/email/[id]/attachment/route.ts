import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverEmailForAnalysis } from '@/services/naverImapService';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireHqAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Email ID is required' }, { status: 400 });
    }

    const uidStr = id.replace(/^naver-/, '');
    const uid = parseInt(uidStr, 10);

    if (isNaN(uid)) {
      return NextResponse.json({ ok: false, error: '유효하지 않은 이메일 식별자입니다.' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const targetFilename = searchParams.get('filename');
    const indexStr = searchParams.get('index');

    const emailData = await fetchNaverEmailForAnalysis(uid);
    if (!emailData || !emailData.attachments || emailData.attachments.length === 0) {
      return NextResponse.json({ ok: false, error: '첨부파일이 없는 이메일입니다.' }, { status: 404 });
    }

    let attachment = null;
    if (targetFilename) {
      attachment = emailData.attachments.find(
        (a) => a.filename === targetFilename || decodeURIComponent(a.filename) === targetFilename
      );
    }
    if (!attachment && indexStr !== null) {
      const idx = parseInt(indexStr, 10);
      if (!isNaN(idx) && idx >= 0 && idx < emailData.attachments.length) {
        attachment = emailData.attachments[idx];
      }
    }
    if (!attachment && emailData.attachments.length === 1) {
      attachment = emailData.attachments[0];
    }

    if (!attachment || !attachment.content) {
      return NextResponse.json({ ok: false, error: '요청한 첨부파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const encodedFilename = encodeURIComponent(attachment.filename);
    const isInlineViewable =
      attachment.contentType === 'application/pdf' || attachment.contentType.startsWith('image/');
    const dispositionType = isInlineViewable ? 'inline' : 'attachment';
    const contentBytes = Uint8Array.from(attachment.content as Buffer);

    return new NextResponse(contentBytes, {
      headers: {
        'Content-Type': attachment.contentType || 'application/octet-stream',
        'Content-Disposition': `${dispositionType}; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'private, no-cache, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/[id]/attachment:', errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

