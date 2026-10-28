import { NextRequest, NextResponse } from 'next/server';
import {
  dismissPendingCustomerNotification,
  recordServerCustomerNotification,
} from '@/lib/dispatch/scheduleServerStore';
import { isNaverSmtpConfigured, sendEmailViaNaver } from '@/services/naverSmtpService';

export const dynamic = 'force-dynamic';

const VALID_TRIGGERS = new Set(['dispatch_confirmed', 'driver_changed', 'arrived_pickup']);

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const {
      scheduleId,
      action = 'record_sent',
      trigger = 'dispatch_confirmed',
      channel = 'sms',
      language = 'ko',
      recipient = '',
      subject = '',
      body = '',
      deliveryMethod = 'manual_copy',
      sentBy = '본사 관리자',
    } = payload || {};

    if (!scheduleId || typeof scheduleId !== 'string') {
      return NextResponse.json(
        { ok: false, error: '배차 ID(scheduleId)가 필요합니다.' },
        { status: 400 }
      );
    }

    if (action === 'dismiss_pending') {
      const dismissed = await dismissPendingCustomerNotification({
        scheduleId: scheduleId.trim(),
      });
      if (dismissed.error) {
        return NextResponse.json(
          { ok: false, error: dismissed.error },
          { status: dismissed.statusCode || 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        action: 'dismiss_pending',
        schedule: dismissed.schedule,
      });
    }

    if (!VALID_TRIGGERS.has(trigger)) {
      return NextResponse.json(
        { ok: false, error: '유효하지 않은 안내 유형(trigger)입니다.' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'string' || !body.trim()) {
      return NextResponse.json(
        { ok: false, error: '발송할 안내 메시지 본문을 입력해주세요.' },
        { status: 400 }
      );
    }

    const safeLang: 'ko' | 'en' = language === 'en' ? 'en' : 'ko';

    if (action === 'send_email') {
      if (!isNaverSmtpConfigured()) {
        return NextResponse.json(
          {
            ok: false,
            smtpNotConfigured: true,
            error:
              'NAVER SMTP 환경변수(NAVER_USER, NAVER_APP_PASSWORD)가 설정되어 있지 않아 서버 이메일 직접 발송을 사용할 수 없습니다. 본문을 복사하여 발송한 뒤 [발송 완료 기록]을 눌러주세요.',
          },
          { status: 503 }
        );
      }

      if (!recipient || typeof recipient !== 'string' || !recipient.includes('@')) {
        return NextResponse.json(
          { ok: false, error: '유효한 수신인 이메일 주소를 입력해주세요.' },
          { status: 400 }
        );
      }

      if (!subject || typeof subject !== 'string' || !subject.trim()) {
        return NextResponse.json(
          { ok: false, error: '이메일 제목을 입력해주세요.' },
          { status: 400 }
        );
      }

      const smtpResult = await sendEmailViaNaver({
        to: recipient.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });

      if (!smtpResult.ok) {
        return NextResponse.json(
          { ok: false, error: smtpResult.error || '이메일 발송에 실패했습니다.' },
          { status: 500 }
        );
      }

      const recorded = await recordServerCustomerNotification({
        scheduleId: scheduleId.trim(),
        trigger,
        channel: 'email',
        language: safeLang,
        recipient: recipient.trim(),
        subject: subject.trim(),
        body: body.trim(),
        deliveryMethod: 'smtp',
        sentBy: typeof sentBy === 'string' && sentBy.trim() ? sentBy.trim() : '본사 관리자',
      });

      if (recorded.error) {
        return NextResponse.json(
          { ok: false, error: recorded.error },
          { status: recorded.statusCode || 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        action: 'send_email',
        deliveryMethod: 'smtp',
        messageId: smtpResult.messageId,
        record: recorded.record,
        schedule: recorded.schedule,
      });
    }

    if (action === 'record_sent') {
      const safeChannel: 'email' | 'sms' = channel === 'email' ? 'email' : 'sms';
      const safeDelivery: 'manual_copy' | 'sms_app' =
        deliveryMethod === 'sms_app' ? 'sms_app' : 'manual_copy';

      const recorded = await recordServerCustomerNotification({
        scheduleId: scheduleId.trim(),
        trigger,
        channel: safeChannel,
        language: safeLang,
        recipient:
          typeof recipient === 'string' && recipient.trim()
            ? recipient.trim()
            : safeChannel === 'email'
            ? '고객사 이메일(수동발송)'
            : '고객사/탑승객 연락처(수동발송)',
        subject: safeChannel === 'email' && typeof subject === 'string' ? subject.trim() : undefined,
        body: body.trim(),
        deliveryMethod: safeDelivery,
        sentBy: typeof sentBy === 'string' && sentBy.trim() ? sentBy.trim() : '본사 관리자',
      });

      if (recorded.error) {
        return NextResponse.json(
          { ok: false, error: recorded.error },
          { status: recorded.statusCode || 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        action: 'record_sent',
        deliveryMethod: safeDelivery,
        record: recorded.record,
        schedule: recorded.schedule,
      });
    }

    return NextResponse.json(
      { ok: false, error: `지원하지 않는 action(${String(action)})입니다.` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules/customer-notify error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
