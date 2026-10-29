import assert from 'node:assert';
import test from 'node:test';
import { supabaseAdmin } from '@/lib/supabase/server';
import { signCockpitSession } from '@/lib/auth/serverAuth';
import { GET, POST, PUT } from '@/app/api/hq/customers/route';
import { NextRequest } from 'next/server';

test('Item 3: CRM Live Supabase DB Synchronization & Deduplication', async () => {
  const adminToken = signCockpitSession({
    userId: 'hq-test-admin',
    org: 'vip_limousine_korea',
    role: 'hq_admin',
  });

  const makeReq = (method: string, body?: any) => {
    return new NextRequest('http://localhost:3000/api/hq/customers', {
      method,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // 1. GET: Fetch existing customers from DB
  const getRes = await GET(makeReq('GET'));
  const getData = await getRes.json();
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getData.ok, true);
  assert.ok(Array.isArray(getData.customers), 'Customers must be an array');
  assert.ok(getData.customers.length >= 28, 'Must return at least 28 seeded customers from DB');

  // Verify CHANEL exists
  const chanel = getData.customers.find((c: any) => c.name.toUpperCase() === 'CHANEL');
  assert.ok(chanel, 'CHANEL must exist in DB customers');

  // 2. POST: Linking an existing contact to existing company (CHANEL - Marie Dupont)
  const existingContactPost = await POST(
    makeReq('POST', {
      companyName: 'CHANEL',
      contactName: 'Marie Dupont',
      contactEmail: 'marie.dupont@chanel.com',
      contactPhone: '+33 6 12 34 56 78',
    })
  );
  const existingData = await existingContactPost.json();
  assert.strictEqual(existingContactPost.status, 200);
  assert.strictEqual(existingData.isNewCustomer, false, 'Must recognize existing customer');
  assert.strictEqual(existingData.isNewContact, false, 'Must recognize existing contact (no duplication)');

  // 3. POST: Adding a NEW contact to existing company (CHANEL)
  const newContactPost = await POST(
    makeReq('POST', {
      companyName: 'CHANEL',
      contactName: `Pierre Dubois ${Date.now()}`,
      contactEmail: `pierre.dubois.${Date.now()}@chanel.com`,
      contactPhone: `010-8888-${Math.floor(1000 + Math.random() * 9000)}`,
      role: 'VIP 의전 팀장',
      department: 'Global Events',
    })
  );
  const newContactData = await newContactPost.json();
  assert.strictEqual(newContactPost.status, 200);
  assert.strictEqual(newContactData.isNewCustomer, false, 'Must match existing CHANEL');
  assert.strictEqual(newContactData.isNewContact, true, 'Must detect new contact');
  assert.ok(newContactData.contactId.startsWith('c-'), 'Must generate contact ID');

  // 4. POST: Registering a completely NEW company & contact
  const testUniqueCompanyName = `테스트글로벌파트너스_${Date.now()}`;
  const newCompanyPost = await POST(
    makeReq('POST', {
      companyName: testUniqueCompanyName,
      contactName: '김민수',
      contactEmail: `minsu.${Date.now()}@test-partner.com`,
      contactPhone: '010-7777-6666',
      notes: '이메일 AI 예약 테스트 고객사',
    })
  );
  const newCompData = await newCompanyPost.json();
  assert.strictEqual(newCompanyPost.status, 200);
  assert.strictEqual(newCompData.isNewCustomer, true, 'Must be recognized as new customer');
  assert.strictEqual(newCompData.isNewContact, true, 'Must be recognized as new contact');
  assert.ok(newCompData.clientId.startsWith('cust-'), 'Must generate customer ID');

  // Verify new company was actually persisted to DB
  const { data: dbCheck } = await supabaseAdmin
    .from('customers')
    .select('id, name, contact_person')
    .eq('id', newCompData.clientId)
    .single();
  assert.ok(dbCheck, 'New customer must be persisted in Supabase cockpit.customers table');
  assert.strictEqual(dbCheck.name, testUniqueCompanyName);
  assert.strictEqual(dbCheck.contact_person, '김민수');

  // 5. Clean up test row
  await supabaseAdmin.from('customers').delete().eq('id', newCompData.clientId);
});
