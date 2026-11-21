/**
 * VIP LIMOUSINE KOREA - NAVER SMTP Email Sending Service
 * Allows the administrator to send emails to any recipient via NAVER SMTP.
 */

import nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  sentAt?: string;
  error?: string;
}

/**
 * Check if NAVER SMTP credentials are configured
 */
export function isNaverSmtpConfigured(): boolean {
  const user = process.env.NAVER_USER;
  const pass = process.env.NAVER_APP_PASSWORD;
  return Boolean(user && pass && user.trim() !== '' && pass.trim() !== '');
}

/**
 * Create a nodemailer transporter using NAVER SMTP
 */
function createSmtpTransporter() {
  const host = process.env.NAVER_SMTP_SERVER || 'smtp.naver.com';
  const port = Number(process.env.NAVER_SMTP_PORT || 465);
  const user = process.env.NAVER_USER || '';
  const pass = process.env.NAVER_APP_PASSWORD || '';

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user,
      pass,
    },
    // Optional timeout settings
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Format sender address with VIP Limousine branding
 */
function getSenderAddress(): string {
  const user = process.env.NAVER_USER || '';
  const senderEmail = user.includes('@') ? user : `${user}@naver.com`;
  return `"VIP LIMOUSINE KOREA 관제팀" <${senderEmail}>`;
}

/**
 * Send an email to any recipient using NAVER SMTP
 */
export async function sendEmailViaNaver(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!isNaverSmtpConfigured()) {
    return {
      ok: false,
      error: 'NAVER SMTP 계정 정보(NAVER_USER, NAVER_APP_PASSWORD)가 구성되지 않았습니다.',
    };
  }

  const { to, cc, bcc, subject, body, html, replyTo } = options;

  if (!to || (Array.isArray(to) && to.length === 0)) {
    return {
      ok: false,
      error: '수신인(받는 사람) 이메일 주소를 입력해주세요.',
    };
  }

  if (!subject || subject.trim() === '') {
    return {
      ok: false,
      error: '이메일 제목을 입력해주세요.',
    };
  }

  try {
    const transporter = createSmtpTransporter();
    const from = getSenderAddress();

    // Default HTML body generated from plain text if html not provided
    const formattedHtml =
      html ||
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 640px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #1E60F3; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #0B1E48; font-size: 18px; font-weight: 800;">VIP LIMOUSINE KOREA</h2>
          <p style="margin: 4px 0 0 0; color: #64748b; font-size: 12px;">HQ Dispatch & Operations Control Center</p>
        </div>
        <div style="font-size: 14px; white-space: pre-wrap; color: #334155;">
${body}
        </div>
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8;">
          <p style="margin: 0;">본 메일은 VIP LIMOUSINE KOREA 본사 관리자 시스템에서 공식 발송되었습니다.</p>
          <p style="margin: 4px 0 0 0;">문의: VIP Limousine 관제팀 | 02-1588-0000</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from,
      to,
      cc,
      bcc,
      replyTo: replyTo || from,
      subject,
      text: body,
      html: formattedHtml,
    });

    const sentAt = new Date().toISOString();
    console.log(`[NAVER SMTP] Email sent successfully to: ${Array.isArray(to) ? to.join(', ') : to} (MessageId: ${info.messageId})`);

    return {
      ok: true,
      messageId: info.messageId,
      sentAt,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[NAVER SMTP] Failed to send email:', errorMsg);
    return {
      ok: false,
      error: `이메일 발송 실패: ${errorMsg}`,
    };
  }
}
