import { NextRequest, NextResponse } from 'next/server';
import { extractBookingFromEmail } from '@/services/emailBookingGeminiService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailId, subject, sender, bodyText } = body;

    if (!emailId || !subject || !bodyText) {
      return NextResponse.json(
        { ok: false, error: 'emailId, subject, and bodyText are required' },
        { status: 400 }
      );
    }

    const result = await extractBookingFromEmail({
      emailId,
      subject,
      sender: sender || '',
      bodyText,
    });

    return NextResponse.json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/extract-booking:', errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
