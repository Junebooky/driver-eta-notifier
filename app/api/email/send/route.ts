import { NextRequest, NextResponse } from 'next/server';
import { sendEmailViaNaver, isNaverSmtpConfigured } from '@/services/naverSmtpService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isNaverSmtpConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NAVER SMTP 환경변수(NAVER_USER, NAVER_APP_PASSWORD)가 설정되어 있지 않습니다.',
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { to, cc, bcc, subject, body: emailBody, html, replyTo } = body || {};

    if (!to) {
      return NextResponse.json(
        { ok: false, error: '받는 사람(수신인) 이메일 주소를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
      return NextResponse.json(
        { ok: false, error: '이메일 제목을 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!emailBody && !html) {
      return NextResponse.json(
        { ok: false, error: '이메일 본문 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    const result = await sendEmailViaNaver({
      to,
      cc,
      bcc,
      subject: subject.trim(),
      body: emailBody || '',
      html,
      replyTo,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || '이메일 발송에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      sentAt: result.sentAt,
      to,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/send:', errorMsg);
    return NextResponse.json(
      { ok: false, error: `서버 오류: ${errorMsg}` },
      { status: 500 }
    );
  }
}
