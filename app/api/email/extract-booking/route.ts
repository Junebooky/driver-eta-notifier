import { NextRequest, NextResponse } from 'next/server';
import { extractBookingFromEmail } from '@/services/emailBookingGeminiService';
import { extractBookingDraftFromEmail } from '@/services/emailIntakeService';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // P0 Compliance: Require HQ Admin authentication before invoking AI extraction
    const auth = await requireHqAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await request.json().catch(() => ({}));
    const emailId = body.emailId;
    const subject = body.subject || body.emailSubject;
    const sender = body.sender || body.emailFrom;
    const bodyText = body.bodyText || body.emailText;

    if (!emailId) {
      return NextResponse.json({ ok: false, error: 'emailId is required' }, { status: 400 });
    }

    if (subject && bodyText) {
      const result = await extractBookingFromEmail({
        emailId,
        subject,
        sender: sender || '',
        bodyText,
      });
      return NextResponse.json(result);
    }

    const result = await extractBookingDraftFromEmail(emailId);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/extract-booking:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
