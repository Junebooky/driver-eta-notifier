import { NextRequest, NextResponse } from 'next/server';
import { extractBookingFromEmail } from '@/services/emailBookingGeminiService';
import { extractBookingDraftFromEmail } from '@/services/emailIntakeService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { emailId, subject, sender, bodyText } = body;

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
