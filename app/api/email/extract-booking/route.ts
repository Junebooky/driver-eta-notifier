import { NextRequest, NextResponse } from 'next/server';
import { extractBookingDraftFromEmail } from '@/services/emailIntakeService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { emailId } = body;

    if (!emailId) {
      return NextResponse.json({ error: 'emailId is required' }, { status: 400 });
    }

    const result = await extractBookingDraftFromEmail(emailId);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
