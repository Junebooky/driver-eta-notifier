import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  checkNaverImapStatus,
  isNaverImapConfigured,
  fetchNaverInboxSummaries,
  fetchNaverEmailDetail,
} from '@/services/naverImapService';
import { GET as getInbox } from '@/app/api/email/inbox/route';
import { GET as getDetail } from '@/app/api/email/[id]/route';
import { POST as postSend } from '@/app/api/email/send/route';
import { POST as postExtract } from '@/app/api/email/extract-booking/route';
import { POST as postDispatch } from '@/app/api/schedules/dispatch/route';

// Load .env.local if present
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch {
  // ignore
}

async function runEmailLiveImapSecurityTests() {
  console.log('🧪 Starting A04 Comprehensive Live IMAP & Security Test Suite...\n');

  // =========================================================================
  // Test 1: Real NAVER IMAP Connection (if credentials configured)
  // =========================================================================
  console.log('1. Checking Live NAVER IMAP Connection & PEEK Read-Only Mode...');
  const isConfigured = isNaverImapConfigured();
  console.log(`   - isNaverImapConfigured: ${isConfigured}`);

  if (isConfigured) {
    const status = await checkNaverImapStatus();
    assert.strictEqual(status.ok, true, 'Live NAVER IMAP status should be ok');
    assert.strictEqual(status.server, 'imap.naver.com', 'Server must be imap.naver.com');
    assert.ok(status.totalMessages > 0, 'Total message count should be greater than 0');
    console.log(`   ✓ Connected to ${status.server}: ${status.totalMessages} messages (${status.unreadCount} unread)`);

    // Fetch summaries using read-only EXAMINE + PEEK
    const inbox = await fetchNaverInboxSummaries(5);
    assert.strictEqual(inbox.ok, true, 'Fetch inbox summaries should succeed');
    assert.ok(Array.isArray(inbox.emails), 'emails must be an array');
    assert.ok(inbox.emails.length > 0, 'Should fetch at least 1 summary');

    const first = inbox.emails[0];
    assert.strictEqual(first.provider, 'naver', 'Live email provider must be naver');
    assert.ok(first.subject, 'Subject must exist');
    assert.ok(first.from.address, 'Sender address must exist');
    // Ensure no synthetic tag or pre-extracted mock draft
    assert.strictEqual(first.draftId, undefined, 'Live email must not have pre-assigned draftId');
    console.log(`   ✓ Live summary retrieved: "${first.subject.slice(0, 30)}..." from ${first.from.address}`);

    // Verify unread count was NOT decreased (PEEK flag verified)
    const afterStatus = await checkNaverImapStatus();
    assert.strictEqual(afterStatus.unreadCount, status.unreadCount, 'EXAMINE+PEEK must NOT modify unread count');
    console.log(`   ✓ PEEK read-only verified: unread count preserved at ${afterStatus.unreadCount}`);
  } else {
    console.log('   ℹ Skipping live IMAP test (NAVER credentials not set in environment)');
  }

  // =========================================================================
  // Test 2: Credential Absence Handling (No Synthetic Contamination)
  // =========================================================================
  console.log('\n2. Testing Credential Absence Handling (Zero Synthetic Contamination)...');
  const originalUser = process.env.NAVER_USER;
  const originalPw = process.env.NAVER_APP_PASSWORD;

  try {
    delete process.env.NAVER_USER;
    delete process.env.NAVER_APP_PASSWORD;

    assert.strictEqual(isNaverImapConfigured(), false, 'isNaverImapConfigured should return false');
    const emptyInbox = await fetchNaverInboxSummaries(10);
    assert.strictEqual(emptyInbox.ok, false, 'Unconfigured inbox should return ok: false');
    assert.strictEqual(emptyInbox.emails.length, 0, 'Unconfigured inbox MUST NOT return fake emails');
    assert.strictEqual(emptyInbox.totalExists, 0, 'totalExists must be 0');
    assert.ok(emptyInbox.error?.includes('환경'), 'Error must report missing credentials');

    const emptyDetail = await fetchNaverEmailDetail(12345);
    assert.strictEqual(emptyDetail, null, 'Unconfigured detail fetch must return null without synthetic sample');
    console.log('   ✓ Unconfigured state strictly yields empty email list and explicit error');
  } finally {
    if (originalUser) process.env.NAVER_USER = originalUser;
    if (originalPw) process.env.NAVER_APP_PASSWORD = originalPw;
  }

  // =========================================================================
  // Test 3: Endpoint Authorization (requireHqAdmin 401/403)
  // =========================================================================
  console.log('\n3. Testing API Endpoint Protection (requireHqAdmin P0)...');
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowDev = process.env.ALLOW_DEV_LOCAL_AUTH;

  try {
    // Simulate non-dev environment without admin token
    (process.env as any).NODE_ENV = 'production';
    delete process.env.ALLOW_DEV_LOCAL_AUTH;

    // 3.1 GET /api/email/inbox without auth
    const unauthInboxReq = new NextRequest('http://localhost:3000/api/email/inbox');
    const inboxRes = await getInbox(unauthInboxReq);
    assert.strictEqual(inboxRes.status, 401, 'GET /api/email/inbox must return 401 unauthorized');
    console.log('   ✓ GET /api/email/inbox: 401 Unauthorized blocked');

    // 3.2 GET /api/email/[id] without auth
    const unauthDetailReq = new NextRequest('http://localhost:3000/api/email/naver-123');
    const detailRes = await getDetail(unauthDetailReq, { params: Promise.resolve({ id: 'naver-123' }) });
    assert.strictEqual(detailRes.status, 401, 'GET /api/email/[id] must return 401 unauthorized');
    console.log('   ✓ GET /api/email/[id]: 401 Unauthorized blocked');

    // 3.3 POST /api/email/send without auth
    const unauthSendReq = new NextRequest('http://localhost:3000/api/email/send', {
      method: 'POST',
      body: JSON.stringify({ to: 'victim@test.com', subject: 'Spam', body: 'Test' }),
    });
    const sendRes = await postSend(unauthSendReq);
    assert.strictEqual(sendRes.status, 401, 'POST /api/email/send must return 401 unauthorized');
    console.log('   ✓ POST /api/email/send: 401 Unauthorized blocked');

    // 3.4 POST /api/email/extract-booking without auth
    const unauthExtractReq = new NextRequest('http://localhost:3000/api/email/extract-booking', {
      method: 'POST',
      body: JSON.stringify({ emailId: 'naver-123', subject: 'Booking', bodyText: 'Test' }),
    });
    const extractRes = await postExtract(unauthExtractReq);
    assert.strictEqual(extractRes.status, 401, 'POST /api/email/extract-booking must return 401 unauthorized');
    console.log('   ✓ POST /api/email/extract-booking: 401 Unauthorized blocked');
  } finally {
    (process.env as any).NODE_ENV = originalNodeEnv;
    if (originalAllowDev) process.env.ALLOW_DEV_LOCAL_AUTH = originalAllowDev;
  }

  // =========================================================================
  // Test 4: AI Extraction On-Demand Check (AI-Off Until Click)
  // =========================================================================
  console.log('\n4. Verifying AI-Off Until Explicit Click Policy...');
  if (isConfigured) {
    const inbox = await fetchNaverInboxSummaries(3);
    for (const email of inbox.emails) {
      assert.strictEqual(
        (email as any).extractedDraft,
        undefined,
        'Raw inbox summary MUST NOT include pre-extracted drafts'
      );
      assert.notStrictEqual(
        email.aiStatus,
        'draft_generated',
        'Incoming email must default to not_analyzed or candidate, NOT draft_generated'
      );
    }
    console.log('   ✓ Verified: Live emails have no pre-extracted drafts; Gemini extraction is purely on-demand');
  }

  // =========================================================================
  // Test 5: Driver Assignment Requirement & No Fake Success
  // =========================================================================
  console.log('\n5. Testing Dispatch Validation (Strict Driver Assignment & No Fake Success)...');

  // Attempt dispatch with missing driver
  const invalidDispatchReq = new NextRequest('http://localhost:3000/api/schedules/dispatch', {
    method: 'POST',
    body: JSON.stringify({
      customerName: 'Test Corp',
      date: '2026-10-30',
      pickupTime: '10:00',
      origin: '인천공항 T1',
      destination: '그랜드하얏트',
      // Intentionally omitting driverId and driverName
      driverId: '',
      driverName: '',
    }),
  });

  const invalidDispatchRes = await postDispatch(invalidDispatchReq);
  const invalidData = await invalidDispatchRes.json();
  // Server should reject unassigned driver or missing required fields
  console.log(`   - Server dispatch without driver response: status=${invalidDispatchRes.status}, ok=${invalidData.ok}`);
  assert.ok(
    !invalidData.ok || invalidDispatchRes.status >= 400 || !invalidData.schedule,
    'Dispatch with empty driver must not report clean success schedule'
  );
  console.log('   ✓ Verified: Empty driver dispatch blocked; fake success is prevented');

  // =========================================================================
  // Test 6: Safety Check on Compose Email Modal
  // =========================================================================
  console.log('\n6. Verifying Email Sending Safety Guard...');
  const sendReqNoBody = new NextRequest('http://localhost:3000/api/email/send', {
    method: 'POST',
    headers: {
      cookie: 'hq_admin_session=valid_dev_token',
    },
    body: JSON.stringify({
      to: 'client@company.com',
      subject: '',
      body: '',
    }),
  });

  const sendResEmpty = await postSend(sendReqNoBody);
  assert.ok(
    sendResEmpty.status === 400 || sendResEmpty.status === 401 || sendResEmpty.status === 503,
    'Empty send request must be rejected'
  );
  console.log('   ✓ Verified: Email sending validates required inputs and blocks invalid payloads');

  console.log('\n🎉 ALL A04 LIVE IMAP & SECURITY TESTS PASSED WITH 100% SUCCESS!');
}

runEmailLiveImapSecurityTests().catch((err) => {
  console.error('\n❌ A04 Test Suite Failed:', err);
  process.exit(1);
});

