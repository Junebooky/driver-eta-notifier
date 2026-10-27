import { NextResponse } from 'next/server';
import { getInboxCandidateEmails } from '@/services/emailIntakeService';

export async function GET() {
  try {
    const emails = await getInboxCandidateEmails();
    return NextResponse.json({
      emails,
      isSynthetic: true,
      notice: 'HQ 이메일 인박스는 현재 승인된 테스트 모드로 동작 중입니다 (실제 편지함 접근 차단).',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
