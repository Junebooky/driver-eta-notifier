/**
 * VIP LIMOUSINE KOREA - Read-only NAVER IMAP Service
 * 
 * Strict Read-Only Policy:
 * - Uses EXAMINE 'INBOX' (readOnly lock)
 * - Uses BODY.PEEK[] for body extraction
 * - NEVER marks emails as read (\Seen)
 * - NEVER alters flags, deletes, or moves emails
 * - NO SMTP is used
 * - Secrets are never logged
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { HqEmailSummary, HqEmailDetail } from '@/types/emailHq';
import { classifyEmailCandidate } from '@/utils/emailClassifier';

export interface ImapConnectionStatus {
  ok: boolean;
  totalMessages: number;
  unreadCount: number;
  accountEmail: string;
  server: string;
  lastChecked: string;
  error?: string;
}

/**
 * Format Date to Korean display string (e.g., 2024. 10. 26 14:30)
 */
function formatDisplayDate(date?: Date | null): string {
  if (!date || isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}. ${String(now.getMonth() + 1).padStart(2, '0')}. ${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Check if NAVER IMAP credentials are configured
 */
export function isNaverImapConfigured(): boolean {
  const user = process.env.NAVER_USER;
  const pass = process.env.NAVER_APP_PASSWORD;
  return Boolean(user && pass && user.trim() !== '' && pass.trim() !== '');
}

/**
 * Create read-only ImapFlow client instance
 */
function createImapClient(): ImapFlow {
  const host = process.env.NAVER_IMAP_SERVER || 'imap.naver.com';
  const port = Number(process.env.NAVER_IMAP_PORT || 993);
  const user = process.env.NAVER_USER || '';
  const pass = process.env.NAVER_APP_PASSWORD || '';

  return new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false, // Security: Never log credentials or protocol dumps
    emitLogs: false,
    clientInfo: {
      name: 'VipLimousineKoreaHq',
      version: '1.0.0',
    },
  });
}

/**
 * Verify IMAP connection health in read-only mode
 */
export async function checkNaverImapStatus(): Promise<ImapConnectionStatus> {
  const accountEmail = process.env.NAVER_USER ? `${process.env.NAVER_USER}@naver.com` : '미연결';
  const server = process.env.NAVER_IMAP_SERVER || 'imap.naver.com';

  if (!isNaverImapConfigured()) {
    return {
      ok: false,
      totalMessages: 0,
      unreadCount: 0,
      accountEmail,
      server,
      lastChecked: formatDisplayDate(new Date()),
      error: 'NAVER_USER 또는 NAVER_APP_PASSWORD 환경 변수가 설정되지 않았습니다.',
    };
  }

  const client = createImapClient();
  try {
    await client.connect();
    // Acquire read-only lock (issues EXAMINE 'INBOX')
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    let totalMessages = 0;
    let unreadCount = 0;
    try {
      totalMessages = client.mailbox ? client.mailbox.exists : 0;
      // Count unseen without changing flags
      const statusRes = await client.status('INBOX', { unseen: true, messages: true });
      unreadCount = statusRes && 'unseen' in statusRes && typeof statusRes.unseen === 'number' ? statusRes.unseen : 0;
    } finally {
      lock.release();
    }
    await client.logout();

    return {
      ok: true,
      totalMessages,
      unreadCount,
      accountEmail,
      server,
      lastChecked: formatDisplayDate(new Date()),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      totalMessages: 0,
      unreadCount: 0,
      accountEmail,
      server,
      lastChecked: formatDisplayDate(new Date()),
      error: message,
    };
  }
}

/**
 * Fetch latest emails from NAVER INBOX in read-only mode (EXAMINE + PEEK)
 */
export async function fetchNaverInboxSummaries(limit: number = 30): Promise<{
  ok: boolean;
  emails: HqEmailSummary[];
  totalExists: number;
  lastSync: string;
  error?: string;
}> {
  if (!isNaverImapConfigured()) {
    return {
      ok: false,
      emails: getSyntheticSampleEmails(),
      totalExists: 5,
      lastSync: formatDisplayDate(new Date()),
      error: '네이버 계정이 설정되지 않아 샘플 모드로 동작합니다.',
    };
  }

  const client = createImapClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    const emailSummaries: HqEmailSummary[] = [];
    let totalExists = 0;

    try {
      totalExists = client.mailbox ? client.mailbox.exists : 0;
      if (totalExists > 0) {
        const fetchCount = Math.min(limit, totalExists);
        const startSeq = Math.max(1, totalExists - fetchCount + 1);
        const seqRange = `${startSeq}:*`;

        // Fetch envelopes & flags (read-only)
        for await (const msg of client.fetch(seqRange, { envelope: true, uid: true, flags: true })) {
          const envelope = msg.envelope;
          const flags = Array.from(msg.flags || []);
          const isUnread = !flags.includes('\\Seen');

          const fromName = envelope?.from?.[0]?.name || envelope?.from?.[0]?.address || '알 수 없음';
          const fromAddress = envelope?.from?.[0]?.address || '';
          const toAddresses = (envelope?.to || []).map((t) => t.address || '');
          const subject = envelope?.subject || '(제목 없음)';
          const rawDate = envelope?.date;
          const date = rawDate ? new Date(rawDate) : new Date();

          // Stage 1 heuristic candidate pre-filtering
          const classification = classifyEmailCandidate(subject, '', fromAddress);

          emailSummaries.push({
            id: `naver-${msg.uid}`,
            uid: msg.uid,
            provider: 'naver',
            from: {
              name: fromName,
              address: fromAddress,
            },
            to: toAddresses,
            subject,
            receivedAt: formatDisplayDate(date),
            dateIso: date.toISOString(),
            isUnread,
            flags,
            preview: '',
            hasAttachments: false,
            candidateClassification: classification.classification,
            aiStatus: classification.classification === 'booking_candidate' ? 'candidate' : 'not_analyzed',
            matchedKeywords: classification.matchedPositive,
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    // Sort newest first
    emailSummaries.reverse();

    return {
      ok: true,
      emails: emailSummaries,
      totalExists,
      lastSync: formatDisplayDate(new Date()),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to fetch NAVER inbox summaries:', errorMsg);
    return {
      ok: false,
      emails: getSyntheticSampleEmails(),
      totalExists: 5,
      lastSync: formatDisplayDate(new Date()),
      error: `IMAP 동기화 오류: ${errorMsg}. 안전 모드(샘플)로 표시합니다.`,
    };
  }
}

/**
 * Fetch a single email's full content using BODY.PEEK[] (Strictly Read-Only)
 */
export async function fetchNaverEmailDetail(uid: number): Promise<HqEmailDetail | null> {
  if (!isNaverImapConfigured()) {
    const sample = getSyntheticSampleEmails().find((e) => e.uid === uid);
    if (!sample) return null;
    return {
      ...sample,
      bodyText: getSyntheticBodyText(uid),
      bodyHtmlSanitized: `<div style="font-family: sans-serif; line-height: 1.6; color: #334155;">${getSyntheticBodyText(uid).replace(/\n/g, '<br/>')}</div>`,
    };
  }

  const client = createImapClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    let detail: HqEmailDetail | null = null;

    try {
      // Download raw RFC822 message without altering flags
      const downloadRes = await client.download(String(uid), undefined, { uid: true });
      if (downloadRes && 'content' in downloadRes && downloadRes.content) {
        // Parse MIME content safely
        const parsed = await simpleParser(downloadRes.content);
        const subject = parsed.subject || '(제목 없음)';
        const fromName = parsed.from?.value?.[0]?.name || parsed.from?.value?.[0]?.address || '알 수 없음';
        const fromAddress = parsed.from?.value?.[0]?.address || '';
        const toAddresses = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [])
          .flatMap((t) => t.value.map((v) => v.address || ''));

        const date = parsed.date || new Date();
        const bodyText = parsed.text || '';
        const bodyHtml = typeof parsed.html === 'string' ? parsed.html : undefined;

        // Basic HTML sanitize: remove scripts, objects, external tracking pixels
        const sanitizedHtml = bodyHtml
          ? bodyHtml
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
              .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
              .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          : undefined;

        const classification = classifyEmailCandidate(subject, bodyText.slice(0, 300), fromAddress);

        detail = {
          id: `naver-${uid}`,
          uid,
          provider: 'naver',
          from: { name: fromName, address: fromAddress },
          to: toAddresses,
          subject,
          receivedAt: formatDisplayDate(date),
          dateIso: date.toISOString(),
          isUnread: false,
          flags: [],
          preview: bodyText.slice(0, 140).replace(/\s+/g, ' ').trim(),
          hasAttachments: (parsed.attachments || []).length > 0,
          candidateClassification: classification.classification,
          aiStatus: classification.classification === 'booking_candidate' ? 'candidate' : 'not_analyzed',
          matchedKeywords: classification.matchedPositive,
          bodyText,
          bodyHtmlSanitized: sanitizedHtml,
        };
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return detail;
  } catch (err) {
    console.error(`Failed to fetch email detail for UID ${uid}:`, err);
    return null;
  }
}

/**
 * Synthetic Sample Emails per Specification
 * (Ensures full reviewability and automated testing even in environments without live IMAP)
 */
export function getSyntheticSampleEmails(): HqEmailSummary[] {
  return [
    {
      id: 'naver-9001',
      uid: 9001,
      provider: 'naver',
      from: { name: 'Morgan Stanley Asia', address: 'exec-travel@morganstanley.com' },
      to: ['vip-korea@naver.com'],
      subject: '[예약 요청] 10/28 인천공항 VIP 의전 픽업 (카니발 하이리무진 1대)',
      receivedAt: '2024. 10. 26 18:20',
      dateIso: '2024-10-26T18:20:00.000Z',
      isUnread: true,
      flags: [],
      preview: '안녕하세요, 모건스탠리 아시아 본부 의전팀입니다. 당사 아시아 총괄 부사장(David Miller) 방한 일정으로 VIP 리무진 픽업을 요청드립니다.',
      hasAttachments: false,
      candidateClassification: 'booking_candidate',
      aiStatus: 'candidate',
      matchedKeywords: ['예약', '의전', '픽업', '카니발', '인천공항'],
    },
    {
      id: 'naver-9002',
      uid: 9002,
      provider: 'naver',
      from: { name: '현대글로비스 해외사업부', address: 'jh.park@glovis.net' },
      to: ['vip-korea@naver.com'],
      subject: '[긴급 배차 변경] 10/27 김포공항 픽업 시간 30분 지연 요청의 건',
      receivedAt: '2024. 10. 26 16:45',
      dateIso: '2024-10-26T16:45:00.000Z',
      isUnread: true,
      flags: [],
      preview: '안녕하세요 현대글로비스 박정훈 책임입니다. 기존에 예약된 10월 27일 대한항공 KE1204편 일정이 30분 연착될 것으로 확인되었습니다.',
      hasAttachments: false,
      candidateClassification: 'booking_candidate',
      aiStatus: 'candidate',
      matchedKeywords: ['배차', '픽업', '김포공항'],
    },
    {
      id: 'naver-9003',
      uid: 9003,
      provider: 'naver',
      from: { name: 'Google Cloud Korea', address: 'events-kr@google.com' },
      to: ['vip-korea@naver.com'],
      subject: '[그룹 의전 견적] 11/02 아시아 테크 서밋 VIP 연사 3인 개별 픽업 요청',
      receivedAt: '2024. 10. 26 14:10',
      dateIso: '2024-10-26T14:10:00.000Z',
      isUnread: false,
      flags: ['\\Seen'],
      preview: '안녕하세요, 구글 클라우드 코리아 테크 서밋 운영사무국입니다. 11월 2일 진행되는 글로벌 서밋에 해외 연사 3분이 동시 입국 예정입니다.',
      hasAttachments: true,
      candidateClassification: 'booking_candidate',
      aiStatus: 'candidate',
      matchedKeywords: ['의전', '견적', '픽업'],
    },
    {
      id: 'naver-9004',
      uid: 9004,
      provider: 'naver',
      from: { name: '네이버 클라우드 플랫폼', address: 'help@navercloud.com' },
      to: ['vip-korea@naver.com'],
      subject: '[안내] 2024년 10월 정기 보안 점검 및 서비스 업데이트 공지',
      receivedAt: '2024. 10. 26 10:00',
      dateIso: '2024-10-26T10:00:00.000Z',
      isUnread: false,
      flags: ['\\Seen'],
      preview: '항상 네이버 클라우드 플랫폼을 이용해 주셔서 감사드립니다. 보다 안정적인 서비스 제공을 위해 정기 시스템 점검이 진행될 예정입니다.',
      hasAttachments: false,
      candidateClassification: 'unrelated',
      aiStatus: 'skipped',
      matchedKeywords: [],
    },
    {
      id: 'naver-9005',
      uid: 9005,
      provider: 'naver',
      from: { name: '정성훈 이사 (파트너스)', address: 'sh.jung@partners.co.kr' },
      to: ['vip-korea@naver.com'],
      subject: '다음 주 미팅 관련 문의 건',
      receivedAt: '2024. 10. 25 17:30',
      dateIso: '2024-10-25T17:30:00.000Z',
      isUnread: false,
      flags: ['\\Seen'],
      preview: '대표님 안녕하십니까, 다음 주 화요일 여의도에서 오찬 미팅 관련 일정 조율차 연락드렸습니다.',
      hasAttachments: false,
      candidateClassification: 'uncertain',
      aiStatus: 'not_analyzed',
      matchedKeywords: ['일정'],
    },
  ];
}

function getSyntheticBodyText(uid: number): string {
  if (uid === 9001) {
    return `안녕하세요, 모건스탠리 아시아 본부 총무의전팀 김서연입니다.

당사 아시아 총괄 부사장(David Miller) 및 비서관 방한 일정으로 VIP 리무진 픽업 및 이동 의전을 요청드립니다.

[예약 요청 상세 정보]
1. 탑승 승객명: David Miller (외 1인, 총 2명)
2. 비상 연락처: +82-10-8842-1920 (비서관 직접 연결) / 이메일: d.miller.exec@morganstanley.com
3. 입국 일시: 2024년 10월 28일 (월) 15:40 입국
4. 항공편명: 대한항공 KE082 (뉴욕 JFK 출발 -> 인천 T2 도착)
5. 출발지 (픽업): 인천국제공항 제2여객터미널 B 입국장 VIP 게이트
6. 목적지 (하차): 서울 여의도 콘래드 호텔 (영등포구 국제금융로 10)
7. 수하물: 대형 캐리어 2개, 골프백 1개
8. 요청 차종: 카니발 하이리무진 (최신형)
9. 특이사항:
  - 웰컴 피켓명: 'MR. DAVID MILLER / MORGAN STANLEY'
  - 차내 에비앙 생수 2병 및 영문 신문 비치 희망
  - 정장 착용 기사님 배정 부탁드립니다.

견적서 회신 및 배차 확정 부탁드립니다.
감사합니다.`;
  }

  if (uid === 9002) {
    return `안녕하세요, 현대글로비스 해외사업부 박정훈 책임입니다.

기존에 예약된 10월 27일(일) 김포공항 입국 픽업 일정에 변동이 생겨 긴급 변경 요청드립니다.

- 기존 예약 고객명: 마이클 챈 (Michael Chen)
- 기존 픽업 예정 시간: 2024년 10월 27일 14:00
- 변경 사유: 도쿄 하네다발 항공편 KE1204 30분 지연 착륙 예정
- 변경 요청 픽업 시간: 2024년 10월 27일 14:30
- 목적지: 강남 그랜드 인터컨티넨탈 서울 파르나스 (변동 없음)

기사님께 30분 지연 대기 전달 부탁드립니다. 추가 대기 요금 발생 시 일괄 청구서에 포함해 주시기 바랍니다.`;
  }

  if (uid === 9003) {
    return `안녕하세요, 구글 클라우드 코리아 테크 서밋 운영팀입니다.

11월 2일 진행되는 'Google Cloud Summit Seoul' 해외 기조연설자 3인의 개별 리무진 픽업 예약을 요청드립니다.

[탑승자 1]
- 승객명: Dr. Amanda Jones
- 픽업 시간: 11월 02일 11:20 (인천 T1, SQ608)
- 목적지: 포시즌스 호텔 서울 (광화문)
- 차종: 세단 또는 하이리무진

[탑승자 2]
- 승객명: Robert Vance
- 픽업 시간: 11월 02일 13:10 (인천 T2, DL159)
- 목적지: JW 메리어트 호텔 서울 (반포)
- 차종: 카니발 하이리무진

[탑승자 3]
- 승객명: Kenji Sato
- 픽업 시간: 11월 02일 14:00 (김포공항 국제선, JL093)
- 목적지: 그랜드 인터컨티넨탈 파르나스
- 차종: 카니발 하이리무진

총 3대의 차량이 필요하며 각 승객별 픽업 피켓 제작을 요청합니다. 상세 견적 및 배차 가능 여부 회신 부탁드립니다.`;
  }

  return '본문 내용이 없습니다.';
}
